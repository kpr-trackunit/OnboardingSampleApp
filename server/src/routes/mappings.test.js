const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const mappingsRouter = require('./mappings');
const { ENTITIES, describeFields } = require('./mappings');
const store = require('../data/store');
const { seedMappings } = require('../data/mappingSeeds');

// The customer the XYZ seed is linked to (customers come from customers/*.md, so look it up)
function xyzCustomerId() {
  return store.getSourceCustomerId('xyz-financial-services', 'XYZ Financial Services');
}

describe('Mapping routes', () => {
  let server;
  let baseUrl;

  // Mount the router on a throwaway app on a random free port
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/mappings', mappingsRouter);
    await new Promise(resolve => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}`;
  });

  after(() => {
    server.close();
  });

  describe('GET /api/mappings/:customerId', () => {
    it('should list all 4 entities with the stored mapping or null', async () => {
      const customerId = xyzCustomerId();
      const res = await fetch(`${baseUrl}/api/mappings/${customerId}`);
      const body = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.customerId, customerId);
      assert.strictEqual(body.customerName, store.getCustomerById(customerId).name);
      assert.deepStrictEqual(body.entities.map(e => e.entity), ['clients', 'contacts', 'accounts', 'transactions']);
      body.entities.forEach(({ entity, mapping }) => {
        assert.deepStrictEqual(mapping, store.getMapping(customerId, entity) || null);
      });
      assert.strictEqual(body.entities[0].mapping.columns.name, 'companyName');
    });

    it('should show no mappings for a customer without any', async () => {
      const res = await fetch(`${baseUrl}/api/mappings/cust_001`);
      const body = await res.json();

      assert.strictEqual(res.status, 200);
      assert.ok(body.entities.every(e => e.mapping === null));
    });

    it('should return 404 for an unknown customer', async () => {
      const res = await fetch(`${baseUrl}/api/mappings/cust_nope`);
      assert.strictEqual(res.status, 404);
      assert.strictEqual((await res.json()).error, 'Customer not found');
    });
  });

  describe('GET /api/mappings/:customerId/:entity', () => {
    it('should return the mapping with every target field, mapped or not', async () => {
      const res = await fetch(`${baseUrl}/api/mappings/${xyzCustomerId()}/clients`);
      const body = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.mapping.entity, 'clients');
      assert.strictEqual(body.mapping.columns.name, 'companyName');
      assert.deepStrictEqual(body.mapping.values.status.map, { A: 'active', I: 'inactive', P: 'pending' });
      assert.strictEqual(body.mapping.dateFormat, 'YYYY-MM-DD');

      const name = body.fields.find(f => f.field === 'name');
      assert.deepStrictEqual(name, { field: 'name', type: 'text', required: true, strict: false, values: null });
      const status = body.fields.find(f => f.field === 'status');
      assert.strictEqual(status.type, 'picklist');
      assert.deepStrictEqual(status.values, ['active', 'inactive', 'pending']);
    });

    it('should return 404 for an unknown customer', async () => {
      const res = await fetch(`${baseUrl}/api/mappings/cust_nope/clients`);
      assert.strictEqual(res.status, 404);
    });

    it('should return 404 for an unknown entity', async () => {
      const res = await fetch(`${baseUrl}/api/mappings/${xyzCustomerId()}/invoices`);
      assert.strictEqual(res.status, 404);
      assert.match((await res.json()).error, /Unknown entity/);
    });

    it('should return 404 when the customer has no mapping for the entity', async () => {
      const res = await fetch(`${baseUrl}/api/mappings/cust_001/clients`);
      assert.strictEqual(res.status, 404);
      assert.strictEqual((await res.json()).error, 'No mapping yet');
    });
  });

  describe('describeFields', () => {
    it('should list unmapped target fields and mark strict ones', () => {
      const fields = describeFields('clients', { columns: { name: 'Company' } });
      assert.ok(fields.some(f => f.field === 'taxId'), 'unmapped fields are listed');
      assert.ok(fields.every(f => typeof f.strict === 'boolean'));
    });

    it('should keep mapped columns that have no target field definition yet', () => {
      const fields = describeFields('invoices', { columns: { total: 'Amount' } });
      assert.deepStrictEqual(fields, [{ field: 'total', type: 'unknown', required: false, strict: false, values: null }]);
    });
  });
});

describe('Mapping seed shape', () => {
  it('should give every seed columns and values objects and a known entity', () => {
    seedMappings().forEach(seed => {
      const label = `${seed.sourceKey}/${seed.entity}`;
      assert.ok(ENTITIES.includes(seed.entity), `${label}: entity`);
      assert.ok(seed.columns && typeof seed.columns === 'object' && !Array.isArray(seed.columns), `${label}: columns`);
      assert.ok(seed.values && typeof seed.values === 'object' && !Array.isArray(seed.values), `${label}: values`);
      Object.values(seed.values).forEach(({ map }) => assert.strictEqual(typeof map, 'object', `${label}: value map`));
    });
  });

  it('should load every seed into the store, one per customer and entity', () => {
    seedMappings().forEach(seed => {
      const customerId = store.getSourceCustomerId(seed.sourceKey, seed.label);
      const stored = store.getMapping(customerId, seed.entity);
      assert.ok(stored, `${seed.sourceKey}/${seed.entity}`);
      assert.deepStrictEqual(stored.columns, seed.columns);
    });
  });
});
