/**
 * Customer Info validation (tickets/customer-info.md slice 3).
 * Pure: no store or request access, so the server route and unit tests share it.
 */

const { REGIONS } = require('./index');

// The Customer Info fields CS can edit on the Customer Info tab
const CUSTOMER_INFO_FIELDS = ['industry', 'region', 'contactEmail'];

// Something@something.tld with no spaces. Only the format is checked; whether
// the address exists is out of scope.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MESSAGES = {
  notText: 'Must be text',
  whitespace: 'Enter a value, or leave it blank',
  email: 'Enter a valid email address',
  region: `Choose one of: ${REGIONS.join(', ')}`
};

/**
 * Checks the Customer Info fields present in `info`. Fields that are left out
 * (undefined) aren't checked, so partial updates work. Blank ('') is allowed:
 * it means "missing", not "invalid". Values are checked after trimming, except
 * that a value made only of whitespace is rejected.
 *
 * @param {Object<string, unknown>} info - Any of industry, region, contactEmail
 * @returns {Object<string, string>} field -> message; empty when everything is valid
 */
function validateCustomerInfo(info) {
  const errors = {};
  for (const field of CUSTOMER_INFO_FIELDS) {
    const raw = info?.[field];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') {
      errors[field] = MESSAGES.notText;
      continue;
    }
    const value = raw.trim();
    if (value === '') {
      if (raw !== '') errors[field] = MESSAGES.whitespace;
      continue;
    }
    if (field === 'contactEmail' && !EMAIL_PATTERN.test(value)) {
      errors[field] = MESSAGES.email;
    } else if (field === 'region' && !REGIONS.includes(value)) {
      errors[field] = MESSAGES.region;
    }
  }
  return errors;
}

module.exports = { CUSTOMER_INFO_FIELDS, validateCustomerInfo };
