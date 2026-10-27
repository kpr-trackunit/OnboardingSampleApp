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
 * @property {import('./index').OnboardingStep[]} steps - The customer's steps, or the default pending steps
 * @property {number} progressPercent - Progress calculated from the steps (0-100)
 * @property {{ id: string, name: string } | null} currentStep - The step the customer is waiting on, or null when done
 */

/**
 * Joins every customer with their onboarding state. A customer without a state
 * gets the default steps (all pending) and 0%. States without a customer are dropped.
 * @param {import('./index').Customer[]} customers
 * @param {import('./index').OnboardingState[]} states
 * @returns {QueueRow[]} One row per customer, in customer order
 */
function buildQueue(customers, states) {
  const stateByCustomer = new Map((states || []).map(s => [s.customerId, s]));
  return (customers || []).map(customer => {
    const steps = stateByCustomer.get(customer.id)?.steps || createDefaultOnboardingSteps();
    return {
      customerId: customer.id,
      customerName: customer.name || 'Unknown',
      customerIndustry: customer.industry || '',
      customerRegion: customer.region || '',
      steps,
      currentStep: currentStep(steps),
      progressPercent: calculateProgress(steps)
    };
  });
}

module.exports = { buildQueue };

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

module.exports.currentStep = currentStep;
