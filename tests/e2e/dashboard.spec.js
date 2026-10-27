// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Onboarding Dashboard', () => {
  test('should display the dashboard heading', async ({ page }) => {
    await page.goto('/');

    // Verify the main heading is visible
    await expect(page.locator('h1')).toContainText('Onboarding Dashboard');
  });

  test('should show navigation tabs', async ({ page }) => {
    await page.goto('/');

    // Verify all navigation tabs are present
    await expect(page.locator('.tab')).toHaveCount(6);
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Customers', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Customer Info' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Data Mapping' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tenant Setup' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import' })).toBeVisible();
  });

  test('should display example customer in onboarding queue', async ({ page }) => {
    await page.goto('/');

    // Wait for data to load and verify example customer is shown
    const acme = page.locator('.customer-card').filter({ hasText: 'Acme' });
    await expect(acme).toBeVisible();
    await expect(acme.locator('h3')).toContainText('Acme 2 Corporation');
  });

  test('should show every customer in the onboarding queue', async ({ page, request }) => {
    const res = await request.get('/api/customers');
    expect(res.ok()).toBeTruthy();
    const customers = await res.json();
    expect(customers.length).toBeGreaterThan(0);

    await page.goto('/');

    // One card per customer, including those with no onboarding state yet
    await expect(page.locator('.customer-card')).toHaveCount(customers.length);
    for (const customer of customers) {
      await expect(
        page.locator('.customer-card h3').filter({ hasText: customer.name }).first()
      ).toBeVisible();
    }
  });

  test('should switch between tabs', async ({ page }) => {
    await page.goto('/');

    // Click on Customer Info tab
    await page.getByRole('button', { name: 'Customer Info' }).click();
    
    // Verify placeholder content is shown
    await expect(page.locator('.placeholder h2')).toContainText('Customer Info');
  });
});
