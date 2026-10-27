const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildQueue } = require('./queue');
const { createDefaultOnboardingSteps } = require('./index');

const acme = { id: 'cust_001', name: 'Acme', industry: 'Manufacturing', region: 'EMEA' };
const globex = { id: 'cust_002', name: 'Globex', industry: '', region: '' };

describe('buildQueue', () => {
  it('should return one row per customer, in customer order', () => {
    const queue = buildQueue([acme, globex], []);

    assert.deepStrictEqual(queue.map(r => r.customerId), ['cust_001', 'cust_002']);
  });

  it('should fall back to default pending steps and 0% for a customer with no state', () => {
    const [row] = buildQueue([globex], []);

    assert.deepStrictEqual(row.steps, createDefaultOnboardingSteps());
    assert.ok(row.steps.every(s => s.status === 'pending'));
    assert.strictEqual(row.progressPercent, 0);
  });

  it("should use the customer's own steps and calculate progress from them", () => {
    const steps = createDefaultOnboardingSteps();
    steps[0].status = 'completed';
    const [row] = buildQueue([acme], [{ customerId: 'cust_001', steps, progressPercent: 0 }]);

    assert.strictEqual(row.steps, steps);
    assert.strictEqual(row.progressPercent, 25);
  });

  it('should include customer name, industry and region', () => {
    const [row] = buildQueue([acme], []);

    assert.strictEqual(row.customerName, 'Acme');
    assert.strictEqual(row.customerIndustry, 'Manufacturing');
    assert.strictEqual(row.customerRegion, 'EMEA');
  });

  it('should drop states that have no matching customer', () => {
    const queue = buildQueue([acme], [{ customerId: 'cust_gone', steps: [], progressPercent: 0 }]);

    assert.deepStrictEqual(queue.map(r => r.customerId), ['cust_001']);
  });

  it('should give each fallback row its own steps array', () => {
    const [a, b] = buildQueue([acme, globex], []);

    assert.notStrictEqual(a.steps, b.steps);
  });

  it('should return an empty queue when there are no customers', () => {
    assert.deepStrictEqual(buildQueue([], [{ customerId: 'cust_001', steps: [] }]), []);
  });
});

describe('currentStep', () => {
  const { currentStep } = require('./queue');

  const withStatuses = (...statuses) =>
    createDefaultOnboardingSteps().map((step, i) => ({ ...step, status: statuses[i] }));

  it('should return the first step when none are done', () => {
    const steps = createDefaultOnboardingSteps();

    assert.deepStrictEqual(currentStep(steps), { id: steps[0].id, name: steps[0].name });
  });

  it('should return the lowest-order step that is not completed', () => {
    const steps = withStatuses('completed', 'in_progress', 'pending', 'pending');

    assert.deepStrictEqual(currentStep(steps), { id: steps[1].id, name: steps[1].name });
  });

  it('should go by order, not array position', () => {
    const steps = withStatuses('completed', 'pending', 'pending', 'completed').reverse();
    const expected = steps.find(s => s.order === 2);

    assert.deepStrictEqual(currentStep(steps), { id: expected.id, name: expected.name });
  });

  it('should return null when every step is completed', () => {
    assert.strictEqual(currentStep(withStatuses('completed', 'completed', 'completed', 'completed')), null);
  });

  it('should treat a failed step as the current step', () => {
    const steps = withStatuses('completed', 'completed', 'failed', 'pending');

    assert.deepStrictEqual(currentStep(steps), { id: steps[2].id, name: steps[2].name });
  });

  it('should be on each queue row', () => {
    const steps = withStatuses('completed', 'pending', 'pending', 'pending');
    const [done, fresh] = buildQueue(
      [acme, globex],
      [
        { customerId: 'cust_001', steps: withStatuses('completed', 'completed', 'completed', 'completed') },
        { customerId: 'cust_002', steps }
      ]
    );

    assert.strictEqual(done.currentStep, null);
    assert.deepStrictEqual(fresh.currentStep, { id: steps[1].id, name: steps[1].name });
  });
});
