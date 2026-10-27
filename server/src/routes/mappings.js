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
const { readSourceFile } = require('../import/sourceFiles');

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

// One mapping with its entity's target fields (including unmapped ones), and the source
// file it maps: its headers in file order, and whether CS uploaded it (slice 6). null without a file.
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

  const file = readSourceFile(customer.id, entity, { getSourceCustomerId: store.getSourceCustomerId });
  res.json({
    mapping,
    fields: describeFields(entity, mapping),
    file: file && { filename: file.filename, uploaded: file.uploaded, headers: file.header, rowCount: file.rows.length }
  });
});

module.exports = router;
module.exports.ENTITIES = ENTITIES;
module.exports.describeFields = describeFields;
module.exports.entityCompleteness = entityCompleteness;
