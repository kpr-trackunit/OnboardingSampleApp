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
 * Imports one entity file for a source
 * @param {string} sourceKey
 * @param {string} entity
 * @param {{ dataDir?: string }} [options]
 * @returns {{ entity: string, imported: number, rejected: number }}
 */
function importEntity(sourceKey, entity, { dataDir = DEFAULT_DATA_DIR } = {}) {
  const { source, file } = resolve(sourceKey, entity, dataDir);
  const mapping = store.getMapping(source.customerId, entity);
  if (!mapping) throw new ImportError(`No ${entity} mapping for '${source.label}'`, 400);

  const text = fs.readFileSync(path.join(dataDir, source.folder, file.filename), 'utf8');
  const { header, rows } = parseCsv(text);

  const records = [];
  let rejected = 0;

  rows.forEach(({ fields }) => {
    if (fields.length !== header.length) {
      rejected++;
      return;
    }
    const row = Object.fromEntries(header.map((column, i) => [column, fields[i]]));
    const { record } = transformRow(row, mapping);
    records.push(ENTITIES[entity].create({ ...record, customerId: source.customerId }));
  });

  ENTITIES[entity].save(records);
  return { entity, imported: records.length, rejected };
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
