# Customer Info: collect and validate the basics before onboarding starts

**Type:** Feature · **Area:** Customer Info tab · **Status:** Proposed

## Why

Customer Info is step 1 of onboarding, but the tab is still a placeholder. That causes three problems:

- Customers added on the Customers tab only have a **name**. `industry`, `region` and `contactEmail` stay blank, and nothing in the app lets CS fill them in.
- Nothing checks the data. A bad email or a free-typed region goes unnoticed until it breaks something later (Tenant Setup plans to prefill region from here, see [tenant-setup.md](tenant-setup.md)).
- The Customer Info step never moves off `pending`, so every customer's Dashboard progress is stuck at the first step.

This ticket makes the tab where CS fills in and checks each customer's basics, and marks the step done. Each slice is tiny, ships on its own, and leaves the app working.

## Context

- **App today:** `customer-info` renders `PlaceholderTab` in [client/src/App.jsx](../client/src/App.jsx). The Customers tab already handles adding, renaming, config and issues ([CustomerDetails.jsx](../client/src/components/CustomerDetails.jsx)).
- **Data:** `Customer` already has `industry`, `region` and `contactEmail` ([server/src/models/index.js](../server/src/models/index.js)), and [customerFiles.js](../server/src/data/customerFiles.js) already reads and writes them in the front matter. `PUT /api/customers/:id` accepts only `name`, `config` and `issues` ([server/src/index.js](../server/src/index.js)).
- **Step status:** `step_1` "Customer Info" is in `createDefaultOnboardingSteps()`. Marking a tenant active already mirrors a step status onto the Dashboard (`updateTenantStatus` in [store.js](../server/src/data/store.js)). Slice 4 uses the same pattern.
- **Seed data:** Acme (`cust_001`) has every field. The three sample-data customers (`cust_002`–`cust_004`) and any new customers are missing some or all of them, so there's real data to demo with.

## Principles for these slices

- Each slice is one PR: server change (if any), UI change (if any) and a test. Each one builds, passes `npm test` and can be deployed alone.
- Validation and completeness are **pure functions in `server/src/models`**, with `node --test` unit tests. The server is the source of truth. The client only shows what the server says.
- Slice 1 comes first. After that the order below is the suggested value order. Slices 5 and 6 reuse the completeness check from Slice 4, so ship Slice 4 before them.

---

## Slices

### Slice 1: See what's missing

**Value:** CS sees at a glance which customers are missing info, without opening each one.

**Demo:** Open Customer Info. There's one row per customer: name, industry, region, contact email. Blank fields show **Missing** in grey. Acme is fully filled in; a newly added customer shows three Missing.

**Tasks**
- [ ] Replace the placeholder with a `CustomerInfoTab` component that renders a table from `GET /api/customers`. Re-fetch when the tab opens.
- [ ] E2E test: the tab lists every customer, and a customer added on the Customers tab shows Missing fields.

### Slice 2: Edit a customer's info

**Value:** CS can fill in the gaps without editing markdown files by hand.

**Demo:** Click **Edit** on XYZ Financial Services, fill in industry, region and email, click **Save**. The row updates, and the values are still there after a server restart.

**Tasks**
- [ ] `PUT /api/customers/:id` accepts `industry`, `region` and `contactEmail` (strings, trimmed). Everything else stays as it is.
- [ ] Inline edit row in the table, with Save / Cancel and an error message on failure.
- [ ] Unit test for the PUT accepting the new fields. E2E test: edit, save, reload, values persist.

### Slice 3: Validate on save

**Value:** Bad data is caught when it's entered, not three steps later.

**Demo:** Enter `bob@` as the email and click Save. The row shows **Enter a valid email address** and nothing is saved. Region is a dropdown, not free text.

**Tasks**
- [ ] Pure `validateCustomerInfo(info)` returning `{ field: message }`: email has a valid format, region is one of `REGIONS`, no field is only whitespace. Blank is allowed (it's "missing", not "invalid").
- [ ] PUT returns 400 with the field errors; the client shows each one next to its field.
- [ ] Unit tests: valid, bad email, unknown region, blank fields allowed.

### Slice 4: Completeness badge

**Value:** CS knows which customers are ready to move on to Data Mapping.

**Demo:** Each row shows **Complete** (green) or **Missing: region, email** (amber). A count above the table: **2 of 4 complete**.

**Tasks**
- [ ] Pure `missingCustomerInfo(customer)` returning the list of required fields that are blank. Required fields: name, industry, region, contactEmail.
- [ ] Render the badge and the count. Unit tests: all filled, some missing, whitespace-only counts as missing.

### Slice 5: The Customer Info step completes itself

**Value:** Dashboard progress finally moves. A customer with complete info shows step 1 done.

**Demo:** Fill in the last missing field for Premier Bookkeeping and save. Open the Dashboard: its Customer Info step is **completed** and progress is 25%. Clear a field again and the step goes back to **in progress**.

**Tasks**
- [ ] After a customer update, set `step_1` to `completed` when nothing is missing, `in_progress` when some fields are filled, `pending` when none are. Recalculate `progressPercent`. Follow the `updateTenantStatus` pattern.
- [ ] Customers without an onboarding state get one created at this point (see Clarify 1).
- [ ] Unit test the status rule. E2E test: complete a customer's info, the Dashboard shows step 1 done.

### Slice 6: Show only incomplete customers

**Value:** CS works through a to-do list instead of scanning everyone.

**Demo:** A **Show incomplete only** toggle above the table. On, Acme disappears and only customers with Missing fields remain.

**Tasks**
- [ ] Client-side filter on the Slice 4 badge.
- [ ] E2E test: toggle on, only incomplete rows show; toggle off, everyone shows.

---

## Later slices (not in this ticket)

- Prefill industry or region from the customer's sample-data files.
- Extra fields: contact name, phone, billing address.
- Link from a Dashboard card straight to that customer's row here.
- Edit name here too, so the Customers tab is only for adding customers.

## Out of scope

- Adding customers. That stays on the Customers tab.
- Config and issues. They stay on the Customers tab.
- Tenant Setup reading region from here. That's a slice in [tenant-setup.md](tenant-setup.md).
- Checking that an email address really exists (no sending emails).
- Moving storage off markdown files.

## Clarify

1. **Onboarding state for new customers.** Most customers have no onboarding state today (only Acme is seeded with one). Slice 5 needs one to write to. Proposed: create it in `store.addCustomer` and lazily for existing customers on first update. This is the "create state" option from Open question 1 in [dashboard.md](dashboard.md).
2. **Region list.** What are the allowed values? Proposed: North America, EU, UK, APAC, LATAM. Existing values that don't match (if any) would show as invalid until fixed.
3. **Industry.** Free text or a fixed list?
4. **Required fields.** Are name, industry, region and contact email the right set for "complete"?
5. **Manual override.** Should CS be able to mark the step completed even with fields missing, or is it automatic only?

## Acceptance criteria (whole ticket)

- [ ] The Customer Info tab lists every customer with industry, region and contact email, and highlights missing ones.
- [ ] CS can edit those fields, and changes persist across a server restart.
- [ ] Invalid emails and unknown regions are rejected with a message next to the field.
- [ ] Each customer shows whether its info is complete, and the tab can be filtered to incomplete customers.
- [ ] The Customer Info onboarding step is `completed` exactly when all required fields are filled, and the Dashboard reflects it without a page reload.
- [ ] `npm run test:unit` and `npm run test:e2e` pass after every slice.
