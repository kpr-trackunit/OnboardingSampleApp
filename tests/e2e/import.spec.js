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

// Reset the source's customer to a pending tenant, then make it active, so the test can import
async function activateSourceTenant(request, sourceKey) {
  const customerId = await sourceCustomerId(request, sourceKey);
  await resetTenantToPending(request, customerId);
  await activateTenant(request, customerId);
  return customerId;
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
    await activateSourceTenant(request, ABC);
    await openImportTab(page);

    await page.locator(`tr[data-source="${ABC}"]`).getByRole('button', { name: 'Import clients' }).click();

    await expect(page.locator('.import-summary')).toContainText('Imported 10 clients');
    await expect(page.locator('.records-table tbody tr')).toHaveCount(10);
    await expect(page.locator('.records-table tbody tr').first()).toContainText('Riverside Manufacturing LLC');
    await expect(page.locator('.records-table tbody tr').first()).toContainText('2023-01-15');
  });

  test('should not duplicate clients when importing twice', async ({ page, request }) => {
    await activateSourceTenant(request, ABC);
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
      await activateSourceTenant(request, sourceKey);
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

  test('should import Premier accounts with leading zeros, standard types and the account tree', async ({ page, request }) => {
    await activateSourceTenant(request, 'premier-bookkeeping');
    await page.goto('/');
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    await page.locator('tr[data-source="premier-bookkeeping"]').getByRole('button', { name: 'Import accounts' }).click();
    await expect(page.locator('.import-result h3')).toHaveText('Premier Bookkeeping');
    await expect(page.locator('.import-summary')).toContainText('Imported 39 accounts');

    const rows = page.locator('.records-table tbody tr');
    await expect(rows).toHaveCount(39);
    const bank = rows.filter({ hasText: 'Bank Current Account' });
    await expect(bank.locator('td').first()).toHaveText('0010');
    await expect(bank).toContainText('asset');
    await expect(bank).toContainText('Assets');
    await expect(bank).toHaveAttribute('data-depth', '0');

    // Children are listed under their parent, indented
    await expect(rows.nth(1)).toContainText('Bank Deposit Account');
    await expect(rows.nth(1)).toHaveAttribute('data-depth', '1');
    await expect(rows.nth(1).locator('td.tree-child')).toHaveCount(1);

    const wages = rows.filter({ hasText: 'Gross Wages' });
    await expect(wages).toContainText('expense');
    await expect(wages).toContainText('Overheads');
    await expect(wages).toContainText('debit');
  });

  test('should import Premier contacts after clients and show each contact\'s client', async ({ page, request }) => {
    await activateSourceTenant(request, 'premier-bookkeeping');
    await page.goto('/');
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    const premier = page.locator('tr[data-source="premier-bookkeeping"]');
    await premier.getByRole('button', { name: 'Import clients' }).click();
    await expect(page.locator('.import-summary')).toContainText('Imported 12 clients');

    await premier.getByRole('button', { name: 'Import contacts' }).click();
    await expect(page.locator('.import-summary')).toContainText('Imported 20 contacts');
    await expect(page.locator('.records-table thead')).toContainText('client');
    await expect(page.locator('.records-table tbody tr')).toHaveCount(20);

    const sophie = page.locator('.records-table tbody tr').filter({ hasText: 'Sophie' });
    await expect(sophie.locator('.owning-client')).toContainText('Artisan Bakery & Cafe');
    await expect(sophie.locator('.owning-client')).toContainText('PB-0001');
    await expect(sophie).toContainText('+44 7700 100001');

    const james = page.locator('.records-table tbody tr').filter({ hasText: 'Crawford' });
    await expect(james.locator('.owning-client')).toContainText('Dockside Imports');
    await expect(james).toContainText('Dormant');
  });

  test('should import XYZ transactions after clients and accounts, with standard values and a currency', async ({ page, request }) => {
    await activateSourceTenant(request, 'xyz-financial-services');
    await page.goto('/');
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    const xyz = page.locator('tr[data-source="xyz-financial-services"]');
    await xyz.getByRole('button', { name: 'Import clients' }).click();
    await expect(page.locator('.import-summary')).toContainText('Imported 12 clients');
    await xyz.getByRole('button', { name: 'Import accounts' }).click();
    await expect(page.locator('.import-summary')).toContainText('Imported 39 accounts');

    const transactionsRow = xyz.filter({ hasText: 'transactions.csv' });
    await expect(transactionsRow.locator('.waiting-for')).toHaveCount(0);
    await transactionsRow.getByRole('button', { name: 'Import transactions' }).click();
    await expect(page.locator('.import-summary')).toContainText('Imported 25 transactions');

    const rows = page.locator('.records-table tbody tr');
    await expect(rows).toHaveCount(25);

    // T-10001, a customer payment: CR / POSTED / WIRE in the file
    const payment = rows.first();
    await expect(payment).toContainText('T-10001');
    await expect(payment.locator('.owning-client')).toContainText('Apex Digital Marketing');
    await expect(payment).toContainText('credit');
    await expect(payment).toContainText('CR');
    await expect(payment).toContainText('completed');
    await expect(payment).toContainText('POSTED');
    await expect(payment).toContainText('22500');
    await expect(payment).toContainText('USD');

    await expect(rows.filter({ hasText: 'pending' }).first()).toContainText('PENDING');
    await expect(rows.filter({ hasText: 'cancelled' }).first()).toContainText('VOID');
    await expect(rows.filter({ hasText: 'debit' }).first()).toContainText('DR');
    await expect(rows.filter({ hasText: 'GBP' })).toHaveCount(0);
  });
});
