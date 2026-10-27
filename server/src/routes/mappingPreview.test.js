const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const mappingsRouter = require('./mappings');
const store = require('../data/store');
const { transformRow } = require('../import/transform');
const { readFileRows } = require('../import/completeness');

// The customer the XYZ seed is linked to (customers come from customers/*.md, so look it up)
function xyzCustomerId() {
  return store.getSourceCustomerId('xyz-financial-services', 'XYZ Financial Services');
}

// ABC's file has no overflowing rows, so every row survives a draft with unmapped values.
// (XYZ rows overflow on mainContact, and overflow recovery needs the picklist values mapped.)
function abcCustomerId() {
  return store.getSourceCustomerId('abc-accounting', 'ABC Accounting');
}

describe('POST /api/mappings/:customerId/:entity/preview', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/mappings', mappingsRouter);
    await new Promise(resolve => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}`;
  });

  after(() => {
    server.close();
  });

  async function preview(customerId, entity, body) {
    const res = await fetch(`${baseUrl}/api/mappings/${customerId}/${entity}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  }

  it('should return the first 5 rows mapped with transformRow and the stored mapping', async () => {
    const customerId = xyzCustomerId();
    const stored = store.getMapping(customerId, 'clients');
    const fileRows = readFileRows(customerId, stored, { getSourceCustomerId: store.getSourceCustomerId });

    const { status, body } = await preview(customerId, 'clients');

    assert.strictEqual(status, 200);
    assert.strictEqual(body.mappingSource, 'stored');
    assert.strictEqual(body.total, fileRows.length);
    assert.strictEqual(body.rows.length, 5);
    body.rows.forEach((row, i) => {
      const expected = transformRow(fileRows[i], stored);
      assert.strictEqual(row.line, i + 2);
      assert.deepStrictEqual(row.source, fileRows[i]);
      assert.deepStrictEqual(row.record, expected.record);
      assert.strictEqual(row.errors.length, expected.errors.length);
      assert.strictEqual(row.warnings.length, expected.warnings.length);
    });
    // Mapped values are in standard form, next to their source value
    assert.strictEqual(body.rows[0].record.statusSource, fileRows[0][stored.columns.status].trim());
    assert.ok(['active', 'inactive', 'pending'].includes(body.rows[0].record.status));
  });

  it('should honour limit', async () => {
    const { status, body } = await preview(xyzCustomerId(), 'clients', { limit: 2 });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.rows.length, 2);
  });

  it('should reject a bad limit or mapping with 400', async () => {
    for (const bad of [{ limit: 0 }, { limit: 'five' }, { limit: 1000 }, { mapping: 'x' }, { mapping: [] }]) {
      const { status, body } = await preview(xyzCustomerId(), 'clients', bad);
      assert.strictEqual(status, 400, JSON.stringify(bad));
      assert.ok(body.error);
    }
  });

  it('should use an unsaved mapping from the body instead of the stored one', async () => {
    const customerId = xyzCustomerId();
    const stored = store.getMapping(customerId, 'clients');
    const before = JSON.stringify(stored);
    // Map every status value to 'inactive'
    const statusMap = Object.fromEntries(Object.keys(stored.values.status.map).map(v => [v, 'inactive']));
    const draft = { ...stored, values: { ...stored.values, status: { map: statusMap, default: 'inactive' } } };

    const { status, body } = await preview(customerId, 'clients', { mapping: draft });

    assert.strictEqual(status, 200);
    assert.strictEqual(body.mappingSource, 'body');
    const withStatus = body.rows.filter(row => row.record.statusSource);
    assert.ok(withStatus.length > 0);
    withStatus.forEach(row => assert.strictEqual(row.record.status, 'inactive'));
    assert.strictEqual(JSON.stringify(store.getMapping(customerId, 'clients')), before, 'stored mapping is unchanged');
  });

  it('should return a warning with each defaulted value', async () => {
    const customerId = abcCustomerId();
    const stored = store.getMapping(customerId, 'clients');
    const draft = { ...stored, values: { ...stored.values, status: { map: {}, default: 'pending' } } };

    const { body } = await preview(customerId, 'clients', { mapping: draft });

    const withStatus = body.rows.filter(row => row.record.statusSource);
    assert.ok(withStatus.length > 0);
    withStatus.forEach(row => {
      assert.strictEqual(row.record.status, 'pending');
      const warning = row.warnings.find(w => w.field === 'status');
      assert.ok(warning, `row ${row.line} has a status warning`);
      assert.strictEqual(warning.row, row.line);
      assert.strictEqual(warning.column, stored.columns.status);
      assert.strictEqual(warning.value, row.record.statusSource);
      assert.strictEqual(warning.default, 'pending');
      assert.match(warning.message, /not mapped, used default 'pending'/);
    });
  });

  it('should report errors per row without failing the preview', async () => {
    const customerId = xyzCustomerId();
    const stored = store.getMapping(customerId, 'clients');
    const { name, ...columns } = stored.columns;
    const draft = { ...stored, columns };

    const { status, body } = await preview(customerId, 'clients', { mapping: draft });

    assert.strictEqual(status, 200);
    body.rows.forEach(row => {
      assert.ok(row.errors.some(e => e.field === 'name' && /required/.test(e.message)));
    });
  });

  it('should 404 with a clear message when there is no mapping', async () => {
    const { status, body } = await preview('cust_001', 'clients');
    assert.strictEqual(status, 404);
    assert.match(body.error, /No mapping yet/);
  });

  it('should 409 with a clear message when the customer has no source file', async () => {
    const stored = store.getMapping(xyzCustomerId(), 'clients');
    const { status, body } = await preview('cust_001', 'clients', { mapping: stored });
    assert.strictEqual(status, 409);
    assert.match(body.error, /No source file/);
  });

  it('should 409 when the entity has no target fields yet', async () => {
    const { status, body } = await preview(xyzCustomerId(), 'contacts', { mapping: { columns: {} } });
    assert.strictEqual(status, 409);
    assert.match(body.error, /No target fields/);
  });

  it('should 404 for an unknown customer or entity', async () => {
    assert.strictEqual((await preview('nope', 'clients')).status, 404);
    assert.strictEqual((await preview(xyzCustomerId(), 'widgets')).status, 404);
  });
});
