// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Import Tab', () => {
  test('should list the 3 customer data sources', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Import' }).click();

    const sources = page.locator('.sources-table .source-label');
    await expect(sources).toHaveCount(3);
    await expect(sources).toHaveText(['ABC Accounting', 'XYZ Financial Services', 'Premier Bookkeeping']);
  });

  test('should show each file with its row count', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Import' }).click();

    const abcRows = page.locator('.sources-table tr[data-source="abc-accounting"]');
    await expect(abcRows).toHaveCount(4);
    await expect(abcRows.first()).toContainText('clients.csv');
    await expect(abcRows.first()).toContainText('10 rows');
  });
});
