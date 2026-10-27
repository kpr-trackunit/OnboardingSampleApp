/**
 * Import all (import slice 8): imports every entity file of a source in dependency
 * order, then records the result on the customer's onboarding Import step.
 */

const store = require('../data/store');
const { DEFAULT_DATA_DIR, getSource } = require('./sources');
const { ImportError, importEntity, getDependencies } = require('./importer');

/**
 * Orders entities so each comes after the entities it references, keeping the
 * given order (ENTITY_FILES) wherever the references allow it.
 * @param {string[]} entities
 * @returns {string[]}
 */
function inDependencyOrder(entities) {
  const ordered = [];
  const remaining = [...entities];
  while (remaining.length > 0) {
    const ready = remaining.findIndex(entity =>
      getDependencies(entity).every(dep => dep === entity || !remaining.includes(dep)));
    // A reference cycle can't be ordered; keep the given order for what's left
    ordered.push(...remaining.splice(ready === -1 ? 0 : ready, 1));
  }
  return ordered;
}

/**
 * The customer an import source belongs to, creating it from the source label if needed.
 * @returns {string | null} The customerId, or null for an unknown source
 */
function linkSourceCustomer(sourceKey, { dataDir = DEFAULT_DATA_DIR } = {}) {
  const source = getSource(sourceKey, dataDir);
  return source ? store.ensureSourceCustomer(source.sourceKey, source.label).id : null;
}

const summaryOf = (entity, status, { imported = 0, rejected = 0, warnings = 0, message = null } = {}) =>
  ({ entity, status, imported, rejected, warnings, message });

/**
 * Imports every entity file of a source in dependency order. An entity whose import fails
 * (ImportError) is marked failed with its message; an entity that references a failed,
 * skipped or empty entity is skipped. The Import step is completed when every entity
 * imported with no rejected rows, and failed otherwise (rows with only warnings don't count).
 * @param {string} sourceKey
 * @param {{ dataDir?: string, importOne?: typeof importEntity }} [options]
 */
function importAll(sourceKey, { dataDir = DEFAULT_DATA_DIR, importOne = importEntity } = {}) {
  const source = getSource(sourceKey, dataDir);
  if (!source) throw new ImportError(`Unknown source '${sourceKey}'`, 404);
  const customer = store.ensureSourceCustomer(source.sourceKey, source.label);

  const results = new Map();
  const entities = inDependencyOrder(source.files.map(file => file.entity)).map(entity => {
    const blocker = getDependencies(entity).find(dep => {
      const result = results.get(dep);
      return result && (result.status !== 'ok' || result.imported === 0);
    });

    let summary;
    if (blocker) {
      summary = summaryOf(entity, 'skipped', { message: `skipped: ${blocker} failed` });
    } else {
      try {
        const run = importOne(source.sourceKey, entity, { dataDir });
        summary = summaryOf(entity, 'ok', { imported: run.imported, rejected: run.rejected, warnings: run.warnings.length });
      } catch (err) {
        if (!(err instanceof ImportError)) throw err;
        summary = summaryOf(entity, 'failed', { message: err.message });
      }
    }
    results.set(entity, summary);
    return summary;
  });

  const clean = entities.every(e => e.status === 'ok' && e.rejected === 0);
  const state = store.updateImportStep(customer.id, clean ? 'completed' : 'failed');
  return {
    sourceKey: source.sourceKey,
    label: source.label,
    customerId: customer.id,
    entities,
    importStep: clean ? 'completed' : 'failed',
    progressPercent: state.progressPercent
  };
}

module.exports = { inDependencyOrder, linkSourceCustomer, importAll };
