/**
 * In-Memory Data Store
 * Simple storage for the training exercise - no database needed
 */

const { createCustomer, createTenant, createDefaultOnboardingSteps, createMapping } = require('../models');
const customerFiles = require('./customerFiles');
const { seedMappings } = require('./mappingSeeds');

// In-memory storage
const store = {
  customers: [],
  tenants: [],
  onboardingStates: [],
  mappings: [],
  clients: [],
  importRuns: []
};

// Seed with example data
function seedData() {
  // Example customer - Acme Corporation
  const exampleCustomer = createCustomer({
    id: 'cust_001',
    name: 'Acme Corporation',
    industry: 'Manufacturing',
    region: 'North America',
    contactEmail: 'onboarding@acme.example.com',
    createdAt: '2025-01-15T10:00:00Z'
  });

  // Example tenant for Acme
  const exampleTenant = createTenant({
    id: 'tenant_001',
    customerId: 'cust_001',
    status: 'pending',
    plan: 'professional',
    createdAt: '2025-01-15T10:00:00Z'
  });

  // Example onboarding state - just started, nothing completed
  const exampleOnboardingState = {
    customerId: 'cust_001',
    steps: createDefaultOnboardingSteps(),
    progressPercent: 0
  };

  // Customers are persisted as markdown files; seed the example only on first run
  store.customers.push(...customerFiles.loadAll());
  if (store.customers.length === 0) {
    customerFiles.save(exampleCustomer);
    store.customers.push(exampleCustomer);
  }
  store.tenants.push(exampleTenant);
  store.onboardingStates.push(exampleOnboardingState);

  // Column/value mappings for the sample customers in sample-data/
  store.mappings.push(...seedMappings().map(({ sourceKey, label, ...mapping }) =>
    createMapping({ ...mapping, customerId: getSourceCustomerId(sourceKey, label) })
  ));
}

// Which customer each import source (sample-data folder) belongs to, keyed by sourceKey.
// Linked once to the customer with the same name as the source label, so later renames
// don't break the link; falls back to cust_<sourceKey> when no customer has that name yet.
const sourceCustomers = {};

function getSourceCustomerId(sourceKey, label) {
  if (!sourceCustomers[sourceKey]) {
    const existing = store.customers.find(c => c.name === label);
    sourceCustomers[sourceKey] = existing ? existing.id : `cust_${sourceKey}`;
  }
  return sourceCustomers[sourceKey];
}

// Initialize with seed data
seedData();

// Store access functions
function getCustomers() {
  return [...store.customers];
}

function getCustomerById(id) {
  return store.customers.find(c => c.id === id);
}

function addCustomer(customer) {
  customerFiles.save(customer);
  store.customers.push(customer);
  return customer;
}

function updateCustomer(id, updates) {
  const index = store.customers.findIndex(c => c.id === id);
  if (index === -1) return null;
  const updated = { ...store.customers[index], ...updates, id };
  customerFiles.save(updated);
  store.customers[index] = updated;
  return updated;
}

function getTenants() {
  return [...store.tenants];
}

function getTenantByCustomerId(customerId) {
  return store.tenants.find(t => t.customerId === customerId);
}

function addTenant(tenant) {
  store.tenants.push(tenant);
  return tenant;
}

function getOnboardingState(customerId) {
  return store.onboardingStates.find(s => s.customerId === customerId);
}

function getAllOnboardingStates() {
  return [...store.onboardingStates];
}

function addOnboardingState(state) {
  store.onboardingStates.push(state);
  return state;
}

function updateOnboardingState(customerId, updates) {
  const index = store.onboardingStates.findIndex(s => s.customerId === customerId);
  if (index !== -1) {
    store.onboardingStates[index] = { ...store.onboardingStates[index], ...updates };
    return store.onboardingStates[index];
  }
  return null;
}

function getMappings(customerId) {
  return store.mappings.filter(m => m.customerId === customerId);
}

function getMapping(customerId, entity) {
  return store.mappings.find(m => m.customerId === customerId && m.entity === entity);
}

// Inserts or replaces the mapping for a customer/entity
function saveMapping(mapping) {
  const index = store.mappings.findIndex(m => m.customerId === mapping.customerId && m.entity === mapping.entity);
  if (index !== -1) {
    store.mappings[index] = mapping;
  } else {
    store.mappings.push(mapping);
  }
  return mapping;
}

function getClients(customerId) {
  return store.clients.filter(c => c.customerId === customerId);
}

// Inserts or replaces each client by customerId + sourceId, so re-importing never duplicates
function saveClients(clients) {
  clients.forEach(client => {
    const index = store.clients.findIndex(c => c.customerId === client.customerId && c.sourceId === client.sourceId);
    if (index !== -1) {
      store.clients[index] = client;
    } else {
      store.clients.push(client);
    }
  });
  return clients;
}

function addImportRun(run) {
  store.importRuns.push(run);
  return run;
}

function getImportRuns(customerId) {
  return store.importRuns.filter(r => r.customerId === customerId);
}

module.exports = {
  getCustomers,
  getCustomerById,
  addCustomer,
  updateCustomer,
  getTenants,
  getTenantByCustomerId,
  addTenant,
  getOnboardingState,
  getAllOnboardingStates,
  addOnboardingState,
  updateOnboardingState,
  getSourceCustomerId,
  getMappings,
  getMapping,
  saveMapping,
  getClients,
  saveClients,
  addImportRun,
  getImportRuns
};
