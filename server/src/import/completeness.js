/**
 * Mapping Completeness
 * Works out whether a Mapping is complete enough to import a file, and why not.
 * Driven only by the mapping and the entity's target fields, so it works for any
 * entity in TARGET_FIELDS and any file (seeded or uploaded).
 *
 * A mapping is complete when (see tickets/data-mapping.md):
 * - every required target field has a source column
 * - the date format is known: detected in the file, or confirmed by CS when ambiguous
 * - every value of a strict picklist field in the file is mapped
 * - every value of a non-strict picklist field is mapped, or the field has a default
 *
 * Reasons with blocking: false (unmapped values that will use the default) are shown
 * to CS but don't stop completion.
 */

const fs = require('fs');
const path = require('path');
const { DEFAULT_DATA_DIR, ENTITY_FILES, listSources } = require('./sources');
const { parseCsv } = require('./csv');
const { rejoinOverflow } = require('./overflow');
const { detectDateFormat } = require('./normalizers');
const store = require('../data/store');
const { getTargetFields } = require('../models/targetFields');
const {
  createDefaultOnboardingSteps,
  calculateProgress,
  dataMappingStepStatus,
  DATA_MAPPING_STEP_ID
} = require('../models');

// clients | contacts | accounts | transactions, in import order
const ENTITIES = ENTITY_FILES.map(f => f.entity);

/**
 * @typedef {{
 *   code: 'no_mapping'|'no_file'|'no_target_fields'|'missing_required_column'|'unmapped_values'
 *     |'unmapped_values_defaulted'|'date_format_ambiguous'|'date_format_unset',
 *   blocking: boolean,
 *   strict: boolean,
 *   field: string|null,
 *   column?: string,
 *   values?: string[],
 *   default?: string,
 *   candidates?: string[],
 *   message: string
 * }} CompletenessReason
 *
 * @typedef {{
 *   format: string|null,
 *   status: 'detected'|'ambiguous'|'confirmed'|'not_needed'|null
 * }} DateFormatStatus  status null means no supported format fits the file's dates
 *
 * @typedef {{ complete: boolean, reasons: CompletenessReason[], dateFormat: DateFormatStatus|null }} Completeness
 */

function reason(code, blocking, message, extra = {}) {
  return { code, blocking, strict: false, field: null, ...extra, message };
}

// Distinct non-blank values in a column, in the order they first appear (trimmed, as import reads them)
function distinctValues(rows, column) {
  const seen = new Set();
  rows.forEach(row => {
    const value = String(row[column] ?? '').trim();
    if (value !== '') seen.add(value);
  });
  return [...seen];
}

/**
 * The mapping's date format status, using the same detector as import.
 * A format CS confirmed wins; otherwise the file decides.
 * @returns {{ dateFormat: DateFormatStatus, reason: CompletenessReason|null }}
 */
function dateFormatStatus(mapping, fileRows, targetFields) {
  if (mapping.dateFormatDetected === 'confirmed' && mapping.dateFormat) {
    return { dateFormat: { format: mapping.dateFormat, status: 'confirmed' }, reason: null };
  }

  const dateColumns = Object.entries(targetFields)
    .filter(([field, spec]) => spec.type === 'date' && mapping.columns[field])
    .map(([field]) => mapping.columns[field]);

  // Without the file, fall back to what the mapping says was detected
  if (!fileRows) {
    const status = mapping.dateFormat ? mapping.dateFormatDetected : null;
    return status === 'detected'
      ? { dateFormat: { format: mapping.dateFormat, status }, reason: null }
      : { dateFormat: { format: null, status }, reason: reason('date_format_unset', true, 'Date format not set') };
  }

  const values = fileRows.flatMap(row => dateColumns.map(column => row[column] ?? ''));
  if (values.every(value => String(value).trim() === '')) {
    return { dateFormat: { format: mapping.dateFormat || null, status: 'not_needed' }, reason: null };
  }

  const detection = detectDateFormat(values);
  if (detection.status === 'detected') {
    return { dateFormat: { format: detection.format, status: 'detected' }, reason: null };
  }
  if (detection.status === 'ambiguous') {
    return {
      dateFormat: { format: null, status: 'ambiguous' },
      reason: reason('date_format_ambiguous', true,
        `Date format is ambiguous (could be ${detection.candidates.join(' or ')}): pick one`,
        { candidates: detection.candidates })
    };
  }
  return {
    dateFormat: { format: null, status: null },
    reason: reason('date_format_unset', true, 'No supported date format fits every date in the file')
  };
}

/**
 * Checks a mapping against its source file. Pure: the caller reads the file.
 * @param {import('../models').Mapping|null} mapping
 * @param {Object<string, string>[]|null} fileRows - The file's rows keyed by column name,
 *   or null when there is no source file to check against
 * @param {Object<string, { type: string, required?: boolean, strict?: boolean, values?: string[] }>|undefined} targetFields
 * @returns {Completeness}
 */
function mappingCompleteness(mapping, fileRows, targetFields) {
  if (!mapping) {
    return { complete: false, reasons: [reason('no_mapping', true, 'No mapping yet')], dateFormat: null };
  }
  if (!targetFields || Object.keys(targetFields).length === 0) {
    return {
      complete: false,
      reasons: [reason('no_target_fields', true, `No target fields are defined for ${mapping.entity} yet`)],
      dateFormat: null
    };
  }

  const reasons = [];
  if (!fileRows) reasons.push(reason('no_file', true, 'No source file to check the mapping against'));

  Object.entries(targetFields).forEach(([field, spec]) => {
    const column = mapping.columns?.[field] || null;
    const strict = Boolean(spec.strict);

    if (!column) {
      if (spec.required) {
        reasons.push(reason('missing_required_column', true, `Required field ${field} has no source column`, { field }));
      }
      return;
    }
    if (spec.type !== 'picklist' || !fileRows) return;

    const { map = {}, default: fallback = null } = mapping.values?.[field] || {};
    const unmapped = distinctValues(fileRows, column).filter(value => !(value in map));
    if (unmapped.length === 0) return;

    const list = unmapped.map(v => `'${v}'`).join(', ');
    if (strict) {
      reasons.push(reason('unmapped_values', true,
        `${field}: ${list} not mapped (strict field, no default allowed)`,
        { field, column, values: unmapped, strict }));
    } else if (fallback === null || fallback === undefined) {
      reasons.push(reason('unmapped_values', true,
        `${field}: ${list} not mapped and no default`,
        { field, column, values: unmapped }));
    } else {
      reasons.push(reason('unmapped_values_defaulted', false,
        `${field}: ${list} not mapped, will use default '${fallback}'`,
        { field, column, values: unmapped, default: fallback }));
    }
  });

  const date = dateFormatStatus(mapping, fileRows, targetFields);
  if (date.reason) reasons.push(date.reason);

  return { complete: reasons.every(r => !r.blocking), reasons, dateFormat: date.dateFormat };
}

/**
 * Reads a customer's source file for an entity as rows keyed by column name, rejoining
 * unquoted commas the same way import does. Rows that still don't fit the header are left out
 * (import rejects them). Returns null when the customer has no file for the entity.
 * @param {string} customerId
 * @param {import('../models').Mapping} mapping - Used to recover overflowing rows
 * @param {{ dataDir?: string, getSourceCustomerId: (sourceKey: string, label: string) => string }} options
 * @returns {Object<string, string>[]|null}
 */
function readFileRows(customerId, mapping, { dataDir = DEFAULT_DATA_DIR, getSourceCustomerId }) {
  const source = listSources(dataDir).find(s => getSourceCustomerId(s.sourceKey, s.label) === customerId);
  const file = source?.files.find(f => f.entity === mapping.entity);
  if (!file) return null;

  const { header, rows } = parseCsv(fs.readFileSync(path.join(dataDir, source.folder, file.filename), 'utf8'));
  return rows
    .map(({ fields }) => rejoinOverflow(header, fields, mapping).fields)
    .filter(fields => fields.length === header.length)
    .map(fields => Object.fromEntries(header.map((column, i) => [column, fields[i]])));
}

/**
 * A customer's mapping for one entity, checked against that customer's source file.
 * Shared by the mapping routes, the import gate and the onboarding step sync.
 * @param {string} customerId
 * @param {string} entity
 * @returns {Completeness}
 */
function entityCompleteness(customerId, entity) {
  const mapping = store.getMapping(customerId, entity) || null;
  const fileRows = mapping
    ? readFileRows(customerId, mapping, { getSourceCustomerId: store.getSourceCustomerId })
    : null;
  return mappingCompleteness(mapping, fileRows, getTargetFields(entity));
}

/**
 * Mirrors a customer's mapping completeness onto onboarding step 2 (Data Mapping) and
 * recalculates progressPercent: completed when all 4 entities are complete, in_progress
 * when some are, pending when none are. Call it whenever a mapping's completeness could
 * change (the mapping PUT in data-mapping slices 3 and 4, uploads) and once at startup.
 *
 * A customer without an onboarding state already shows the default (all pending) steps
 * on the Dashboard, so a state is only created when step 2 needs to be something else.
 * @param {string} customerId
 * @param {(customerId: string, entity: string) => Completeness} [getCompleteness]
 * @returns {import('../models').OnboardingState | null} The updated state, or null when
 *   the customer is unknown or nothing needed writing
 */
function syncDataMappingStep(customerId, getCompleteness = entityCompleteness) {
  if (!store.getCustomerById(customerId)) return null;

  const completeCount = ENTITIES.filter(entity => getCompleteness(customerId, entity).complete).length;
  const status = dataMappingStepStatus(completeCount, ENTITIES.length);

  const existing = store.getOnboardingState(customerId);
  if (!existing && status === 'pending') return null;

  const steps = (existing?.steps || createDefaultOnboardingSteps()).map(step =>
    step.id === DATA_MAPPING_STEP_ID ? { ...step, status } : step
  );
  const progressPercent = calculateProgress(steps);
  if (!existing) return store.addOnboardingState({ customerId, steps, progressPercent });
  return store.updateOnboardingState(customerId, { steps, progressPercent });
}

module.exports = {
  ENTITIES,
  mappingCompleteness,
  readFileRows,
  entityCompleteness,
  syncDataMappingStep
};
