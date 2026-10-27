/**
 * Onboarding queue: one row per customer, built from customers and onboarding states.
 * Pure functions only, so they can be unit tested without the store.
 */
const { createDefaultOnboardingSteps, calculateProgress } = require('./index');

/**
 * @typedef {Object} QueueRow
 * @property {string} customerId - Customer ID
 * @property {string} customerName - Customer name
 * @property {string} customerIndustry - Customer industry ('' if unknown)
 * @property {string} customerRegion - Customer region ('' if unknown)
 * @property {string|null} customerCreatedAt - When the customer was created (ISO timestamp), or null if unknown
 * @property {number|null} daysWaiting - Whole days since the customer was created, or null if unknown
 * @property {import('./index').OnboardingStep[]} steps - The customer's steps, or the default pending steps
 * @property {number} progressPercent - Progress calculated from the steps (0-100)
 * @property {number} openIssueCount - Issues that aren't resolved (0 if none)
 * @property {{ id: string, name: string } | null} currentStep - The step the customer is waiting on, or null when done
 * @property {boolean} needsAttention - True when any step has failed
 */

/**
 * Joins every customer with their onboarding state. A customer without a state
 * gets the default steps (all pending) and 0%. States without a customer are dropped.
 * @param {import('./index').Customer[]} customers
 * @param {import('./index').OnboardingState[]} states
 * @param {Date} [now] - Current time, used for daysWaiting (defaults to the real clock)
 * @returns {QueueRow[]} One row per customer, in customer order
 */
function buildQueue(customers, states, now = new Date()) {
  const stateByCustomer = new Map((states || []).map(s => [s.customerId, s]));
  return (customers || []).map(customer => {
    const steps = stateByCustomer.get(customer.id)?.steps || createDefaultOnboardingSteps();
    return {
      customerId: customer.id,
      customerName: customer.name || 'Unknown',
      customerIndustry: customer.industry || '',
      customerRegion: customer.region || '',
      openIssueCount: openIssueCount(customer.issues),
      customerCreatedAt: customer.createdAt || null,
      daysWaiting: daysWaiting(customer.createdAt, now),
      steps,
      currentStep: currentStep(steps),
      needsAttention: needsAttention(steps),
      progressPercent: calculateProgress(steps)
    };
  });
}

/**
 * Counts a customer's known blockers: issues whose status isn't 'resolved'.
 * @param {{ status: string, title: string }[] | undefined} issues
 * @returns {number} 0 when the list is missing or empty
 */
function openIssueCount(issues) {
  return (issues || []).filter(issue => issue.status !== 'resolved').length;
}

/**
 * @typedef {Object} QueueSummary
 * @property {number} total - Number of rows in the queue
 * @property {number} notStarted - 0% and no failed step
 * @property {number} inProgress - Everything that isn't not started, done or failed
 * @property {number} done - 100% and no failed step
 * @property {number} failed - Any step `failed` (wins over every other bucket)
 */

/**
 * Buckets every queue row into exactly one state, so the counts add up to the total.
 * Failed wins: a partly done customer with a failed step counts as failed.
 * @param {QueueRow[]} queue
 * @returns {QueueSummary}
 */
function summarise(queue) {
  const summary = { total: 0, notStarted: 0, inProgress: 0, done: 0, failed: 0 };
  for (const row of queue || []) {
    summary.total++;
    if ((row.steps || []).some(s => s.status === 'failed')) summary.failed++;
    else if (row.progressPercent >= 100) summary.done++;
    else if (row.progressPercent <= 0) summary.notStarted++;
    else summary.inProgress++;
  }
  return summary;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days a customer has been waiting since they were created, rounded down.
 * @param {string|Date|null|undefined} createdAt - When the customer was created
 * @param {Date} now - Current time (a parameter so it can be tested)
 * @returns {number|null} Whole days (never negative), or null for a missing or invalid date
 */
function daysWaiting(createdAt, now) {
  if (!createdAt) return null;
  const created = new Date(createdAt).getTime();
  const current = new Date(now).getTime();
  if (Number.isNaN(created) || Number.isNaN(current)) return null;
  return Math.max(0, Math.floor((current - created) / MS_PER_DAY));
}

/**
 * The step a customer is waiting on: the lowest-`order` step that isn't `completed`.
 * A `failed` step isn't completed, so it can be the current step.
 *
 * Returned as `{ id, name }` rather than just the name: `id` is a stable key for
 * filtering by step (Slice 9's chips) and `name` is the label to show. Status and
 * order stay on `steps`, so they aren't duplicated here.
 * @param {import('./index').OnboardingStep[]} steps
 * @returns {{ id: string, name: string } | null} The current step, or null when every step is completed
 */
function currentStep(steps) {
  const next = [...(steps || [])]
    .sort((a, b) => a.order - b.order)
    .find(step => step.status !== 'completed');
  return next ? { id: next.id, name: next.name } : null;
}

/**
 * A customer needs attention when any of their steps has failed.
 * @param {import('./index').OnboardingStep[]} steps
 * @returns {boolean}
 */
function needsAttention(steps) {
  return (steps || []).some(step => step.status === 'failed');
}

/**
 * Sort keys for the queue, compared in order: the first key that differs decides.
 * Each key maps a row to a number; lower numbers come first.
 * Add or change keys here to refine the order.
 * @type {Array<(row: QueueRow) => number>}
 */
const QUEUE_SORT_KEYS = [
  // Needs attention first, then active (in progress / not started), done (100%) last
  row => (row.needsAttention ? 0 : row.progressPercent === 100 ? 2 : 1),
  // Oldest customer first. A missing or invalid date sorts last; a finite
  // sentinel (not Infinity) keeps two missing dates comparing equal (0, not NaN).
  row => {
    const t = Date.parse(row.customerCreatedAt);
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
  }
];

/**
 * Compares two queue rows by QUEUE_SORT_KEYS.
 * @param {QueueRow} a
 * @param {QueueRow} b
 * @returns {number}
 */
function compareQueueRows(a, b) {
  for (const key of QUEUE_SORT_KEYS) {
    const diff = key(a) - key(b);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Returns the queue in work order (see QUEUE_SORT_KEYS): rows needing attention
 * first, then active rows oldest first, done rows last. The sort is
 * stable, so rows that compare equal keep their existing order. Does not
 * mutate the input.
 * @param {QueueRow[]} rows
 * @returns {QueueRow[]}
 */
function sortQueue(rows) {
  return [...(rows || [])].sort(compareQueueRows);
}

module.exports = { buildQueue, openIssueCount, summarise, daysWaiting, currentStep, needsAttention, sortQueue, compareQueueRows };
