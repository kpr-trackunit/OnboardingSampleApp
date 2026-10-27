const { describe, it } = require('node:test');
const assert = require('node:assert');
const { labelFromFolder, sourceKeyFromLabel, listSources, getSource } = require('./sources');

describe('Import Sources', () => {
  describe('labelFromFolder', () => {
    it('should strip the customer prefix and split words', () => {
      assert.strictEqual(labelFromFolder('CustomerA_ABCAccounting'), 'ABC Accounting');
      assert.strictEqual(labelFromFolder('CustomerB_XYZFinancialServices'), 'XYZ Financial Services');
      assert.strictEqual(labelFromFolder('CustomerC_PremierBookkeeping'), 'Premier Bookkeeping');
    });
  });

  describe('sourceKeyFromLabel', () => {
    it('should create a URL-safe key', () => {
      assert.strictEqual(sourceKeyFromLabel('XYZ Financial Services'), 'xyz-financial-services');
    });
  });

  describe('listSources', () => {
    it('should list the 3 sample customers', () => {
      const sources = listSources();

      assert.deepStrictEqual(sources.map(s => s.label), [
        'ABC Accounting',
        'XYZ Financial Services',
        'Premier Bookkeeping'
      ]);
    });

    it('should list 4 files per source', () => {
      listSources().forEach(source => {
        assert.deepStrictEqual(source.files.map(f => f.entity), ['clients', 'contacts', 'accounts', 'transactions']);
      });
    });

    it('should count data rows excluding the header', () => {
      const counts = Object.fromEntries(listSources().map(s => [
        s.sourceKey,
        Object.fromEntries(s.files.map(f => [f.entity, f.rowCount]))
      ]));

      assert.deepStrictEqual(counts, {
        'abc-accounting': { clients: 10, contacts: 15, accounts: 39, transactions: 25 },
        'xyz-financial-services': { clients: 12, contacts: 18, accounts: 39, transactions: 25 },
        'premier-bookkeeping': { clients: 12, contacts: 20, accounts: 39, transactions: 25 }
      });
    });

    it('should return an empty list when the folder does not exist', () => {
      assert.deepStrictEqual(listSources('/does/not/exist'), []);
    });
  });

  describe('getSource', () => {
    it('should find a source by key', () => {
      assert.strictEqual(getSource('abc-accounting').label, 'ABC Accounting');
      assert.strictEqual(getSource('unknown'), undefined);
    });
  });
});
