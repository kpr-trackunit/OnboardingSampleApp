/**
 * In-Memory Data Store
 * Simple storage for the training exercise - no database needed
 */

const {
  createCustomer,
  createTenant,
  createDefaultOnboardingSteps,
  calculateProgress,
  canTransitionTenant,
  TENANT_STATUS_TO_STEP_STATUS
} = require('../models');
const customerFiles = require('./customerFiles');

// In-memory storage
const store = {
  customers: [],
  tenants: [],
  onboardingStates: []
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

function addTenant(tenant) {
  store.tenants.push(tenant);
  return tenant;
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

module.exports = {
  getCustomers,
  getCustomerById,
  addCustomer,
  updateCustomer,
  getTenants,
  getTenantList,
  getTenantByCustomerId,
  addTenant,
  updateTenantStatus,
  getOnboardingState,
  getAllOnboardingStates,
  addOnboardingState,
  updateOnboardingState
};
