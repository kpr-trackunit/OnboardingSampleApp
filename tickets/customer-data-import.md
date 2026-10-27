# Import Customer Data

**Type:** Feature · **Area:** Import tab (onboarding step 4) · **Status:** Proposed · **Related:** [data-mapping.md](data-mapping.md)

## Why

We only get paid once a customer is provisioned **and** their data is in the platform. Today the Import tab is a placeholder, so CS imports each customer's data by hand. Every customer sends data in a different shape (column names, date formats, picklist values), which is where most of the manual time goes.

The goal is to ship the smallest useful import **now** and grow it slice by slice. Each slice below works on its own, can be demoed with the files in `sample-data/`, and leaves the app usable.

## Context

- **Source data:** `sample-data/` has 3 customers × 4 CSVs (clients, contacts, chart of accounts, transactions). See [sample-data/README.md](../sample-data/README.md) for how the schemas differ.

  | Customer | Columns | Dates |
  |---|---|---|
  | ABC Accounting | Title Case | `MM/DD/YYYY` |
  | XYZ Financial Services | camelCase | `YYYY-MM-DD` |
  | Premier Bookkeeping | snake_case | `DD-MM-YYYY` |

- **App today:** Express API with an in-memory store ([server/src/data/store.js](../server/src/data/store.js)), React client with an `Import` placeholder tab ([client/src/App.jsx](../client/src/App.jsx)). There's no database or auth, and data resets on restart. That's fine for this ticket.
- **Known data traps** (found while scoping):
  - **XYZ `clients.csv` is malformed.** Every row has an unquoted `mainContact` like `Williams, Robert`, so each row has 11 fields against a 10-column header. A naive split shifts the columns or rejects all 12 rows.
  - **Premier `nominal_code` values have leading zeros** (`0010`). Keep account codes as strings.
  - The same value can be written in different ways: `Active` / `A` / `ACTIVE`, `Debit` / `DR` / `D`, and `Y` / `1` / `Yes` for "active" flags.
  - Revenue is formatted differently per customer (`2500000.00` vs `1850000`), and Premier amounts are GBP (`amount_gbp`).

## Canonical target model (proposed)

Shared shape that every customer's data is mapped into. It lives on the server next to the existing models.

```text
Client       { id, customerId, sourceId, name, entityType, status, startDate, taxId, annualRevenue, industry, paymentTerms }
Contact      { id, customerId, sourceId, clientSourceId, firstName, lastName, email, phone, role, active }
Account      { id, customerId, code, name, type, subType, normalBalance, active, parentCode }
Transaction  { id, customerId, sourceId, date, clientSourceId, accountCode, description, direction, amount, currency, status, paymentMethod, reference }
ImportRun    { id, customerId, entity, startedAt, imported, rejected, warnings[], errors[] }
```

- Standard values are region-neutral and listed in [data-mapping.md](data-mapping.md#standard-values-region-neutral). For example, `status` = active | inactive | pending, `entityType` = company | llc_llp | partnership | sole_trader | non_profit, and `direction` = debit | credit.
- Every picklist field also stores its original value as `<field>Source` (e.g. `entityTypeSource: "Limited Company"`).
- Dates are stored as ISO `YYYY-MM-DD`.
- **Mappings are data, not code.** Column and value maps are `Mapping` objects in the store (one per customer per entity; see [data-mapping.md](data-mapping.md#mapping-model-proposed)). Import reads them, and the Data Mapping tab edits them. The 3 sample customers are seeded at startup.

---

## Slices

Each slice is a vertical cut (API, UI and a test) with a demo script. Ship them in order. Stopping after any slice still leaves CS with something they can use.

### Slice 1: See what there is to import (walking skeleton)

**Value:** CS can see which customers have data waiting and how much, without opening files.

**Demo:** Open the Import tab and see a table listing ABC, XYZ and Premier, each with its 4 files and row counts (for example "clients: 10 rows").

**Tasks**
- [ ] `GET /api/import/sources`: scan `sample-data/` and return `[{ sourceKey, label, files: [{ entity, filename, rowCount }] }]`.
- [ ] Replace the Import `PlaceholderTab` with a sources table.
- [ ] Unit test the row counts. E2E test: the Import tab lists 3 sources.

### Slice 2: Import clients for one customer (ABC, happy path)

**Value:** The first real data lands in the platform, so CS stops re-typing ABC's clients.

**Demo:** Click **Import clients** on ABC. The tab shows "Imported 10 clients" and a table of the imported records in canonical shape. Restarting the server clears them, which is expected.

**Tasks**
- [ ] Add a small CSV parser utility, or a proven dependency like `csv-parse` (decide in the slice).
- [ ] Add the `Mapping` model and store collection, seeded with ABC's clients mapping. Write one shared transform function that converts a row to the canonical `Client` shape using a mapping. Don't hard-code columns in the import code.
- [ ] Add the `Client` model, store collection and `getClients(customerId)`.
- [ ] `POST /api/import/:sourceKey/clients` returns `{ imported, rejected }`. `GET /api/import/:sourceKey/clients` lists the imported records.
- [ ] Add an Import button per source/file and a results table.
- [ ] Unit test the mapping. E2E test: import ABC clients and see 10 rows.

### Slice 3: Clients for all three customers, with values normalized

**Value:** The same button works for every customer in the queue, and the output is consistent.

**Demo:** Import clients for XYZ and Premier. Every status shows as `active`/`inactive`/`pending` and every date shows as `YYYY-MM-DD`, whatever the source format was.

**Tasks**
- [ ] Seed clients mappings for XYZ and Premier, including value maps for status and entity type (region-neutral values, e.g. `Limited Company` → `company`).
- [ ] Add normalizers for dates (auto-detected per file, see [data-mapping.md](data-mapping.md) decision 8) and revenue (convert to a number). Store each `<field>Source` next to its standard value.
- [ ] **Handle the XYZ unquoted-comma rows with a general rule.** When a row has more fields than the header, rejoin the extra fields into the free-text column that overflowed. This must work for uploaded files too, not just XYZ. Cover it with a test.
- [ ] Unit tests: one table-driven test per normalizer, covering all three source spellings.

### Slice 4: Show what failed and why

**Value:** CS can trust the import. Bad rows are reported instead of silently dropped or crashing the whole import.

**Demo:** Import a CSV with a bad date and a missing name, from a small fixture under `tests/`. The result reads "9 imported, 2 rejected", with a per-row reason such as "row 4: `Date Onboarded` '13/45/2023' is not a valid date".

**Tasks**
- [ ] Add row-level validation for required fields and parseable dates. Rejected rows are skipped and never block valid rows.
- [ ] **Unmapped picklist values:** on non-strict fields, use the mapping's default and record a **warning** (row, field, source value, default used). On strict fields (transaction `direction`, account `type`, account `normalBalance`), **reject** the row. See [data-mapping.md](data-mapping.md) decisions 4 and 5.
- [ ] Record an `ImportRun` with the warning and error lists, and show both in the UI.
- [ ] Re-importing the same file replaces that customer's clients rather than duplicating them (idempotent by `sourceId`).
- [ ] Tests: a fixture with bad rows, checking the counts and messages, plus a test that importing twice does not duplicate.

### Slice 5: Contacts, linked to their clients

**Value:** CS gets the people to talk to for each client, not just company names.

**Demo:** Import contacts for any customer. Each contact shows the client it belongs to, and a contact whose client doesn't exist is rejected with "unknown client `X`".

**Tasks**
- [ ] Seed contacts mappings for all 3 sources, plus `Contact` normalization (active flag `Active`/`Y`/…; keep the phone number as text).
- [ ] Check that each contact's client exists among already-imported clients. Prompt the user to import clients first if none are loaded.
- [ ] Tests: mapping per source, and rejection of contacts whose client isn't found.

### Slice 6: Chart of accounts

**Value:** The ledger structure is in place, which transactions need.

**Demo:** Import accounts for Premier. Codes like `0010` keep their leading zero, types are normalized (`Assets` → `asset`, `Overheads` → `expense`), and the parent/child structure is visible.

**Tasks**
- [ ] Seed accounts mappings and add the `Account` model. Keep `code` as a string.
- [ ] Normalize account type and normal balance (`Debit`/`DR`/`D`) and the active flag (`Active`/`1`/`Yes`).
- [ ] Validate that each `parentCode` exists in the same file.
- [ ] Tests: leading zeros kept, type mapping per source, orphan parent rejected.

### Slice 7: Transactions

**Value:** The customer's financial history is in the platform. This completes the data import.

**Demo:** Import transactions for XYZ and see 25 rows with direction `debit`/`credit`, status `completed`/`pending`/`cancelled`, and a currency (USD, or GBP for Premier).

**Tasks**
- [ ] Seed transactions mappings, add the `Transaction` model, and normalize direction (strict), status and payment method.
- [ ] Check that each transaction's client and account code exist.
- [ ] Set currency per source (Premier = GBP, everyone else USD for now).
- [ ] Tests: one mapping test per source, and missing-reference rejections.

### Slice 8: "Import all" and onboarding progress

**Value:** One click per customer, and the dashboard shows when import is done. This ties back to "we get paid when fully set up".

**Demo:** Click **Import all** on a source. All four entities import in dependency order (clients → contacts → accounts → transactions) and a summary shows counts per entity. On the Dashboard, the customer's **Import** step flips to `completed` (or `failed` if any entity has rejections) and the progress bar moves.

**Tasks**
- [ ] `POST /api/import/:sourceKey/all` runs the entities in order and stops downstream entities if their dependency fails.
- [ ] Link the import source to a `Customer` in the store, creating the customer from the source label if needed, so it shows in the onboarding queue.
- [ ] Update the onboarding step status and `progressPercent` through `updateOnboardingState`.
- [ ] E2E test: import all, then the Dashboard shows the Import step as completed.

---

## Later slices (not in this ticket)

Moved to [data-mapping.md](data-mapping.md):

- **Upload a CSV** from the browser (Data Mapping slice 6).
- **Configurable column/value mapping in the UI** (Data Mapping slices 3 and 4), which is what makes a 4th customer self-service.
- **Suggest mappings from header names** (Data Mapping slice 7).
- **Preview** before committing an import (Data Mapping slice 8).
- **Gate import per entity** until its mapping is complete (Data Mapping slice 5).

Still candidates for follow-up tickets:

- **Export the rejected and warning rows** as a CSV to send back to the customer.

## Out of scope

- Persistence beyond the in-memory store, auth, multi-user concurrency.
- Currency conversion (store the source currency only).
- Large files, streaming, background jobs. Sample files have 40 rows or fewer.

## Acceptance criteria (whole ticket)

- [ ] All 12 sample files import with no unexpected rejections. The XYZ clients file imports all 12 rows correctly despite its unquoted commas.
- [ ] Imported data uses the region-neutral standard values and ISO dates for all three customers, and keeps each original value.
- [ ] Every rejected row shows the row number, the column and a readable reason. Every row that used a default is listed as a warning.
- [ ] Import reads its column and value maps from the stored `Mapping` objects; no column names are hard-coded in the import code.
- [ ] Re-running an import never creates duplicates.
- [ ] The Dashboard reflects the Import step status after **Import all**.
- [ ] `npm run test:unit` and `npm run test:e2e` pass.

## Open questions

1. Should an import with some rejected rows mark the step `completed` (with warnings) or `failed`? This ticket currently proposes `failed`. Rows that only have warnings don't count as failures.
2. Is USD the right default currency for ABC and XYZ, or should currency be set per customer?

**Resolved:** The XYZ unquoted-comma rows are handled in our parser with a general recovery rule, because uploaded files will have the same problem (see slice 3).
