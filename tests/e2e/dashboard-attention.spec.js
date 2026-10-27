// @ts-check
const { test, expect } = require('@playwright/test');

// Slice 6: customers with a failed step are flagged and listed first.
//
// The only API that sets a failed step is PATCH /api/tenants/:customerId/status, and the
// only tenant is Acme's seeded one, which tenant-setup.spec.js needs to start `pending`.
// Tenant transitions are one-way (failed can only go back to provisioning), so failing it
// here can't be undone and would race that spec. Instead, the ordering and flag are unit
// tested in server/src/models/queue.test.js, and this spec checks the live API shape plus
// how the Dashboard renders a flagged row.

test.describe('Dashboard: customers needing attention', () => {
  test('the queue flags each row and lists flagged rows first', async ({ request }) => {
    const res = await request.get('/api/onboarding');
    expect(res.ok()).toBeTruthy();
    const queue = await res.json();
    expect(queue.length).toBeGreaterThan(0);

    for (const row of queue) {
      expect(typeof row.needsAttention).toBe('boolean');
      expect(row.needsAttention).toBe(row.steps.some(s => s.status === 'failed'));
    }
    const flags = queue.map(row => row.needsAttention);
    const firstUnflagged = flags.indexOf(false);
    if (firstUnflagged !== -1) {
      expect(flags.slice(firstUnflagged)).not.toContain(true);
    }
  });

  test('a flagged card has a red border and a Needs attention badge, and is shown first', async ({ page }) => {
    let flaggedName = '';

    // Serve the real queue with its last customer's Tenant Setup step failed, in the
    // order the server returns it (flagged rows first).
    await page.route('**/api/onboarding', async route => {
      const queue = await (await route.fetch()).json();
      const last = queue[queue.length - 1];
      const flagged = {
        ...last,
        steps: last.steps.map(s => (s.name === 'Tenant Setup' ? { ...s, status: 'failed' } : s)),
        needsAttention: true
      };
      flaggedName = flagged.customerName;
      await route.fulfill({ json: [flagged, ...queue.slice(0, -1)] });
    });

    await page.goto('/');

    const cards = page.locator('.customer-card');
    const first = cards.first();
    await expect(first.locator('h3')).toContainText(flaggedName);
    await expect(first).toHaveClass(/needs-attention/);
    await expect(first.locator('.attention-badge')).toHaveText('Needs attention');
    await expect(first).toHaveCSS('border-top-color', 'rgb(220, 38, 38)');

    // Only the flagged card is marked
    await expect(page.locator('.customer-card.needs-attention')).toHaveCount(1);
    await expect(page.locator('.attention-badge')).toHaveCount(1);
  });
});
