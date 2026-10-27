/**
 * Customer Info completeness. Pure functions only, so they can be unit tested
 * without the store. The server is the source of truth: GET /api/customers adds
 * `missingInfo` to each customer and the client only renders it.
 */

/** Fields a customer needs before onboarding can move on, in display order */
const REQUIRED_CUSTOMER_INFO = ['name', 'industry', 'region', 'contactEmail'];

/**
 * Lists the required fields that are blank. Absent, non-string and
 * whitespace-only values all count as blank.
 * @param {Partial<import('./index').Customer>} customer
 * @returns {string[]} Field keys from REQUIRED_CUSTOMER_INFO, in that order. Empty when complete.
 */
function missingCustomerInfo(customer) {
  return REQUIRED_CUSTOMER_INFO.filter(field => {
    const value = customer?.[field];
    return typeof value !== 'string' || !value.trim();
  });
}

module.exports = { REQUIRED_CUSTOMER_INFO, missingCustomerInfo };
