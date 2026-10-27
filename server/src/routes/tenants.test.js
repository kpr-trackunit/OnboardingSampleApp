const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const tenantsRouter = require('./tenants');
const store = require('../data/store');

describe('Tenant routes', () => {
  let server;
  let baseUrl;

  // Mount the router on a throwaway app on a random free port
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/tenants', tenantsRouter);
    await new Promise(resolve => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}`;
  });

  after(() => {
    server.close();
  });

  describe('GET /api/tenants', () => {
    it('should list every tenant joined with its customer name', async () => {
      const res = await fetch(`${baseUrl}/api/tenants`);
      const tenants = await res.json();

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(tenants));
      assert.strictEqual(tenants.length, 1);

      const [acme] = tenants;
      assert.strictEqual(acme.customerId, 'cust_001');
      // Customer names come from customers/*.md, so compare against the store
      assert.strictEqual(acme.customerName, store.getCustomerById('cust_001').name);
      assert.strictEqual(acme.status, 'pending');
      assert.strictEqual(acme.plan, 'professional');
      assert.ok(acme.createdAt);
    });
  });

  describe('PATCH /api/tenants/:customerId', () => {
    const customerId = 'cust_001';
    let original;

    const patch = (id, body) => fetch(`${baseUrl}/api/tenants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    // The store is shared, so put the seeded tenant back after each test
    before(() => {
      original = { ...store.getTenantByCustomerId(customerId) };
    });
    afterEach(() => {
      store.updateTenant(customerId, { plan: original.plan, status: original.status });
    });

    it('should change the plan', async () => {
      const res = await patch(customerId, { plan: 'enterprise' });
      const tenant = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(tenant.plan, 'enterprise');
      assert.strictEqual(store.getTenantByCustomerId(customerId).plan, 'enterprise');
    });

    it('should reject an unknown plan with 400', async () => {
      const res = await patch(customerId, { plan: 'platinum' });
      const body = await res.json();

      assert.strictEqual(res.status, 400);
      assert.match(body.error, /Invalid plan/);
      assert.strictEqual(store.getTenantByCustomerId(customerId).plan, original.plan);
    });

    it('should allow a plan change while the tenant is active', async () => {
      store.updateTenant(customerId, { status: 'active' });

      const res = await patch(customerId, { plan: 'starter' });
      const tenant = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(tenant.plan, 'starter');
      assert.strictEqual(tenant.status, 'active');
    });

    it('should return 404 for an unknown customer', async () => {
      const res = await patch('cust_does_not_exist', { plan: 'enterprise' });
      assert.strictEqual(res.status, 404);
    });

    it('should return 400 when no editable field is given', async () => {
      const res = await patch(customerId, { status: 'active' });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(store.getTenantByCustomerId(customerId).status, original.status);
    });
  });
});
