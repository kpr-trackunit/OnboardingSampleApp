/**
 * Tenant Setup routes, mounted at /api/tenants
 */

const express = require('express');
const store = require('../data/store');
const { TENANT_STATUS_TRANSITIONS } = require('../models');

const router = express.Router();

// Get all tenants with their customer name
router.get('/', (req, res) => {
  res.json(store.getTenantList());
});

// Change a tenant's status, e.g. { status: 'provisioning' }.
// Only moves in TENANT_STATUS_TRANSITIONS (models) are allowed; others return 409.
router.patch('/:customerId/status', (req, res) => {
  const { status } = req.body || {};
  if (!Object.hasOwn(TENANT_STATUS_TRANSITIONS, status)) {
    return res.status(400).json({
      error: `status must be one of: ${Object.keys(TENANT_STATUS_TRANSITIONS).join(', ')}`
    });
  }

  const result = store.updateTenantStatus(req.params.customerId, status);
  if (result.code === 'not_found') {
    return res.status(404).json({ error: result.error });
  }
  if (result.code === 'invalid_transition') {
    return res.status(409).json({ error: result.error });
  }

  const customer = store.getCustomerById(result.tenant.customerId);
  res.json({ ...result.tenant, customerName: customer?.name || 'Unknown' });
});

module.exports = router;
