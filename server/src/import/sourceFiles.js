/**
 * Source Files
 * Finds the CSV a customer's entity is imported from: the file CS uploaded when
 * there is one (data-mapping slice 6), otherwise the sample-data file.
 * Import and the Data Mapping tab both read files through here.
 */

const fs = require('fs');
const path = require('path');
const { DEFAULT_DATA_DIR, listSources } = require('./sources');
const { parseCsv } = require('./csv');
const { getUpload } = require('./uploads');
const { detectDateFormat, isDateLike } = require('./normalizers');

/**
 * @typedef {{
 *   filename: string,
 *   uploaded: boolean,
 *   header: string[],
 *   rows: { line: number, fields: string[] }[]
 * }} SourceFile
 */

/**
 * Reads and parses a customer's source file for an entity
 * @param {string} customerId
 * @param {string} entity
 * @param {{ dataDir?: string, getSourceCustomerId: (sourceKey: string, label: string) => string }} options
 * @returns {SourceFile|null} null when the customer has neither an upload nor a sample file
 */
function readSourceFile(customerId, entity, { dataDir = DEFAULT_DATA_DIR, getSourceCustomerId }) {
  const upload = getUpload(customerId, entity);
  if (upload) {
    return { filename: upload.filename, uploaded: true, ...parseCsv(upload.text) };
  }

  const source = listSources(dataDir).find(s => getSourceCustomerId(s.sourceKey, s.label) === customerId);
  const file = source?.files.find(f => f.entity === entity);
  if (!file) return null;

  const text = fs.readFileSync(path.join(dataDir, source.folder, file.filename), 'utf8');
  return { filename: file.filename, uploaded: false, ...parseCsv(text) };
}

/**
 * Detects a file's date format before any column is mapped: looks at every column
 * whose non-blank values all look like dates, so it works for any customer's headers.
 * @param {Object<string, string>[]} rows - Rows keyed by column name
 * @returns {ReturnType<typeof detectDateFormat> & { columns: string[] }} columns are the date-like
 *   columns found; status is null when there are none or no format fits them all
 */
function detectFileDateFormat(rows) {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const dateColumns = columns.filter(column => {
    const values = rows.map(row => String(row[column] ?? '').trim()).filter(v => v !== '');
    return values.length > 0 && values.every(isDateLike);
  });
  const detection = detectDateFormat(rows.flatMap(row => dateColumns.map(column => row[column] ?? '')));
  return { ...detection, columns: dateColumns };
}

module.exports = {
  readSourceFile,
  detectFileDateFormat
};
