const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildQueue, needsAttention, sortQueue } = require('./queue');
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

describe('needsAttention', () => {
  it('should be false when no step has failed', () => {
    const steps = createDefaultOnboardingSteps();
    steps[0].status = 'completed';
    steps[1].status = 'in_progress';

    assert.strictEqual(needsAttention(steps), false);
    assert.strictEqual(buildQueue([acme], [{ customerId: 'cust_001', steps }])[0].needsAttention, false);
  });

  it('should be true when any step has failed', () => {
    const steps = createDefaultOnboardingSteps();
    steps[0].status = 'completed';
    steps[2].status = 'failed';

    assert.strictEqual(needsAttention(steps), true);
    assert.strictEqual(buildQueue([acme], [{ customerId: 'cust_001', steps }])[0].needsAttention, true);
  });

  it('should be false for a customer with no state (default pending steps)', () => {
    assert.strictEqual(buildQueue([globex], [])[0].needsAttention, false);
  });
});

describe('sortQueue', () => {
  const row = (customerId, attention) => ({ customerId, needsAttention: attention });

  it('should list rows needing attention first, keeping the existing order within each group', () => {
    const rows = [row('a', false), row('b', true), row('c', false), row('d', true), row('e', false)];

    assert.deepStrictEqual(sortQueue(rows).map(r => r.customerId), ['b', 'd', 'a', 'c', 'e']);
  });

  it('should keep the existing order when nothing needs attention', () => {
    const rows = [row('a', false), row('b', false), row('c', false)];

    assert.deepStrictEqual(sortQueue(rows).map(r => r.customerId), ['a', 'b', 'c']);
  });

  it('should not mutate the input', () => {
    const rows = [row('a', false), row('b', true)];

    sortQueue(rows);

    assert.deepStrictEqual(rows.map(r => r.customerId), ['a', 'b']);
  });

  it('should return an empty array for an empty queue', () => {
    assert.deepStrictEqual(sortQueue([]), []);
  });
});
