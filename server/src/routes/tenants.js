/**
 * Tenant Setup routes, mounted at /api/tenants
 */

const express = require('express');
const store = require('../data/store');

const router = express.Router();

// Get all tenants with their customer name
router.get('/', (req, res) => {
  res.json(store.getTenantList());
});

module.exports = router;
