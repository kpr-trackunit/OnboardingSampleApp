/**
 * Too-Many-Fields Recovery
 * Customers often leave commas unquoted in free text ("Williams, Robert"), so a row
 * splits into more fields than the header. This rejoins the extra fields into the
 * free-text column that overflowed. It is a general rule driven by the mapping, so
 * it works for any file (including uploads), not just the known XYZ case.
 */

const { getTargetFields } = require('../models/targetFields');
const { isDateLike, normalizeNumber } = require('./normalizers');

// Whether a raw value is acceptable for the target field mapped to a column
function fits(value, spec, valueMap) {
  const raw = String(value).trim();
  if (raw === '') return true;
  if (spec.type === 'date') return isDateLike(raw);
  if (spec.type === 'number') return normalizeNumber(raw) !== null;
  if (spec.type === 'picklist') return Boolean(valueMap && raw in valueMap.map);
  return true;
}

/**
 * Rejoins overflowing fields so the row matches the header
 * @param {string[]} header
 * @param {string[]} fields
 * @param {import('../models').Mapping} mapping
 * @returns {{ fields: string[], column: string|null }} column is the free-text column that was rejoined,
 *   or null when the row could not be recovered unambiguously
 */
function rejoinOverflow(header, fields, mapping) {
  const extra = fields.length - header.length;
  if (extra <= 0) return { fields, column: null };

  const targetFields = getTargetFields(mapping.entity);
  const fieldByColumn = {};
  Object.entries(mapping.columns).forEach(([field, column]) => {
    if (column) fieldByColumn[column] = field;
  });

  // Free-text columns are unmapped columns or ones mapped to a text field (not an ID or a reference)
  const isFreeText = column => {
    const field = fieldByColumn[column];
    return !field || (targetFields[field].type === 'text' && field !== 'sourceId' && !targetFields[field].references);
  };

  const candidates = header
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => isFreeText(column))
    .map(({ column, index }) => {
      const merged = [
        ...fields.slice(0, index),
        fields.slice(index, index + extra + 1).join(','),
        ...fields.slice(index + extra + 1)
      ];
      // Commas in prose are followed by a space ("Williams, Robert", "Electric, gas, water")
      const prose = fields.slice(index + 1, index + extra + 1).every(part => part.startsWith(' '));
      const typedFieldsFit = header.every((col, i) => {
        const field = fieldByColumn[col];
        return !field || fits(merged[i], targetFields[field], mapping.values[field]);
      });
      return { column, merged, prose, typedFieldsFit };
    })
    .filter(candidate => candidate.typedFieldsFit);

  const prose = candidates.filter(candidate => candidate.prose);
  const best = prose.length === 1 ? prose[0] : (prose.length === 0 && candidates.length === 1 ? candidates[0] : null);

  return best ? { fields: best.merged, column: best.column } : { fields, column: null };
}

module.exports = {
  rejoinOverflow
};
