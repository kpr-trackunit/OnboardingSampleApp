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
      daysWaiting: daysWaiting(customer.createdAt, now),
      steps,
      progressPercent: calculateProgress(steps)
    };
  });
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

module.exports = { buildQueue, daysWaiting };
