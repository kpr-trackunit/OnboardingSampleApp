// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Tenant Setup', () => {
  test('should list Acme tenant as pending', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Tenant Setup' }).click();

    // Acme's seeded tenant is shown with its status badge and plan
    const acmeRow = page.locator('.tenant-table tbody tr', { hasText: /Acme/ });
    await expect(acmeRow).toBeVisible();
    await expect(acmeRow.locator('.status-badge')).toHaveText('pending');
    await expect(acmeRow.locator('.status-badge')).toHaveClass(/pending/);
    await expect(acmeRow).toContainText('professional');
  });
});
