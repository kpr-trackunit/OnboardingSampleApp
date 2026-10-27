const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { importEntity, getImported, listImportSources } = require('./importer');
const { transformRow } = require('./transform');
const { rejoinOverflow } = require('./overflow');
const { parseCsv } = require('./csv');
const { createMapping } = require('../models');
const { seedMappings } = require('../data/mappingSeeds');
const store = require('../data/store');

// Fixture: ABC accounts with an unmapped type (line 4), its child (line 5), an unmapped
// normal balance (line 6), the "Electric, gas, water" overflow row (line 8), an orphan
// parent (line 9) and an unmapped status (line 10)
const FIXTURE_DIR = path.join(__dirname, '../../../tests/fixtures/import');

const seed = sourceKey => createMapping(seedMappings().find(m => m.sourceKey === sourceKey && m.entity === 'accounts'));

describe('Chart of accounts import', () => {
  it('should list accounts as importable for every source', () => {
    listImportSources().forEach(source => {
      assert.strictEqual(source.files.find(f => f.entity === 'accounts').importable, true, source.sourceKey);
    });
  });

  it('should import every sample chart of accounts with no rejections', () => {
    ['abc-accounting', 'xyz-financial-services', 'premier-bookkeeping'].forEach(sourceKey => {
      const run = importEntity(sourceKey, 'accounts');
      assert.deepStrictEqual([run.imported, run.rejected, run.warnings.length], [39, 0, 0], sourceKey);
    });
  });

  it('should keep Premier codes as strings with their leading zeros', () => {
    importEntity('premier-bookkeeping', 'accounts');
    const accounts = getImported('premier-bookkeeping', 'accounts');

    const bank = accounts.find(a => a.code === '0010');
    assert.ok(bank, 'account 0010 is stored under its zero-padded code');
    assert.strictEqual(bank.name, 'Bank Current Account');
    assert.strictEqual(accounts.find(a => a.code === '0011').parentCode, '0010');
    assert.ok(accounts.every(a => typeof a.code === 'string'));
    assert.strictEqual(store.getAccountByCode(bank.customerId, '0010').id, bank.id);
    assert.strictEqual(store.getAccountByCode(bank.customerId, '10'), undefined);
  });

  describe('type, normal balance and active flag per source', () => {
    const cases = [
      { sourceKey: 'abc-accounting', type: 'Revenue', balance: 'Credit', active: 'Active', expected: ['revenue', 'credit', true] },
      { sourceKey: 'abc-accounting', type: 'Expense', balance: 'Debit', active: 'Inactive', expected: ['expense', 'debit', false] },
      { sourceKey: 'xyz-financial-services', type: 'ASSET', balance: 'DR', active: '1', expected: ['asset', 'debit', true] },
      { sourceKey: 'xyz-financial-services', type: 'EQUITY', balance: 'CR', active: '0', expected: ['equity', 'credit', false] },
      { sourceKey: 'premier-bookkeeping', type: 'Assets', balance: 'D', active: 'Yes', expected: ['asset', 'debit', true] },
      { sourceKey: 'premier-bookkeeping', type: 'Liabilities', balance: 'C', active: 'Yes', expected: ['liability', 'credit', true] },
      { sourceKey: 'premier-bookkeeping', type: 'Capital', balance: 'C', active: 'No', expected: ['equity', 'credit', false] },
      { sourceKey: 'premier-bookkeeping', type: 'Income', balance: 'C', active: 'Yes', expected: ['revenue', 'credit', true] },
      { sourceKey: 'premier-bookkeeping', type: 'Direct Costs', balance: 'D', active: 'Yes', expected: ['expense', 'debit', true] },
      { sourceKey: 'premier-bookkeeping', type: 'Overheads', balance: 'D', active: 'Yes', expected: ['expense', 'debit', true] },
      { sourceKey: 'premier-bookkeeping', type: 'Finance Costs', balance: 'D', active: 'Yes', expected: ['expense', 'debit', true] }
    ];

    cases.forEach(({ sourceKey, type, balance, active, expected }) => {
      it(`should map ${sourceKey} '${type}' / '${balance}' / '${active}'`, () => {
        const mapping = seed(sourceKey);
        const { columns } = mapping;
        const row = {
          [columns.code]: '0100',
          [columns.name]: 'Test',
          [columns.type]: type,
          [columns.normalBalance]: balance,
          [columns.active]: active
        };

        const { record, errors, warnings } = transformRow(row, mapping);

        assert.deepStrictEqual(errors, []);
        assert.deepStrictEqual(warnings, []);
        assert.deepStrictEqual([record.type, record.normalBalance, record.active], expected);
        assert.deepStrictEqual([record.typeSource, record.normalBalanceSource, record.activeSource], [type, balance, active]);
        assert.strictEqual(record.code, '0100');
      });
    });
  });

  it('should reject an unmapped type or normal balance instead of using a default', () => {
    const mapping = seed('abc-accounting');
    const row = { 'Account Number': '1100', 'Account Name': 'Receivables', 'Account Type': 'Asset Account', 'Normal Balance': 'DR', 'Status': 'Active' };

    const { errors, warnings } = transformRow(row, mapping);

    assert.deepStrictEqual(errors.map(e => e.message), [
      "`Account Type` 'Asset Account' is not mapped (strict field, no default allowed)",
      "`Normal Balance` 'DR' is not mapped (strict field, no default allowed)"
    ]);
    assert.deepStrictEqual(warnings, []);
  });

  it('should reject an unmapped strict value even if a default was stored on the mapping', () => {
    const base = seed('premier-bookkeeping');
    const mapping = { ...base, values: { ...base.values, type: { ...base.values.type, default: 'expense' } } };
    const row = { nominal_code: '9000', account_title: 'Suspense', category: 'Suspense', debit_credit: 'D', is_active: 'Yes' };

    const { record, errors, warnings } = transformRow(row, mapping);

    assert.deepStrictEqual(errors.map(e => e.field), ['type']);
    assert.strictEqual(record.type, null);
    assert.deepStrictEqual(warnings, []);
  });

  it('should recover the ABC "Electric, gas, water" row into Description', () => {
    const header = ['Account Number', 'Account Name', 'Account Type', 'Sub Type', 'Normal Balance', 'Status', 'Description', 'Parent Account'];
    const { rows } = parseCsv(`${header.join(',')}\n6300,Utilities,Expense,Operating Expense,Debit,Active,Electric, gas, water,6000\n`);
    assert.strictEqual(rows[0].fields.length, 10);

    const { fields, column } = rejoinOverflow(header, rows[0].fields, seed('abc-accounting'));

    assert.strictEqual(column, 'Description');
    assert.deepStrictEqual(fields, ['6300', 'Utilities', 'Expense', 'Operating Expense', 'Debit', 'Active', 'Electric, gas, water', '6000']);
  });

  describe('fixture with bad rows', () => {
    const run = importEntity('abc-accounting', 'accounts', { dataDir: FIXTURE_DIR });
    const accounts = getImported('abc-accounting', 'accounts', { dataDir: FIXTURE_DIR });

    it('should import the good rows and reject the bad ones with a reason', () => {
      assert.strictEqual(run.imported, 5);
      assert.strictEqual(run.rejected, 4);
      assert.deepStrictEqual(run.errors.map(e => e.message), [
        "row 4: `Account Type` 'Asset Account' is not mapped (strict field, no default allowed)",
        "row 6: `Normal Balance` 'DR' is not mapped (strict field, no default allowed)",
        "row 5: `Parent Account` '1100' was rejected, so this account has no parent",
        "row 9: `Parent Account` '9999' does not exist in this file"
      ]);
      assert.deepStrictEqual(run.errors.slice(2).map(e => [e.row, e.field, e.column, e.value]), [
        [5, 'parentCode', 'Parent Account', '1100'],
        [9, 'parentCode', 'Parent Account', '9999']
      ]);
    });

    it('should keep the overflow row with its parent', () => {
      const utilities = accounts.find(a => a.code === '6300');
      assert.strictEqual(utilities.parentCode, '6000');
      assert.strictEqual(utilities.type, 'expense');
      assert.ok(!accounts.some(a => ['1100', '1110', '2000', '6400'].includes(a.code)));
    });

    it('should warn on an unmapped active flag and use the default', () => {
      assert.deepStrictEqual(run.warnings.map(w => w.message), [
        "row 10: `Status` 'Closed' is not mapped, used default 'true'"
      ]);
      assert.strictEqual(accounts.find(a => a.code === '6500').active, true);
    });
  });
});
