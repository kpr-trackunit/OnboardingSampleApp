/**
 * Row Transform
 * The one place a source row becomes a canonical record. It is driven entirely by a
 * Mapping (columns, value maps, date format) and the entity's target fields, so no
 * source column names live in code. Import and the mapping preview both use it.
 */

const { getTargetFields } = require('../models/targetFields');
const { normalizeDate, normalizeNumber } = require('./normalizers');

/**
 * Converts one source row into canonical fields using a mapping
 * @param {Object<string, string>} row - Source column → raw value
 * @param {import('../models').Mapping} mapping
 * @returns {{ record: Object, errors: Object[], warnings: Object[] }}
 */
function transformRow(row, mapping) {
  const targetFields = getTargetFields(mapping.entity);
  const record = {};
  const errors = [];
  const warnings = [];

  Object.entries(targetFields).forEach(([field, spec]) => {
    const column = mapping.columns[field];
    const raw = column ? String(row[column] ?? '').trim() : '';

    if (spec.type === 'picklist') {
      const valueMap = mapping.values[field] || { map: {}, default: null };
      record[field] = raw === '' ? null : (valueMap.map[raw] ?? valueMap.default);
      record[`${field}Source`] = raw;
    } else if (spec.type === 'date') {
      record[field] = raw === '' ? null : normalizeDate(raw, mapping.dateFormat);
    } else if (spec.type === 'number') {
      record[field] = raw === '' ? null : normalizeNumber(raw);
    } else {
      record[field] = raw;
    }
  });

  return { record, errors, warnings };
}

module.exports = {
  transformRow
};
