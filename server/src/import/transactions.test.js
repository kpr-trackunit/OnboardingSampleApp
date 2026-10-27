const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { ImportError, listImportSources, importEntity, getImported } = require('./importer');
const { transformRow } = require('./transform');
const { seedMappings } = require('../data/mappingSeeds');
const { createMapping, createTransaction } = require('../models');
const store = require('../data/store');

// Fixture: ABC transactions against the fixture clients (C003 is rejected) and accounts
// (1100 is rejected): one good row (line 2), a rejected client (line 3), a rejected account
// (line 4), an unmapped direction (line 5), account 01000 when only 1000 exists (line 6),
// an unknown client and account (line 7) and an unmapped payment method (line 8)
const FIXTURE_DIR = path.join(__dirname, '../../../tests/fixtures/import');

const seed = sourceKey => createMapping(seedMappings().find(m => m.sourceKey === sourceKey && m.entity === 'transactions'));

const waitingFor = sourceKey => listImportSources()
  .find(s => s.sourceKey === sourceKey)
  .files.find(f => f.entity === 'transactions').waitingFor;

// The parts of an ImportRun that don't change between runs
const summary = run => ({ imported: run.imported, rejected: run.rejected, warnings: run.warnings.length });

// The store is shared across this file and never reset, so the describes run in order:
// nothing imported, then the fixture for ABC, then the full sample files
describe('Transactions import', () => {
  describe('before clients and accounts are imported', () => {
    it('should wait for both clients and accounts', () => {
      assert.strictEqual(waitingFor('xyz-financial-services'), 'clients and accounts');
      assert.throws(
        () => importEntity('xyz-financial-services', 'transactions'),
        err => err instanceof ImportError && err.status === 409 && err.message === 'Import clients and accounts first'
      );
    });

    it('should still wait for accounts once clients are imported', () => {
      importEntity('xyz-financial-services', 'clients');

      assert.strictEqual(waitingFor('xyz-financial-services'), 'accounts');
      assert.throws(() => importEntity('xyz-financial-services', 'transactions'), { message: 'Import accounts first' });
      const customerId = store.getSourceCustomerId('xyz-financial-services', 'XYZ Financial Services');
      assert.deepStrictEqual(store.getImportRuns(customerId).map(r => r.entity), ['clients']);
    });
  });

  describe('fixture with bad rows', () => {
    importEntity('abc-accounting', 'clients', { dataDir: FIXTURE_DIR });
    importEntity('abc-accounting', 'accounts', { dataDir: FIXTURE_DIR });
    const run = importEntity('abc-accounting', 'transactions', { dataDir: FIXTURE_DIR });

    it('should import the good rows and reject the rest with a reason', () => {
      assert.deepStrictEqual(summary(run), { imported: 2, rejected: 5, warnings: 1 });
      assert.deepStrictEqual(run.errors.map(e => e.message), [
        'row 3: unknown client `C003`',
        'row 4: unknown account `1100`',
        "row 5: `Transaction Type` 'Transfer' is not mapped (strict field, no default allowed)",
        'row 6: unknown account `01000`',
        'row 7: unknown client `C999`',
        'row 7: unknown account `9999`'
      ]);
      assert.deepStrictEqual(getImported('abc-accounting', 'transactions').map(t => t.sourceId), ['TXN001', 'TXN007']);
    });

    it('should report which column held a missing reference', () => {
      assert.deepStrictEqual(run.errors.filter(e => e.row === 7).map(e => [e.field, e.column, e.value]), [
        ['clientSourceId', 'Client ID', 'C999'],
        ['accountCode', 'Account Number', '9999']
      ]);
    });

    it('should use the default payment method with a warning', () => {
      assert.deepStrictEqual(run.warnings.map(w => w.message), [
        "row 8: `Payment Method` 'Journal Entry' is not mapped, used default 'bank_transfer'"
      ]);
      const supplies = getImported('abc-accounting', 'transactions').find(t => t.sourceId === 'TXN007');
      assert.deepStrictEqual([supplies.paymentMethod, supplies.paymentMethodSource], ['bank_transfer', 'Journal Entry']);
    });
  });

  describe('mapping per source', () => {
    const cases = [
      {
        sourceKey: 'abc-accounting',
        // Financing, Journal Entry and Bank Charge aren't payment methods, so they use the default
        counts: { imported: 25, rejected: 0, warnings: 3 },
        first: {
          sourceId: 'TXN001', date: '2024-01-15', clientSourceId: 'C001', clientName: 'Riverside Manufacturing LLC', accountCode: '1020',
          description: 'Client payment received', direction: 'credit', directionSource: 'Credit',
          amount: 15000, currency: 'USD', status: 'completed', statusSource: 'Cleared',
          paymentMethod: 'wire', paymentMethodSource: 'Wire Transfer', reference: 'INV-2024-001'
        }
      },
      {
        sourceKey: 'xyz-financial-services',
        // LEASE, FEE and JE likewise
        counts: { imported: 25, rejected: 0, warnings: 3 },
        first: {
          sourceId: 'T-10001', date: '2024-01-10', clientSourceId: 'XYZ-001', clientName: 'Apex Digital Marketing', accountCode: '102',
          description: 'Customer payment', direction: 'credit', directionSource: 'CR',
          amount: 22500, currency: 'USD', status: 'completed', statusSource: 'POSTED',
          paymentMethod: 'wire', paymentMethodSource: 'WIRE', reference: 'INV-10001'
        }
      },
      {
        sourceKey: 'premier-bookkeeping',
        // HP (hire purchase) and Bank Charge likewise
        counts: { imported: 25, rejected: 0, warnings: 2 },
        first: {
          sourceId: 'TRN-00001', date: '2024-01-15', clientSourceId: 'PB-0001', clientName: 'Artisan Bakery & Cafe', accountCode: '0010',
          description: 'Customer receipt', direction: 'credit', directionSource: 'C',
          amount: 4250, currency: 'GBP', status: 'completed', statusSource: 'Reconciled',
          paymentMethod: 'ach', paymentMethodSource: 'BACS', reference: 'SI-2024-001'
        }
      }
    ];

    cases.forEach(({ sourceKey, counts, first }) => {
      it(`should import every ${sourceKey} transaction with standard values`, () => {
        importEntity(sourceKey, 'clients');
        importEntity(sourceKey, 'accounts');
        const run = importEntity(sourceKey, 'transactions');
        assert.deepStrictEqual(summary(run), counts);
        assert.ok(run.warnings.every(w => w.field === 'paymentMethod'), 'only payment methods fall back to the default');

        const transactions = getImported(sourceKey, 'transactions');
        assert.strictEqual(transactions.length, 25);
        const { id, customerId, ...fields } = transactions[0];
        assert.deepStrictEqual(fields, first);
        assert.strictEqual(id, `transaction_${customerId}_${first.sourceId}`);
        transactions.forEach(t => {
          assert.ok(['debit', 'credit'].includes(t.direction), `${t.sourceId} direction`);
          assert.ok(['completed', 'pending', 'cancelled'].includes(t.status), `${t.sourceId} status`);
          assert.strictEqual(typeof t.amount, 'number', `${t.sourceId} amount`);
          assert.strictEqual(t.currency, first.currency, `${t.sourceId} currency`);
          assert.ok(store.getAccountByCode(customerId, t.accountCode), `${t.sourceId} account ${t.accountCode}`);
        });
      });
    });

    it('should not duplicate transactions when the same file is imported twice', () => {
      importEntity('premier-bookkeeping', 'transactions');
      const transactions = getImported('premier-bookkeeping', 'transactions');
      assert.strictEqual(transactions.length, 25);
      assert.strictEqual(new Set(transactions.map(t => t.sourceId)).size, 25);
    });

    it('should no longer wait once clients and accounts are imported', () => {
      assert.strictEqual(waitingFor('premier-bookkeeping'), null);
    });
  });

  describe('direction, status and payment method per source', () => {
    // 1 February 2024 in each source's date format
    const DATES = { 'abc-accounting': '02/01/2024', 'xyz-financial-services': '2024-02-01', 'premier-bookkeeping': '01-02-2024' };
    const cases = [
      ['abc-accounting', 'Debit', 'Voided', 'Check', ['debit', 'cancelled', 'check']],
      ['abc-accounting', 'Credit', 'Pending', 'Direct Deposit', ['credit', 'pending', 'ach']],
      ['xyz-financial-services', 'DR', 'VOID', 'EFT', ['debit', 'cancelled', 'ach']],
      ['xyz-financial-services', 'CR', 'PENDING', 'BANK', ['credit', 'pending', 'bank_transfer']],
      ['premier-bookkeeping', 'D', 'Unreconciled', 'Cheque', ['debit', 'pending', 'check']],
      ['premier-bookkeeping', 'C', 'Cancelled', 'Card Payment', ['credit', 'cancelled', 'card']]
    ];

    cases.forEach(([sourceKey, direction, status, method, expected]) => {
      it(`should map ${sourceKey} '${direction}' / '${status}' / '${method}'`, () => {
        const mapping = seed(sourceKey);
        const { columns } = mapping;
        const row = {
          [columns.sourceId]: 'T1',
          [columns.date]: DATES[sourceKey],
          [columns.clientSourceId]: 'C1',
          [columns.accountCode]: '0100',
          [columns.direction]: direction,
          [columns.amount]: '12.50',
          [columns.status]: status,
          [columns.paymentMethod]: method
        };

        const { record, errors, warnings } = transformRow(row, mapping);

        assert.deepStrictEqual(errors, []);
        assert.deepStrictEqual(warnings, []);
        assert.deepStrictEqual([record.direction, record.status, record.paymentMethod], expected);
        assert.deepStrictEqual([record.directionSource, record.statusSource, record.paymentMethodSource], [direction, status, method]);
        assert.strictEqual(record.amount, 12.5);
        assert.strictEqual(record.accountCode, '0100');
      });
    });

    it('should reject an unmapped direction even if a default was stored on the mapping', () => {
      const base = seed('xyz-financial-services');
      const mapping = { ...base, values: { ...base.values, direction: { ...base.values.direction, default: 'debit' } } };
      const row = { txnId: 'T-1', txnDate: '2024-01-10', clientCode: 'XYZ-001', acctCode: '102', entryType: 'D', txnAmount: '10.00' };

      const { record, errors, warnings } = transformRow(row, mapping);

      assert.deepStrictEqual(errors.map(e => e.message), ["`entryType` 'D' is not mapped (strict field, no default allowed)"]);
      assert.strictEqual(record.direction, null);
      assert.deepStrictEqual(warnings, []);
    });
  });

  describe('currency', () => {
    it('should be GBP for Premier and USD for everyone else', () => {
      assert.deepStrictEqual(
        ['abc-accounting', 'xyz-financial-services', 'premier-bookkeeping'].map(sourceKey => seed(sourceKey).currency),
        ['USD', 'USD', 'GBP']
      );
    });

    it('should default to USD when a mapping has no currency', () => {
      assert.strictEqual(createTransaction({ customerId: 'c', sourceId: 't' }).currency, 'USD');
    });
  });
});
