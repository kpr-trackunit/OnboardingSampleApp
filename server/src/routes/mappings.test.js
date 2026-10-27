const { describe, it, before, after, afterEach } = require('node:test');
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

function abcCustomerId() {
  return store.getSourceCustomerId('abc-accounting', 'ABC Accounting');
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

    it('should give each entity its completeness, checked against the source file', async () => {
      const res = await fetch(`${baseUrl}/api/mappings/${xyzCustomerId()}`);
      const body = await res.json();

      const clients = body.entities.find(e => e.entity === 'clients');
      assert.deepStrictEqual(clients.completeness, {
        complete: true,
        reasons: [],
        dateFormat: { format: 'YYYY-MM-DD', status: 'detected' }
      });

      // Entities not seeded yet read "Incomplete: no mapping yet"
      body.entities.filter(e => !e.mapping).forEach(({ completeness }) => {
        assert.strictEqual(completeness.complete, false);
        assert.deepStrictEqual(completeness.reasons.map(r => [r.code, r.message]), [['no_mapping', 'No mapping yet']]);
      });
    });

    it('should mark every entity incomplete for a customer with no mappings', async () => {
      const body = await (await fetch(`${baseUrl}/api/mappings/cust_001`)).json();
      assert.ok(body.entities.every(e => e.completeness.complete === false));
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

    it("should list the source file's headers for the column dropdowns", async () => {
      const res = await fetch(`${baseUrl}/api/mappings/${abcCustomerId()}/clients`);
      const body = await res.json();

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(body.headers, [
        'Client ID', 'Client Name', 'Business Type', 'Status', 'Date Onboarded',
        'Tax ID', 'Annual Revenue', 'Industry', 'Payment Terms', 'Primary Contact'
      ]);
    });
  });

  describe('PUT /api/mappings/:customerId/:entity', () => {
    let original;

    before(() => {
      original = store.getMapping(abcCustomerId(), 'clients');
    });

    // Each test edits the shared store, so put the seeded ABC clients mapping back
    afterEach(() => {
      store.saveMapping(original);
    });

    function put(body, { customerId = abcCustomerId(), entity = 'clients' } = {}) {
      return fetch(`${baseUrl}/api/mappings/${customerId}/${entity}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    it('should change only the columns sent, and save them', async () => {
      const res = await put({ columns: { paymentTerms: 'Primary Contact' } });
      const body = await res.json();

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(body.mapping.columns, { ...original.columns, paymentTerms: 'Primary Contact' });
      assert.deepStrictEqual(body.mapping.values, original.values);
      assert.strictEqual(store.getMapping(abcCustomerId(), 'clients').columns.paymentTerms, 'Primary Contact');
      assert.strictEqual(body.completeness.complete, true);
      assert.ok(body.headers.includes('Primary Contact'));
      assert.ok(body.fields.some(f => f.field === 'paymentTerms'));
    });

    it('should reject an unknown target field with 400 and change nothing', async () => {
      const res = await put({ columns: { nickname: 'Client Name' } });

      assert.strictEqual(res.status, 400);
      assert.match((await res.json()).error, /Unknown target field 'nickname'/);
      assert.deepStrictEqual(store.getMapping(abcCustomerId(), 'clients'), original);
    });

    it("should reject a column that isn't in the file's headers with 400", async () => {
      const res = await put({ columns: { name: 'Company Name' } });

      assert.strictEqual(res.status, 400);
      assert.match((await res.json()).error, /'Company Name' is not a column in the clients file/);
      assert.deepStrictEqual(store.getMapping(abcCustomerId(), 'clients'), original);
    });

    it('should make the mapping incomplete when a required field is unmapped', async () => {
      const res = await put({ columns: { name: null } });
      const body = await res.json();

      assert.strictEqual(res.status, 200);
      assert.ok(!('name' in body.mapping.columns));
      assert.strictEqual(body.completeness.complete, false);
      assert.ok(body.completeness.reasons.some(r => r.code === 'missing_required_column' && r.field === 'name'));
    });

    it('should reject keys that are not editable yet, an empty edit, and columns that are not an object', async () => {
      const values = await put({ values: {} });
      assert.strictEqual(values.status, 400);
      assert.match((await values.json()).error, /Can't edit values/);

      assert.strictEqual((await put({})).status, 400);
      assert.strictEqual((await put({ columns: ['name'] })).status, 400);
    });

    it('should return 404 for an unknown customer, entity or mapping', async () => {
      const edit = { columns: { name: null } };
      assert.strictEqual((await put(edit, { customerId: 'cust_nope' })).status, 404);
      assert.strictEqual((await put(edit, { entity: 'invoices' })).status, 404);
      assert.strictEqual((await put(edit, { customerId: 'cust_001' })).status, 404);
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
