// @ts-check
const { test, expect } = require('@playwright/test');

// Finds the customer whose clients mapping is the XYZ one (name ← companyName).
// Customer names live in customers/*.md and can be renamed, so look it up through the API.
async function findXyzCustomer(request) {
  const customers = await (await request.get('/api/customers')).json();
  for (const customer of customers) {
    const overview = await (await request.get(`/api/mappings/${customer.id}`)).json();
    const clients = overview.entities.find(e => e.entity === 'clients');
    if (clients.mapping?.columns.name === 'companyName') return { customer, mapping: clients.mapping };
  }
  throw new Error('No customer has the XYZ clients mapping');
}

test.describe('Data Mapping preview', () => {
  test('should show the first 5 XYZ clients rows, with mapped values next to their source values', async ({ page, request }) => {
    const { customer, mapping } = await findXyzCustomer(request);
    // The source value XYZ maps to the standard status 'active'
    const activeSource = Object.keys(mapping.values.status.map).find(v => mapping.values.status.map[v] === 'active');
    expect(activeSource).toBeTruthy();

    await page.goto('/');
    await page.getByRole('button', { name: 'Data Mapping' }).click();
    await page.getByLabel('Customer').selectOption({ label: customer.name });
    await page.getByRole('group', { name: 'Entity' }).getByRole('button', { name: 'clients' }).click();

    const preview = page.locator('.mapping-preview[data-entity="clients"]');
    await expect(preview.locator('tbody tr[data-line]:not(.preview-errors)')).toHaveCount(5);
    await expect(preview.locator('thead')).toContainText(mapping.columns.status);

    const activeCell = preview
      .locator('td[data-field="status"]')
      .filter({ has: page.locator('.preview-value', { hasText: /^active$/ }) })
      .first();
    await expect(activeCell.locator('.preview-source')).toHaveText(`← ${activeSource}`);
  });

  test('should refresh when the selected entity changes', async ({ page, request }) => {
    const { customer } = await findXyzCustomer(request);
    const overview = await (await request.get(`/api/mappings/${customer.id}`)).json();

    await page.goto('/');
    await page.getByRole('button', { name: 'Data Mapping' }).click();
    await page.getByLabel('Customer').selectOption({ label: customer.name });
    const entities = page.getByRole('group', { name: 'Entity' });
    await entities.getByRole('button', { name: 'clients' }).click();
    await expect(page.locator('.mapping-preview[data-entity="clients"]')).toBeVisible();

    // Another entity: the clients preview goes away (it has its own preview, or none without a mapping)
    const other = overview.entities.find(e => e.entity !== 'clients');
    await entities.getByRole('button', { name: other.entity }).click();
    await expect(page.locator('.mapping-preview[data-entity="clients"]')).toHaveCount(0);
  });
});
