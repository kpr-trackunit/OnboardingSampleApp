const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validateCustomerInfo } = require('./customerInfoValidation');
const { REGIONS, TENANT_REGIONS } = require('./index');

describe('REGIONS', () => {
  it('is the ticket\'s proposed list, including LATAM', () => {
    assert.deepStrictEqual(REGIONS, ['North America', 'EU', 'UK', 'APAC', 'LATAM']);
  });

  it('is shared with tenants, so both always allow the same values', () => {
    assert.strictEqual(TENANT_REGIONS, REGIONS);
  });
});

describe('validateCustomerInfo', () => {
  it('returns no errors for valid info', () => {
    assert.deepStrictEqual(validateCustomerInfo({
      industry: 'Financial Services',
      region: 'EU',
      contactEmail: 'ops@xyz.example.com'
    }), {});
  });

  it('accepts every region in REGIONS', () => {
    for (const region of REGIONS) {
      assert.deepStrictEqual(validateCustomerInfo({ region }), {}, region);
    }
  });

  it('checks values after trimming', () => {
    assert.deepStrictEqual(validateCustomerInfo({
      region: ' APAC ',
      contactEmail: '  ops@xyz.example.com '
    }), {});
  });

  it('rejects a bad email', () => {
    for (const contactEmail of ['bob@', 'bob', '@example.com', 'bob@example', 'bob smith@example.com']) {
      assert.deepStrictEqual(
        validateCustomerInfo({ contactEmail }),
        { contactEmail: 'Enter a valid email address' },
        contactEmail
      );
    }
  });

  it('rejects an unknown region, naming the allowed ones', () => {
    for (const region of ['Mars', 'United Kingdom', 'eu']) {
      const errors = validateCustomerInfo({ region });
      assert.deepStrictEqual(Object.keys(errors), ['region'], region);
      assert.match(errors.region, /North America, EU, UK, APAC, LATAM/);
    }
  });

  it('allows blank fields (missing, not invalid)', () => {
    assert.deepStrictEqual(validateCustomerInfo({ industry: '', region: '', contactEmail: '' }), {});
  });

  it('rejects whitespace-only fields', () => {
    const errors = validateCustomerInfo({ industry: '   ', region: ' ', contactEmail: '\t' });
    assert.deepStrictEqual(Object.keys(errors).sort(), ['contactEmail', 'industry', 'region']);
  });

  it('only checks the fields it is given', () => {
    assert.deepStrictEqual(validateCustomerInfo({}), {});
    assert.deepStrictEqual(validateCustomerInfo({ name: '   ', config: {} }), {});
  });

  it('rejects non-text values', () => {
    assert.deepStrictEqual(
      validateCustomerInfo({ industry: 'Retail', region: 42, contactEmail: null }),
      { region: 'Must be text', contactEmail: 'Must be text' }
    );
  });

  it('reports every invalid field at once', () => {
    assert.deepStrictEqual(Object.keys(validateCustomerInfo({
      industry: ' ',
      region: 'Mars',
      contactEmail: 'bob@'
    })).sort(), ['contactEmail', 'industry', 'region']);
  });
});
