/**
 * Importer
 * Reads a source file, maps each row through the customer's stored Mapping and
 * saves the canonical records in the store.
 */

const fs = require('fs');
const path = require('path');
const store = require('../data/store');
const { createClient } = require('../models');
const { DEFAULT_DATA_DIR, listSources, getSource } = require('./sources');
const { parseCsv } = require('./csv');
const { transformRow } = require('./transform');
const { rejoinOverflow } = require('./overflow');
const { detectDateFormat } = require('./normalizers');
const { getTargetFields } = require('../models/targetFields');

// How each entity is created and stored
const ENTITIES = {
  clients: { create: createClient, save: store.addClients, list: store.getClients }
};

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

/**
 * Imports one entity file for a source
 * @param {string} sourceKey
 * @param {string} entity
 * @param {{ dataDir?: string }} [options]
 * @returns {{ entity: string, imported: number, rejected: number, dateFormat: string|null }}
 */
function importEntity(sourceKey, entity, { dataDir = DEFAULT_DATA_DIR } = {}) {
  const { source, file } = resolve(sourceKey, entity, dataDir);
  const storedMapping = store.getMapping(source.customerId, entity);
  if (!storedMapping) throw new ImportError(`No ${entity} mapping for '${source.label}'`, 400);

  const text = fs.readFileSync(path.join(dataDir, source.folder, file.filename), 'utf8');
  const { header, rows } = parseCsv(text);

  // Rejoin unquoted commas in free text, then key each row by column name
  let rejected = 0;
  const keyedRows = [];
  rows.forEach(({ fields }) => {
    const recovered = rejoinOverflow(header, fields, storedMapping).fields;
    if (recovered.length !== header.length) {
      rejected++;
      return;
    }
    keyedRows.push(Object.fromEntries(header.map((column, i) => [column, recovered[i]])));
  });

  const mapping = withDetectedDateFormat(storedMapping, keyedRows);
  const records = keyedRows.map(row => {
    const { record } = transformRow(row, mapping);
    return ENTITIES[entity].create({ ...record, customerId: source.customerId });
  });

  ENTITIES[entity].save(records);
  return { entity, imported: records.length, rejected, dateFormat: mapping.dateFormat };
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
