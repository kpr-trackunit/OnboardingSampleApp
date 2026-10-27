// @ts-check
const { test, expect } = require('@playwright/test');

/** The expected card text for a count, or null when the card should show nothing. */
function openIssueLabel(count) {
  if (count === 0) return null;
  return `${count} open issue${count === 1 ? '' : 's'}`;
}

function unresolved(customer) {
  return (customer.issues || []).filter(issue => issue.status !== 'resolved').length;
}

test.describe('Dashboard open issues', () => {
  test('each card shows the open issue count from the customer data', async ({ page, request }) => {
    const res = await request.get('/api/customers');
    expect(res.ok()).toBeTruthy();
    const customers = await res.json();
    expect(customers.some(c => unresolved(c) > 0)).toBeTruthy();

    await page.goto('/');

    for (const customer of customers) {
      const card = page.locator('.customer-card').filter({
        has: page.locator('h3', { hasText: customer.name })
      }).first();
      await expect(card).toBeVisible();

      const label = openIssueLabel(unresolved(customer));
      if (label) {
        await expect(card.locator('.open-issues')).toHaveText(label);
      } else {
        await expect(card.locator('.open-issues')).toHaveCount(0);
      }
    }
  });

  test('a customer with no open issues shows no count', async ({ page }) => {
    // Every customer in customers/*.md has open issues, and the files must not be
    // edited, so take the real queue and zero one row's count before it renders.
    let zeroedName = '';
    await page.route('**/api/onboarding', async route => {
      const response = await route.fetch();
      const rows = await response.json();
      rows[0].openIssueCount = 0;
      zeroedName = rows[0].customerName;
      await route.fulfill({ response, json: rows });
    });

    await page.goto('/');

    await expect(page.locator('.customer-card').first()).toBeVisible();
    const card = page.locator('.customer-card').filter({
      has: page.locator('h3', { hasText: zeroedName })
    }).first();
    await expect(card).toBeVisible();
    await expect(card.locator('.open-issues')).toHaveCount(0);
  });
});
