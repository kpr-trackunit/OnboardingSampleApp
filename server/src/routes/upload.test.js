const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Customers are saved as markdown files: point the store at a scratch copy of customers/
// before it loads, so creating "Delta Ledger" here never touches the real folder
const scratchCustomers = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-test-customers-'));
fs.cpSync(path.join(__dirname, '../../../customers'), scratchCustomers, { recursive: true });
process.env.CUSTOMERS_DIR = scratchCustomers;

const express = require('express');
const store = require('../data/store');
const { createCustomer, createMapping } = require('../models');
const uploadRouter = require('./upload');
const mappingsRouter = require('./mappings');
const { sourceCustomerId } = require('./importGuard');
const { getUpload, getUploadHeader, clearUploads } = require('../import/uploads');
const { readFileRows, mappingCompleteness } = require('../import/completeness');
const { listImportSources, importEntity, getImported } = require('../import/importer');
const { getTargetFields } = require('../models/targetFields');

const FIXTURE = path.join(__dirname, '../../../tests/fixtures/upload/DeltaLedger/clients.csv');
const DELTA_CSV = fs.readFileSync(FIXTURE, 'utf8');
const AMBIGUOUS_CSV = fs.readFileSync(
  path.join(__dirname, '../../../tests/fixtures/mapping/CustomerD_AmbiguousDates/clients.csv'), 'utf8');

// Delta Ledger's clients mapped by CS (what slices 3 and 4 will do through the UI)
const DELTA_COLUMNS = {
  sourceId: 'Ref',
  name: 'Company',
  entityType: 'Kind',
  status: 'State',
  startDate: 'Joined',
  taxId: 'VAT Number',
  annualRevenue: 'Turnover',
  industry: 'Sector',
  paymentTerms: 'Terms'
};
const DELTA_VALUES = {
  entityType: { map: { 'Limited Company': 'company', 'Sole Trader': 'sole_trader', Charity: 'non_profit' }, default: 'company' },
  status: { map: { Live: 'active', Closed: 'inactive' }, default: 'pending' }
};

describe('Upload route', () => {
  let server;
  let baseUrl;
  let customer;
  let counter = 0;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/import', uploadRouter);
    app.use('/api/mappings', mappingsRouter);
    await new Promise(resolve => { server = app.listen(0, resolve); });
    baseUrl = `http://localhost:${server.address().port}`;
  });

  after(() => {
    server.close();
    fs.rmSync(scratchCustomers, { recursive: true, force: true });
  });

  // A brand-new customer per test, so mappings created by one test don't leak into the next
  beforeEach(() => {
    clearUploads();
    counter++;
    customer = store.addCustomer(createCustomer({ id: `cust_delta_${counter}`, name: `Delta Ledger ${counter}` }));
  });

  function upload(customerId, entity, text, { filename = 'clients.csv', json = false } = {}) {
    const url = `${baseUrl}/api/import/${customerId}/${entity}/upload?filename=${encodeURIComponent(filename)}`;
    return json
      ? fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, filename }) })
      : fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text });
  }

  describe('POST /api/import/:customerId/:entity/upload', () => {
    it('should store the file in memory for the customer and entity', async () => {
      const res = await upload(customer.id, 'clients', DELTA_CSV);
      const body = await res.json();

      assert.strictEqual(res.status, 201);
      assert.strictEqual(body.replaced, false);
      assert.deepStrictEqual(body.upload.header,
        ['Ref', 'Company', 'Contact', 'Kind', 'State', 'Joined', 'VAT Number', 'Turnover', 'Sector', 'Terms']);
      assert.strictEqual(body.upload.rowCount, 3);
      assert.strictEqual(body.upload.filename, 'clients.csv');
      assert.strictEqual(body.upload.sourceKey, `upload:${customer.id}`);
      assert.strictEqual(body.upload.text, undefined, 'the response leaves out the file text');

      assert.strictEqual(getUpload(customer.id, 'clients').text, DELTA_CSV);
      assert.deepStrictEqual(getUploadHeader(customer.id, 'clients'), body.upload.header);
    });

    it('should accept JSON { text } as well as raw text/csv', async () => {
      const res = await upload(customer.id, 'clients', DELTA_CSV, { json: true, filename: 'delta.csv' });
      const body = await res.json();

      assert.strictEqual(res.status, 201);
      assert.strictEqual(body.upload.filename, 'delta.csv');
      assert.strictEqual(getUpload(customer.id, 'clients').rowCount, 3);
    });

    it('should create an empty mapping with the detected date format on the first upload', async () => {
      const body = await (await upload(customer.id, 'clients', DELTA_CSV)).json();
      const mapping = store.getMapping(customer.id, 'clients');

      assert.strictEqual(body.mappingCreated, true);
      assert.deepStrictEqual(body.mapping, mapping);
      assert.deepStrictEqual(mapping.columns,
        Object.fromEntries(Object.keys(getTargetFields('clients')).map(field => [field, null])));
      assert.deepStrictEqual(mapping.values, {});
      assert.strictEqual(mapping.dateFormat, 'DD-MM-YYYY');
      assert.strictEqual(mapping.dateFormatDetected, 'detected');
    });

    it('should mark the date format ambiguous when the file could be read either way', async () => {
      await upload(customer.id, 'clients', AMBIGUOUS_CSV);
      const mapping = store.getMapping(customer.id, 'clients');

      assert.strictEqual(mapping.dateFormat, null);
      assert.strictEqual(mapping.dateFormatDetected, 'ambiguous');
    });

    it('should create an empty mapping for an entity without target fields yet', async () => {
      await upload(customer.id, 'contacts', 'Name,Email\nAna,ana@example.com\n');
      const mapping = store.getMapping(customer.id, 'contacts');

      assert.deepStrictEqual(mapping.columns, {});
      assert.deepStrictEqual(mapping.values, {});
    });

    it('should replace the previous upload and keep the mapping', async () => {
      await upload(customer.id, 'clients', DELTA_CSV);
      const edited = store.saveMapping({ ...store.getMapping(customer.id, 'clients'), columns: { ...DELTA_COLUMNS } });

      const res = await upload(customer.id, 'clients', 'Ref,Company\nD9,Replacement Ltd\n', { filename: 'clients-v2.csv' });
      const body = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.replaced, true);
      assert.strictEqual(body.mappingCreated, false);
      assert.deepStrictEqual(body.mapping, edited);
      assert.deepStrictEqual(getUpload(customer.id, 'clients').header, ['Ref', 'Company']);
      assert.strictEqual(getUpload(customer.id, 'clients').filename, 'clients-v2.csv');
      assert.strictEqual(getUpload(customer.id, 'clients').rowCount, 1);
    });

    it('should reject an unknown customer, an unknown entity and an empty file', async () => {
      assert.strictEqual((await upload('cust_nobody', 'clients', DELTA_CSV)).status, 404);
      assert.strictEqual((await upload(customer.id, 'invoices', DELTA_CSV)).status, 404);
      assert.strictEqual((await upload(customer.id, 'clients', '  \n')).status, 400);
      assert.strictEqual(getUpload(customer.id, 'clients'), undefined);
      assert.strictEqual(store.getMapping(customer.id, 'clients'), undefined);
    });
  });

  describe('reading an uploaded file', () => {
    it('should recover a row with an unquoted comma before any column is mapped', async () => {
      await upload(customer.id, 'clients', DELTA_CSV);
      const rows = readFileRows(customer.id, store.getMapping(customer.id, 'clients'),
        { getSourceCustomerId: store.getSourceCustomerId });

      // No mapping yet, so recovery relies on the comma being followed by a space ("Williams, Robert")
      assert.strictEqual(rows.length, 3);
      assert.strictEqual(rows[1].Contact, 'Williams, Robert');
      assert.strictEqual(rows[1].Kind, 'Sole Trader');
      assert.strictEqual(rows[1].Joined, '14-07-2022');
    });

    it('should show the empty mapping as incomplete with the file\'s detected date format', async () => {
      await upload(customer.id, 'clients', DELTA_CSV);
      const res = await fetch(`${baseUrl}/api/mappings/${customer.id}`);
      const clients = (await res.json()).entities.find(e => e.entity === 'clients');

      assert.strictEqual(clients.completeness.complete, false);
      assert.deepStrictEqual(clients.completeness.dateFormat, { format: 'DD-MM-YYYY', status: 'detected' });
      assert.deepStrictEqual(
        clients.completeness.reasons.filter(r => r.code === 'missing_required_column').map(r => r.field),
        ['sourceId', 'name']);
    });

    it('should return the uploaded file\'s headers with the mapping', async () => {
      await upload(customer.id, 'clients', DELTA_CSV, { filename: 'delta-clients.csv' });
      const body = await (await fetch(`${baseUrl}/api/mappings/${customer.id}/clients`)).json();

      assert.deepStrictEqual(body.file, {
        filename: 'delta-clients.csv',
        uploaded: true,
        headers: ['Ref', 'Company', 'Contact', 'Kind', 'State', 'Joined', 'VAT Number', 'Turnover', 'Sector', 'Terms'],
        rowCount: 3
      });
    });
  });

  describe('importing an uploaded file', () => {
    it('should list a customer that only has uploads as an upload: source', async () => {
      await upload(customer.id, 'clients', DELTA_CSV);
      const source = listImportSources().find(s => s.customerId === customer.id);

      assert.strictEqual(source.sourceKey, `upload:${customer.id}`);
      assert.strictEqual(source.label, customer.name);
      assert.deepStrictEqual(source.files, [
        { entity: 'clients', filename: 'clients.csv', rowCount: 3, uploaded: true, importable: true }
      ]);
      assert.strictEqual(sourceCustomerId(source.sourceKey), customer.id, 'the tenant guard finds the customer');
      assert.strictEqual(sourceCustomerId('upload:cust_nobody'), null);
    });

    it('should list a sample customer\'s upload in place of its sample file', () => {
      const xyz = listImportSources().find(s => s.sourceKey === 'xyz-financial-services');
      const xyzCustomerId = xyz.customerId;
      // Uploading for a seeded customer goes through the same store as the route
      require('../import/uploads').saveUpload({ customerId: xyzCustomerId, entity: 'clients', text: 'a,b\n1,2\n' });

      const files = listImportSources().find(s => s.sourceKey === 'xyz-financial-services').files;
      assert.deepStrictEqual(files.find(f => f.entity === 'clients'),
        { entity: 'clients', filename: 'clients.csv', rowCount: 1, uploaded: true, importable: true });
      assert.strictEqual(files.find(f => f.entity === 'contacts').uploaded, false);
      assert.strictEqual(listImportSources().filter(s => s.customerId === xyzCustomerId).length, 1);
    });

    it('should import the uploaded file once it is mapped, recovering the overflowing row', async () => {
      await upload(customer.id, 'clients', DELTA_CSV);
      // Slice 3's PUT isn't on this branch, so map it through the store
      store.saveMapping(createMapping({
        ...store.getMapping(customer.id, 'clients'),
        columns: DELTA_COLUMNS,
        values: DELTA_VALUES
      }));
      const rows = readFileRows(customer.id, store.getMapping(customer.id, 'clients'),
        { getSourceCustomerId: store.getSourceCustomerId });
      assert.strictEqual(mappingCompleteness(store.getMapping(customer.id, 'clients'), rows, getTargetFields('clients')).complete, true);

      const sourceKey = `upload:${customer.id}`;
      const run = importEntity(sourceKey, 'clients');

      assert.strictEqual(run.imported, 3);
      assert.strictEqual(run.rejected, 0);
      assert.deepStrictEqual(run.warnings, []);
      assert.strictEqual(run.dateFormat, 'DD-MM-YYYY');

      const clients = getImported(sourceKey, 'clients');
      assert.deepStrictEqual(clients.map(c => [c.sourceId, c.name, c.entityType, c.status, c.startDate]), [
        ['D001', 'Delta Bakery Ltd', 'company', 'active', '2023-03-25'],
        ['D002', 'Harbour Joinery', 'sole_trader', 'active', '2022-07-14'],
        ['D003', 'North Star Trust', 'non_profit', 'inactive', '2021-11-03']
      ]);
      assert.ok(clients.every(c => c.customerId === customer.id));
    });
  });
});
