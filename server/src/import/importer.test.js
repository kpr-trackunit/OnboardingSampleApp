const { describe, it } = require('node:test');
const assert = require('node:assert');
const { ImportError, listImportSources, importEntity, getImported } = require('./importer');
const store = require('../data/store');

describe('Importer', () => {
  describe('listImportSources', () => {
    it('should link each source to the customer with the same name', () => {
      const abc = listImportSources().find(s => s.sourceKey === 'abc-accounting');
      const customer = store.getCustomers().find(c => c.name === 'ABC Accounting');

      assert.strictEqual(abc.customerId, customer ? customer.id : 'cust_abc-accounting');
    });

    it('should mark files that have a mapping as importable', () => {
      const abc = listImportSources().find(s => s.sourceKey === 'abc-accounting');

      assert.strictEqual(abc.files.find(f => f.entity === 'clients').importable, true);
      assert.strictEqual(abc.files.find(f => f.entity === 'transactions').importable, false);
    });
  });

  describe('importEntity', () => {
    it('should import the 10 ABC clients in canonical shape', () => {
      const result = importEntity('abc-accounting', 'clients');
      assert.deepStrictEqual(result, { entity: 'clients', imported: 10, rejected: 0, dateFormat: 'MM/DD/YYYY' });

      const customerId = store.getSourceCustomerId('abc-accounting', 'ABC Accounting');
      const clients = getImported('abc-accounting', 'clients');
      assert.strictEqual(clients.length, 10);
      assert.deepStrictEqual(clients[0], {
        id: `client_${customerId}_C001`,
        customerId,
        sourceId: 'C001',
        name: 'Riverside Manufacturing LLC',
        entityType: 'company',
        entityTypeSource: 'Corporation',
        status: 'active',
        statusSource: 'Active',
        startDate: '2023-01-15',
        taxId: '12-3456789',
        annualRevenue: 2500000,
        industry: 'Manufacturing',
        paymentTerms: 'Net 30'
      });
    });

    it('should import all 12 XYZ clients despite the unquoted commas', () => {
      const result = importEntity('xyz-financial-services', 'clients');
      assert.deepStrictEqual(result, { entity: 'clients', imported: 12, rejected: 0, dateFormat: 'YYYY-MM-DD' });

      const apex = getImported('xyz-financial-services', 'clients').find(c => c.sourceId === 'XYZ-001');
      assert.strictEqual(apex.industry, 'TECH');
      assert.strictEqual(apex.paymentTerms, 'NET30');
      assert.strictEqual(apex.annualRevenue, 1850000);
    });

    it('should import Premier clients with ISO dates and standard values', () => {
      const result = importEntity('premier-bookkeeping', 'clients');
      assert.deepStrictEqual(result, { entity: 'clients', imported: 12, rejected: 0, dateFormat: 'DD-MM-YYYY' });

      const clients = getImported('premier-bookkeeping', 'clients');
      const dockside = clients.find(c => c.sourceId === 'PB-0004');
      assert.strictEqual(dockside.startDate, '2022-01-28');
      assert.strictEqual(dockside.status, 'inactive');
      assert.strictEqual(dockside.statusSource, 'DORMANT');
      assert.strictEqual(dockside.entityType, 'company');
      clients.forEach(c => assert.match(c.startDate, /^\d{4}-\d{2}-\d{2}$/));
    });

    it('should reject an unknown source with a 404', () => {
      assert.throws(() => importEntity('nope', 'clients'), err => err instanceof ImportError && err.status === 404);
    });

    it('should reject an entity without a mapping with a 400', () => {
      assert.throws(() => importEntity('abc-accounting', 'transactions'), err => err instanceof ImportError);
    });
  });
});
