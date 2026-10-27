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
});
