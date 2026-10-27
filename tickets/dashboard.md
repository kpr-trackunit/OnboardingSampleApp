# Onboarding Dashboard: a queue CS can work from

**Type:** Feature · **Area:** Dashboard tab · **Status:** Proposed

## Why

We only get paid once a customer is fully set up, so CS needs to know **who to work on next**. Today the Dashboard can't tell them:

- It only shows customers that have an onboarding state, and only the seeded Acme has one. Customers added on the Customers tab (and the ones loaded from `customers/*.md`) never appear in the queue.
- It fetches once, when the app loads. Work done on other tabs doesn't show until a full page reload.
- Every card looks the same. There's no summary, no order, and nothing that makes a stuck or failed customer stand out.

This ticket turns the Dashboard into a work queue. Each slice is tiny, ships on its own, and leaves the app working.

## Context

- **App today:** `DashboardTab` in [client/src/App.jsx](../client/src/App.jsx) renders one card per row of `GET /api/onboarding`, with a `ProgressBar` and `Checklist`. The route in [server/src/index.js](../server/src/index.js) maps over `store.getAllOnboardingStates()` and joins the customer, so customers without a state are dropped. `store.addCustomer()` doesn't create an onboarding state ([server/src/data/store.js](../server/src/data/store.js)).
- **Step statuses** are `pending | in_progress | completed | failed`, and `calculateProgress()` already exists ([server/src/models/index.js](../server/src/models/index.js)). Other tickets ([tenant-setup.md](tenant-setup.md), [data-mapping.md](data-mapping.md), [customer-data-import.md](customer-data-import.md)) will move step statuses. This ticket only **reads** them, so it doesn't depend on any of them shipping first.
- **Existing e2e test is red:** [tests/e2e/dashboard.spec.js](../tests/e2e/dashboard.spec.js) expects 5 tabs, but the Customers tab made it 6.

## Principles for these slices

- Each slice is one PR: server change (if any), UI change (if any) and a test. Each one builds, passes `npm test` and can be deployed alone.
- Derived values (current step, days waiting, attention flag) are computed **on the server** as pure functions in `server/src/models`, so they get fast `node --test` unit tests. The client only renders them.
- After Slice 1, the slices don't depend on each other and can ship in any order. The order below is the suggested value order.

---

## Slices

### Slice 0: Green build

**Value:** The Dashboard test suite tells the truth again, so every slice after this can rely on it.

**Demo:** `npm run test:e2e` passes.

**Tasks**
- [ ] Update `dashboard.spec.js` to expect 6 tabs and assert the Customers tab is visible.

### Slice 1: Every customer is in the queue

**Value:** No customer can be forgotten. Everyone on the Customers tab shows up on the Dashboard.

**Demo:** Open the Dashboard. All customers from `customers/*.md` appear, not just Acme. A customer with no onboarding state shows four `pending` steps and 0%.

**Tasks**
- [ ] `GET /api/onboarding` returns one row per **customer**, falling back to `createDefaultOnboardingSteps()` and 0% when the customer has no state. The store isn't changed.
- [ ] Unit test for the join (extract it to a pure `buildQueue(customers, states)` function). Update the e2e test: the queue count matches the customer count.

### Slice 2: The Dashboard is always fresh

**Value:** CS sees the result of their work as soon as they come back to the Dashboard, without reloading the page.

**Demo:** Add "Globex" on the Customers tab, then click Dashboard. Globex is in the queue.

**Tasks**
- [ ] Move the onboarding fetch into `DashboardTab` so it re-fetches every time the tab is opened.
- [ ] E2E test: add a customer, switch to Dashboard, the new customer is listed.

### Slice 3: Summary strip

**Value:** CS and their lead see the state of the whole queue at a glance: how much work is left.

**Demo:** Above the cards: **Total 4 · Not started 3 · In progress 1 · Done 0 · Failed 0**.

**Tasks**
- [ ] Pure `summarise(queue)` function: not started = 0% and no failed step; done = 100%; failed = any step `failed`; in progress = the rest.
- [ ] `GET /api/onboarding/summary` returns the counts, or include `summary` in the existing response if simpler (decide in the PR).
- [ ] Render the strip. Unit test the bucketing, including a customer that is both partly done and failed (counts as failed).

### Slice 4: Show the current step on each card

**Value:** CS can tell what each customer is waiting for without reading the checklist.

**Demo:** Each card header shows a badge, e.g. **Next: Data Mapping**, or **Done** when every step is completed.

**Tasks**
- [ ] Pure `currentStep(steps)`: the lowest-`order` step that isn't `completed`, or `null` when done. Add it to each queue row.
- [ ] Render the badge. Unit tests: none done, middle step, all done, a failed step is the current step.

### Slice 5: Days waiting

**Value:** CS can see who has been waiting longest, which is who is most likely to churn or chase us.

**Demo:** Each card shows "Waiting 12 days" (from the customer's `createdAt`). Customers with no `createdAt` show nothing rather than "NaN days".

**Tasks**
- [ ] Pure `daysWaiting(createdAt, now)`, added to each row. `now` is a parameter so it can be tested.
- [ ] Render it in the card meta row. Unit tests: same day = 0, whole days, missing/invalid date.

### Slice 6: Failed customers stand out

**Value:** Stuck customers can't hide in the list.

**Demo:** Set a step to `failed` (in the store, or through Tenant Setup once that ships). The card gets a red border and a **Needs attention** badge, and is listed first.

**Tasks**
- [ ] Add `needsAttention` (any step `failed`) to each row.
- [ ] Sort the queue: needs attention first, then the existing order. Add a red card style.
- [ ] Unit test for the flag and the sort.

### Slice 7: Work order (oldest first)

**Value:** The top of the list is the next customer to work on. CS stops picking at random.

**Demo:** Below any "Needs attention" customers, cards are ordered by days waiting, longest first. Completed customers go to the bottom.

**Tasks**
- [ ] Extend the server sort: needs attention → in progress / not started by `createdAt` ascending → done last.
- [ ] Unit test the full ordering with one customer per bucket.

### Slice 8: Open issues on the card

**Value:** CS sees known blockers before opening a customer (the "open-issue count" idea from [BACKLOG.md](../BACKLOG.md)).

**Demo:** Acme's card shows **2 open issues**. Resolving one on Tenant Setup and returning to the Dashboard shows **1 open issue**. A customer with none shows nothing.

**Tasks**
- [ ] Add `openIssueCount` (issues not `resolved`) to each row.
- [ ] Render it in the card meta row. Unit test the count.

### Slice 9: Filter by current step

**Value:** A CS person who owns one step (for example Tenant Setup) sees only their queue.

**Demo:** Chips above the cards: **All · Customer Info · Data Mapping · Tenant Setup · Import · Done**, each with a count. Clicking **Tenant Setup** shows only customers whose current step is Tenant Setup.

**Tasks**
- [ ] Client-side filter on the `currentStep` field from Slice 4 (if Slice 4 hasn't shipped, ship it first: this is the one dependency).
- [ ] E2E test: click a chip, only matching cards show; click **All**, everything shows again.

---

## Later slices (not in this ticket)

- Click a card to jump to its current step's tab with the customer preselected.
- Remember the selected filter across reloads.
- Compact table view for long queues.
- Auto-refresh on an interval, for a Dashboard left open on a wall screen.
- "Time in current step", once step changes are timestamped (see Status history in [tenant-setup.md](tenant-setup.md)).

## Out of scope

- Changing step statuses from the Dashboard. The step tabs own their own status.
- Persisting onboarding state beyond the in-memory store.
- Charts and trends over time.
- Auth, or "my customers" by assignee.

## Acceptance criteria (whole ticket)

- [ ] Every customer appears in the queue exactly once.
- [ ] The Dashboard reflects changes made on other tabs without a page reload.
- [ ] The summary counts add up to the total.
- [ ] Each card shows its current step, days waiting and open issue count.
- [ ] Failed customers are listed first and visibly flagged; the rest are ordered oldest first, done last.
- [ ] The queue can be filtered by current step.
- [ ] `npm run test:unit` and `npm run test:e2e` pass after every slice.

## Open questions

1. Should Slice 1 create the onboarding state in the store when a customer is added, instead of a fallback in the route? The fallback is smaller and safe now; creating it is needed once other tabs write step statuses for new customers. Proposed: fallback now, and the first ticket that writes step status for new customers adds `store.addCustomer` → create state.
2. Should "Done" customers drop off the queue entirely after some days, or stay at the bottom?
3. Is "days since created" the right waiting clock, or should it be days since the last step changed?
