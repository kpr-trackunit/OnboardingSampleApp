/**
 * POST /api/import/:sourceKey/all (import slice 8): imports every entity of a source in
 * dependency order and updates the customer's Import step. Mounted at /api/import before
 * the per-entity route, so 'all' is never read as an entity.
 */

const express = require('express');
const { ImportError } = require('../import/importer');
const { importAll, linkSourceCustomer } = require('../import/importAll');
const { requireActiveTenant } = require('./importGuard');

const router = express.Router();

// Linking first creates the customer (with its pending tenant) for a new source, so it shows
// in the onboarding queue and Tenant Setup; the guard then answers 409 until the tenant is active
router.post('/:sourceKey/all', requireActiveTenant(sourceKey => linkSourceCustomer(sourceKey)), (req, res) => {
  try {
    res.json(importAll(req.params.sourceKey));
  } catch (err) {
    if (err instanceof ImportError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Import all failed:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

module.exports = router;
