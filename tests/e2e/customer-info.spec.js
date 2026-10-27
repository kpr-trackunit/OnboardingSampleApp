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
    await row.getByLabel('Region').selectOption(values.region);
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

  test('an invalid email shows a message next to the field, and nothing is saved', async ({ page, request }) => {
    const xyz = await findXyz(request);
    const oldEmail = (xyz.contactEmail || '').trim() || 'Missing';
    const oldIndustry = (xyz.industry || '').trim() || 'Missing';

    await openCustomerInfo(page);
    const row = page.locator(`.customer-info-table tbody tr[data-customer-id="${xyz.id}"]`);
    await row.getByRole('button', { name: 'Edit' }).click();
    await row.getByLabel('Industry').fill('Not saved either');
    await row.getByLabel('Contact email').fill('bob@');

    const saved = page.waitForResponse(r =>
      r.url().endsWith(`/api/customers/${xyz.id}`) && r.request().method() === 'PUT');
    await row.getByRole('button', { name: 'Save' }).click();
    const res = await saved;
    expect(res.status()).toBe(400);
    expect((await res.json()).errors).toEqual({ contactEmail: 'Enter a valid email address' });

    // The message is next to the email field, and the row stays in edit mode
    const emailCell = row.locator('td[data-field="contactEmail"]');
    await expect(emailCell.locator('.field-error')).toHaveText('Enter a valid email address');
    await expect(row.getByLabel('Contact email')).toHaveAttribute('aria-invalid', 'true');
    await expect(row.getByLabel('Contact email')).toHaveValue('bob@');
    await expect(row.getByRole('button', { name: 'Save' })).toBeVisible();

    // Nothing was saved: a reload still shows the old values
    await page.reload();
    await page.getByRole('button', { name: 'Customer Info' }).click();
    await expect(row.locator('td[data-field="contactEmail"]')).toHaveText(oldEmail);
    await expect(row.locator('td[data-field="industry"]')).toHaveText(oldIndustry);
  });

  test('region is a dropdown of the server\'s regions, keeping a current value that isn\'t in the list', async ({ page, request }) => {
    const regions = await (await request.get('/api/regions')).json();
    expect(regions).toEqual(['North America', 'EU', 'UK', 'APAC', 'LATAM']);

    // Premier Bookkeeping's seeded region, "United Kingdom", isn't in the list
    const customers = await (await request.get('/api/customers')).json();
    const premier = customers.find(c => c.name === 'Premier Bookkeeping');
    expect(premier, 'Premier Bookkeeping should exist').toBeTruthy();
    expect(regions).not.toContain(premier.region);

    await openCustomerInfo(page);
    const row = page.locator(`.customer-info-table tbody tr[data-customer-id="${premier.id}"]`);
    await row.getByRole('button', { name: 'Edit' }).click();

    const select = row.getByRole('combobox', { name: 'Region' });
    await expect(select).toHaveValue(premier.region);
    await expect(select.locator('option')).toHaveText(['', premier.region, ...regions]);
    await row.getByRole('button', { name: 'Cancel' }).click();
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
