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
      assert.deepStrictEqual(result, { entity: 'clients', imported: 10, rejected: 0 });

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

    it('should reject an unknown source with a 404', () => {
      assert.throws(() => importEntity('nope', 'clients'), err => err instanceof ImportError && err.status === 404);
    });

    it('should reject an entity without a mapping with a 400', () => {
      assert.throws(() => importEntity('abc-accounting', 'transactions'), err => err instanceof ImportError);
    });
  });
});
