// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Tenant Setup', () => {
  // Tests share the server's in-memory tenants, so run them one at a time
  test.describe.configure({ mode: 'serial' });

  test('should list Acme tenant as pending', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Tenant Setup' }).click();

    // Acme's seeded tenant is shown with its status badge and plan
    const acmeRow = page.locator('.tenant-table tbody tr', { hasText: /Acme/ });
    await expect(acmeRow).toBeVisible();
    await expect(acmeRow.locator('.status-badge')).toHaveText('pending');
    await expect(acmeRow.locator('.status-badge')).toHaveClass(/pending/);
    await expect(acmeRow.locator('.plan-select')).toHaveValue('professional');
  });

  test('should keep a changed plan after reloading the tab', async ({ page, request }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Tenant Setup' }).click();

    const row = page.locator('.tenant-table tbody tr').first();
    const planSelect = row.locator('.plan-select');
    await expect(planSelect).toBeVisible();
    const customerId = await row.getAttribute('data-customer-id');
    const originalPlan = await planSelect.inputValue();
    const newPlan = originalPlan === 'enterprise' ? 'starter' : 'enterprise';

    try {
      const saved = page.waitForResponse(res =>
        res.url().endsWith(`/api/tenants/${customerId}`) && res.request().method() === 'PATCH');
      await planSelect.selectOption(newPlan);
      expect((await saved).ok()).toBeTruthy();

      await page.reload();
      await page.getByRole('button', { name: 'Tenant Setup' }).click();
      await expect(
        page.locator(`.tenant-table tbody tr[data-customer-id="${customerId}"] .plan-select`)
      ).toHaveValue(newPlan);
    } finally {
      // Put the shared tenant back for other tests
      await request.patch(`/api/tenants/${customerId}`, { data: { plan: originalPlan } });
    }
  });
});
