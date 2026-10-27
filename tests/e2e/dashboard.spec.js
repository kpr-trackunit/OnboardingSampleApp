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

test.describe('Dashboard step filter', () => {
  // Use the exact /api/onboarding response the page rendered, so tests running in
  // parallel that change step statuses can't make the expectations drift.
  async function openDashboard(page) {
    const [res] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === '/api/onboarding' && r.ok()),
      page.goto('/')
    ]);
    const queue = await res.json();
    await expect(page.locator('.customer-card')).toHaveCount(queue.length);
    return queue;
  }

  const filter = page => page.getByRole('radiogroup', { name: 'Filter by current step' });
  const radio = (page, label) => page.getByRole('radio', { name: new RegExp(`^${label} \\d+$`) });
  const chip = (page, label) => filter(page).locator(radio(page, label));
  // The radio input is visually hidden; users click the chip (its label)
  const clickChip = (page, label) =>
    filter(page).locator('.step-filter-chip').filter({ has: radio(page, label) }).click();
  const sortedSteps = queue => [...queue[0].steps].sort((a, b) => a.order - b.order);

  test('shows All, each step in order, then Done, with counts', async ({ page }) => {
    const queue = await openDashboard(page);
    const expected = [
      ['All', queue.length],
      ...sortedSteps(queue).map(s => [s.name, queue.filter(r => r.currentStep?.id === s.id).length]),
      ['Done', queue.filter(r => r.currentStep === null).length]
    ];

    expect(expected.map(([label]) => label)).toEqual(
      ['All', 'Customer Info', 'Data Mapping', 'Tenant Setup', 'Import', 'Done']
    );
    await expect(filter(page).locator('.step-filter-chip')).toHaveText(
      expected.map(([label, count]) => `${label} ${count}`)
    );
    await expect(chip(page, 'All')).toBeChecked();
  });

  test('clicking a chip shows only matching cards; All shows everything again', async ({ page }) => {
    const queue = await openDashboard(page);
    const cards = page.locator('.customer-card');
    const filters = [
      ...sortedSteps(queue).map(s => ({ label: s.name, rows: queue.filter(r => r.currentStep?.id === s.id) })),
      { label: 'Done', rows: queue.filter(r => r.currentStep === null) }
    ];
    // At least one chip must hide some cards for this test to mean anything
    expect(queue.length).toBeGreaterThan(0);
    expect(filters.some(f => f.rows.length < queue.length)).toBeTruthy();

    for (const { label, rows } of filters) {
      await clickChip(page, label);
      await expect(chip(page, label)).toBeChecked();
      await expect(cards).toHaveCount(rows.length);
      await expect(cards.locator('h3')).toHaveText(rows.map(r => r.customerName));
    }

    await clickChip(page, 'All');
    await expect(cards).toHaveCount(queue.length);
    await expect(cards.locator('h3')).toHaveText(queue.map(r => r.customerName));
  });
});
