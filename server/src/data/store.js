/**
 * In-Memory Data Store
 * Simple storage for the training exercise - no database needed
 */

const {
  createCustomer,
  createTenant,
  createDefaultOnboardingSteps,
  createMapping,
  calculateProgress,
  canTransitionTenant,
  TENANT_STATUS_TO_STEP_STATUS
} = require('../models');
const customerFiles = require('./customerFiles');
const { seedMappings } = require('./mappingSeeds');

// In-memory storage
const store = {
  customers: [],
  tenants: [],
  onboardingStates: [],
  mappings: [],
  clients: []
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
  // Added after the customers load so its region is backfilled from the customer
  addTenant(exampleTenant);
  // Every other customer gets a default tenant, so none is missing from Tenant Setup
  backfillTenants();
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

// Adds a customer and, unless it already has one, its default tenant (pending / starter)
function addCustomer(customer) {
  customerFiles.save(customer);
  store.customers.push(customer);
  ensureTenant(customer.id);
  return customer;
}

// Creates the default tenant for a customer that has none; one tenant per customerId.
// The id is derived from the customer id, since a timestamp id collides within a backfill
function ensureTenant(customerId) {
  return getTenantByCustomerId(customerId)
    || addTenant(createTenant({ id: `tenant_${customerId}`, customerId }));
}

// Gives every customer without a tenant its default tenant. Safe to run repeatedly
function backfillTenants() {
  store.customers.forEach(customer => ensureTenant(customer.id));
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

// All tenants joined with their customer's name (Tenant Setup table)
function getTenantList() {
  return store.tenants.map(tenant => {
    const customer = getCustomerById(tenant.customerId);
    return { ...tenant, customerName: customer?.name || 'Unknown' };
  });
}

function getTenantByCustomerId(customerId) {
  return store.tenants.find(t => t.customerId === customerId);
}

// Adds a tenant. A tenant without a region gets its customer's region (data residency prefill)
function addTenant(tenant) {
  const customer = getCustomerById(tenant.customerId);
  const added = { ...tenant, region: tenant.region || customer?.region || '' };
  store.tenants.push(added);
  return added;
}

const TENANT_SETUP_STEP_ID = 'step_3';

/**
 * Moves a customer's tenant to a new status, enforcing the transition table,
 * and mirrors it onto onboarding step 3 (recalculating progressPercent).
 * @returns {{ tenant: object } | { error: string, code: 'not_found' | 'invalid_transition' }}
 */
function updateTenantStatus(customerId, status) {
  const index = store.tenants.findIndex(t => t.customerId === customerId);
  if (index === -1) {
    return { error: 'Tenant not found', code: 'not_found' };
  }

  const current = store.tenants[index];
  if (!canTransitionTenant(current.status, status)) {
    return {
      error: `Cannot change tenant status from ${current.status} to ${status}`,
      code: 'invalid_transition'
    };
  }

  const tenant = { ...current, status };
  store.tenants[index] = tenant;

  const state = getOnboardingState(customerId);
  if (state) {
    const steps = state.steps.map(step =>
      step.id === TENANT_SETUP_STEP_ID
        ? { ...step, status: TENANT_STATUS_TO_STEP_STATUS[status] }
        : step
    );
    updateOnboardingState(customerId, { steps, progressPercent: calculateProgress(steps) });
  }

  return { tenant };
}

// Merge updates into a customer's tenant. Returns the updated tenant, or null if it has none
function updateTenant(customerId, updates) {
  const index = store.tenants.findIndex(t => t.customerId === customerId);
  if (index === -1) return null;
  store.tenants[index] = { ...store.tenants[index], ...updates, customerId };
  return store.tenants[index];
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

function addClients(clients) {
  store.clients.push(...clients);
  return clients;
}

module.exports = {
  getCustomers,
  getCustomerById,
  addCustomer,
  updateCustomer,
  getTenants,
  getTenantList,
  getTenantByCustomerId,
  addTenant,
  backfillTenants,
  updateTenantStatus,
  updateTenant,
  getOnboardingState,
  getAllOnboardingStates,
  addOnboardingState,
  updateOnboardingState,
  getSourceCustomerId,
  getMappings,
  getMapping,
  saveMapping,
  getClients,
  addClients
};
