const { describe, it } = require('node:test');
const assert = require('node:assert');
const { transformRow } = require('./transform');
const { createMapping } = require('../models');
const { seedMappings } = require('../data/mappingSeeds');

const abcClients = createMapping(seedMappings().find(m => m.sourceKey === 'abc-accounting' && m.entity === 'clients'));

describe('transformRow', () => {
  it('should map an ABC client row to the canonical shape', () => {
    const row = {
      'Client ID': 'C003',
      'Client Name': 'Tech Solutions Inc',
      'Business Type': 'S-Corporation',
      'Status': 'Active',
      'Date Onboarded': '06/10/2023',
      'Tax ID': '34-5678901',
      'Annual Revenue': '1200000.00',
      'Industry': 'Technology',
      'Payment Terms': 'Net 45',
      'Primary Contact': 'Mike Chen'
    };

    const { record } = transformRow(row, abcClients);

    assert.deepStrictEqual(record, {
      sourceId: 'C003',
      name: 'Tech Solutions Inc',
      entityType: 'company',
      entityTypeSource: 'S-Corporation',
      status: 'active',
      statusSource: 'Active',
      startDate: '2023-06-10',
      taxId: '34-5678901',
      annualRevenue: 1200000,
      industry: 'Technology',
      paymentTerms: 'Net 45'
    });
  });

  it('should read columns from the mapping, not from code', () => {
    const mapping = createMapping({
      customerId: 'cust_test',
      entity: 'clients',
      columns: { sourceId: 'ref', name: 'company', status: 'state' },
      values: { status: { map: { 'on': 'active' }, default: 'pending' } },
      dateFormat: 'YYYY-MM-DD'
    });

    const { record } = transformRow({ ref: 'X1', company: 'Acme', state: 'on' }, mapping);

    assert.strictEqual(record.sourceId, 'X1');
    assert.strictEqual(record.name, 'Acme');
    assert.strictEqual(record.status, 'active');
    assert.strictEqual(record.statusSource, 'on');
  });

  it('should leave unmapped columns empty', () => {
    const mapping = createMapping({ customerId: 'cust_test', entity: 'clients', columns: { sourceId: 'ref', taxId: null } });

    const { record } = transformRow({ ref: 'X1' }, mapping);

    assert.strictEqual(record.taxId, '');
    assert.strictEqual(record.startDate, null);
    assert.strictEqual(record.annualRevenue, null);
  });
});
