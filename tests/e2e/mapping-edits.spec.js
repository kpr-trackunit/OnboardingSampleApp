// @ts-check
const { test, expect } = require('@playwright/test');

/*
 * Tests that edit the seeded mappings on the shared server. They run in the
 * "mapping-edits" project, after every other spec (see playwright.config.js),
 * because other specs expect the seeded mappings: while ABC's name is unmapped,
 * an ABC clients import elsewhere would reject every row.
 */

const ABC = 'abc-accounting';

// The customer behind an import source, as the API links them
async function sourceCustomer(request, sourceKey) {
  const sources = await (await request.get('/api/import/sources')).json();
  const source = sources.find(s => s.sourceKey === sourceKey);
  expect(source, `source ${sourceKey}`).toBeTruthy();
  return (await request.get(`/api/customers/${source.customerId}`)).json();
}

// Import needs an active tenant (test-only reset route, see server/src/routes/testSupport.js)
async function ensureTenantActive(request, customerId) {
  const tenant = await request.get(`/api/tenants/${customerId}`);
  if (tenant.ok() && (await tenant.json()).status === 'active') return;

  const reset = await request.post(`/api/test/tenants/${customerId}/reset`);
  expect(reset.ok(), await reset.text()).toBeTruthy();
  for (const status of ['provisioning', 'active']) {
    const res = await request.patch(`/api/tenants/${customerId}/status`, { data: { status } });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
}

async function openClientsMapping(page, customerName) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Data Mapping' }).click();
  await page.getByLabel('Customer').selectOption({ label: customerName });
  await page.getByRole('group', { name: 'Entity' }).getByRole('button', { name: 'clients' }).click();
}

test.describe('Editing column mappings', () => {
  test.describe.configure({ mode: 'serial' });

  test('should update the badge on each edit, and import with the edited mapping', async ({ page, request }) => {
    const abc = await sourceCustomer(request, ABC);
    const original = (await (await request.get(`/api/mappings/${abc.id}/clients`)).json()).mapping;
    expect(original.columns.name).toBe('Client Name');
    expect(original.columns.paymentTerms).toBe('Payment Terms');
    await ensureTenantActive(request, abc.id);

    try {
      await openClientsMapping(page, abc.name);

      const view = page.locator('.mapping-view[data-entity="clients"]');
      const card = page.locator('.entity-status[data-entity="clients"]');
      const badge = card.locator('h4 .completeness-badge');
      const name = view.getByLabel('Source column for name');
      const paymentTerms = view.getByLabel('Source column for paymentTerms');
      await expect(badge).toHaveText('Complete');

      // Unmapping a required field makes the mapping incomplete, and says why
      await name.selectOption({ label: 'unmapped' });
      await expect(badge).toHaveText('Incomplete');
      await expect(card.locator('.completeness-reasons')).toContainText('Required field name has no source column');

      // Map it back, and point paymentTerms at a different column
      await name.selectOption('Client Name');
      await expect(badge).toHaveText('Complete');
      await expect(paymentTerms).toBeEnabled();
      await paymentTerms.selectOption('Primary Contact');
      await expect(paymentTerms).toBeEnabled();

      // The edits were saved: they're still there after a reload
      await page.reload();
      await openClientsMapping(page, abc.name);
      await expect(name).toHaveValue('Client Name');
      await expect(paymentTerms).toHaveValue('Primary Contact');

      // Re-import ABC clients: payment terms now come from Primary Contact
      await page.getByRole('button', { name: 'Import', exact: true }).click();
      await page.locator(`tr[data-source="${ABC}"]`).getByRole('button', { name: 'Import clients' }).click();
      await expect(page.locator('.import-summary')).toContainText('Imported 10 clients');
      const riverside = page.locator('.records-table tbody tr').filter({ hasText: 'Riverside Manufacturing LLC' });
      await expect(riverside).toContainText('John Smith');
      await expect(riverside).not.toContainText('Net 30');
    } finally {
      // Put the seeded mapping back, and re-import so ABC's clients have their real payment terms
      const restore = await request.put(`/api/mappings/${abc.id}/clients`, { data: { columns: original.columns } });
      expect(restore.ok(), await restore.text()).toBeTruthy();
      const reimport = await request.post(`/api/import/${ABC}/clients`);
      expect(reimport.ok(), await reimport.text()).toBeTruthy();
    }
  });
});
