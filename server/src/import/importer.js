/**
 * Importer
 * Reads a source file, maps each row through the customer's stored Mapping and
 * saves the canonical records in the store. The source file is the one CS uploaded
 * when there is one (data-mapping slice 6), otherwise the sample-data file.
 */

const store = require('../data/store');
const { createClient, createImportRun } = require('../models');
const { DEFAULT_DATA_DIR, ENTITY_FILES, listSources, getSource } = require('./sources');
const { readSourceFile } = require('./sourceFiles');
const { listUploads, getUpload, uploadSourceKey, customerIdFromUploadKey } = require('./uploads');
const { transformRow } = require('./transform');
const { rejoinOverflow } = require('./overflow');
const { detectDateFormat } = require('./normalizers');
const { getTargetFields } = require('../models/targetFields');

// How each entity is created and stored
const ENTITIES = {
  clients: { create: createClient, save: store.saveClients, list: store.getClients }
};

let runCount = 0;

class ImportError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Adds the customer the source belongs to
function withCustomer(source) {
  return { ...source, customerId: store.getSourceCustomerId(source.sourceKey, source.label) };
}

// A file entry as the Import tab lists it, from an upload
function uploadedFile(upload) {
  return { entity: upload.entity, filename: upload.filename, rowCount: upload.rowCount, uploaded: true };
}

// A source's files with uploads in place of (or added to) its sample-data files, in import order
function withUploads(customerId, files) {
  return ENTITY_FILES
    .map(({ entity }) => {
      const upload = getUpload(customerId, entity);
      if (upload) return uploadedFile(upload);
      const file = files.find(f => f.entity === entity);
      return file && { ...file, uploaded: false };
    })
    .filter(Boolean);
}

/**
 * Lists sources with their customerId and an importable flag per file (true when a mapping exists).
 * Sample-data sources list a customer's upload in place of the sample file. Customers that only
 * have uploads are listed after them, under the source key `upload:<customerId>`.
 * @param {string} [dataDir]
 */
function listImportSources(dataDir = DEFAULT_DATA_DIR) {
  const samples = listSources(dataDir).map(withCustomer)
    .map(source => ({ ...source, files: withUploads(source.customerId, source.files) }));

  const sampleCustomers = new Set(samples.map(s => s.customerId));
  const uploadOnly = [...new Set(listUploads().map(u => u.customerId))]
    .filter(customerId => !sampleCustomers.has(customerId))
    .map(customerId => ({
      sourceKey: uploadSourceKey(customerId),
      label: store.getCustomerById(customerId)?.name || customerId,
      folder: null,
      customerId,
      files: withUploads(customerId, [])
    }));

  return [...samples, ...uploadOnly].map(source => ({
    ...source,
    files: source.files.map(file => ({
      ...file,
      importable: Boolean(ENTITIES[file.entity] && store.getMapping(source.customerId, file.entity))
    }))
  }));
}

// The source behind a key: a sample-data folder, or `upload:<customerId>` for a customer that only has uploads
function findSource(sourceKey, dataDir) {
  const uploadCustomerId = customerIdFromUploadKey(sourceKey);
  if (uploadCustomerId === null) {
    const found = getSource(sourceKey, dataDir);
    return found && withCustomer(found);
  }
  const customer = store.getCustomerById(uploadCustomerId);
  return customer && { sourceKey, label: customer.name, folder: null, customerId: customer.id };
}

function resolve(sourceKey, entity, dataDir) {
  const source = findSource(sourceKey, dataDir);
  if (!source) throw new ImportError(`Unknown source '${sourceKey}'`, 404);

  const file = ENTITIES[entity] && readSourceFile(source.customerId, entity, {
    dataDir,
    getSourceCustomerId: store.getSourceCustomerId
  });
  if (!file) throw new ImportError(`No ${entity} file to import for '${sourceKey}'`, 404);

  return { source, file };
}

/**
 * Uses the date format detected in the file unless CS has confirmed one on the mapping.
 * An ambiguous file keeps the mapping's format.
 */
function withDetectedDateFormat(mapping, rows) {
  if (mapping.dateFormatDetected === 'confirmed') return mapping;

  const dateColumns = Object.entries(getTargetFields(mapping.entity))
    .filter(([field, spec]) => spec.type === 'date' && mapping.columns[field])
    .map(([field]) => mapping.columns[field]);
  const detection = detectDateFormat(rows.flatMap(row => dateColumns.map(column => row[column] ?? '')));

  if (detection.status === 'detected') {
    return { ...mapping, dateFormat: detection.format, dateFormatDetected: 'detected' };
  }
  return mapping;
}

// Prefixes a transform issue with its row number
function atRow(row, issue) {
  return { row, ...issue, message: `row ${row}: ${issue.message}` };
}

/**
 * Imports one entity file for a source. Rejected rows are skipped and never block valid rows.
 * Re-importing replaces records with the same sourceId, and each run is recorded as an ImportRun.
 * @param {string} sourceKey
 * @param {string} entity
 * @param {{ dataDir?: string }} [options]
 * @returns {import('../models').ImportRun & { dateFormat: string|null }}
 */
function importEntity(sourceKey, entity, { dataDir = DEFAULT_DATA_DIR } = {}) {
  const { source, file } = resolve(sourceKey, entity, dataDir);
  const storedMapping = store.getMapping(source.customerId, entity);
  if (!storedMapping) throw new ImportError(`No ${entity} mapping for '${source.label}'`, 400);

  const startedAt = new Date().toISOString();
  const { header, rows } = file;
  const errors = [];
  const warnings = [];

  // Rejoin unquoted commas in free text, then key each row by column name
  const keyedRows = [];
  rows.forEach(({ line, fields }) => {
    const recovered = rejoinOverflow(header, fields, storedMapping).fields;
    if (recovered.length !== header.length) {
      errors.push(atRow(line, {
        field: null,
        column: null,
        value: fields.join(','),
        message: `has ${fields.length} fields, expected ${header.length}`
      }));
      return;
    }
    keyedRows.push({ line, row: Object.fromEntries(header.map((column, i) => [column, recovered[i]])) });
  });

  const mapping = withDetectedDateFormat(storedMapping, keyedRows.map(({ row }) => row));
  const idColumn = mapping.columns.sourceId;
  const seenIds = new Set();
  const records = [];

  keyedRows.forEach(({ line, row }) => {
    const result = transformRow(row, mapping);
    const rowErrors = result.errors.map(issue => atRow(line, issue));

    const { sourceId } = result.record;
    if (sourceId && seenIds.has(sourceId)) {
      rowErrors.push(atRow(line, {
        field: 'sourceId',
        column: idColumn,
        value: sourceId,
        message: `\`${idColumn}\` '${sourceId}' appears more than once in the file`
      }));
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    seenIds.add(sourceId);
    warnings.push(...result.warnings.map(issue => atRow(line, issue)));
    records.push(ENTITIES[entity].create({ ...result.record, customerId: source.customerId }));
  });

  ENTITIES[entity].save(records);

  runCount++;
  const run = store.addImportRun(createImportRun({
    id: `run_${runCount}`,
    customerId: source.customerId,
    entity,
    startedAt,
    imported: records.length,
    rejected: new Set(errors.map(e => e.row)).size,
    warnings,
    errors
  }));
  return { ...run, dateFormat: mapping.dateFormat };
}

/**
 * Lists the records imported so far for a source
 * @param {string} sourceKey
 * @param {string} entity
 * @param {{ dataDir?: string }} [options]
 */
function getImported(sourceKey, entity, { dataDir = DEFAULT_DATA_DIR } = {}) {
  const { source } = resolve(sourceKey, entity, dataDir);
  return ENTITIES[entity].list(source.customerId);
}

module.exports = {
  ImportError,
  listImportSources,
  importEntity,
  getImported
};
