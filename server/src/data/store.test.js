const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Point customer persistence at a scratch copy of customers/ before the store
// loads, so the test never writes to the repo's customer files. Only Acme
// (cust_001) is seeded with an onboarding state; the others start without one.
const REPO_CUSTOMERS = path.join(__dirname, '..', '..', '..', 'customers');
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'customers-store-'));
fs.cpSync(REPO_CUSTOMERS, scratchDir, { recursive: true });
process.env.CUSTOMERS_DIR = scratchDir;

const store = require('./store');
const { createCustomer, calculateProgress } = require('../models');

const step1 = customerId =>
  store.getOnboardingState(customerId).steps.find(s => s.id === 'step_1');

describe('syncCustomerInfoStep', () => {
  after(() => fs.rmSync(scratchDir, { recursive: true, force: true }));

  it('gives every loaded customer an onboarding state at startup, with step 1 derived from its info', () => {
    for (const customer of store.getCustomers()) {
      const state = store.getOnboardingState(customer.id);
      assert.ok(state, `${customer.id} should have an onboarding state`);
      assert.strictEqual(state.steps.length, 4);
      assert.strictEqual(state.progressPercent, calculateProgress(state.steps));
    }
    // Acme has every field; the sample-data customers are missing contactEmail
    assert.strictEqual(step1('cust_001').status, 'completed');
    assert.strictEqual(step1('cust_002').status, 'in_progress');
  });

  it('creates the onboarding state for a new customer that has none', () => {
    const customer = createCustomer({ id: 'cust_store_test', name: 'Store Test Co' });
    assert.strictEqual(store.getOnboardingState(customer.id), undefined);

    store.addCustomer(customer);

    const state = store.getOnboardingState(customer.id);
    assert.ok(state);
    // Name is one of the required fields, so a name-only customer is in progress
    assert.deepStrictEqual(state.steps.map(s => s.status),
      ['in_progress', 'pending', 'pending', 'pending']);
    assert.strictEqual(state.progressPercent, 0);
  });

  it('marks step 1 completed and recalculates progress once nothing is missing, and back again', () => {
    const id = 'cust_002';
    const before = store.getOnboardingState(id).progressPercent;

    store.updateCustomer(id, { contactEmail: 'ops@abc.example.com' });
    let state = store.syncCustomerInfoStep(id);
    assert.strictEqual(step1(id).status, 'completed');
    assert.strictEqual(state.progressPercent, before + 25);
    assert.strictEqual(state.progressPercent, calculateProgress(state.steps));

    store.updateCustomer(id, { contactEmail: '' });
    state = store.syncCustomerInfoStep(id);
    assert.strictEqual(step1(id).status, 'in_progress');
    assert.strictEqual(state.progressPercent, before);
  });

  it('leaves the other steps alone', () => {
    const id = 'cust_003';
    const others = store.getOnboardingState(id).steps.filter(s => s.id !== 'step_1');
    store.syncCustomerInfoStep(id);
    assert.deepStrictEqual(
      store.getOnboardingState(id).steps.filter(s => s.id !== 'step_1'), others);
  });

  it('returns null and creates nothing for an unknown customer', () => {
    const count = store.getAllOnboardingStates().length;
    assert.strictEqual(store.syncCustomerInfoStep('cust_nope'), null);
    assert.strictEqual(store.getAllOnboardingStates().length, count);
  });
});
