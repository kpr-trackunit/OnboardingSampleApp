const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { mappingCompleteness, readFileRows } = require('./completeness');
const { createMapping } = require('../models');
const { seedMappings } = require('../data/mappingSeeds');
const { TARGET_FIELDS } = require('../models/targetFields');

const SAMPLE_DIR = path.join(__dirname, '../../../sample-data');
const AMBIGUOUS_DIR = path.join(__dirname, '../../../tests/fixtures/mapping');

// Links each source folder to a customer id equal to its sourceKey
const bySourceKey = sourceKey => sourceKey;

const seed = (sourceKey, entity = 'clients') => {
  const { sourceKey: _key, label: _label, ...mapping } = seedMappings().find(m => m.sourceKey === sourceKey && m.entity === entity);
  return createMapping({ ...mapping, customerId: sourceKey });
};

const rowsFor = (customerId, mapping, dataDir = SAMPLE_DIR) =>
  readFileRows(customerId, mapping, { dataDir, getSourceCustomerId: bySourceKey });

describe('mappingCompleteness', () => {
  describe('date format, using the import detector', () => {
    const cases = [
      { sourceKey: 'abc-accounting', format: 'MM/DD/YYYY' },
      { sourceKey: 'xyz-financial-services', format: 'YYYY-MM-DD' },
      { sourceKey: 'premier-bookkeeping', format: 'DD-MM-YYYY' }
    ];

    cases.forEach(({ sourceKey, format }) => {
      it(`should detect ${format} in the ${sourceKey} clients file`, () => {
        const mapping = { ...seed(sourceKey), dateFormat: null, dateFormatDetected: 'detected' };
        const result = mappingCompleteness(mapping, rowsFor(sourceKey, mapping), TARGET_FIELDS.clients);

        assert.deepStrictEqual(result.dateFormat, { format, status: 'detected' });
        assert.ok(!result.reasons.some(r => r.code.startsWith('date_format')));
      });
    });

    it('should block an ambiguous file (no day above 12) until CS confirms a format', () => {
      const mapping = { ...seed('abc-accounting'), customerId: 'ambiguous-dates' };
      const rows = rowsFor('ambiguous-dates', mapping, AMBIGUOUS_DIR);
      assert.strictEqual(rows.length, 3);

      const result = mappingCompleteness(mapping, rows, TARGET_FIELDS.clients);
      assert.strictEqual(result.complete, false);
      assert.deepStrictEqual(result.dateFormat, { format: null, status: 'ambiguous' });
      const reason = result.reasons.find(r => r.code === 'date_format_ambiguous');
      assert.ok(reason.blocking);
      assert.deepStrictEqual(reason.candidates, ['MM/DD/YYYY', 'DD-MM-YYYY']);

      const confirmed = { ...mapping, dateFormat: 'DD-MM-YYYY', dateFormatDetected: 'confirmed' };
      const after = mappingCompleteness(confirmed, rows, TARGET_FIELDS.clients);
      assert.strictEqual(after.complete, true);
      assert.deepStrictEqual(after.dateFormat, { format: 'DD-MM-YYYY', status: 'confirmed' });
    });

    it('should block a file whose dates fit no supported format', () => {
      const mapping = seed('abc-accounting');
      const rows = [{ 'Client ID': 'C1', 'Client Name': 'A', 'Date Onboarded': 'soon' }];
      const result = mappingCompleteness(mapping, rows, TARGET_FIELDS.clients);

      assert.strictEqual(result.complete, false);
      assert.ok(result.reasons.some(r => r.code === 'date_format_unset' && r.blocking));
    });

    it('should not need a date format when no date column has values', () => {
      const mapping = { ...seed('abc-accounting'), dateFormat: null };
      const rows = [{ 'Client ID': 'C1', 'Client Name': 'A', 'Date Onboarded': '' }];
      const result = mappingCompleteness(mapping, rows, TARGET_FIELDS.clients);

      assert.strictEqual(result.complete, true);
      assert.strictEqual(result.dateFormat.status, 'not_needed');
    });
  });

  describe('reasons', () => {
    // A small entity with every kind of field, independent of what TARGET_FIELDS defines
    const fields = {
      ref: { type: 'text', required: true },
      side: { type: 'picklist', strict: true, values: ['debit', 'credit'] },
      state: { type: 'picklist', values: ['open', 'closed'] },
      kind: { type: 'picklist', values: ['a', 'b'] }
    };
    const mapping = {
      entity: 'ledger',
      columns: { ref: 'Ref', side: 'DrCr', state: 'State', kind: 'Kind' },
      values: {
        side: { map: { DR: 'debit', CR: 'credit' }, default: null },
        state: { map: { O: 'open' }, default: 'open' },
        kind: { map: { A: 'a' }, default: null }
      },
      dateFormat: null,
      dateFormatDetected: 'detected'
    };
    const rows = [
      { Ref: '1', DrCr: 'DR', State: 'O', Kind: 'A' },
      { Ref: '2', DrCr: 'XX', State: 'H', Kind: 'B' },
      { Ref: '3', DrCr: ' XX ', State: 'H', Kind: '' }
    ];

    it('should be complete when every value is mapped', () => {
      const clean = rows.slice(0, 1);
      assert.deepStrictEqual(mappingCompleteness(mapping, clean, fields), {
        complete: true,
        reasons: [],
        dateFormat: { format: null, status: 'not_needed' }
      });
    });

    it('should list a required field with no source column', () => {
      const missing = { ...mapping, columns: { ...mapping.columns, ref: null } };
      const result = mappingCompleteness(missing, rows.slice(0, 1), fields);

      assert.strictEqual(result.complete, false);
      assert.deepStrictEqual(result.reasons.map(r => [r.code, r.field, r.blocking]), [
        ['missing_required_column', 'ref', true]
      ]);
    });

    it('should block on an unmapped strict value, marked strict', () => {
      const result = mappingCompleteness(mapping, rows, fields);
      const reason = result.reasons.find(r => r.field === 'side');

      assert.strictEqual(result.complete, false);
      assert.deepStrictEqual(
        { code: reason.code, strict: reason.strict, blocking: reason.blocking, values: reason.values },
        { code: 'unmapped_values', strict: true, blocking: true, values: ['XX'] }
      );
    });

    it('should block on an unmapped non-strict value with no default', () => {
      const result = mappingCompleteness(mapping, rows, fields);
      const reason = result.reasons.find(r => r.field === 'kind');

      assert.deepStrictEqual(
        { code: reason.code, strict: reason.strict, blocking: reason.blocking, values: reason.values },
        { code: 'unmapped_values', strict: false, blocking: true, values: ['B'] }
      );
    });

    it('should list, but not block on, an unmapped non-strict value that has a default', () => {
      const onlyDefaulted = { ...mapping, values: { ...mapping.values, side: { map: { DR: 'debit', XX: 'credit' } }, kind: { map: { A: 'a', B: 'b' } } } };
      const result = mappingCompleteness(onlyDefaulted, rows, fields);

      assert.strictEqual(result.complete, true);
      assert.deepStrictEqual(result.reasons.map(r => [r.code, r.field, r.blocking, r.default]), [
        ['unmapped_values_defaulted', 'state', false, 'open']
      ]);
    });

    it('should say there is no mapping yet', () => {
      const result = mappingCompleteness(null, null, TARGET_FIELDS.clients);
      assert.strictEqual(result.complete, false);
      assert.deepStrictEqual(result.reasons.map(r => r.code), ['no_mapping']);
    });

    it('should block when there is no source file to check', () => {
      const result = mappingCompleteness(seed('abc-accounting'), null, TARGET_FIELDS.clients);
      assert.strictEqual(result.complete, false);
      assert.ok(result.reasons.some(r => r.code === 'no_file' && r.blocking));
    });

    it('should block an entity with no target fields defined', () => {
      const result = mappingCompleteness({ ...mapping, entity: 'unknown' }, rows, undefined);
      assert.deepStrictEqual(result.reasons.map(r => r.code), ['no_target_fields']);
    });
  });

  describe('seeded mappings', () => {
    seedMappings().forEach(({ sourceKey, entity }) => {
      it(`should find the ${sourceKey} ${entity} mapping complete against its sample file`, () => {
        const mapping = seed(sourceKey, entity);
        const result = mappingCompleteness(mapping, rowsFor(sourceKey, mapping), TARGET_FIELDS[entity]);

        assert.deepStrictEqual(result.reasons, []);
        assert.strictEqual(result.complete, true);
      });
    });
  });
});

describe('readFileRows', () => {
  it('should return null when the customer has no file for the entity', () => {
    assert.strictEqual(rowsFor('no-such-customer', seed('abc-accounting')), null);
  });

  it('should rejoin unquoted commas so every XYZ row keys by header', () => {
    const mapping = seed('xyz-financial-services');
    const rows = rowsFor('xyz-financial-services', mapping);
    assert.ok(rows.length > 0);
    rows.forEach(row => assert.ok(row.clientStatus && row.entityType));
  });
});
