/**
 * Tenant Setup routes, mounted at /api/tenants
 */

const express = require('express');
const store = require('../data/store');
const { TENANT_PLANS, TENANT_REGIONS, TENANT_STATUS_TRANSITIONS } = require('../models');

const router = express.Router();

// Fields that PATCH /:customerId may change, each with a validator that
// returns an error message, or null when the value is valid.
const EDITABLE_FIELDS = {
  plan: value => (TENANT_PLANS.includes(value)
    ? null
    : `Invalid plan. Must be one of: ${TENANT_PLANS.join(', ')}`),
  region: value => (TENANT_REGIONS.includes(value)
    ? null
    : `Invalid region. Must be one of: ${TENANT_REGIONS.join(', ')}`)
};

// Get all tenants with their customer name
router.get('/', (req, res) => {
  res.json(store.getTenantList());
});

// Change a tenant's status, e.g. { status: 'provisioning' } or { status: 'failed', reason: '...' }.
// Only moves in TENANT_STATUS_TRANSITIONS (models) are allowed; others return 409.
// Moving to failed needs a non-empty reason (400 otherwise).
router.patch('/:customerId/status', (req, res) => {
  const { status, reason } = req.body || {};
  if (!Object.hasOwn(TENANT_STATUS_TRANSITIONS, status)) {
    return res.status(400).json({
      error: `status must be one of: ${Object.keys(TENANT_STATUS_TRANSITIONS).join(', ')}`
    });
  }

  if (reason != null && typeof reason !== 'string') {
    return res.status(400).json({ error: 'reason must be a string' });
  }

  const result = store.updateTenantStatus(req.params.customerId, status, reason);
  if (result.code === 'not_found') {
    return res.status(404).json({ error: result.error });
  }
  if (result.code === 'invalid_transition') {
    return res.status(409).json({ error: result.error });
  }
  if (result.code === 'reason_required') {
    return res.status(400).json({ error: result.error });
  }

  const customer = store.getCustomerById(result.tenant.customerId);
  res.json({ ...result.tenant, customerName: customer?.name || 'Unknown' });
});

// Edit a tenant's editable fields. Allowed at any status.
router.patch('/:customerId', (req, res) => {
  const body = req.body || {};
  const updates = {};

  for (const [field, validate] of Object.entries(EDITABLE_FIELDS)) {
    if (!(field in body)) continue;
    const error = validate(body[field]);
    if (error) return res.status(400).json({ error });
    updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      error: `No editable fields provided. Editable fields: ${Object.keys(EDITABLE_FIELDS).join(', ')}`
    });
  }

  const tenant = store.updateTenant(req.params.customerId, updates);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  res.json(tenant);
});

module.exports = router;
