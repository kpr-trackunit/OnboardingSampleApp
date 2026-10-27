const { describe, it } = require('node:test');
const assert = require('node:assert');
const { rejoinOverflow } = require('./overflow');
const { createMapping } = require('../models');
const { seedMappings } = require('../data/mappingSeeds');

const xyzClients = createMapping(seedMappings().find(m => m.sourceKey === 'xyz-financial-services' && m.entity === 'clients'));
const xyzHeader = ['clientCode', 'companyName', 'entityType', 'clientStatus', 'startDate', 'federalTaxId', 'yearlyRevenue', 'sectorCode', 'billingTerms', 'mainContact'];

describe('rejoinOverflow', () => {
  it('should rejoin the XYZ unquoted contact name into mainContact', () => {
    const fields = 'XYZ-001,Apex Digital Marketing,CORP,A,2023-02-10,11-2233445,1850000,TECH,NET30,Williams, Robert'.split(',');

    const { fields: recovered, column } = rejoinOverflow(xyzHeader, fields, xyzClients);

    assert.strictEqual(column, 'mainContact');
    assert.strictEqual(recovered.length, 10);
    assert.strictEqual(recovered[9], 'Williams, Robert');
    assert.strictEqual(recovered[7], 'TECH');
  });

  it('should rejoin overflow in a free-text column that is not last', () => {
    // Same rule, a different file: an unquoted comma in a mapped text column mid-row
    const mapping = createMapping({
      customerId: 'cust_test',
      entity: 'clients',
      columns: { sourceId: 'id', name: 'name', startDate: 'since', annualRevenue: 'revenue' },
      dateFormat: 'YYYY-MM-DD'
    });
    const header = ['id', 'name', 'since', 'revenue'];
    const fields = ['C9', 'Smith', ' Jones & Co', '2024-01-02', '5000'];

    const { fields: recovered, column } = rejoinOverflow(header, fields, mapping);

    assert.strictEqual(column, 'name');
    assert.deepStrictEqual(recovered, ['C9', 'Smith, Jones & Co', '2024-01-02', '5000']);
  });

  it('should leave rows with the right number of fields alone', () => {
    const fields = ['C1', 'Acme', '2024-01-02', '10'];
    const mapping = createMapping({ customerId: 'cust_test', entity: 'clients', columns: { sourceId: 'id' } });

    assert.deepStrictEqual(rejoinOverflow(['id', 'name', 'since', 'revenue'], fields, mapping), { fields, column: null });
  });

  it('should give up when no free-text column can absorb the extra field', () => {
    const mapping = createMapping({
      customerId: 'cust_test',
      entity: 'clients',
      columns: { sourceId: 'id', startDate: 'since', annualRevenue: 'revenue' }
    });
    const fields = ['C1', '2024-01-02', '10', '20'];

    const { column } = rejoinOverflow(['id', 'since', 'revenue'], fields, mapping);

    assert.strictEqual(column, null);
  });
});
