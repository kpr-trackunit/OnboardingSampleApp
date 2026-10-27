/**
 * Minimal CSV Parser
 * Handles quoted fields ("a, b"), escaped quotes ("") and CRLF line endings.
 * Kept in-house (no csv-parse dependency) because we need the source line number
 * of every row for error messages, and sample files are small (40 rows or fewer).
 */

/**
 * Splits CSV text into records of raw string fields
 * @param {string} text
 * @returns {{ line: number, fields: string[] }[]} line is the 1-based line where the record starts
 */
function parseRecords(text) {
  const records = [];
  let fields = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    fields.push(field);
    // Skip blank lines
    if (!(fields.length === 1 && fields[0].trim() === '')) {
      records.push({ line: recordLine, fields });
    }
    fields = [];
    field = '';
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        if (char === '\n') line++;
        field += char;
      }
    } else if (char === '"' && field === '') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else if (char === '\r') {
      // Ignore; the following \n ends the record
    } else if (char === '\n') {
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += char;
    }
  }

  if (field !== '' || fields.length > 0) endRecord();
  return records;
}

/**
 * Parses CSV text into a header and data rows
 * @param {string} text
 * @returns {{ header: string[], rows: { line: number, fields: string[] }[] }}
 */
function parseCsv(text) {
  const records = parseRecords(text.replace(/^﻿/, ''));
  if (records.length === 0) return { header: [], rows: [] };

  const [headerRecord, ...rows] = records;
  return { header: headerRecord.fields.map(h => h.trim()), rows };
}

module.exports = {
  parseCsv
};
