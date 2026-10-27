const { describe, it } = require('node:test');
const assert = require('node:assert');
const store = require('./store');
const { createTenant } = require('../models');

// Customers that don't have a tenant yet (anyone but the seeded tenant's customer)
const customersWithoutTenant = () =>
  store.getCustomers().filter(c => c.region && !store.getTenantByCustomerId(c.id));

describe('store.addTenant', () => {
  it('should default the region to the customer region', () => {
    const [customer] = customersWithoutTenant();
    assert.ok(customer, 'expected a customer with a region and no tenant');

    const tenant = store.addTenant(createTenant({ customerId: customer.id }));

    assert.strictEqual(tenant.region, customer.region);
    assert.strictEqual(store.getTenantByCustomerId(customer.id).region, customer.region);
  });

  it('should keep a region that is given explicitly', () => {
    const [customer] = customersWithoutTenant();
    assert.ok(customer, 'expected a customer with a region and no tenant');

    const tenant = store.addTenant(createTenant({ customerId: customer.id, region: 'APAC' }));

    assert.strictEqual(tenant.region, 'APAC');
  });

  it('should backfill the seeded tenant region from its customer', () => {
    const [seeded] = store.getTenants();
    assert.strictEqual(seeded.region, store.getCustomerById(seeded.customerId).region);
  });
});
