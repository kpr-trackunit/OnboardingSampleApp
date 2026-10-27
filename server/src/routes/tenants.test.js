const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const tenantsRouter = require('./tenants');

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
      assert.strictEqual(acme.customerName, 'Acme Corporation');
      assert.strictEqual(acme.status, 'pending');
      assert.strictEqual(acme.plan, 'professional');
      assert.ok(acme.createdAt);
    });
  });
});
