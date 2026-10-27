const { describe, it } = require('node:test');
const assert = require('node:assert');
const { checkParents } = require('./hierarchy');

const options = { keyField: 'code', parentField: 'parentCode', parentColumn: 'parent' };
const rows = list => list.map(([code, parentCode], i) => ({ line: i + 2, record: { code, parentCode } }));
const codes = result => result.accepted.map(({ record }) => record.code);

describe('checkParents', () => {
  it('should accept accounts whose parent is in the file, in any order', () => {
    const all = rows([['0011', '0010'], ['0010', ''], ['0012', '0010']]);

    const result = checkParents(all, all, options);

    assert.deepStrictEqual(codes(result), ['0011', '0010', '0012']);
    assert.deepStrictEqual(result.errors, []);
  });

  it('should reject an orphan whose parent is not in the file', () => {
    const all = rows([['100', ''], ['101', '999']]);

    const result = checkParents(all, all, options);

    assert.deepStrictEqual(codes(result), ['100']);
    assert.deepStrictEqual(result.errors, [
      { line: 3, field: 'parentCode', column: 'parent', value: '999', message: "`parent` '999' does not exist in this file" }
    ]);
  });

  it('should reject the whole branch under a rejected parent', () => {
    const all = rows([['100', ''], ['110', '100'], ['111', '110']]);
    const accepted = all.filter(({ record }) => record.code !== '100');

    const result = checkParents(accepted, all, options);

    assert.deepStrictEqual(codes(result), []);
    assert.deepStrictEqual(result.errors.map(e => e.line), [3, 4]);
    assert.ok(result.errors.every(e => e.message.includes('was rejected')));
  });

  it('should reject accounts that are their own parent or form a loop', () => {
    const all = rows([['1', '1'], ['2', '3'], ['3', '2'], ['4', '2'], ['5', '']]);

    const result = checkParents(all, all, options);

    assert.deepStrictEqual(codes(result), ['5']);
    assert.deepStrictEqual(result.errors.map(e => [e.line, e.message]), [
      [2, "`parent` '1' is the account itself"],
      [3, "`parent` '3' makes a loop of parent accounts"],
      [4, "`parent` '2' makes a loop of parent accounts"],
      [5, "`parent` '2' was rejected, so this account has no parent"]
    ]);
  });
});
