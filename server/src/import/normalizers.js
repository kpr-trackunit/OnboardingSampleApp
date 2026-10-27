/**
 * Value Normalizers
 * Convert raw CSV strings into canonical values. Return null when a value can't be parsed.
 */

// Position of each date part per supported format
const DATE_FORMATS = {
  'MM/DD/YYYY': { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['month', 'day', 'year'] },
  'YYYY-MM-DD': { pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: ['year', 'month', 'day'] },
  'DD-MM-YYYY': { pattern: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ['day', 'month', 'year'] }
};

/**
 * Parses a date written in the given format into ISO YYYY-MM-DD
 * @param {string} value
 * @param {string} format - One of DATE_FORMATS
 * @returns {string|null}
 */
function normalizeDate(value, format) {
  const spec = DATE_FORMATS[format];
  const match = spec && String(value).trim().match(spec.pattern);
  if (!match) return null;

  const parts = {};
  spec.order.forEach((part, i) => { parts[part] = Number(match[i + 1]); });
  const { year, month, day } = parts;

  // Reject impossible dates like 02/30 or 13/45
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parses a number such as "2500000.00", "1850000" or "1,850,000"
 * @param {string} value
 * @returns {number|null}
 */
function normalizeNumber(value) {
  const cleaned = String(value).replace(/[,\s]/g, '');
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

module.exports = {
  DATE_FORMATS,
  normalizeDate,
  normalizeNumber
};
