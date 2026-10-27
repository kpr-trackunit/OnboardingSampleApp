/**
 * Uploaded Source Files (data-mapping slice 6)
 * CSV files CS uploads for a customer, held in memory: one per customer + entity,
 * and a new upload replaces the previous one. Lost on restart like the mappings
 * (ticket decision 7).
 *
 * Import and the Data Mapping tab read an uploaded file in place of the
 * sample-data one (see sourceFiles.js). A customer that only has uploads is
 * listed for import under the source key `upload:<customerId>`.
 */

const { ENTITY_FILES } = require('./sources');
const { parseCsv } = require('./csv');

// Namespaced so an upload-only source can never collide with a sample-data key such as abc-accounting
const UPLOAD_SOURCE_PREFIX = 'upload:';

/**
 * @typedef {{
 *   customerId: string,
 *   entity: string,
 *   filename: string,
 *   text: string,
 *   header: string[],
 *   rowCount: number,
 *   uploadedAt: string
 * }} Upload
 */

/** @type {Map<string, Upload>} keyed by `${customerId}/${entity}` */
const uploads = new Map();

const keyFor = (customerId, entity) => `${customerId}/${entity}`;

/**
 * Stores (or replaces) the uploaded file for a customer + entity
 * @param {{ customerId: string, entity: string, text: string, filename?: string }} file
 * @returns {{ upload: Upload, replaced: boolean }}
 */
function saveUpload({ customerId, entity, text, filename }) {
  const { header, rows } = parseCsv(text);
  const replaced = uploads.has(keyFor(customerId, entity));
  const upload = {
    customerId,
    entity,
    filename: filename || ENTITY_FILES.find(f => f.entity === entity)?.filename || `${entity}.csv`,
    text,
    header,
    rowCount: rows.length,
    uploadedAt: new Date().toISOString()
  };
  uploads.set(keyFor(customerId, entity), upload);
  return { upload, replaced };
}

/**
 * The uploaded file for a customer + entity, or undefined
 * @param {string} customerId
 * @param {string} entity
 * @returns {Upload|undefined}
 */
function getUpload(customerId, entity) {
  return uploads.get(keyFor(customerId, entity));
}

/**
 * The uploaded file's column headers, in file order, or null without an upload.
 * The entry point for column suggestions (slice 7).
 * @param {string} customerId
 * @param {string} entity
 * @returns {string[]|null}
 */
function getUploadHeader(customerId, entity) {
  return getUpload(customerId, entity)?.header || null;
}

/**
 * Every upload, or one customer's, in import (ENTITY_FILES) order per customer
 * @param {string} [customerId]
 * @returns {Upload[]}
 */
function listUploads(customerId) {
  const order = entity => ENTITY_FILES.findIndex(f => f.entity === entity);
  return [...uploads.values()]
    .filter(u => !customerId || u.customerId === customerId)
    .sort((a, b) => order(a.entity) - order(b.entity));
}

// Unit tests only
function clearUploads() {
  uploads.clear();
}

/** @param {string} customerId */
function uploadSourceKey(customerId) {
  return `${UPLOAD_SOURCE_PREFIX}${customerId}`;
}

/**
 * The customer behind an `upload:<customerId>` source key, or null for any other key
 * @param {string} sourceKey
 */
function customerIdFromUploadKey(sourceKey) {
  return String(sourceKey).startsWith(UPLOAD_SOURCE_PREFIX)
    ? String(sourceKey).slice(UPLOAD_SOURCE_PREFIX.length) || null
    : null;
}

module.exports = {
  UPLOAD_SOURCE_PREFIX,
  saveUpload,
  getUpload,
  getUploadHeader,
  listUploads,
  clearUploads,
  uploadSourceKey,
  customerIdFromUploadKey
};
