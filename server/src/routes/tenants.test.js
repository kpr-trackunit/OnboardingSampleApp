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

    it('should prefill the seeded tenant region from its customer', async () => {
      const res = await fetch(`${baseUrl}/api/tenants`);
      const [tenant] = await res.json();

      assert.ok(tenant.region);
      assert.strictEqual(tenant.region, store.getCustomerById(tenant.customerId).region);
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
      forceStatus(originalTenant.status, originalTenant.failureReason);
      store.getTenantByCustomerId(customerId).statusHistory = [...originalTenant.statusHistory];
      store.updateOnboardingState(customerId, structuredClone(originalState));
    });

    // Put the tenant straight into a status, bypassing the transition table
    function forceStatus(status, failureReason = null) {
      Object.assign(store.getTenantByCustomerId(customerId), { status, failureReason });
    }

    function patchStatus(status, id = customerId, reason) {
      return fetch(`${baseUrl}/api/tenants/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason })
      });
    }

    // Moving to failed needs a reason; other moves ignore it
    const REASON = 'Region not available for enterprise plan';
    const reasonFor = to => (to === 'failed' ? REASON : undefined);

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
          const res = await patchStatus(to, customerId, reasonFor(to));
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
        const res = await patchStatus(to, customerId, reasonFor(to));
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

    describe('failure reason', () => {
      for (const reason of [undefined, '', '   ']) {
        it(`rejects Mark failed with 400 when the reason is ${JSON.stringify(reason)}`, async () => {
          forceStatus('provisioning');
          const res = await patchStatus('failed', customerId, reason);
          assert.strictEqual(res.status, 400);
          assert.match((await res.json()).error, /reason is required/);

          // Nothing changes: still provisioning, no reason, step 3 untouched
          const tenant = store.getTenantByCustomerId(customerId);
          assert.strictEqual(tenant.status, 'provisioning');
          assert.strictEqual(tenant.failureReason, null);
          assert.deepStrictEqual(store.getOnboardingState(customerId), originalState);
        });
      }

      it('rejects a non-string reason with 400', async () => {
        forceStatus('provisioning');
        const res = await patchStatus('failed', customerId, 42);
        assert.strictEqual(res.status, 400);
        assert.strictEqual(store.getTenantByCustomerId(customerId).status, 'provisioning');
      });

      it('stores the (trimmed) reason and mirrors failed onto step 3', async () => {
        forceStatus('provisioning');
        const res = await patchStatus('failed', customerId, `  ${REASON}  `);
        const body = await res.json();

        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.status, 'failed');
        assert.strictEqual(body.failureReason, REASON);
        assert.strictEqual(store.getTenantByCustomerId(customerId).failureReason, REASON);

        // GET /api/tenants returns it too, so the row can show it after a reload
        const list = await (await fetch(`${baseUrl}/api/tenants`)).json();
        assert.strictEqual(list.find(t => t.customerId === customerId).failureReason, REASON);

        const tenantStep = store.getOnboardingState(customerId).steps.find(s => s.id === 'step_3');
        assert.strictEqual(tenantStep.status, 'failed');
      });

      it('Retry (failed -> provisioning) clears the reason', async () => {
        forceStatus('provisioning');
        await patchStatus('failed', customerId, REASON);

        const res = await patchStatus('provisioning');
        const body = await res.json();

        assert.strictEqual(res.status, 200);
        assert.strictEqual(body.status, 'provisioning');
        assert.strictEqual(body.failureReason, null);
        assert.strictEqual(store.getTenantByCustomerId(customerId).failureReason, null);
        const tenantStep = store.getOnboardingState(customerId).steps.find(s => s.id === 'step_3');
        assert.strictEqual(tenantStep.status, 'in_progress');
      });

      it('checks the transition before the reason (409 for pending -> failed)', async () => {
        forceStatus('pending');
        const res = await patchStatus('failed');
        assert.strictEqual(res.status, 409);
      });
    });

    describe('status history', () => {
      const history = () => store.getTenantByCustomerId(customerId).statusHistory;

      it('appends an entry per change, in order, across Start -> Mark failed -> Retry', async () => {
        forceStatus('pending');
        const before = history().length;
        const startedAt = Date.now();

        await patchStatus('provisioning');
        await patchStatus('failed', customerId, `  ${REASON}  `);
        const res = await patchStatus('provisioning');
        const body = await res.json();

        const added = history().slice(before);
        assert.deepStrictEqual(
          added.map(({ from, to }) => ({ from, to })),
          [
            { from: 'pending', to: 'provisioning' },
            { from: 'provisioning', to: 'failed' },
            { from: 'failed', to: 'provisioning' }
          ]
        );

        // The (trimmed) reason is kept on the failed entry only, even after Retry clears failureReason
        assert.strictEqual(added[1].reason, REASON);
        assert.ok(!('reason' in added[0]));
        assert.ok(!('reason' in added[2]));
        assert.strictEqual(body.failureReason, null);

        // Timestamps are ISO strings, in order, from this test run
        const times = added.map(e => Date.parse(e.at));
        assert.ok(added.every(e => new Date(e.at).toISOString() === e.at));
        assert.ok(times[0] >= startedAt - 1000);
        assert.ok(times[0] <= times[1] && times[1] <= times[2]);

        // The PATCH response and GET /api/tenants both carry the history
        assert.deepStrictEqual(body.statusHistory, history());
        const list = await (await fetch(`${baseUrl}/api/tenants`)).json();
        assert.deepStrictEqual(list.find(t => t.customerId === customerId).statusHistory, history());
      });

      it('does not log a rejected transition or a missing reason', async () => {
        forceStatus('pending');
        const before = history().length;

        assert.strictEqual((await patchStatus('active')).status, 409);
        forceStatus('provisioning');
        assert.strictEqual((await patchStatus('failed', customerId, '  ')).status, 400);

        assert.strictEqual(history().length, before);
      });
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
      store.updateTenant(customerId, {
        plan: original.plan,
        region: original.region,
        status: original.status
      });
    });

    it('should change the plan', async () => {
      const res = await patch(customerId, { plan: 'enterprise' });
      const tenant = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(tenant.plan, 'enterprise');
      assert.strictEqual(store.getTenantByCustomerId(customerId).plan, 'enterprise');
    });

    it('should not add a status history entry for a plan change', async () => {
      const before = structuredClone(store.getTenantByCustomerId(customerId).statusHistory);

      const res = await patch(customerId, { plan: 'enterprise' });
      const tenant = await res.json();

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(tenant.statusHistory, before);
      assert.deepStrictEqual(store.getTenantByCustomerId(customerId).statusHistory, before);
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

    it('should change the region', async () => {
      const newRegion = original.region === 'EU' ? 'APAC' : 'EU';
      const res = await patch(customerId, { region: newRegion });
      const tenant = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(tenant.region, newRegion);
      assert.strictEqual(store.getTenantByCustomerId(customerId).region, newRegion);
    });

    it('should reject an unknown region with 400', async () => {
      const res = await patch(customerId, { region: 'Mars' });
      const body = await res.json();

      assert.strictEqual(res.status, 400);
      assert.match(body.error, /Invalid region/);
      assert.strictEqual(store.getTenantByCustomerId(customerId).region, original.region);
    });

    it('should allow a region change while the tenant is active', async () => {
      store.updateTenant(customerId, { status: 'active' });

      const res = await patch(customerId, { region: 'UK' });
      const tenant = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(tenant.region, 'UK');
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
