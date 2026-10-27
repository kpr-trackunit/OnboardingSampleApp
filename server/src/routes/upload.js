/**
 * Upload route (data-mapping slice 6), mounted at /api/import
 *
 * POST /api/import/:customerId/:entity/upload
 *   Body, either:
 *   - raw CSV text with Content-Type text/csv (or text/plain), up to 5 MB; the original
 *     file name can be given as ?filename=clients.csv
 *   - JSON { text: "<csv>", filename?: "clients.csv" } (the app's JSON body limit applies)
 *
 * Holds the file in memory as that customer's source file for the entity, replacing any
 * previous upload. Import and the Data Mapping tab then read it in place of sample-data.
 * On the first upload for a customer + entity with no mapping yet, an empty mapping is
 * created: every target field unmapped, no values, and the date format detected from the file.
 *
 * Responds 201 for a first upload, 200 when it replaces one:
 *   { upload: { customerId, entity, filename, header, rowCount, uploadedAt, sourceKey },
 *     mapping, mappingCreated, replaced }
 *
 * Uploading is not gated on an active tenant: CS can map a new customer's files while the
 * tenant is being set up. Importing them still is (routes/importGuard.js).
 */

const express = require('express');
const store = require('../data/store');
const { createMapping } = require('../models');
const { getTargetFields } = require('../models/targetFields');
const { ENTITY_FILES, listSources } = require('../import/sources');
const { parseCsv } = require('../import/csv');
const { rejoinOverflow } = require('../import/overflow');
const { saveUpload, uploadSourceKey } = require('../import/uploads');
const { detectFileDateFormat } = require('../import/sourceFiles');

const router = express.Router();
const ENTITIES = ENTITY_FILES.map(f => f.entity);

// The import source key the upload is listed under: the customer's sample-data source if it has one
function sourceKeyFor(customerId) {
  const sample = listSources().find(s => store.getSourceCustomerId(s.sourceKey, s.label) === customerId);
  return sample ? sample.sourceKey : uploadSourceKey(customerId);
}

/**
 * An empty mapping for a new upload: all target fields null, no value maps,
 * and the date format as detected in the file (ambiguous when CS has to pick one)
 * @param {string} customerId
 * @param {string} entity
 * @param {{ header: string[], rows: { fields: string[] }[] }} parsed
 */
function emptyMapping(customerId, entity, { header, rows }) {
  const columns = Object.fromEntries(Object.keys(getTargetFields(entity) || {}).map(field => [field, null]));
  const keyedRows = rows
    .map(({ fields }) => rejoinOverflow(header, fields, { entity, columns, values: {} }).fields)
    .filter(fields => fields.length === header.length)
    .map(fields => Object.fromEntries(header.map((column, i) => [column, fields[i]])));
  const detection = detectFileDateFormat(keyedRows);

  return createMapping({
    customerId,
    entity,
    columns,
    values: {},
    dateFormat: detection.status === 'detected' ? detection.format : null,
    // Anything but one clear format needs CS to pick it (ticket decision 8)
    dateFormatDetected: detection.status === 'detected' ? 'detected' : 'ambiguous'
  });
}

// The CSV text from either body format, or null
function csvText(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body.text === 'string') return req.body.text;
  return null;
}

router.post(
  '/:customerId/:entity/upload',
  express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }),
  (req, res) => {
    const { customerId, entity } = req.params;
    if (!store.getCustomerById(customerId)) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    if (!ENTITIES.includes(entity)) {
      return res.status(404).json({ error: `Unknown entity. Must be one of: ${ENTITIES.join(', ')}` });
    }

    const text = csvText(req);
    if (text === null || text.trim() === '') {
      return res.status(400).json({ error: 'Send the CSV as text/csv, or as JSON { "text": "..." }' });
    }

    const parsed = parseCsv(text);
    if (parsed.header.length === 0) {
      return res.status(400).json({ error: 'The file has no header row' });
    }

    const filename = String(req.query.filename || req.body?.filename || '').trim() || undefined;
    const { upload, replaced } = saveUpload({ customerId, entity, text, filename });

    // Only the first upload creates a mapping; a re-upload keeps the one CS is working on
    let mapping = store.getMapping(customerId, entity);
    const mappingCreated = !mapping;
    if (mappingCreated) {
      mapping = store.saveMapping(emptyMapping(customerId, entity, parsed));
    }

    const { text: _text, ...summary } = upload;
    res.status(replaced ? 200 : 201).json({
      upload: { ...summary, sourceKey: sourceKeyFor(customerId) },
      mapping,
      mappingCreated,
      replaced
    });
  }
);

module.exports = router;
module.exports.emptyMapping = emptyMapping;
