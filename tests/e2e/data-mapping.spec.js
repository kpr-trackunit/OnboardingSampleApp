// @ts-check
const { test, expect } = require('@playwright/test');

// Finds the customer whose clients mapping is the XYZ one (name ← companyName).
// Customer names live in customers/*.md and can be renamed, so look it up through the API.
async function findXyzCustomer(request) {
  const customers = await (await request.get('/api/customers')).json();
  for (const customer of customers) {
    const overview = await (await request.get(`/api/mappings/${customer.id}`)).json();
    const clients = overview.entities.find(e => e.entity === 'clients');
    if (clients.mapping?.columns.name === 'companyName') return customer;
  }
  throw new Error('No customer has the XYZ clients mapping');
}

test.describe('Data Mapping Tab', () => {
  test('should show the XYZ clients mapping', async ({ page, request }) => {
    const xyz = await findXyzCustomer(request);

    await page.goto('/');
    await page.getByRole('button', { name: 'Data Mapping' }).click();
    await page.getByLabel('Customer').selectOption({ label: xyz.name });
    await page.getByRole('group', { name: 'Entity' }).getByRole('button', { name: 'clients' }).click();

    const view = page.locator('.mapping-view[data-entity="clients"]');
    await expect(view.locator('.column-mappings tr[data-field="name"]')).toContainText('name');
    await expect(view.locator('.column-mappings tr[data-field="name"]')).toContainText('companyName');
    await expect(view.locator('.column-mappings tr[data-field="status"]')).toContainText('clientStatus');

    const status = view.locator('.value-mapping[data-field="status"]');
    await expect(status.locator('.value-map tr').filter({ hasText: /^A/ })).toContainText('active');
    await expect(status.locator('.value-default')).toContainText('pending');

    await expect(view.locator('.date-format')).toContainText('YYYY-MM-DD');
  });

  test('should show a completeness badge per entity, with clients Complete for every sample customer', async ({ page, request }) => {
    // The sample customers are the ones with a seeded clients mapping
    const customers = await (await request.get('/api/customers')).json();
    const samples = [];
    for (const customer of customers) {
      const overview = await (await request.get(`/api/mappings/${customer.id}`)).json();
      if (overview.entities.find(e => e.entity === 'clients').mapping) samples.push({ customer, overview });
    }
    expect(samples).toHaveLength(3);

    await page.goto('/');
    await page.getByRole('button', { name: 'Data Mapping' }).click();

    for (const { customer, overview } of samples) {
      await page.getByLabel('Customer').selectOption({ label: customer.name });

      const cards = page.locator('.completeness-summary .entity-status');
      await expect(cards).toHaveCount(4);
      await expect(page.getByRole('group', { name: 'Entity' }).locator('.completeness-badge')).toHaveCount(4);

      const clients = page.locator('.entity-status[data-entity="clients"]');
      await expect(clients.locator('.completeness-badge')).toHaveText('Complete');
      await expect(clients.locator('.date-status')).toContainText('detected');

      // Entities with no mapping yet say so
      for (const { entity } of overview.entities.filter(e => !e.mapping)) {
        const card = page.locator(`.entity-status[data-entity="${entity}"]`);
        await expect(card.locator('h4 .completeness-badge')).toHaveText('Incomplete');
        await expect(card.locator('.completeness-reasons')).toContainText('No mapping yet');
      }
    }
  });

  test('should say when an entity has no mapping yet', async ({ page, request }) => {
    const acme = await (await request.get('/api/customers/cust_001')).json();

    await page.goto('/');
    await page.getByRole('button', { name: 'Data Mapping' }).click();
    await page.getByLabel('Customer').selectOption({ label: acme.name });

    await expect(page.locator('.mapping-empty')).toContainText('No mapping yet');
  });
});
