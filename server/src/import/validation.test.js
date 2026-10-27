const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { importEntity, getImported } = require('./importer');
const { transformRow } = require('./transform');
const { createMapping } = require('../models');
const { TARGET_FIELDS } = require('../models/targetFields');
const store = require('../data/store');

// Fixture: ABC clients with a bad date (line 4), an unmapped Business Type (line 5) and a missing name (line 7)
const FIXTURE_DIR = path.join(__dirname, '../../../tests/fixtures/import');

describe('Import validation', () => {
  it('should reject bad rows with a reason and import the rest', () => {
    const run = importEntity('abc-accounting', 'clients', { dataDir: FIXTURE_DIR });

    assert.strictEqual(run.imported, 9);
    assert.strictEqual(run.rejected, 2);
    assert.deepStrictEqual(run.errors.map(e => e.message), [
      "row 4: `Date Onboarded` '13/45/2023' is not a valid date",
      'row 7: `Client Name` is required'
    ]);
    assert.deepStrictEqual(run.errors.map(e => [e.row, e.column]), [[4, 'Date Onboarded'], [7, 'Client Name']]);
  });

  it('should import unmapped picklist values with the default and warn', () => {
    const run = importEntity('abc-accounting', 'clients', { dataDir: FIXTURE_DIR });

    assert.deepStrictEqual(run.warnings, [{
      row: 5,
      field: 'entityType',
      column: 'Business Type',
      value: 'Cooperative',
      default: 'company',
      message: "row 5: `Business Type` 'Cooperative' is not mapped, used default 'company'"
    }]);
    const farms = getImported('abc-accounting', 'clients', { dataDir: FIXTURE_DIR }).find(c => c.sourceId === 'C004');
    assert.strictEqual(farms.entityType, 'company');
    assert.strictEqual(farms.entityTypeSource, 'Cooperative');
  });

  it('should record each run as an ImportRun', () => {
    const run = importEntity('abc-accounting', 'clients', { dataDir: FIXTURE_DIR });

    const stored = store.getImportRuns(run.customerId).find(r => r.id === run.id);
    assert.strictEqual(stored.entity, 'clients');
    assert.strictEqual(stored.errors.length, 2);
    assert.strictEqual(stored.warnings.length, 1);
    assert.ok(stored.startedAt);
  });

  it('should not duplicate clients when the same file is imported twice', () => {
    importEntity('abc-accounting', 'clients');
    importEntity('abc-accounting', 'clients');

    const clients = getImported('abc-accounting', 'clients');
    assert.strictEqual(clients.filter(c => c.sourceId === 'C001').length, 1);
    assert.strictEqual(new Set(clients.map(c => c.sourceId)).size, clients.length);
  });

  describe('strict picklist fields', () => {
    it('should reject an unmapped value instead of using a default', () => {
      // No entity has strict fields until accounts/transactions, so register a test one
      TARGET_FIELDS.strictTest = {
        sourceId: { type: 'text', required: true },
        direction: { type: 'picklist', strict: true, values: ['debit', 'credit'] }
      };
      const mapping = createMapping({
        customerId: 'cust_test',
        entity: 'strictTest',
        columns: { sourceId: 'id', direction: 'type' },
        values: { direction: { map: { DR: 'debit', CR: 'credit' }, default: 'debit' } }
      });

      const { record, errors, warnings } = transformRow({ id: 'T1', type: 'XX' }, mapping);

      assert.strictEqual(record.direction, null);
      assert.strictEqual(record.directionSource, 'XX');
      assert.deepStrictEqual(warnings, []);
      assert.deepStrictEqual(errors.map(e => e.message), ["`type` 'XX' is not mapped (strict field, no default allowed)"]);
      delete TARGET_FIELDS.strictTest;
    });
  });
});
