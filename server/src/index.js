const express = require('express');
const cors = require('cors');
const store = require('./data/store');
const { createCustomer } = require('./models');
const { buildQueue, summarise } = require('./models/queue');
const { ImportError, listImportSources, importEntity, getImported } = require('./import/importer');
const { requireActiveTenant } = require('./routes/importGuard');

const app = express();
const PORT = process.env.PORT || 3001;
const ISSUE_STATUSES = ['open', 'in-progress', 'resolved'];
// Customer Info fields CS can edit on the Customer Info tab
const INFO_FIELDS = ['industry', 'region', 'contactEmail'];

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all customers
app.get('/api/customers', (req, res) => {
  res.json(store.getCustomers());
});

// Add a customer (stub: name only)
app.post('/api/customers', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    return res.status(400).json({ error: 'Customer name is required' });
  }
  res.status(201).json(store.addCustomer(createCustomer({ name })));
});

// Update a customer's name, config, issues and/or info fields
app.put('/api/customers/:id', (req, res) => {
  const body = req.body || {};
  const { name, config, issues } = body;
  const updates = {};
  // Info fields: strings, trimmed. Errors are keyed by field so the Customer
  // Info row can show each one next to its input.
  const errors = {};
  for (const field of INFO_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'string') {
      errors[field] = 'Must be text';
      continue;
    }
    updates[field] = body[field].trim();
  }
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Some fields are invalid', errors });
  }
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }
    updates.name = name.trim();
  }
  if (config !== undefined) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return res.status(400).json({ error: 'Config must be an object of key/value pairs' });
    }
    if (Object.keys(config).some(k => k.includes(':'))) {
      return res.status(400).json({ error: 'Config keys cannot contain ":"' });
    }
    updates.config = Object.fromEntries(
      Object.entries(config)
        .map(([k, v]) => [k.trim(), String(v ?? '')])
        .filter(([k]) => k)
    );
  }
  if (issues !== undefined) {
    const valid = Array.isArray(issues) && issues.every(i =>
      i && typeof i.title === 'string' && i.title.trim() && ISSUE_STATUSES.includes(i.status));
    if (!valid) {
      return res.status(400).json({ error: `Issues need a title and a status of ${ISSUE_STATUSES.join(', ')}` });
    }
    updates.issues = issues.map(i => ({ title: i.title.trim(), status: i.status }));
  }
  const customer = store.updateCustomer(req.params.id, updates);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(customer);
});

// Get customer by ID
app.get('/api/customers/:id', (req, res) => {
  const customer = store.getCustomerById(req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(customer);
});

// Get onboarding state for a customer
app.get('/api/customers/:id/onboarding', (req, res) => {
  const state = store.getOnboardingState(req.params.id);
  if (!state) {
    return res.status(404).json({ error: 'Onboarding state not found' });
  }
  res.json(state);
});

// Onboarding queue (dashboard view): one row per customer
app.get('/api/onboarding', (req, res) => {
  res.json(buildQueue(store.getCustomers(), store.getAllOnboardingStates()));
});

// Onboarding queue summary (dashboard strip): how many customers are in each state
app.get('/api/onboarding/summary', (req, res) => {
  res.json(summarise(buildQueue(store.getCustomers(), store.getAllOnboardingStates())));
});

// Tenant Setup routes (list, and later status/plan/region updates)
app.use('/api/tenants', require('./routes/tenants'));

// Get tenant by customer ID
app.get('/api/tenants/:customerId', (req, res) => {
  const tenant = store.getTenantByCustomerId(req.params.customerId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  res.json(tenant);
});

// List customer data files waiting to be imported. Always allowed; tenantActive
// tells the Import tab whether the source's customer may import yet (tenant slice 7).
app.get('/api/import/sources', (req, res) => {
  res.json(listImportSources().map(source => ({
    ...source,
    tenantActive: store.isTenantActive(source.customerId)
  })));
});

// Sends import errors as JSON with their HTTP status
function handleImportError(res, err) {
  if (err instanceof ImportError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('Import failed:', err);
  return res.status(500).json({ error: 'Import failed' });
}

// Import one entity file (e.g. clients) for a source. 409 until the tenant is active.
app.post('/api/import/:sourceKey/:entity', requireActiveTenant(), (req, res) => {
  try {
    res.json(importEntity(req.params.sourceKey, req.params.entity));
  } catch (err) {
    handleImportError(res, err);
  }
});

// List the records imported so far for a source/entity
app.get('/api/import/:sourceKey/:entity', (req, res) => {
  try {
    res.json(getImported(req.params.sourceKey, req.params.entity));
  } catch (err) {
    handleImportError(res, err);
  }
});

// Test-only setup routes for the E2E suite (see routes/testSupport.js)
if (process.env.ENABLE_TEST_ROUTES === 'true') {
  app.use('/api/test', require('./routes/testSupport'));
}

// Start server (only when run directly, so tests can require the app)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Onboarding API server running at http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
