const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const customerFiles = require('./customerFiles');

// addCustomer writes customers/<id>.md, so point the store at a scratch copy of
// the customers directory. CUSTOMERS_DIR is read when customerFiles is loaded, so
// clear the cached module after setting it.
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-customers-'));
fs.cpSync(customerFiles.CUSTOMERS_DIR, scratchDir, { recursive: true });
process.env.CUSTOMERS_DIR = scratchDir;
delete require.cache[require.resolve('./customerFiles')];

const { createCustomer, createTenant } = require('../models');

// A customer that exists on disk before the server starts, with no tenant yet
const preexisting = createCustomer({ id: 'cust_store_test_backfill', name: 'Backfill Co', region: 'United Kingdom' });
require('./customerFiles').save(preexisting);

const store = require('./store');

after(() => fs.rmSync(scratchDir, { recursive: true, force: true }));

const tenantsFor = (customerId) => store.getTenants().filter(t => t.customerId === customerId);

function assertOneTenantPerCustomer() {
  for (const customer of store.getCustomers()) {
    assert.strictEqual(tenantsFor(customer.id).length, 1, `exactly one tenant for ${customer.id}`);
  }
}

describe('store.addTenant', () => {
  it('should keep a region that is given explicitly', () => {
    const tenant = store.addTenant(createTenant({ customerId: 'cust_store_test_no_customer', region: 'APAC' }));

    assert.strictEqual(tenant.region, 'APAC');
  });

  it('should backfill the seeded tenant region from its customer', () => {
    const seeded = store.getTenantByCustomerId('cust_001');
    assert.strictEqual(seeded.plan, 'professional');
    assert.strictEqual(seeded.region, store.getCustomerById('cust_001').region);
  });
});

describe('store.addCustomer', () => {
  it('should create exactly one pending / starter tenant with the customer region', () => {
    const customer = store.addCustomer(createCustomer({ name: 'Tenant Auto Co', region: 'APAC' }));

    const tenants = tenantsFor(customer.id);
    assert.strictEqual(tenants.length, 1);
    assert.strictEqual(tenants[0].status, 'pending');
    assert.strictEqual(tenants[0].plan, 'starter');
    assert.strictEqual(tenants[0].region, 'APAC');
    assert.ok(fs.existsSync(path.join(scratchDir, `${customer.id}.md`)));
  });
});

describe('store.backfillTenants', () => {
  it('should have given every customer loaded at startup a tenant, region prefilled', () => {
    assertOneTenantPerCustomer();

    const [tenant] = tenantsFor(preexisting.id);
    assert.strictEqual(tenant.status, 'pending');
    assert.strictEqual(tenant.plan, 'starter');
    assert.strictEqual(tenant.region, 'United Kingdom');
  });

  it('should be idempotent', () => {
    const before = store.getTenants();

    store.backfillTenants();
    store.backfillTenants();

    assert.deepStrictEqual(store.getTenants(), before);
    assertOneTenantPerCustomer();
    assert.strictEqual(new Set(before.map(t => t.id)).size, before.length, 'tenant ids are unique');
  });
});
