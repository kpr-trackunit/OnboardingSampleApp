const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildQueue, needsAttention, daysWaiting, sortQueue } = require('./queue');
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

describe('daysWaiting', () => {
  const now = new Date('2025-02-01T12:00:00Z');

  it('should be 0 on the same day', () => {
    assert.strictEqual(daysWaiting('2025-02-01T08:00:00Z', now), 0);
  });

  it('should count whole days', () => {
    assert.strictEqual(daysWaiting('2025-01-20T12:00:00Z', now), 12);
    assert.strictEqual(daysWaiting('2025-01-31T12:00:00Z', now), 1);
  });

  it('should round a partial day down', () => {
    assert.strictEqual(daysWaiting('2025-01-30T13:00:00Z', now), 1);
  });

  it('should return null for a missing date', () => {
    assert.strictEqual(daysWaiting(undefined, now), null);
    assert.strictEqual(daysWaiting(null, now), null);
    assert.strictEqual(daysWaiting('', now), null);
  });

  it('should return null for an invalid date', () => {
    assert.strictEqual(daysWaiting('not a date', now), null);
  });

  it('should be added to each queue row, using the given now', () => {
    const [withDate, withoutDate] = buildQueue(
      [{ ...acme, createdAt: '2025-01-20T12:00:00Z' }, globex], [], now
    );

    assert.strictEqual(withDate.daysWaiting, 12);
    assert.strictEqual(withoutDate.daysWaiting, null);
  });
});
