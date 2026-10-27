/**
 * Value Normalizers
 * Convert raw CSV strings into canonical values. Return null when a value can't be parsed.
 */

// Order of the date parts per supported format. Separators are matched loosely
// (/, - or .) because customers mix them, which is what makes day/month order ambiguous.
const DATE_FORMATS = {
  'MM/DD/YYYY': { pattern: /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/, order: ['month', 'day', 'year'] },
  'YYYY-MM-DD': { pattern: /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/, order: ['year', 'month', 'day'] },
  'DD-MM-YYYY': { pattern: /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/, order: ['day', 'month', 'year'] }
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
 * Works out which date format a file uses from its date values
 * @param {string[]} values - Raw date values from the file (blanks are ignored)
 * @returns {{ format: string|null, status: 'detected'|'ambiguous'|null, candidates: string[] }}
 *   status is null when no format fits every value
 */
function detectDateFormat(values) {
  const present = values.map(v => String(v).trim()).filter(v => v !== '');
  if (present.length === 0) return { format: null, status: null, candidates: [] };

  const candidates = Object.keys(DATE_FORMATS)
    .filter(format => present.every(value => normalizeDate(value, format) !== null));

  if (candidates.length === 1) return { format: candidates[0], status: 'detected', candidates };
  if (candidates.length > 1) return { format: null, status: 'ambiguous', candidates };
  return { format: null, status: null, candidates };
}

/**
 * True when a value parses as a date in any supported format
 * @param {string} value
 */
function isDateLike(value) {
  return Object.keys(DATE_FORMATS).some(format => normalizeDate(value, format) !== null);
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
  detectDateFormat,
  isDateLike,
  normalizeNumber
};
