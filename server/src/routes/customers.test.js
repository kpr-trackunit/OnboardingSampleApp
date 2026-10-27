const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Point customer persistence at a scratch copy of customers/ before the store
// loads, so the test never writes to the repo's customer files.
const REPO_CUSTOMERS = path.join(__dirname, '..', '..', '..', 'customers');
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'customers-put-'));
fs.cpSync(REPO_CUSTOMERS, scratchDir, { recursive: true });
process.env.CUSTOMERS_DIR = scratchDir;

const app = require('../index');
const store = require('../data/store');
const customerFiles = require('../data/customerFiles');

describe('PUT /api/customers/:id (Customer Info fields)', () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise(resolve => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://localhost:${server.address().port}`;
  });

  after(() => {
    server.close();
    fs.rmSync(scratchDir, { recursive: true, force: true });
  });

  const put = (id, body) => fetch(`${baseUrl}/api/customers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  it('writes to the scratch directory, not the repo', () => {
    assert.strictEqual(customerFiles.CUSTOMERS_DIR, scratchDir);
  });

  it('accepts industry, region and contactEmail, trimmed, and persists them', async () => {
    const id = 'cust_003';
    const before = store.getCustomerById(id);

    const res = await put(id, {
      industry: '  Financial Services ',
      region: ' EU',
      contactEmail: 'ops@xyz.example.com  '
    });
    const customer = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(customer.industry, 'Financial Services');
    assert.strictEqual(customer.region, 'EU');
    assert.strictEqual(customer.contactEmail, 'ops@xyz.example.com');

    // Everything else stays as it was
    assert.strictEqual(customer.name, before.name);
    assert.deepStrictEqual(customer.config, before.config);
    assert.deepStrictEqual(customer.issues, before.issues);
    assert.strictEqual(customer.createdAt, before.createdAt);

    // And it's on disk, so it survives a restart
    const saved = customerFiles.loadAll().find(c => c.id === id);
    assert.strictEqual(saved.industry, 'Financial Services');
    assert.strictEqual(saved.region, 'EU');
    assert.strictEqual(saved.contactEmail, 'ops@xyz.example.com');
    assert.strictEqual(saved.name, before.name);
  });

  it('only changes the fields that are sent', async () => {
    const id = 'cust_002';
    const before = store.getCustomerById(id);

    const res = await put(id, { contactEmail: 'cs@abc.example.com' });
    const customer = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(customer.contactEmail, 'cs@abc.example.com');
    assert.strictEqual(customer.industry, before.industry);
    assert.strictEqual(customer.region, before.region);
    assert.strictEqual(customer.name, before.name);
  });

  it('allows clearing a field with a blank string', async () => {
    const res = await put('cust_002', { region: '   ' });
    const customer = await res.json();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(customer.region, '');
  });

  it('rejects non-string values with errors keyed by field, and saves nothing', async () => {
    const id = 'cust_004';
    const before = store.getCustomerById(id);

    const res = await put(id, { industry: 'Retail', region: 42, contactEmail: null });
    const body = await res.json();

    assert.strictEqual(res.status, 400);
    assert.ok(body.error);
    assert.deepStrictEqual(Object.keys(body.errors).sort(), ['contactEmail', 'region']);
    assert.deepStrictEqual(store.getCustomerById(id), before);
  });

  it('returns 404 for an unknown customer', async () => {
    const res = await put('cust_nope', { industry: 'Retail' });
    assert.strictEqual(res.status, 404);
  });
});
