/**
 * Row Transform
 * The one place a source row becomes a canonical record. It is driven entirely by a
 * Mapping (columns, value maps, date format) and the entity's target fields, so no
 * source column names live in code. Import and the mapping preview both use it.
 *
 * Problems are reported per field, without a row number (the caller adds it):
 * - errors reject the row: missing required value, unparseable date/number,
 *   unmapped value on a strict picklist (or a picklist with no default)
 * - warnings keep the row: unmapped value on a non-strict picklist, which takes the default
 */

const { getTargetFields } = require('../models/targetFields');
const { normalizeDate, normalizeNumber } = require('./normalizers');

/**
 * Converts one source row into canonical fields using a mapping
 * @param {Object<string, string>} row - Source column → raw value
 * @param {import('../models').Mapping} mapping
 * @returns {{
 *   record: Object,
 *   errors: { field: string, column: string|null, value: string, message: string }[],
 *   warnings: { field: string, column: string, value: string, default: string, message: string }[]
 * }}
 */
function transformRow(row, mapping) {
  const targetFields = getTargetFields(mapping.entity);
  const record = {};
  const errors = [];
  const warnings = [];

  Object.entries(targetFields).forEach(([field, spec]) => {
    const column = mapping.columns[field] || null;
    const raw = column ? String(row[column] ?? '').trim() : '';
    const label = `\`${column || field}\``;
    const addError = message => errors.push({ field, column, value: raw, message });

    if (raw === '') {
      record[field] = spec.type === 'text' ? '' : null;
      if (spec.type === 'picklist') record[`${field}Source`] = '';
      if (spec.required) addError(`${label} is required`);
      return;
    }

    if (spec.type === 'picklist') {
      const valueMap = mapping.values[field] || { map: {}, default: null };
      record[`${field}Source`] = raw;

      if (raw in valueMap.map) {
        record[field] = valueMap.map[raw];
      } else if (spec.strict || valueMap.default === null || valueMap.default === undefined) {
        record[field] = null;
        addError(`${label} '${raw}' is not mapped${spec.strict ? ' (strict field, no default allowed)' : ' and has no default'}`);
      } else {
        record[field] = valueMap.default;
        warnings.push({
          field,
          column,
          value: raw,
          default: valueMap.default,
          message: `${label} '${raw}' is not mapped, used default '${valueMap.default}'`
        });
      }
    } else if (spec.type === 'date') {
      record[field] = normalizeDate(raw, mapping.dateFormat);
      if (record[field] === null) addError(`${label} '${raw}' is not a valid date`);
    } else if (spec.type === 'number') {
      record[field] = normalizeNumber(raw);
      if (record[field] === null) addError(`${label} '${raw}' is not a valid number`);
    } else {
      record[field] = raw;
    }
  });

  return { record, errors, warnings };
}

module.exports = {
  transformRow
};
