// @ts-check
const { test, expect } = require('@playwright/test');

const ABC = 'abc-accounting';
const TENANT_NOTICE = 'Tenant not active yet. Finish Tenant Setup first';

// The customer behind an import source, as the API links them
async function sourceCustomerId(request, sourceKey) {
  const res = await request.get('/api/import/sources');
  expect(res.ok()).toBeTruthy();
  const source = (await res.json()).find(s => s.sourceKey === sourceKey);
  expect(source, `source ${sourceKey}`).toBeTruthy();
  return source.customerId;
}

// Give the customer a fresh pending tenant (test-only route, see server/src/routes/testSupport.js)
async function resetTenantToPending(request, customerId) {
  const res = await request.post(`/api/test/tenants/${customerId}/reset`);
  expect(res.ok(), await res.text()).toBeTruthy();
}

// pending -> provisioning -> active through the real status route
async function activateTenant(request, customerId) {
  for (const status of ['provisioning', 'active']) {
    const res = await request.patch(`/api/tenants/${customerId}/status`, { data: { status } });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
}

async function openImportTab(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
}

test.describe('Import Tab', () => {
  // The tests below change the ABC tenant on the shared server, so run them in order
  test.describe.configure({ mode: 'serial' });

  test('should list the 3 customer data sources', async ({ page }) => {
    await openImportTab(page);

    const sources = page.locator('.sources-table .source-label');
    await expect(sources).toHaveCount(3);
    await expect(sources).toHaveText(['ABC Accounting', 'XYZ Financial Services', 'Premier Bookkeeping']);
  });

  test('should show each file with its row count', async ({ page }) => {
    await openImportTab(page);

    const abcRows = page.locator(`.sources-table tr[data-source="${ABC}"]`);
    await expect(abcRows).toHaveCount(4);
    await expect(abcRows.first()).toContainText('clients.csv');
    await expect(abcRows.first()).toContainText('10 rows');
  });

  test('should block import while the tenant is pending, and enable it once active', async ({ page, request }) => {
    const customerId = await sourceCustomerId(request, ABC);
    await resetTenantToPending(request, customerId);
    await openImportTab(page);

    const abcRows = page.locator(`.sources-table tr[data-source="${ABC}"]`);
    const importButton = abcRows.getByRole('button', { name: 'Import clients' });
    await expect(abcRows.first().locator('.tenant-notice')).toHaveText(TENANT_NOTICE);
    await expect(importButton).toBeDisabled();

    // The server enforces it too
    const blocked = await request.post(`/api/import/${ABC}/clients`);
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).error).toBe(TENANT_NOTICE);

    await activateTenant(request, customerId);
    await openImportTab(page);

    await expect(abcRows.first().locator('.tenant-notice')).toHaveCount(0);
    // The import itself is exercised by the next test (importing twice would duplicate records)
    await expect(importButton).toBeEnabled();
  });

  test('should import ABC clients and show the records', async ({ page, request }) => {
    const customerId = await sourceCustomerId(request, ABC);
    await resetTenantToPending(request, customerId);
    await activateTenant(request, customerId);
    await openImportTab(page);

    await page.locator(`tr[data-source="${ABC}"]`).getByRole('button', { name: 'Import clients' }).click();

    await expect(page.locator('.import-summary')).toContainText('Imported 10 clients');
    await expect(page.locator('.records-table tbody tr')).toHaveCount(10);
    await expect(page.locator('.records-table tbody tr').first()).toContainText('Riverside Manufacturing LLC');
    await expect(page.locator('.records-table tbody tr').first()).toContainText('2023-01-15');
  });

  test('should not duplicate clients when importing twice', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    const importAbc = page.locator('tr[data-source="abc-accounting"]').getByRole('button', { name: 'Import clients' });
    await importAbc.click();
    await expect(page.locator('.import-summary')).toContainText('Imported 10 clients');
    await importAbc.click();
    await expect(importAbc).toBeEnabled();

    await expect(page.locator('.records-table tbody tr')).toHaveCount(10);
    await expect(page.locator('.import-errors')).toHaveCount(0);
  });

  test('should import XYZ and Premier clients with standard values and ISO dates', async ({ page, request }) => {
    for (const sourceKey of ['xyz-financial-services', 'premier-bookkeeping']) {
      const customerId = await sourceCustomerId(request, sourceKey);
      await resetTenantToPending(request, customerId);
      await activateTenant(request, customerId);
    }
    await openImportTab(page);

    await page.locator('tr[data-source="xyz-financial-services"]').getByRole('button', { name: 'Import clients' }).click();
    await expect(page.locator('.import-summary')).toContainText('Imported 12 clients');
    const apex = page.locator('.records-table tbody tr').filter({ hasText: 'Apex Digital Marketing' });
    await expect(apex).toContainText('2023-02-10');
    await expect(apex).toContainText('active');
    await expect(apex).toContainText('TECH');

    await page.locator('tr[data-source="premier-bookkeeping"]').getByRole('button', { name: 'Import clients' }).click();
    await expect(page.locator('.import-result h3')).toHaveText('Premier Bookkeeping');
    await expect(page.locator('.import-summary')).toContainText('Imported 12 clients');
    const dockside = page.locator('.records-table tbody tr').filter({ hasText: 'Dockside Imports' });
    await expect(dockside).toContainText('2022-01-28');
    await expect(dockside).toContainText('inactive');
    await expect(dockside).toContainText('DORMANT');
  });
});
