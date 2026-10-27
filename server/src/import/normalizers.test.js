const { describe, it } = require('node:test');
const assert = require('node:assert');
const { normalizeDate, detectDateFormat, normalizeNumber } = require('./normalizers');
const { transformRow } = require('./transform');
const { createMapping } = require('../models');
const { seedMappings } = require('../data/mappingSeeds');

const clientsMapping = sourceKey =>
  createMapping(seedMappings().find(m => m.sourceKey === sourceKey && m.entity === 'clients'));

describe('Normalizers', () => {
  describe('normalizeDate', () => {
    const cases = [
      { source: 'ABC', value: '01/15/2023', format: 'MM/DD/YYYY', expected: '2023-01-15' },
      { source: 'XYZ', value: '2023-02-10', format: 'YYYY-MM-DD', expected: '2023-02-10' },
      { source: 'Premier', value: '15-03-2023', format: 'DD-MM-YYYY', expected: '2023-03-15' },
      { source: 'ABC', value: '13/45/2023', format: 'MM/DD/YYYY', expected: null },
      { source: 'Premier', value: '30-02-2024', format: 'DD-MM-YYYY', expected: null },
      { source: 'XYZ', value: 'soon', format: 'YYYY-MM-DD', expected: null }
    ];

    cases.forEach(({ source, value, format, expected }) => {
      it(`should parse ${source} '${value}' as ${expected}`, () => {
        assert.strictEqual(normalizeDate(value, format), expected);
      });
    });
  });

  describe('detectDateFormat', () => {
    const cases = [
      { source: 'ABC', values: ['01/15/2023', '03/22/2023', '06/10/2023'], format: 'MM/DD/YYYY', status: 'detected' },
      { source: 'XYZ', values: ['2023-02-10', '2023-04-15'], format: 'YYYY-MM-DD', status: 'detected' },
      { source: 'Premier', values: ['15-03-2023', '22-05-2023'], format: 'DD-MM-YYYY', status: 'detected' },
      { source: 'no day above 12', values: ['01/02/2023', '05/06/2023'], format: null, status: 'ambiguous' },
      { source: 'not dates', values: ['n/a'], format: null, status: null }
    ];

    cases.forEach(({ source, values, format, status }) => {
      it(`should detect ${source} as ${status || 'unknown'}`, () => {
        const result = detectDateFormat(values);
        assert.strictEqual(result.format, format);
        assert.strictEqual(result.status, status);
      });
    });
  });

  describe('normalizeNumber', () => {
    const cases = [
      { source: 'ABC', value: '2500000.00', expected: 2500000 },
      { source: 'XYZ', value: '1850000', expected: 1850000 },
      { source: 'Premier', value: '285000.00', expected: 285000 },
      { source: 'thousands separator', value: '1,250,000', expected: 1250000 },
      { source: 'text', value: 'lots', expected: null }
    ];

    cases.forEach(({ source, value, expected }) => {
      it(`should parse ${source} '${value}' as ${expected}`, () => {
        assert.strictEqual(normalizeNumber(value), expected);
      });
    });
  });

  describe('client status value maps', () => {
    const cases = [
      { sourceKey: 'abc-accounting', column: 'Status', values: { Active: 'active', Inactive: 'inactive', Pending: 'pending' } },
      { sourceKey: 'xyz-financial-services', column: 'clientStatus', values: { A: 'active', I: 'inactive', P: 'pending' } },
      { sourceKey: 'premier-bookkeeping', column: 'account_status', values: { ACTIVE: 'active', DORMANT: 'inactive', SUSPENDED: 'pending' } }
    ];

    cases.forEach(({ sourceKey, column, values }) => {
      it(`should map ${sourceKey} statuses and keep the source value`, () => {
        Object.entries(values).forEach(([raw, expected]) => {
          const { record } = transformRow({ [column]: raw }, clientsMapping(sourceKey));
          assert.strictEqual(record.status, expected);
          assert.strictEqual(record.statusSource, raw);
        });
      });
    });
  });

  describe('client entity type value maps', () => {
    const cases = [
      { sourceKey: 'abc-accounting', column: 'Business Type', values: { 'S-Corporation': 'company', 'LLC': 'llc_llp', 'Sole Proprietorship': 'sole_trader', 'Non-Profit': 'non_profit' } },
      { sourceKey: 'xyz-financial-services', column: 'entityType', values: { SCORP: 'company', PART: 'partnership', SOLE: 'sole_trader', NPROF: 'non_profit' } },
      { sourceKey: 'premier-bookkeeping', column: 'legal_structure', values: { 'Limited Company': 'company', 'LLP': 'llc_llp', 'Sole Trader': 'sole_trader' } }
    ];

    cases.forEach(({ sourceKey, column, values }) => {
      it(`should map ${sourceKey} entity types to region-neutral values`, () => {
        Object.entries(values).forEach(([raw, expected]) => {
          const { record } = transformRow({ [column]: raw }, clientsMapping(sourceKey));
          assert.strictEqual(record.entityType, expected);
          assert.strictEqual(record.entityTypeSource, raw);
        });
      });
    });
  });
});
