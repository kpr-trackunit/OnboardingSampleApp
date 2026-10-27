/**
 * Importer
 * Reads a source file, maps each row through the customer's stored Mapping and
 * saves the canonical records in the store.
 */

const fs = require('fs');
const path = require('path');
const store = require('../data/store');
const { createClient, createImportRun, createAccount } = require('../models');
const { DEFAULT_DATA_DIR, listSources, getSource } = require('./sources');
const { parseCsv } = require('./csv');
const { transformRow } = require('./transform');
const { rejoinOverflow } = require('./overflow');
const { detectDateFormat } = require('./normalizers');
const { getTargetFields, getKeyField } = require('../models/targetFields');
const { checkParents } = require('./hierarchy');

// How each entity is created and stored. An optional checkFile(accepted, all, mapping)
// runs once every row is transformed, for rules that span rows; it returns
// { accepted, errors } where each error carries the row's line.
const ENTITIES = {
  clients: { create: createClient, save: store.saveClients, list: store.getClients }
};

ENTITIES.accounts = {
  create: createAccount,
  save: store.saveAccounts,
  list: store.getAccounts,
  checkFile: (accepted, all, mapping) => checkParents(accepted, all, {
    keyField: 'code',
    parentField: 'parentCode',
    parentColumn: mapping.columns.parentCode || null
  })
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

/**
 * Lists sources with their customerId and an importable flag per file (true when a mapping exists)
 * @param {string} [dataDir]
 */
function listImportSources(dataDir = DEFAULT_DATA_DIR) {
  return listSources(dataDir).map(withCustomer).map(source => ({
    ...source,
    files: source.files.map(file => ({
      ...file,
      importable: Boolean(ENTITIES[file.entity] && store.getMapping(source.customerId, file.entity))
    }))
  }));
}

function resolve(sourceKey, entity, dataDir) {
  const found = getSource(sourceKey, dataDir);
  if (!found) throw new ImportError(`Unknown source '${sourceKey}'`, 404);
  const source = withCustomer(found);

  const file = source.files.find(f => f.entity === entity);
  if (!file || !ENTITIES[entity]) throw new ImportError(`No ${entity} file to import for '${sourceKey}'`, 404);

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
  const text = fs.readFileSync(path.join(dataDir, source.folder, file.filename), 'utf8');
  const { header, rows } = parseCsv(text);
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
  const keyField = getKeyField(entity);
  const idColumn = mapping.columns[keyField];
  const seenIds = new Set();
  const transformed = [];
  let accepted = [];

  keyedRows.forEach(({ line, row }) => {
    const result = transformRow(row, mapping);
    const rowErrors = result.errors.map(issue => atRow(line, issue));
    transformed.push({ line, record: result.record });

    const sourceId = result.record[keyField];
    if (sourceId && seenIds.has(sourceId)) {
      rowErrors.push(atRow(line, {
        field: keyField,
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
    accepted.push({ line, record: result.record, warnings: result.warnings });
  });

  if (ENTITIES[entity].checkFile) {
    const checked = ENTITIES[entity].checkFile(accepted, transformed, mapping);
    errors.push(...checked.errors.map(({ line, ...issue }) => atRow(line, issue)));
    accepted = checked.accepted;
  }

  const records = accepted.map(({ line, record, warnings: rowWarnings }) => {
    warnings.push(...rowWarnings.map(issue => atRow(line, issue)));
    return ENTITIES[entity].create({ ...record, customerId: source.customerId });
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
