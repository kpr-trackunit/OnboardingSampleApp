// @ts-check
const path = require('path');
const { test, expect } = require('@playwright/test');

// A small clients file for a customer that isn't one of the 3 samples: its own headers,
// DD-MM-YYYY dates, and an unquoted comma in the Contact column ("Williams, Robert")
const DELTA_CLIENTS = path.join(__dirname, '../fixtures/upload/DeltaLedger/clients.csv');
const DELTA_HEADERS = ['Ref', 'Company', 'Contact', 'Kind', 'State', 'Joined', 'VAT Number', 'Turnover', 'Sector', 'Terms'];

test.describe('Upload a new customer\'s files', () => {
  test('should upload a clients CSV and show its empty mapping with headers and detected date format', async ({ page, request }) => {
    const name = `Delta Ledger ${Date.now()}`;

    // Create the customer on the Customers tab
    await page.goto('/');
    await page.getByRole('button', { name: 'Customers', exact: true }).click();
    await page.getByLabel('Customer name').fill(name);
    await page.getByRole('button', { name: 'Add Customer' }).click();
    await expect(page.getByText(name).first()).toBeVisible();

    const customers = await (await request.get('/api/customers')).json();
    const customer = customers.find(c => c.name === name);
    expect(customer, 'the new customer').toBeTruthy();

    // Upload its clients file on the Import tab
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByLabel('Upload customer').selectOption({ label: name });
    await page.getByLabel('Upload clients CSV').setInputFiles(DELTA_CLIENTS);

    await expect(page.locator('.upload-status')).toHaveText(
      'Uploaded clients.csv (3 rows), empty clients mapping created: map it on the Data Mapping tab');

    // It's listed as an import source of its own; nothing is mapped yet so it can't be imported
    const row = page.locator(`.sources-table tr[data-source="upload:${customer.id}"]`);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(name);
    await expect(row).toContainText('clients.csv');
    await expect(row).toContainText('uploaded');
    await expect(row).toContainText('3 rows');

    // The empty mapping shows the file's headers and its detected date format
    await page.getByRole('button', { name: 'Data Mapping' }).click();
    await page.getByLabel('Customer').selectOption({ label: name });
    await page.getByRole('group', { name: 'Entity' }).getByRole('button', { name: 'clients' }).click();

    const view = page.locator('.mapping-view[data-entity="clients"]');
    await expect(view.locator('.source-file')).toContainText('clients.csv');
    await expect(view.locator('.source-file')).toContainText('uploaded, 3 rows');
    await expect(view.getByLabel('File headers').locator('li')).toHaveText(DELTA_HEADERS);
    await expect(view.locator('.column-mappings tr[data-field="name"]')).toContainText('unmapped');
    await expect(view.locator('.date-format')).toContainText('DD-MM-YYYY');
    await expect(view.locator('.date-format')).toContainText('detected');

    const clients = page.locator('.entity-status[data-entity="clients"]');
    await expect(clients).toHaveAttribute('data-complete', 'false');
    await expect(clients.locator('.date-status')).toContainText('DD-MM-YYYY');
    await expect(clients.locator('.reason[data-code="missing_required_column"]')).toHaveCount(2);
  });
});
