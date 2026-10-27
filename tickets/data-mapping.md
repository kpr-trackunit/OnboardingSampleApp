# Data Mapping

**Type:** Feature · **Area:** Data Mapping tab (onboarding step 2) · **Status:** Proposed · **Related:** [customer-data-import.md](customer-data-import.md)

## Why

Every customer sends the same kinds of data (clients, contacts, chart of accounts, transactions), but with different column names, picklist values and date formats. The [import ticket](customer-data-import.md) starts with mappings seeded for the 3 known customers. That gets value out early, but onboarding a 4th customer would still need a developer.

The Data Mapping step lets CS map a new customer's files to the standard model themselves. That removes engineering from the onboarding queue.

## Scope

**In:** Column mapping, value (picklist) mapping, date format detection, and a minimal CSV upload so new customers' files can be mapped.

**Not in:** Mapping customer needs to platform configuration (plan, features, modules). The README's description of this step also reads that way, but it's a separate later ticket.

## Decisions

These were agreed in a grilling session on 2026-10-27.

| # | Topic | Decision |
|---|---|---|
| 1 | Scope | Column and value mapping now. Platform configuration is a separate later ticket. |
| 2 | Where maps live | Mappings are **data, not code**, from day one. Import and the mapping UI read and write the same mapping objects. |
| 3 | Granularity | One mapping **per customer, per entity**: 4 per customer (clients, contacts, accounts, transactions). |
| 4 | Unmapped values | Each picklist field has a **default chosen by CS**. A row with an unmapped value is imported using the default and **flagged as a warning** in the import report. |
| 5 | Strict fields | Transaction `direction`, account `type` and account `normalBalance` are **strict**: no default is allowed, so an unmapped value rejects the row. A wrong guess here corrupts balances. |
| 6 | Standard values | A **region-neutral standard set**. The original value is always kept next to the standard one (e.g. `entityType: company`, `entityTypeSource: "Limited Company"`). |
| 7 | Persistence | **In-memory.** The 3 known customers are seeded at startup. Edits made in the UI are lost on restart; this is accepted as a known limitation. |
| 8 | Dates | Format is **auto-detected per file**. If detection is ambiguous (e.g. no day above 12), CS must pick the format, and the mapping can't be completed until they do. |
| 9 | Gating | **Per entity.** An entity's import unlocks when its own mapping is complete. The Data Mapping onboarding step is marked completed when all 4 are. |
| 10 | New customers | **Minimal CSV upload** is part of this ticket (moved forward from the import ticket's later slices). |
| 11 | Suggestions | **Simple name matching**: normalize headers and match them against target field names plus a synonym list built from the 3 sample customers. CS reviews and confirms. |

## Mapping model (proposed)

```text
Mapping {
  id, customerId, entity,                    // entity: clients | contacts | accounts | transactions
  columns:  { [targetField]: sourceColumn | null },
  values:   { [targetField]: { map: { [sourceValue]: standardValue }, default: standardValue | null } },
  dateFormat: 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | null,
  dateFormatDetected: 'detected' | 'ambiguous' | 'confirmed',
  updatedAt
}
```

A mapping is **complete** when all of these hold:
- Every required target field has a source column.
- `dateFormat` is set. An ambiguous detection counts as unset until CS confirms a format.
- Every **strict** field has a mapping for every distinct value found in the file.

Non-strict fields with unmapped values don't block completion as long as they have a default.

### Standard values (region-neutral)

| Field | Values |
|---|---|
| Client `status` | active, inactive, pending |
| Client `entityType` | company, llc_llp, partnership, sole_trader, non_profit |
| Contact `active` | true, false |
| Account `type` *(strict)* | asset, liability, equity, revenue, expense |
| Account `normalBalance` *(strict)* | debit, credit |
| Transaction `direction` *(strict)* | debit, credit |
| Transaction `status` | completed, pending, cancelled |
| Transaction `paymentMethod` | wire, bank_transfer, ach, check, card, cash |

Every picklist field also stores `<field>Source`, the original value.

---

## Slices

Each slice can be demoed and leaves the app usable. They build on the import ticket's slices 1 to 3, which provide the sources list, the CSV parser and mappings stored as data.

### Slice 1: See the mappings

**Value:** CS can see how each customer's data is interpreted, instead of the logic being hidden in code.

**Demo:** Open Data Mapping, pick XYZ → clients. A table shows each target field next to its source column (`name ← companyName`), and each picklist field's value map (`A → active`).

**Tasks**
- [ ] Add a `Mapping` model and store collection, seeded with the 12 mappings for the 3 sample customers × 4 entities.
- [ ] `GET /api/mappings/:customerId` and `GET /api/mappings/:customerId/:entity`.
- [ ] Replace the Data Mapping placeholder tab with a customer/entity picker and a read-only view.
- [ ] Unit test the seeds' shape. E2E test: the XYZ clients mapping is visible.

### Slice 2: Show what's incomplete

**Value:** CS can see at a glance what needs attention before importing.

**Demo:** Each customer shows 4 entity badges, **Complete** or **Incomplete**, with the reasons listed: missing required fields, unmapped values (strict ones highlighted), and the detected date format or **Ambiguous**.

**Tasks**
- [ ] Add a completeness check: scan the source file for distinct values per picklist field and compare them with the mapping.
- [ ] Add date format auto-detection with a `detected | ambiguous` result.
- [ ] Return completeness and reasons from `GET /api/mappings/:customerId`.
- [ ] Tests: the detector on all 3 sample formats plus an ambiguous fixture; completeness reasons for a mapping that's missing a field.

### Slice 3: Edit column mappings

**Value:** CS can fix or adjust how columns are mapped without a developer.

**Demo:** Unmap ABC clients' `name` field, and the badge flips to Incomplete. Map `name ← Client Name` again, remap `paymentTerms` to a different column, and re-import: the import uses the edited mapping.

**Tasks**
- [ ] `PUT /api/mappings/:customerId/:entity` for columns. Validate that the target fields exist.
- [ ] Add a dropdown per target field listing the file's headers, plus "unmapped".
- [ ] E2E test: edit a column, then the import result reflects the change.

### Slice 4: Edit value mappings and defaults

**Value:** CS can deal with unexpected picklist values, such as a new `ON_HOLD` status, on their own.

**Demo:** Upload a fixture where XYZ clients has an `H` status. It shows as unmapped with the client status default `pending`. Import, and the row comes in as `pending` and is flagged as a warning. In transactions, an unmapped `entryType` value can't be given a default and rejects the row.

**Tasks**
- [ ] Add a value-mapping editor per picklist field: list the distinct values in the file, a dropdown of standard values for each, and a default selector.
- [ ] Disable the default selector for strict fields and explain why in the UI.
- [ ] Have import use the default for unmapped values and add a warning (row, field, source value, default used) to the import run.
- [ ] Tests: a default is applied and flagged; an unmapped strict value is rejected.

### Slice 5: Gate import and complete the onboarding step

**Value:** Half-mapped data can't get in, and progress on the dashboard is accurate.

**Demo:** For a customer whose transactions mapping is incomplete, Import transactions is disabled with "Mapping incomplete" while Import clients still works. Completing all 4 mappings marks the Data Mapping step **completed** on the Dashboard, and the progress bar moves.

**Tasks**
- [ ] Have the import endpoints return `409` with reasons when the entity's mapping is incomplete.
- [ ] Disable the import buttons and show the reason on the Import tab.
- [ ] Update onboarding step 2 through `updateOnboardingState` whenever a mapping's completeness changes.
- [ ] E2E test: per-entity gate, then the step completes.

### Slice 6: Upload a new customer's files

**Value:** A customer that isn't one of the 3 samples can be onboarded without a developer, which is the main point of this ticket.

**Demo:** Create customer "Delta Ledger", upload its `clients.csv`, and an empty clients mapping appears listing the file's headers and detected date format. Map it, mark it complete, and import.

**Tasks**
- [ ] `POST /api/import/:customerId/:entity/upload` (multipart or raw text), held in memory as a source file.
- [ ] Create an empty mapping on the first upload for that customer and entity.
- [ ] Recover rows with too many fields using a general rule, not one specific to XYZ (see the import ticket, slice 3).
- [ ] Add an upload control per entity on the Import tab.
- [ ] E2E test: upload, map, import.

### Slice 7: Suggest column mappings

**Value:** Mapping a new customer takes a few clicks instead of 40 dropdowns.

**Demo:** Upload a file with headers `company_name, Status, start_date`. The suggestions come back pre-filled (`name ← company_name`, …) and marked "suggested" until CS confirms them.

**Tasks**
- [ ] Normalize headers (lowercase, strip spaces, `_`, `-`, split camelCase).
- [ ] Build a synonym list per target field from the 3 seeded mappings.
- [ ] Pre-fill only unmapped fields, and add a "Confirm suggestions" action.
- [ ] Unit test: each sample customer's headers get the correct suggestions.

### Slice 8: Preview

**Value:** CS can check a mapping against real rows before committing an import.

**Demo:** Below the editor, the first 5 rows are shown before and after mapping, and they update as the mapping is edited. Values that used a default are highlighted.

**Tasks**
- [ ] `POST /api/mappings/:customerId/:entity/preview` returns the first N rows mapped, using the same transform function as import.
- [ ] Add a preview table to the editor.

---

## Known limitations

- **Mappings are in-memory.** CS's edits and uploaded files are lost when the server restarts. The 3 sample customers come back from seeds.

## Out of scope

- Mapping customer needs to platform configuration (a separate ticket).
- Reusable mapping templates shared across customers.
- Fuzzy or AI-based suggestions.
- Persisting mappings to disk or a database.

## Acceptance criteria

- [ ] All 12 seeded mappings are complete and import every sample file with no warnings.
- [ ] A new customer can be uploaded, mapped and imported entirely through the UI.
- [ ] Unmapped values on non-strict fields are imported using the default and listed as warnings. Unmapped values on strict fields are rejected.
- [ ] Every standard value is stored with its original source value.
- [ ] An ambiguous date format blocks completion until CS picks one.
- [ ] Import is gated per entity, and the Data Mapping step completes when all 4 mappings are complete.
- [ ] `npm run test:unit` and `npm run test:e2e` pass.

## Open questions

1. Number and currency formats: auto-detect per file (e.g. `1.234,56`), or a setting on each mapping? Currency is currently fixed per customer.
2. When a mapping is edited after data has been imported, should the data be re-imported automatically or just flagged as out of date?
3. Should the suggestion synonym list grow from the mappings CS confirms?
