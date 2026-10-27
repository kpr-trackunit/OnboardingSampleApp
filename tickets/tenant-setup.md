# Tenant Setup Tracker

**Type:** Feature · **Area:** Tenant Setup tab (onboarding step 3) · **Status:** Proposed

## Why

We only get paid once a customer is provisioned **and** fully set up. Today CS provisions each tenant by hand on the platform and keeps track of where each one is in their heads, or in spreadsheets. The Tenant Setup tab is a placeholder, so the Dashboard never shows step 3 moving. Customers whose provisioning is stuck or has failed are invisible until someone asks about them.

This ticket makes the tab a **tracker**. CS still provisions the tenant outside this tool and records the result here. That gives the team one place to see each tenant's status, plan and region and why it failed, and it keeps the Dashboard honest. Each slice below works on its own and leaves the app usable.

## Context

- **App today:** The `Tenant` model has `{ id, customerId, status, plan, createdAt }`, with `status` = pending | provisioning | active | failed and `plan` = starter | professional | enterprise ([server/src/models/index.js](../server/src/models/index.js)). The only route is `GET /api/tenants/:customerId`. The store has `addTenant()` and `updateOnboardingState()` but no write routes ([server/src/data/store.js](../server/src/data/store.js)). Seed data: Acme has a `pending` tenant on the `professional` plan.
- **Storage:** In-memory only, so data resets on restart. There's no auth, so history entries don't record a user.

## Decisions (from requirements grilling)

| # | Question | Decision |
|---|---|---|
| 1 | What does "provisioning" do? | **Status flag only.** CS provisions the tenant elsewhere, and this tool records the outcome. There are no external calls and no simulated provisioner. |
| 2 | Which status changes are allowed? | **All 4 statuses, guided.** `pending → provisioning → active`, `provisioning → failed`, `failed → provisioning` (Retry). The UI shows only the valid next actions, and the API rejects invalid transitions with `409`. |
| 3 | What does marking a tenant failed require? | **A reason, as free text.** It shows on the tenant until the next Retry. |
| 4 | Plan | **Editable at any status.** |
| 5 | When does a tenant record exist? | **Created automatically with the customer** (`pending`, `starter`). On startup, existing customers without a tenant get one too. |
| 6 | Which configuration is captured? | **Region (data residency) only.** It is prefilled from `Customer.region`. |
| 7 | Can region change? | **Editable at any status.** |
| 8 | How do tenant status and onboarding step 3 relate? | **Step 3 mirrors the tenant status:** pending→pending, provisioning→in_progress, active→completed, failed→failed. `progressPercent` is recalculated on each change. |
| 9 | Gating | **Tenant setup gates Import only.** Import is blocked until the tenant is `active`. Tenant setup itself has no prerequisites. |
| 10 | History | **Status changes only.** Each change logs `{ at, from, to, reason? }`. Plan and region edits are not logged. |

## Target model

```text
Tenant {
  id, customerId, createdAt,
  status: 'pending' | 'provisioning' | 'active' | 'failed',
  plan:   'starter' | 'professional' | 'enterprise',
  region: string,                 // NEW: data residency, prefilled from Customer.region
  failureReason: string | null,   // NEW: set when status is failed, cleared on Retry
  statusHistory: [{ at, from, to, reason? }]   // NEW
}
```

Allowed transitions:

```text
pending ──Start──▶ provisioning ──Mark active──▶ active
                        │  ▲
          Mark failed   │  │ Retry
          (reason req.) ▼  │
                       failed
```

---

## Slices

Each slice is a vertical cut (API, UI and a test) with a demo script. Ship them in order. Stopping after any slice still leaves CS with something they can use.

### Slice 1: See every tenant (walking skeleton)

**Value:** CS can see the status and plan of every customer's tenant on one screen, without asking around.

**Demo:** Open Tenant Setup. A table shows Acme Corporation with status `pending` and plan `professional`, and each status has a coloured badge.

**Tasks**
- [ ] `GET /api/tenants` returns all tenants, joined with the customer name.
- [ ] Replace the Tenant Setup `PlaceholderTab` with a tenants table (customer, status, plan, created).
- [ ] Unit test for the list. E2E test: the Tenant Setup tab shows Acme as `pending`.

### Slice 2: Mark a tenant active (happy path) and update the Dashboard

**Value:** The first time the Dashboard moves because of real work. CS records a provisioned tenant, and step 3 shows `completed`.

**Demo:** Click **Start** on Acme to set it to `provisioning`, then click **Mark active**. Switch to Dashboard: Acme's "Tenant Setup" step is `completed` and progress is 25%.

**Tasks**
- [ ] `PATCH /api/tenants/:customerId/status` with `{ status }`. It enforces the transition table above and returns `409` with a message for an invalid move.
- [ ] Mirror the status onto onboarding step 3 and recalculate `progressPercent` with `calculateProgress`, through `updateOnboardingState`.
- [ ] Add row action buttons that show only the valid next action(s). The Dashboard re-fetches when you switch tabs.
- [ ] Unit tests: a table-driven test of valid and invalid transitions, and the step-3 mirroring. E2E test: start, mark active, Dashboard shows 25%.

### Slice 3: Failed tenants, with a reason and Retry

**Value:** Stuck or failed customers are visible, along with why they failed, so they don't fall out of the queue.

**Demo:** On a `provisioning` tenant, click **Mark failed**. The tenant can't be saved without a reason. Enter "Region not available for enterprise plan". The row shows `failed` with the reason, and the Dashboard step shows `failed`. Click **Retry**: the tenant goes back to `provisioning` and the reason is cleared.

**Tasks**
- [ ] Add `failureReason` to the model. `PATCH …/status` to `failed` requires a non-empty `reason` (returns `400` otherwise). Retry clears it.
- [ ] Add a reason prompt in the UI and show the reason in the row.
- [ ] Tests: failing without a reason is rejected, Retry clears the reason, and the Dashboard step shows `failed`.

### Slice 4: Change the plan

**Value:** CS can fix the plan when it's wrong (or when the customer upgrades) without editing data by hand.

**Demo:** Change Acme's plan from `professional` to `enterprise` using a dropdown in the row. It saves, and the plan stays changed after reloading the tab. The plan can be changed at any status, including `active`.

**Tasks**
- [ ] `PATCH /api/tenants/:customerId` with `{ plan }`. It validates against the plan enum (returns `400` on an unknown plan).
- [ ] Add a plan dropdown in the row.
- [ ] Tests: a valid plan change, an invalid plan rejected, and a plan change allowed while `active`.

### Slice 5: Region (data residency)

**Value:** CS records where the tenant is hosted, which they need for compliance conversations with the customer.

**Demo:** Acme's tenant shows region "North America", prefilled from Customer Info. Change it to "EU" and it saves. It can be edited at any status.

**Tasks**
- [ ] Add `region` to the model. Default it to `Customer.region` when the tenant is created, and backfill the seed tenant.
- [ ] `PATCH /api/tenants/:customerId` accepts `{ region }`. Use a fixed list of regions, and agree the list in this slice.
- [ ] Add a region column with a selector.
- [ ] Tests: the prefill from the customer, and an edit.

### Slice 6: Every customer has a tenant automatically

**Value:** No customer can be missed. As soon as a customer exists, it shows up in Tenant Setup as `pending`.

**Demo:** Add a customer, either through the store or through the Customer Info / Import flow once that exists. It appears in Tenant Setup as `pending` / `starter` with its region prefilled. Restarting the server doesn't create duplicate tenants.

**Tasks**
- [ ] `store.addCustomer` also creates a tenant (`pending`, `starter`, region from the customer) if the customer has none.
- [ ] On startup, backfill a tenant for any customer that doesn't have one. Never create duplicates (one tenant per `customerId`).
- [ ] Tests: adding a customer creates exactly one tenant, and running the backfill twice is idempotent.

### Slice 7: Block Import until the tenant is active

**Value:** Prevents imports into a tenant that doesn't exist yet, which would mean wasted work and support tickets.

**Demo:** With Acme's tenant `pending`, the Import tab shows "Tenant not active yet. Finish Tenant Setup first" and the import actions are disabled. Mark the tenant active, and Import becomes available.

**Tasks**
- [ ] Add a server-side guard: import routes return `409` if the customer's tenant is not `active`. This coordinates with [customer-data-import.md](customer-data-import.md).
- [ ] Show a UI notice and disable the actions on the Import tab.
- [ ] Tests: the guard rejects the import while `pending` and allows it when `active`.
- [ ] *If the Import ticket hasn't shipped yet:* add only the guard helper (`isTenantActive(customerId)`) and its test, and wire it in when Import lands.

### Slice 8: Status history

**Value:** CS can answer "how long has this been stuck?" and "why did it fail last time?"

**Demo:** Expand Acme's row. A timeline shows `pending → provisioning` (time), `provisioning → failed`, "Region not available…" (time), and `failed → provisioning` (time).

**Tasks**
- [ ] Append `{ at, from, to, reason? }` to `statusHistory` on every status change. Plan and region edits are not logged.
- [ ] Add an expandable timeline in the row, showing how long the tenant has been in its current status (e.g. "provisioning for 3 days").
- [ ] Tests: entries are appended in order, and the reason is kept on failed entries.

---

## Later slices (not in this ticket)

- More configuration: locale (currency, timezone, date format), admin user, tenant URL / external ID.
- Logging plan and region changes in the history.
- Filtering and sorting the table by status, e.g. "show me all failed tenants".
- Alerts when a tenant has been `provisioning` for more than N days.
- Real provisioning through a platform API, which would replace the manual status buttons.

## Out of scope

- Actually provisioning anything (this is a tracker).
- Auth and user attribution in the history.
- Persistence beyond the in-memory store.
- Prerequisites for tenant setup, e.g. requiring Customer Info or Data Mapping first.

## Acceptance criteria (whole ticket)

- [ ] Every customer has exactly one tenant, visible in the Tenant Setup tab.
- [ ] Only the allowed status transitions are possible, in both the UI and the API.
- [ ] A tenant can't be marked `failed` without a reason. Retry clears the reason.
- [ ] Plan and region can be edited at any status.
- [ ] Dashboard step 3 always matches the tenant status, and the progress bar updates.
- [ ] Import is blocked until the tenant is `active`.
- [ ] Status history records every transition.
- [ ] `npm run test:unit` and `npm run test:e2e` pass.

## Open questions

1. What's the fixed region list? (Proposed: North America, EU, UK, APAC.)
2. When a plan or region changes on an `active` tenant, should CS see a warning that the real tenant must be changed by hand as well?
3. Should `active → failed` be allowed, for a tenant that breaks after go-live, or is that out of scope for onboarding?
