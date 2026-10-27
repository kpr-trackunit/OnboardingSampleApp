const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const customerFiles = require('../data/customerFiles');

// A new source creates a customer, and addCustomer writes customers/<id>.md, so point the
// store at a scratch copy of the customers directory before it loads
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-all-test-customers-'));
fs.cpSync(customerFiles.CUSTOMERS_DIR, scratchDir, { recursive: true });
process.env.CUSTOMERS_DIR = scratchDir;
delete require.cache[require.resolve('../data/customerFiles')];

const express = require('express');
const store = require('../data/store');
const { ENTITY_FILES } = require('./sources');
const { ImportError, getDependencies } = require('./importer');
const { inDependencyOrder, importAll } = require('./importAll');
const { buildQueue } = require('../models/queue');

const FIXTURE_DIR = path.join(__dirname, '../../../tests/fixtures/import');
const newSourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-all-test-data-'));

after(() => {
  fs.rmSync(scratchDir, { recursive: true, force: true });
  fs.rmSync(newSourceDir, { recursive: true, force: true });
});

const importStep = customerId => store.getOnboardingState(customerId).steps.find(s => s.id === 'step_4');
const byEntity = result => Object.fromEntries(result.entities.map(e => [e.entity, e]));

// A stand-in for importEntity: records the order it's called in and answers per entity
function fakeImport(answers) {
  const calls = [];
  const importOne = (sourceKey, entity) => {
    calls.push(entity);
    const answer = answers[entity] || { imported: 1, rejected: 0, warnings: [] };
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { calls, importOne };
}

describe('inDependencyOrder', () => {
  it('keeps the ENTITY_FILES order: clients, contacts, accounts, transactions', () => {
    assert.deepStrictEqual(
      inDependencyOrder(ENTITY_FILES.map(f => f.entity)),
      ['clients', 'contacts', 'accounts', 'transactions']
    );
  });

  it('puts every entity after the entities it references, whatever order it is given', () => {
    const order = inDependencyOrder(['transactions', 'contacts', 'accounts', 'clients']);
    assert.strictEqual(order.length, 4);
    order.forEach((entity, index) => {
      getDependencies(entity).forEach(dep => {
        assert.ok(order.indexOf(dep) < index, `${dep} before ${entity} in ${order.join(', ')}`);
      });
    });
  });
});

describe('importAll', () => {
  it('imports each entity in dependency order', () => {
    const { calls, importOne } = fakeImport({});
    const result = importAll('xyz-financial-services', { importOne });

    assert.deepStrictEqual(calls, ['clients', 'contacts', 'accounts', 'transactions']);
    assert.ok(result.entities.every(e => e.status === 'ok'));
  });

  it('marks a failing entity failed and skips the entities that depend on it', () => {
    const { calls, importOne } = fakeImport({ clients: new ImportError("No clients mapping for 'XYZ'", 400) });
    const result = byEntity(importAll('xyz-financial-services', { importOne }));

    assert.deepStrictEqual(calls, ['clients', 'accounts']);
    assert.deepStrictEqual(result.clients, {
      entity: 'clients', status: 'failed', imported: 0, rejected: 0, warnings: 0, message: "No clients mapping for 'XYZ'"
    });
    assert.strictEqual(result.contacts.status, 'skipped');
    assert.strictEqual(result.contacts.message, 'skipped: clients failed');
    assert.strictEqual(result.accounts.status, 'ok');
    assert.strictEqual(result.transactions.status, 'skipped');
    assert.strictEqual(result.transactions.message, 'skipped: clients failed');
  });

  it('skips entities whose dependency imported no rows', () => {
    const { calls, importOne } = fakeImport({ accounts: { imported: 0, rejected: 3, warnings: [] } });
    const result = byEntity(importAll('xyz-financial-services', { importOne }));

    assert.deepStrictEqual(calls, ['clients', 'contacts', 'accounts']);
    assert.strictEqual(result.accounts.status, 'ok');
    assert.strictEqual(result.transactions.status, 'skipped');
    assert.strictEqual(result.transactions.message, 'skipped: accounts failed');
  });

  it('lets errors that are not ImportErrors through', () => {
    const { importOne } = fakeImport({ clients: new TypeError('boom') });
    assert.throws(() => importAll('xyz-financial-services', { importOne }), TypeError);
  });

  it('answers 404 for an unknown source', () => {
    assert.throws(() => importAll('nope'), err => err instanceof ImportError && err.status === 404);
  });

  it('completes the Import step for a clean run of the sample files', () => {
    const result = importAll('premier-bookkeeping');

    assert.deepStrictEqual(result.entities.map(e => [e.entity, e.status, e.rejected]), [
      ['clients', 'ok', 0], ['contacts', 'ok', 0], ['accounts', 'ok', 0], ['transactions', 'ok', 0]
    ]);
    assert.ok(result.entities.every(e => e.imported > 0));
    assert.strictEqual(result.importStep, 'completed');
    assert.strictEqual(importStep(result.customerId).status, 'completed');
    // The customer had no onboarding state: one is created with only Import completed
    assert.strictEqual(result.progressPercent, 25);
    assert.strictEqual(store.getOnboardingState(result.customerId).progressPercent, 25);
  });

  it('fails the Import step when any entity has rejected rows', () => {
    const result = importAll('abc-accounting', { dataDir: FIXTURE_DIR });

    assert.ok(result.entities.some(e => e.rejected > 0));
    assert.strictEqual(result.importStep, 'failed');
    assert.strictEqual(importStep(result.customerId).status, 'failed');
    assert.strictEqual(result.progressPercent, 0);
  });

  it('keeps the other steps and recalculates progress for a customer that has a state', () => {
    // cust_001 is seeded with an onboarding state; give it one completed step first
    const customerId = 'cust_001';
    const steps = store.getOnboardingState(customerId).steps.map(s => (s.id === 'step_1' ? { ...s, status: 'completed' } : s));
    store.updateOnboardingState(customerId, { steps });

    const state = store.updateImportStep(customerId, 'completed');
    assert.deepStrictEqual(state.steps.map(s => s.status), ['completed', 'pending', 'pending', 'completed']);
    assert.strictEqual(state.progressPercent, 50);
  });

  describe('a source no customer is linked to yet', () => {
    let result;

    before(() => {
      const folder = path.join(newSourceDir, 'CustomerD_NorthwindTraders');
      fs.mkdirSync(folder);
      fs.writeFileSync(path.join(folder, 'clients.csv'), 'Client ID,Name\nN1,Northwind Retail\n');
      result = importAll('northwind-traders', { dataDir: newSourceDir });
    });

    it('creates the customer from the source label, so it shows in the onboarding queue', () => {
      const customer = store.getCustomerById(result.customerId);
      assert.ok(customer, 'customer created');
      assert.strictEqual(customer.name, 'Northwind Traders');
      assert.ok(fs.existsSync(path.join(scratchDir, `${result.customerId}.md`)), 'customer file written');

      const row = buildQueue(store.getCustomers(), store.getAllOnboardingStates())
        .find(r => r.customerId === result.customerId);
      assert.strictEqual(row.customerName, 'Northwind Traders');
      assert.strictEqual(row.steps.find(s => s.id === 'step_4').status, 'failed');
    });

    it('gives the new customer a pending tenant', () => {
      assert.strictEqual(store.getTenantByCustomerId(result.customerId).status, 'pending');
    });

    it('fails the entity that has no mapping, and the Import step', () => {
      assert.deepStrictEqual(result.entities.map(e => [e.entity, e.status]), [['clients', 'failed']]);
      assert.match(result.entities[0].message, /No clients mapping/);
      assert.strictEqual(result.importStep, 'failed');
    });

    it('links the same customer on the next run instead of creating another', () => {
      const again = importAll('northwind-traders', { dataDir: newSourceDir });
      assert.strictEqual(again.customerId, result.customerId);
      assert.strictEqual(store.getCustomers().filter(c => c.name === 'Northwind Traders').length, 1);
    });
  });
});

describe('POST /api/import/:sourceKey/all', () => {
  const sourceKey = 'xyz-financial-services';
  const customerId = store.getSourceCustomerId(sourceKey, 'XYZ Financial Services');
  let server;
  let baseUrl;

  before(async () => {
    const app = express();
    app.use('/api/import', require('../routes/importAll'));
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());

  it('answers 409 while the tenant is not active', async () => {
    store.updateTenant(customerId, { status: 'pending' });
    const res = await fetch(`${baseUrl}/api/import/${sourceKey}/all`, { method: 'POST' });
    assert.strictEqual(res.status, 409);
    assert.match((await res.json()).error, /Tenant not active/);
  });

  it('imports every entity once the tenant is active', async () => {
    store.updateTenant(customerId, { status: 'active' });
    const res = await fetch(`${baseUrl}/api/import/${sourceKey}/all`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body.entities.map(e => [e.entity, e.status]), [
      ['clients', 'ok'], ['contacts', 'ok'], ['accounts', 'ok'], ['transactions', 'ok']
    ]);
    assert.strictEqual(body.customerId, customerId);
  });

  it('answers 404 for an unknown source', async () => {
    const res = await fetch(`${baseUrl}/api/import/nope/all`, { method: 'POST' });
    assert.strictEqual(res.status, 404);
  });
});
