const express = require('express');
const cors = require('cors');
const store = require('./data/store');
const { createCustomer } = require('./models');

const app = express();
const PORT = process.env.PORT || 3001;
const ISSUE_STATUSES = ['open', 'in-progress', 'resolved'];

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

// Update a customer's name and/or config
app.put('/api/customers/:id', (req, res) => {
  const { name, config, issues } = req.body || {};
  const updates = {};
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

// Get all onboarding states (dashboard view)
app.get('/api/onboarding', (req, res) => {
  const states = store.getAllOnboardingStates();
  const customers = store.getCustomers();
  
  // Join customer info with onboarding state
  const dashboard = states.map(state => {
    const customer = customers.find(c => c.id === state.customerId);
    return {
      ...state,
      customerName: customer?.name || 'Unknown',
      customerIndustry: customer?.industry || '',
      customerRegion: customer?.region || ''
    };
  });
  
  res.json(dashboard);
});

// Get tenant by customer ID
app.get('/api/tenants/:customerId', (req, res) => {
  const tenant = store.getTenantByCustomerId(req.params.customerId);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  res.json(tenant);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Onboarding API server running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
});
