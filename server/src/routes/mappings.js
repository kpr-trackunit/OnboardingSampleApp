/**
 * Data Mapping routes, mounted at /api/mappings
 *
 * Read-only for now. Each entity entry in the customer overview carries its
 * completeness and reasons (data-mapping slice 2), checked against the customer's
 * source file. Later slices add PUT for columns and values (3, 4) and
 * POST /:customerId/:entity/preview (8).
 */

const express = require('express');
const store = require('../data/store');
const { ENTITY_FILES } = require('../import/sources');
const { getTargetFields } = require('../models/targetFields');
const { mappingCompleteness, readFileRows } = require('../import/completeness');
const { transformRow } = require('../import/transform');

const router = express.Router();

// clients | contacts | accounts | transactions, in import order
const ENTITIES = ENTITY_FILES.map(f => f.entity);

/**
 * Lists an entity's target fields in order, as { field, type, required, strict, values }.
 * Mapped columns with no target field definition yet are appended as type 'unknown',
 * so a mapping is never shown with fields missing.
 * @param {string} entity
 * @param {object | null} mapping
 */
function describeFields(entity, mapping) {
  const definitions = getTargetFields(entity) || {};
  const fields = Object.entries(definitions).map(([field, def]) => ({
    field,
    type: def.type,
    required: !!def.required,
    strict: !!def.strict,
    values: def.values || null
  }));
  Object.keys(mapping?.columns || {})
    .filter(field => !definitions[field])
    .forEach(field => fields.push({ field, type: 'unknown', required: false, strict: false, values: null }));
  return fields;
}

// Returns the customer, or sends a 404 and returns null
function findCustomer(req, res) {
  const customer = store.getCustomerById(req.params.customerId);
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return null;
  }
  return customer;
}

/**
 * A customer's mapping for one entity, checked against that customer's source file
 * @param {string} customerId
 * @param {string} entity
 * @returns {import('../import/completeness').Completeness}
 */
function entityCompleteness(customerId, entity) {
  const mapping = store.getMapping(customerId, entity) || null;
  const fileRows = mapping
    ? readFileRows(customerId, mapping, { getSourceCustomerId: store.getSourceCustomerId })
    : null;
  return mappingCompleteness(mapping, fileRows, getTargetFields(entity));
}

// Every entity for a customer, each with its mapping (or null, "No mapping yet") and completeness
router.get('/:customerId', (req, res) => {
  const customer = findCustomer(req, res);
  if (!customer) return;

  res.json({
    customerId: customer.id,
    customerName: customer.name,
    entities: ENTITIES.map(entity => ({
      entity,
      mapping: store.getMapping(customer.id, entity) || null,
      completeness: entityCompleteness(customer.id, entity)
    }))
  });
});

// One mapping with its entity's target fields (including unmapped ones)
router.get('/:customerId/:entity', (req, res) => {
  const customer = findCustomer(req, res);
  if (!customer) return;

  const { entity } = req.params;
  if (!ENTITIES.includes(entity)) {
    return res.status(404).json({ error: `Unknown entity. Must be one of: ${ENTITIES.join(', ')}` });
  }

  const mapping = store.getMapping(customer.id, entity);
  if (!mapping) {
    return res.status(404).json({ error: 'No mapping yet' });
  }

  res.json({ mapping, fields: describeFields(entity, mapping) });
});

const PREVIEW_DEFAULT_LIMIT = 5;
const PREVIEW_MAX_LIMIT = 100;

/**
 * Preview of how a mapping turns the first rows of the customer's file into records,
 * using the same transformRow as import. The body may carry an unsaved mapping
 * (what the editor currently shows), which is used instead of the stored one.
 * Body: { mapping?: { columns, values, dateFormat, ... }, limit?: number (default 5) }
 * 200: { entity, mappingSource: 'body'|'stored', columns, total, rows: [{ line, source, record, errors, warnings }] }
 *   line is the file line of the row, assuming one line per record (header is line 1)
 * 400: bad body · 404: unknown customer/entity, or no mapping · 409: no target fields or no source file
 */
router.post('/:customerId/:entity/preview', (req, res) => {
  const customer = findCustomer(req, res);
  if (!customer) return;

  const { entity } = req.params;
  if (!ENTITIES.includes(entity)) {
    return res.status(404).json({ error: `Unknown entity. Must be one of: ${ENTITIES.join(', ')}` });
  }

  const body = req.body || {};
  const limit = body.limit === undefined ? PREVIEW_DEFAULT_LIMIT : body.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > PREVIEW_MAX_LIMIT) {
    return res.status(400).json({ error: `limit must be a whole number from 1 to ${PREVIEW_MAX_LIMIT}` });
  }

  const draft = body.mapping;
  if (draft !== undefined && (!draft || typeof draft !== 'object' || Array.isArray(draft))) {
    return res.status(400).json({ error: 'mapping must be an object' });
  }

  const stored = store.getMapping(customer.id, entity) || null;
  const mapping = draft
    ? { customerId: customer.id, columns: {}, values: {}, dateFormat: null, ...draft, entity }
    : stored;
  if (!mapping) {
    return res.status(404).json({ error: 'No mapping yet: nothing to preview' });
  }
  if (!getTargetFields(entity)) {
    return res.status(409).json({ error: `No target fields are defined for ${entity} yet, so it can't be previewed` });
  }

  const fileRows = readFileRows(customer.id, mapping, { getSourceCustomerId: store.getSourceCustomerId });
  if (!fileRows) {
    return res.status(409).json({ error: `No source file for ${entity}: upload one to see a preview` });
  }

  const rows = fileRows.slice(0, limit).map((source, i) => {
    const { record, errors, warnings } = transformRow(source, mapping);
    const line = i + 2;
    return {
      line,
      source,
      record,
      errors: errors.map(e => ({ row: line, ...e })),
      warnings: warnings.map(w => ({ row: line, ...w }))
    };
  });

  res.json({ entity, mappingSource: draft ? 'body' : 'stored', columns: mapping.columns, total: fileRows.length, rows });
});

module.exports = router;
module.exports.ENTITIES = ENTITIES;
module.exports.describeFields = describeFields;
module.exports.entityCompleteness = entityCompleteness;
