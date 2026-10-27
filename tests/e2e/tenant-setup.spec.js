// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Tenant Setup', () => {
  // These tests share one in-memory server and the status tests change the
  // seeded tenant, so run them in order: list (pending) first, then
  // Start -> failed -> Retry (provisioning), then Mark active (terminal).
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

  // Leaves the seeded tenant in provisioning (after Retry) for the Mark active test below
  test('Start, Mark failed with a reason, then Retry clears it', async ({ page }) => {
    const reason = 'Region not available for enterprise plan';
    await page.goto('/');
    await page.getByRole('button', { name: 'Tenant Setup' }).click();

    // The seeded tenant, found by customer id; its name is read from the row
    const row = page.locator('.tenant-table tbody tr[data-customer-id="cust_001"]');
    await expect(row.locator('.status-badge')).toHaveText('pending');
    const customerName = (await row.locator('td').first().innerText()).trim();

    // Only the valid next action is offered at each status
    await expect(row.locator('.tenant-actions').getByRole('button')).toHaveText(['Start']);
    await row.getByRole('button', { name: 'Start' }).click();
    await expect(row.locator('.status-badge')).toHaveText('provisioning');
    await expect(row.locator('.tenant-actions').getByRole('button')).toHaveText(['Mark active', 'Mark failed']);

    // Mark failed asks for a reason and can't be submitted while it's blank
    await row.getByRole('button', { name: 'Mark failed' }).click();
    const reasonInput = row.getByRole('textbox', { name: 'Failure reason' });
    const submit = row.getByRole('button', { name: 'Mark failed' });
    await expect(reasonInput).toBeVisible();
    await expect(submit).toBeDisabled();
    await reasonInput.fill('   ');
    await expect(submit).toBeDisabled();

    await reasonInput.fill(reason);
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(row.locator('.status-badge')).toHaveText('failed');
    await expect(row.locator('.failure-reason')).toHaveText(reason);
    await expect(row.locator('.tenant-actions').getByRole('button')).toHaveText(['Retry']);

    // Dashboard step 3 mirrors failed
    await page.getByRole('button', { name: 'Dashboard' }).click();
    const card = page.locator('.customer-card', {
      has: page.getByRole('heading', { name: customerName, exact: true })
    });
    const tenantStep = card.locator('.checklist li', { hasText: 'Tenant Setup' });
    await expect(tenantStep.locator('.step-status')).toHaveClass(/failed/);
    await expect(tenantStep).toContainText('failed');

    // Retry goes back to provisioning and clears the reason
    await page.getByRole('button', { name: 'Tenant Setup' }).click();
    await expect(row.locator('.failure-reason')).toHaveText(reason);
    await row.getByRole('button', { name: 'Retry' }).click();
    await expect(row.locator('.status-badge')).toHaveText('provisioning');
    await expect(row.locator('.failure-reason')).toHaveCount(0);
    await expect(row).not.toContainText(reason);

    // History keeps every change so far, oldest first, with the reason on the failed entry
    const history = page.locator('.history-row[data-history-for="cust_001"]');
    await expect(history).toHaveCount(0);
    await row.getByRole('button', { name: 'History' }).click();
    await expect(row.getByRole('button', { name: 'Hide history' })).toHaveAttribute('aria-expanded', 'true');
    const entries = history.locator('.history-entry');
    await expect(entries.locator('.history-transition')).toHaveText([
      'pending → provisioning',
      'provisioning → failed',
      'failed → provisioning'
    ]);
    await expect(entries.nth(1).locator('.history-reason')).toHaveText(reason);
    await expect(entries.nth(0).locator('.history-reason')).toHaveCount(0);
    await expect(entries.nth(2).locator('.history-reason')).toHaveCount(0);
    for (let i = 0; i < 3; i++) {
      await expect(entries.nth(i).locator('time')).not.toBeEmpty();
    }
    await expect(history.locator('.time-in-status')).toHaveText('provisioning for less than a minute');

    // It closes again
    await row.getByRole('button', { name: 'Hide history' }).click();
    await expect(history).toHaveCount(0);
  });

  test('Mark active completes the Tenant Setup step on the Dashboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Tenant Setup' }).click();

    // The seeded tenant, left in provisioning by the Retry test above
    const row = page.locator('.tenant-table tbody tr[data-customer-id="cust_001"]');
    await expect(row.locator('.status-badge')).toHaveText('provisioning');
    const customerName = (await row.locator('td').first().innerText()).trim();

    await expect(row.locator('.tenant-actions').getByRole('button')).toHaveText(['Mark active', 'Mark failed']);
    await row.getByRole('button', { name: 'Mark active' }).click();
    await expect(row.locator('.status-badge')).toHaveText('active');
    await expect(row.locator('.tenant-actions').getByRole('button')).toHaveCount(0);

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

  test('should keep a changed region after reloading the tab', async ({ page, request }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Tenant Setup' }).click();

    const row = page.locator('.tenant-table tbody tr').first();
    const regionSelect = row.locator('.region-select');
    await expect(regionSelect).toBeVisible();
    const customerId = await row.getAttribute('data-customer-id');
    const originalRegion = await regionSelect.inputValue();
    // Prefilled from the customer's region
    expect(originalRegion).not.toBe('');
    const newRegion = originalRegion === 'EU' ? 'APAC' : 'EU';

    try {
      const saved = page.waitForResponse(res =>
        res.url().endsWith(`/api/tenants/${customerId}`) && res.request().method() === 'PATCH');
      await regionSelect.selectOption(newRegion);
      expect((await saved).ok()).toBeTruthy();

      await page.reload();
      await page.getByRole('button', { name: 'Tenant Setup' }).click();
      await expect(
        page.locator(`.tenant-table tbody tr[data-customer-id="${customerId}"] .region-select`)
      ).toHaveValue(newRegion);
    } finally {
      // Put the shared tenant back for other tests
      await request.patch(`/api/tenants/${customerId}`, { data: { region: originalRegion } });
    }
  });
});
