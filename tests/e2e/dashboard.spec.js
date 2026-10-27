// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Onboarding Dashboard', () => {
  // Run in order in one worker: the "add a customer" test would otherwise race
  // the test that compares the card count with the customer count
  test.describe.configure({ mode: 'default' });

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

    // Other specs may add customers in parallel, so count against the queue the page loaded
    const queueLoaded = page.waitForResponse(r => r.url().endsWith('/api/onboarding'));
    await page.goto('/');
    const queue = await (await queueLoaded).json();
    expect(queue.length).toBeGreaterThanOrEqual(customers.length);

    // One card per customer, including those with no onboarding state yet
    await expect(page.locator('.customer-card')).toHaveCount(queue.length);
    for (const customer of customers) {
      await expect(
        page.locator('.customer-card h3').filter({ hasText: customer.name }).first()
      ).toBeVisible();
    }
  });

  test('should show a summary strip whose total matches the queue', async ({ page }) => {
    await page.goto('/');

    const strip = page.getByTestId('summary-strip');
    await expect(strip).toBeVisible();
    for (const label of ['Total', 'Not started', 'In progress', 'Done', 'Failed']) {
      await expect(strip).toContainText(label);
    }

    const cards = page.locator('.customer-card');
    await expect(cards.first()).toBeVisible();
    const cardCount = await cards.count();
    await expect(page.getByTestId('summary-total').locator('strong')).toHaveText(String(cardCount));

    // The buckets add up to the total
    let sum = 0;
    for (const key of ['notStarted', 'inProgress', 'done', 'failed']) {
      sum += Number(await page.getByTestId(`summary-${key}`).locator('strong').innerText());
    }
    expect(sum).toBe(cardCount);
  });

  test('should show how many days each customer has been waiting', async ({ page }) => {
    await page.goto('/');

    // At least one seeded customer has a createdAt, so shows a whole number of days
    const waiting = page.locator('.customer-card .days-waiting');
    await expect(waiting.first()).toHaveText(/^⏳ Waiting \d+ days?$/);
    await expect(page.locator('.customer-meta').filter({ hasText: /\bNaN\b/ })).toHaveCount(0);
  });

  test('should switch between tabs', async ({ page }) => {
    await page.goto('/');

    // Click on Customer Info tab
    await page.getByRole('button', { name: 'Customer Info' }).click();
    
    // Verify placeholder content is shown
    await expect(page.locator('.placeholder h2')).toContainText('Customer Info');
  });

  test('should show a customer added on the Customers tab without a reload', async ({ page }) => {
    // Unique name so the test is independent of whatever customers already exist
    const name = `Globex ${Date.now()}`;

    await page.goto('/');
    await expect(page.locator('.customer-card').first()).toBeVisible();
    await expect(page.locator('.customer-card h3').filter({ hasText: name })).toHaveCount(0);

    await page.getByRole('button', { name: 'Customers', exact: true }).click();
    await page.getByPlaceholder('New customer name').fill(name);
    await page.getByRole('button', { name: 'Add Customer' }).click();
    await expect(page.locator('.customer-card h3').filter({ hasText: name })).toBeVisible();

    // Back to the Dashboard in the same page: no reload, the queue is re-fetched
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(page.locator('.customer-card h3').filter({ hasText: name })).toBeVisible();
  });
});

test.describe('Dashboard current step', () => {
  test('should show a "Next:" badge for a customer with no completed steps', async ({ page, request }) => {
    const res = await request.get('/api/onboarding');
    expect(res.ok()).toBeTruthy();
    const queue = await res.json();
    const fresh = queue.find(row => row.steps.every(step => step.status !== 'completed'));
    expect(fresh, 'a customer with no completed steps').toBeTruthy();
    const firstStep = [...fresh.steps].sort((a, b) => a.order - b.order)[0];

    await page.goto('/');

    const card = page.locator('.customer-card').filter({
      has: page.locator('h3', { hasText: fresh.customerName })
    }).first();
    await expect(card.locator('.current-step-badge')).toHaveText(`Next: ${firstStep.name}`);
  });
});
