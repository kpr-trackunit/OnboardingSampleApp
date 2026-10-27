const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const store = require('../data/store');
const { createTenant } = require('../models');
const {
  requireActiveTenant,
  requireCompleteMapping,
  sourceCustomerId,
  blockingReasons,
  TENANT_NOT_ACTIVE_MESSAGE,
  MAPPING_INCOMPLETE_MESSAGE
} = require('./importGuard');

describe('isTenantActive', () => {
  const customerId = 'cust_001';
  let originalStatus;

  before(() => { originalStatus = store.getTenantByCustomerId(customerId).status; });
  afterEach(() => { store.updateTenant(customerId, { status: originalStatus }); });

  it('is true only for an active tenant', () => {
    for (const status of ['pending', 'provisioning', 'failed']) {
      store.updateTenant(customerId, { status });
      assert.strictEqual(store.isTenantActive(customerId), false, status);
    }
    store.updateTenant(customerId, { status: 'active' });
    assert.strictEqual(store.isTenantActive(customerId), true);
  });

  it('is false for a customer without a tenant record', () => {
    assert.strictEqual(store.isTenantActive('cust_without_tenant'), false);
  });
});

describe('requireActiveTenant', () => {
  const customerId = 'cust_guard_test';
  let server;
  let baseUrl;

  // A throwaway app: the guard maps every sourceKey except "unknown" to the test customer
  before(async () => {
    store.addTenant(createTenant({ customerId, status: 'pending' }));
    const app = express();
    const lookup = sourceKey => (sourceKey === 'unknown' ? null : customerId);
    app.post('/import/:sourceKey/:entity', requireActiveTenant(lookup), (req, res) => {
      res.json({ imported: true });
    });
    await new Promise(resolve => { server = app.listen(0, resolve); });
    baseUrl = `http://localhost:${server.address().port}`;
  });

  after(() => server.close());

  const post = sourceKey => fetch(`${baseUrl}/import/${sourceKey}/clients`, { method: 'POST' });

  it('rejects the import with 409 while the tenant is pending', async () => {
    store.updateTenant(customerId, { status: 'pending' });
    const res = await post('some-source');
    const body = await res.json();

    assert.strictEqual(res.status, 409);
    assert.strictEqual(body.error, TENANT_NOT_ACTIVE_MESSAGE);
    assert.strictEqual(body.customerId, customerId);
  });

  it('allows the import once the tenant is active', async () => {
    store.updateTenant(customerId, { status: 'active' });
    const res = await post('some-source');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { imported: true });
  });

  it('lets an unknown source through to the route (which answers 404 itself)', async () => {
    store.updateTenant(customerId, { status: 'pending' });
    const res = await post('unknown');
    assert.strictEqual(res.status, 200);
  });
});

describe('sourceCustomerId', () => {
  it('links each sample-data source to its customer through the store', () => {
    const { listSources } = require('../import/sources');
    for (const source of listSources()) {
      assert.strictEqual(
        sourceCustomerId(source.sourceKey),
        store.getSourceCustomerId(source.sourceKey, source.label)
      );
    }
  });

  it('returns null for an unknown source', () => {
    assert.strictEqual(sourceCustomerId('no-such-source'), null);
  });
});

describe('requireCompleteMapping', () => {
  const customerId = 'cust_mapping_gate_test';
  const missingName = {
    code: 'missing_required_column', blocking: true, strict: false, field: 'name',
    message: 'Required field name has no source column'
  };
  const defaulted = {
    code: 'unmapped_values_defaulted', blocking: false, strict: false, field: 'status',
    message: "status: 'H' not mapped, will use default 'pending'"
  };
  // clients is complete (with a non-blocking reason), every other entity is not
  const completeness = (id, entity) => (entity === 'clients'
    ? { complete: true, reasons: [defaulted], dateFormat: null }
    : { complete: false, reasons: [missingName, defaulted], dateFormat: null });
  let server;
  let baseUrl;

  before(async () => {
    store.addTenant(createTenant({ customerId, status: 'pending' }));
    const app = express();
    const lookup = sourceKey => (sourceKey === 'unknown' ? null : customerId);
    app.post('/import/:sourceKey/:entity',
      requireActiveTenant(lookup),
      requireCompleteMapping(lookup, completeness),
      (req, res) => res.json({ imported: req.params.entity }));
    await new Promise(resolve => { server = app.listen(0, resolve); });
    baseUrl = `http://localhost:${server.address().port}`;
  });

  after(() => server.close());

  const post = (entity, sourceKey = 'some-source') =>
    fetch(`${baseUrl}/import/${sourceKey}/${entity}`, { method: 'POST' });

  it('rejects an entity whose mapping is incomplete with 409 and the blocking reasons', async () => {
    store.updateTenant(customerId, { status: 'active' });
    const res = await post('transactions');
    const body = await res.json();

    assert.strictEqual(res.status, 409);
    assert.strictEqual(MAPPING_INCOMPLETE_MESSAGE, 'Mapping incomplete');
    assert.strictEqual(body.error, MAPPING_INCOMPLETE_MESSAGE);
    assert.deepStrictEqual(body.reasons, [missingName]);
    assert.strictEqual(body.entity, 'transactions');
  });

  it('lets an entity whose mapping is complete through', async () => {
    store.updateTenant(customerId, { status: 'active' });
    const res = await post('clients');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { imported: 'clients' });
  });

  it('runs after the tenant check', async () => {
    store.updateTenant(customerId, { status: 'pending' });
    const body = await (await post('transactions')).json();
    assert.strictEqual(body.error, TENANT_NOT_ACTIVE_MESSAGE);
  });

  it('lets unknown sources and entities through to the route', async () => {
    store.updateTenant(customerId, { status: 'active' });
    assert.strictEqual((await post('transactions', 'unknown')).status, 200);
    assert.strictEqual((await post('invoices')).status, 200);
  });

  it('gates the sample data per entity: clients complete, transactions not mapped yet', () => {
    const { listSources } = require('../import/sources');
    const { entityCompleteness } = require('../import/completeness');
    for (const source of listSources()) {
      const id = sourceCustomerId(source.sourceKey);
      assert.strictEqual(entityCompleteness(id, 'clients').complete, true, `${source.sourceKey} clients`);
      const transactions = entityCompleteness(id, 'transactions');
      assert.strictEqual(transactions.complete, false, `${source.sourceKey} transactions`);
      assert.ok(blockingReasons(transactions).length > 0);
    }
  });
});
