const { describe, it } = require('node:test');
const assert = require('node:assert');
const { missingCustomerInfo } = require('./customerInfo');

const complete = {
  id: 'cust_001',
  name: 'Acme',
  industry: 'Manufacturing',
  region: 'EU',
  contactEmail: 'ops@acme.example'
};

describe('missingCustomerInfo', () => {
  it('should return an empty list when every required field is filled', () => {
    assert.deepStrictEqual(missingCustomerInfo(complete), []);
  });

  it('should list the blank fields, in required-field order', () => {
    const customer = { ...complete, contactEmail: '', region: '' };

    assert.deepStrictEqual(missingCustomerInfo(customer), ['region', 'contactEmail']);
  });

  it('should count whitespace-only values as missing', () => {
    const customer = { ...complete, industry: '   ', region: '\t\n' };

    assert.deepStrictEqual(missingCustomerInfo(customer), ['industry', 'region']);
  });

  it('should list name when it is missing', () => {
    const { name, ...customer } = complete;

    assert.deepStrictEqual(missingCustomerInfo(customer), ['name']);
  });

  it('should treat absent and non-string fields as missing', () => {
    assert.deepStrictEqual(
      missingCustomerInfo({ id: 'cust_new', name: 'New Co', region: null, contactEmail: 42 }),
      ['industry', 'region', 'contactEmail']
    );
  });
});
