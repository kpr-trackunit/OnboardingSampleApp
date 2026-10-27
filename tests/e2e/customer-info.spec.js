// @ts-check
const { test, expect } = require('@playwright/test');

const FIELDS = ['industry', 'region', 'contactEmail'];

test.describe('Customer Info', () => {
  // The add test creates a customer, so run the list test first to keep its
  // row count in step with GET /api/customers.
  test.describe.configure({ mode: 'serial' });

  test('lists every customer, with blank fields shown as Missing', async ({ page, request }) => {
    const res = await request.get('/api/customers');
    expect(res.ok()).toBeTruthy();
    const customers = await res.json();
    expect(customers.length).toBeGreaterThan(0);

    await page.goto('/');
    await page.getByRole('button', { name: 'Customer Info' }).click();

    const rows = page.locator('.customer-info-table tbody tr');
    await expect(rows).toHaveCount(customers.length);

    for (const customer of customers) {
      const row = page.locator(`.customer-info-table tbody tr[data-customer-id="${customer.id}"]`);
      await expect(row.locator('.customer-name')).toHaveText(customer.name);
      for (const field of FIELDS) {
        const value = (customer[field] || '').trim();
        await expect(row.locator(`td[data-field="${field}"]`)).toHaveText(value || 'Missing');
      }
    }
  });

  test('a customer added on the Customers tab shows three Missing fields', async ({ page, request }) => {
    const name = `Info Test ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await page.goto('/');
    await page.getByRole('button', { name: 'Customers', exact: true }).click();
    await page.getByPlaceholder('New customer name').fill(name);
    const created = page.waitForResponse(r =>
      r.url().endsWith('/api/customers') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Add Customer' }).click();
    expect((await created).ok()).toBeTruthy();
    await expect(page.locator('.customer-card h3', { hasText: name })).toBeVisible();

    // Opening the tab re-fetches, so the new customer is there without a reload
    await page.getByRole('button', { name: 'Customer Info' }).click();
    const row = page.locator('.customer-info-table tbody tr', { hasText: name });
    await expect(row).toHaveCount(1);
    for (const field of FIELDS) {
      const cell = row.locator(`td[data-field="${field}"] .missing`);
      await expect(cell).toHaveText('Missing');
      await expect(cell).toHaveCSS('color', 'rgb(156, 163, 175)');
    }
  });

  test('each row shows the completeness badge from the API, and the count matches', async ({ page, request }) => {
    const LABELS = { name: 'name', industry: 'industry', region: 'region', contactEmail: 'email' };

    const res = await request.get('/api/customers');
    expect(res.ok()).toBeTruthy();
    const customers = await res.json();
    expect(customers.length).toBeGreaterThan(0);
    for (const customer of customers) expect(Array.isArray(customer.missingInfo)).toBeTruthy();

    await page.goto('/');
    await page.getByRole('button', { name: 'Customer Info' }).click();
    await expect(page.locator('.customer-info-table tbody tr')).toHaveCount(customers.length);

    for (const customer of customers) {
      const badge = page.locator(
        `.customer-info-table tbody tr[data-customer-id="${customer.id}"] .completeness-badge`);
      if (customer.missingInfo.length === 0) {
        await expect(badge).toHaveText('Complete');
        await expect(badge).toHaveClass(/\bcomplete\b/);
      } else {
        const labels = customer.missingInfo.map(field => LABELS[field]);
        await expect(badge).toHaveText(`Missing: ${labels.join(', ')}`);
        await expect(badge).toHaveClass(/\bincomplete\b/);
      }
    }

    const complete = customers.filter(c => c.missingInfo.length === 0).length;
    await expect(page.locator('.completeness-count'))
      .toHaveText(`${complete} of ${customers.length} complete`);
  });

  // Finds XYZ Financial Services by name, so the test doesn't depend on its id
  async function findXyz(request) {
    const res = await request.get('/api/customers');
    const xyz = (await res.json()).find(c => c.name === 'XYZ Financial Services');
    expect(xyz, 'XYZ Financial Services should exist').toBeTruthy();
    return xyz;
  }

  async function openCustomerInfo(page) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Customer Info' }).click();
  }

  test('editing a customer saves the values, and they persist after a reload', async ({ page, request }) => {
    const xyz = await findXyz(request);
    const values = {
      industry: 'Financial Services',
      region: 'EU',
      contactEmail: `ops+${Date.now()}@xyz.example.com`
    };

    await openCustomerInfo(page);
    const row = page.locator(`.customer-info-table tbody tr[data-customer-id="${xyz.id}"]`);
    await row.getByRole('button', { name: 'Edit' }).click();

    await row.getByLabel('Industry').fill(`  ${values.industry} `);
    await row.getByLabel('Region').fill(values.region);
    await row.getByLabel('Contact email').fill(values.contactEmail);

    const saved = page.waitForResponse(r =>
      r.url().endsWith(`/api/customers/${xyz.id}`) && r.request().method() === 'PUT');
    // After saving, the tab re-fetches the list so server-derived data is fresh
    const refetched = page.waitForResponse(r =>
      r.url().endsWith('/api/customers') && r.request().method() === 'GET');
    await row.getByRole('button', { name: 'Save' }).click();
    expect((await saved).ok()).toBeTruthy();
    expect((await refetched).ok()).toBeTruthy();

    // The row leaves edit mode and shows the saved (trimmed) values
    await expect(row.getByRole('button', { name: 'Edit' })).toBeVisible();
    for (const [field, value] of Object.entries(values)) {
      await expect(row.locator(`td[data-field="${field}"]`)).toHaveText(value);
    }

    // Still there after a reload, i.e. it came back from the server
    await page.reload();
    await page.getByRole('button', { name: 'Customer Info' }).click();
    for (const [field, value] of Object.entries(values)) {
      await expect(row.locator(`td[data-field="${field}"]`)).toHaveText(value);
    }
  });

  test('Cancel discards the edits', async ({ page, request }) => {
    const xyz = await findXyz(request);

    await openCustomerInfo(page);
    const row = page.locator(`.customer-info-table tbody tr[data-customer-id="${xyz.id}"]`);
    await row.getByRole('button', { name: 'Edit' }).click();
    await row.getByLabel('Industry').fill('Not saved');
    await row.getByRole('button', { name: 'Cancel' }).click();

    await expect(row.locator('td[data-field="industry"]'))
      .toHaveText((xyz.industry || '').trim() || 'Missing');
  });

  test('a failed save shows the error and keeps the row in edit mode', async ({ page, request }) => {
    const xyz = await findXyz(request);
    await page.route(`**/api/customers/${xyz.id}`, route => {
      if (route.request().method() !== 'PUT') return route.continue();
      return route.fulfill({ status: 500, json: { error: 'Disk is full' } });
    });

    await openCustomerInfo(page);
    const row = page.locator(`.customer-info-table tbody tr[data-customer-id="${xyz.id}"]`);
    await row.getByRole('button', { name: 'Edit' }).click();
    await row.getByLabel('Industry').fill('Will fail');
    await row.getByRole('button', { name: 'Save' }).click();

    await expect(row.getByRole('alert')).toContainText('Disk is full');
    await expect(row.getByLabel('Industry')).toHaveValue('Will fail');
  });
});
