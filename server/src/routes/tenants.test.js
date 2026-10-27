const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const tenantsRouter = require('./tenants');
const store = require('../data/store');
const { calculateProgress } = require('../models');

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

  describe('PATCH /api/tenants/:customerId/status', () => {
    const customerId = 'cust_001';
    let originalTenant;
    let originalState;

    // Tests share the in-memory store; snapshot Acme's tenant and onboarding state
    before(() => {
      originalTenant = { ...store.getTenantByCustomerId(customerId) };
      originalState = structuredClone(store.getOnboardingState(customerId));
    });

    afterEach(() => {
      forceStatus(originalTenant.status);
      store.updateOnboardingState(customerId, structuredClone(originalState));
    });

    // Put the tenant straight into a status, bypassing the transition table
    function forceStatus(status) {
      store.getTenantByCustomerId(customerId).status = status;
    }

    function patchStatus(status, id = customerId) {
      return fetch(`${baseUrl}/api/tenants/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
    }

    const STATUSES = ['pending', 'provisioning', 'active', 'failed'];
    const VALID = new Set([
      'pending->provisioning',
      'provisioning->active',
      'provisioning->failed',
      'failed->provisioning'
    ]);

    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const valid = VALID.has(`${from}->${to}`);
        it(`${valid ? 'allows' : 'rejects with 409'} ${from} -> ${to}`, async () => {
          forceStatus(from);
          const res = await patchStatus(to);
          const body = await res.json();

          if (valid) {
            assert.strictEqual(res.status, 200);
            assert.strictEqual(body.status, to);
            assert.strictEqual(body.customerId, customerId);
            assert.strictEqual(store.getTenantByCustomerId(customerId).status, to);
          } else {
            assert.strictEqual(res.status, 409);
            assert.match(body.error, new RegExp(`from ${from} to ${to}`));
            assert.strictEqual(store.getTenantByCustomerId(customerId).status, from);
          }
        });
      }
    }

    const STEP_MIRROR = [
      { from: 'failed', to: 'provisioning', step: 'in_progress' },
      { from: 'provisioning', to: 'active', step: 'completed' },
      { from: 'provisioning', to: 'failed', step: 'failed' }
    ];

    for (const { from, to, step } of STEP_MIRROR) {
      it(`mirrors ${to} onto onboarding step 3 as ${step}`, async () => {
        forceStatus(from);
        const res = await patchStatus(to);
        assert.strictEqual(res.status, 200);

        const state = store.getOnboardingState(customerId);
        const tenantStep = state.steps.find(s => s.id === 'step_3');
        assert.strictEqual(tenantStep.status, step);
        // Other steps are untouched
        for (const s of state.steps.filter(s => s.id !== 'step_3')) {
          const before = originalState.steps.find(o => o.id === s.id);
          assert.strictEqual(s.status, before.status);
        }
      });
    }

    it('recalculates progressPercent through Start then Mark active', async () => {
      forceStatus('pending');

      await patchStatus('provisioning');
      // in_progress does not count as completed
      assert.strictEqual(
        store.getOnboardingState(customerId).progressPercent,
        calculateProgress(store.getOnboardingState(customerId).steps)
      );
      assert.strictEqual(store.getOnboardingState(customerId).progressPercent, 0);

      await patchStatus('active');
      const state = store.getOnboardingState(customerId);
      // Seed has all 4 steps pending, so completing step 3 is 1 of 4
      assert.strictEqual(state.progressPercent, calculateProgress(state.steps));
      assert.strictEqual(state.progressPercent, 25);
    });

    it('does not touch onboarding state on a rejected transition', async () => {
      forceStatus('pending');
      const res = await patchStatus('active');
      assert.strictEqual(res.status, 409);
      assert.deepStrictEqual(store.getOnboardingState(customerId), originalState);
    });

    it('returns 400 for an unknown or missing status', async () => {
      for (const status of ['done', undefined, 'constructor']) {
        const res = await patchStatus(status);
        assert.strictEqual(res.status, 400);
        assert.match((await res.json()).error, /status must be one of/);
      }
    });

    it('returns 404 for a customer without a tenant', async () => {
      const res = await patchStatus('provisioning', 'cust_missing');
      assert.strictEqual(res.status, 404);
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
