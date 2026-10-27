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
 * @property {number|null} daysWaiting - Whole days since the customer was created, or null if unknown
 * @property {import('./index').OnboardingStep[]} steps - The customer's steps, or the default pending steps
 * @property {number} progressPercent - Progress calculated from the steps (0-100)
 * @property {number} openIssueCount - Issues that aren't resolved (0 if none)
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
      daysWaiting: daysWaiting(customer.createdAt, now),
      steps,
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

module.exports = { buildQueue, openIssueCount, summarise, daysWaiting };
