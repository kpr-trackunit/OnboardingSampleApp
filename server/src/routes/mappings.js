/**
 * Data Mapping routes, mounted at /api/mappings
 *
 * Each entity entry in the customer overview carries its completeness and reasons
 * (data-mapping slice 2), checked against the customer's source file.
 * PUT /:customerId/:entity edits a mapping as a partial update: columns for now
 * (slice 3); values, defaults and a confirmed date format come next (slice 4).
 * POST /:customerId/:entity/preview comes in slice 8.
 */

const express = require('express');
const store = require('../data/store');
const { ENTITY_FILES } = require('../import/sources');
const { getTargetFields } = require('../models/targetFields');
const { mappingCompleteness, readFileRows } = require('../import/completeness');

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

/**
 * The column names in a customer's source file for an entity, in file order,
 * for the column dropdowns. Empty when there is no file (or no row fits its header).
 * @param {string} customerId
 * @param {import('../models').Mapping} mapping
 * @returns {string[]}
 */
function fileHeaders(customerId, mapping) {
  const rows = readFileRows(customerId, mapping, { getSourceCustomerId: store.getSourceCustomerId });
  return rows && rows.length > 0 ? Object.keys(rows[0]) : [];
}

// Returns the customer's mapping for the entity in the URL, or sends a 404 and returns null
function findMapping(req, res) {
  const customer = findCustomer(req, res);
  if (!customer) return null;

  const { entity } = req.params;
  if (!ENTITIES.includes(entity)) {
    res.status(404).json({ error: `Unknown entity. Must be one of: ${ENTITIES.join(', ')}` });
    return null;
  }

  const mapping = store.getMapping(customer.id, entity);
  if (!mapping) {
    res.status(404).json({ error: 'No mapping yet' });
    return null;
  }
  return mapping;
}

// The keys a PUT body may hold. Slice 4 adds values and dateFormat.
const EDITABLE_KEYS = ['columns'];

/**
 * Checks a columns edit, { targetField: sourceColumn | null }, against the entity's
 * target fields and the file's headers. null unmaps the field.
 * @returns {string|null} The error, or null when the edit is valid
 */
function validateColumns(columns, entity, headers) {
  if (!columns || typeof columns !== 'object' || Array.isArray(columns)) {
    return 'columns must be an object of { targetField: sourceColumn | null }';
  }
  const targetFields = getTargetFields(entity) || {};
  for (const [field, column] of Object.entries(columns)) {
    if (!Object.hasOwn(targetFields, field)) {
      return `Unknown target field '${field}' for ${entity}`;
    }
    if (column === null) continue;
    if (typeof column !== 'string' || !headers.includes(column)) {
      return `'${column}' is not a column in the ${entity} file`;
    }
  }
  return null;
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

// One mapping with its entity's target fields (including unmapped ones) and the file's headers
router.get('/:customerId/:entity', (req, res) => {
  const mapping = findMapping(req, res);
  if (!mapping) return;

  res.json({
    mapping,
    fields: describeFields(mapping.entity, mapping),
    headers: fileHeaders(mapping.customerId, mapping)
  });
});

/**
 * Edits a mapping. The body is a partial update, { columns? } for now:
 * columns lists only the target fields that change, e.g. { columns: { name: null } }
 * unmaps name and leaves the other columns alone.
 * Responds like GET, plus the entity's completeness so the badge can update.
 */
router.put('/:customerId/:entity', (req, res) => {
  const mapping = findMapping(req, res);
  if (!mapping) return;

  const body = req.body || {};
  const unknownKeys = Object.keys(body).filter(key => !EDITABLE_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    return res.status(400).json({ error: `Can't edit ${unknownKeys.join(', ')}. Editable: ${EDITABLE_KEYS.join(', ')}` });
  }
  if (body.columns === undefined) {
    return res.status(400).json({ error: `Nothing to change. Send one of: ${EDITABLE_KEYS.join(', ')}` });
  }

  const headers = fileHeaders(mapping.customerId, mapping);
  const error = validateColumns(body.columns, mapping.entity, headers);
  if (error) return res.status(400).json({ error });

  const columns = { ...mapping.columns };
  Object.entries(body.columns).forEach(([field, column]) => {
    if (column === null) delete columns[field];
    else columns[field] = column;
  });

  const saved = store.saveMapping({ ...mapping, columns, updatedAt: new Date().toISOString() });
  res.json({
    mapping: saved,
    fields: describeFields(saved.entity, saved),
    headers,
    completeness: entityCompleteness(saved.customerId, saved.entity)
  });
});

module.exports = router;
module.exports.ENTITIES = ENTITIES;
module.exports.describeFields = describeFields;
module.exports.entityCompleteness = entityCompleteness;
