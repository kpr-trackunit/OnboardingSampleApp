/**
 * Import guard (tenant slice 7): import routes that write data are blocked
 * until the customer's tenant is active.
 */

const store = require('../data/store');
const { getSource } = require('../import/sources');
const { customerIdFromUploadKey } = require('../import/uploads');

const TENANT_NOT_ACTIVE_MESSAGE = 'Tenant not active yet. Finish Tenant Setup first';

// The customer an import source belongs to, or null for an unknown source.
// Uses the store's sourceKey -> customer link (import slice 8 will own this later).
// An upload-only source (`upload:<customerId>`, data-mapping slice 6) names its customer.
function sourceCustomerId(sourceKey) {
  const uploadCustomerId = customerIdFromUploadKey(sourceKey);
  if (uploadCustomerId !== null) {
    return store.getCustomerById(uploadCustomerId) ? uploadCustomerId : null;
  }
  const source = getSource(sourceKey);
  return source ? store.getSourceCustomerId(source.sourceKey, source.label) : null;
}

/**
 * Express middleware: responds 409 unless the tenant of the customer behind
 * req.params.sourceKey is active. Unknown sources pass through so the import
 * route can answer with its own 404.
 * @param {(sourceKey: string) => string | null} [getCustomerId]
 */
function requireActiveTenant(getCustomerId = sourceCustomerId) {
  return (req, res, next) => {
    const customerId = getCustomerId(req.params.sourceKey);
    if (customerId && !store.isTenantActive(customerId)) {
      return res.status(409).json({ error: TENANT_NOT_ACTIVE_MESSAGE, customerId });
    }
    next();
  };
}

module.exports = { TENANT_NOT_ACTIVE_MESSAGE, sourceCustomerId, requireActiveTenant };
