/**
 * Test-only routes, mounted at /api/test only when ENABLE_TEST_ROUTES=true
 * (set by the Playwright webServer). Never mounted in a normal `npm start`.
 *
 * Why: Import is blocked until a customer's tenant is active, but only the
 * seeded customer has a tenant until tenant slice 6 creates one for every
 * customer. E2E tests use this to give an import customer a fresh `pending`
 * tenant, then move it to active through the real PATCH status route, so the
 * transition rules and the import guard are exercised unchanged.
 * Remove this once slice 6 auto-creates tenants.
 */

const express = require('express');
const store = require('../data/store');
const { createTenant } = require('../models');

const router = express.Router();

// Reset a customer's tenant to a new `pending` one (creating it if missing)
router.post('/tenants/:customerId/reset', (req, res) => {
  const { customerId } = req.params;
  if (!store.getCustomerById(customerId)) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  const existing = store.getTenantByCustomerId(customerId);
  if (existing) {
    store.updateTenant(customerId, { status: 'pending' });
    return res.json(store.getTenantByCustomerId(customerId));
  }
  res.status(201).json(store.addTenant(createTenant({ customerId, status: 'pending', plan: 'starter' })));
});

module.exports = router;
