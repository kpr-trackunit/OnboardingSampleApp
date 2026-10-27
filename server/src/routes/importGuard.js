/**
 * Import guards: import routes that write data are blocked
 * - until the customer's tenant is active (tenant slice 7), then
 * - until the entity's own mapping is complete (data-mapping slice 5, Decision 9:
 *   gating is per entity, so a complete clients mapping imports while transactions waits).
 */

const store = require('../data/store');
const { getSource } = require('../import/sources');
const { ENTITIES, entityCompleteness } = require('../import/completeness');

const TENANT_NOT_ACTIVE_MESSAGE = 'Tenant not active yet. Finish Tenant Setup first';
const MAPPING_INCOMPLETE_MESSAGE = 'Mapping incomplete';

// The customer an import source belongs to, or null for an unknown source.
// Uses the store's sourceKey -> customer link (import slice 8 will own this later).
function sourceCustomerId(sourceKey) {
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

/**
 * The reasons that stop a mapping from being complete (non-blocking ones, such as
 * values that will use the default, don't gate import).
 * @param {import('../import/completeness').Completeness} completeness
 */
function blockingReasons(completeness) {
  return completeness.reasons.filter(r => r.blocking);
}

/**
 * Express middleware: responds 409 { error: 'Mapping incomplete', reasons } unless the
 * mapping for req.params.entity of the customer behind req.params.sourceKey is complete.
 * Unknown sources and entities pass through so the import route can answer with its own 404.
 * Mount it after requireActiveTenant so the tenant check runs first.
 * @param {(sourceKey: string) => string | null} [getCustomerId]
 * @param {(customerId: string, entity: string) => import('../import/completeness').Completeness} [getCompleteness]
 */
function requireCompleteMapping(getCustomerId = sourceCustomerId, getCompleteness = entityCompleteness) {
  return (req, res, next) => {
    const { sourceKey, entity } = req.params;
    const customerId = getCustomerId(sourceKey);
    if (!customerId || !ENTITIES.includes(entity)) return next();

    const completeness = getCompleteness(customerId, entity);
    if (!completeness.complete) {
      return res.status(409).json({
        error: MAPPING_INCOMPLETE_MESSAGE,
        reasons: blockingReasons(completeness),
        customerId,
        entity
      });
    }
    next();
  };
}

module.exports = {
  TENANT_NOT_ACTIVE_MESSAGE,
  MAPPING_INCOMPLETE_MESSAGE,
  sourceCustomerId,
  blockingReasons,
  requireActiveTenant,
  requireCompleteMapping
};
