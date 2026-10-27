// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Import Tab', () => {
  test('should list the 3 customer data sources', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    const sources = page.locator('.sources-table .source-label');
    await expect(sources).toHaveCount(3);
    await expect(sources).toHaveText(['ABC Accounting', 'XYZ Financial Services', 'Premier Bookkeeping']);
  });

  test('should show each file with its row count', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    const abcRows = page.locator('.sources-table tr[data-source="abc-accounting"]');
    await expect(abcRows).toHaveCount(4);
    await expect(abcRows.first()).toContainText('clients.csv');
    await expect(abcRows.first()).toContainText('10 rows');
  });

  test('should import ABC clients and show the records', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    await page.locator('tr[data-source="abc-accounting"]').getByRole('button', { name: 'Import clients' }).click();

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

  test('should import XYZ and Premier clients with standard values and ISO dates', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Import', exact: true }).click();

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

  test('should import Premier accounts with leading zeros, standard types and the account tree', async ({ page }) => {
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

  test('should import Premier contacts after clients and show each contact\'s client', async ({ page }) => {
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
});
