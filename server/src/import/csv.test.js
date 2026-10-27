const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseCsv } = require('./csv');

describe('CSV Parser', () => {
  it('should split the header and rows', () => {
    const { header, rows } = parseCsv('Id,Name\n1,Alpha\n2,Beta\n');

    assert.deepStrictEqual(header, ['Id', 'Name']);
    assert.deepStrictEqual(rows.map(r => r.fields), [['1', 'Alpha'], ['2', 'Beta']]);
  });

  it('should keep commas and escaped quotes inside quoted fields', () => {
    const { rows } = parseCsv('Id,Name\n1,"Smith, ""Jo"""\n');

    assert.deepStrictEqual(rows[0].fields, ['1', 'Smith, "Jo"']);
  });

  it('should handle CRLF line endings and skip blank lines', () => {
    const { rows } = parseCsv('Id,Name\r\n1,Alpha\r\n\r\n2,Beta');

    assert.deepStrictEqual(rows.map(r => r.fields), [['1', 'Alpha'], ['2', 'Beta']]);
  });

  it('should record the file line number of each row', () => {
    const { rows } = parseCsv('Id,Name\n1,Alpha\n\n2,Beta\n');

    assert.deepStrictEqual(rows.map(r => r.line), [2, 4]);
  });

  it('should keep empty trailing fields', () => {
    const { rows } = parseCsv('Code,Parent\n1000,\n');

    assert.deepStrictEqual(rows[0].fields, ['1000', '']);
  });

  it('should return no rows for an empty file', () => {
    assert.deepStrictEqual(parseCsv(''), { header: [], rows: [] });
  });
});
