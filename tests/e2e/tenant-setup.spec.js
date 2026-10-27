// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Tenant Setup', () => {
  // These tests share one in-memory server and the status test changes the
  // seeded tenant, so run them in order: list (pending) first, then change it.
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

  test('Start then Mark active completes the Tenant Setup step on the Dashboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Tenant Setup' }).click();

    // The seeded tenant, found by customer id; its name is read from the row
    const row = page.locator('.tenant-table tbody tr[data-customer-id="cust_001"]');
    await expect(row.locator('.status-badge')).toHaveText('pending');
    const customerName = (await row.locator('td').first().innerText()).trim();

    // Only the valid next action is offered at each status
    await expect(row.getByRole('button')).toHaveText(['Start']);
    await row.getByRole('button', { name: 'Start' }).click();
    await expect(row.locator('.status-badge')).toHaveText('provisioning');

    await expect(row.getByRole('button')).toHaveText(['Mark active']);
    await row.getByRole('button', { name: 'Mark active' }).click();
    await expect(row.locator('.status-badge')).toHaveText('active');
    await expect(row.getByRole('button')).toHaveCount(0);

    // Dashboard re-fetches on tab switch: step 3 completed, 1 of 4 steps = 25%
    await page.getByRole('button', { name: 'Dashboard' }).click();
    const card = page.locator('.customer-card', {
      has: page.getByRole('heading', { name: customerName, exact: true })
    });
    const tenantStep = card.locator('.checklist li', { hasText: 'Tenant Setup' });
    await expect(tenantStep).toContainText('completed');
    await expect(tenantStep.locator('.step-status')).toHaveClass(/completed/);
    await expect(card.locator('.progress-bar')).toHaveText('25%');
  });
});
