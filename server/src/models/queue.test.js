const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildQueue, openIssueCount, daysWaiting } = require('./queue');
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

describe('openIssueCount', () => {
  it('should count open and in-progress issues but not resolved ones', () => {
    const issues = [
      { status: 'open', title: 'A' },
      { status: 'in-progress', title: 'B' },
      { status: 'resolved', title: 'C' },
      { status: 'open', title: 'D' }
    ];

    assert.strictEqual(openIssueCount(issues), 3);
  });

  it('should return 0 when every issue is resolved', () => {
    assert.strictEqual(openIssueCount([{ status: 'resolved', title: 'A' }]), 0);
  });

  it('should return 0 for a missing or empty issue list', () => {
    assert.strictEqual(openIssueCount(undefined), 0);
    assert.strictEqual(openIssueCount([]), 0);
  });

  it("should add the count to each queue row", () => {
    const [row] = buildQueue([{ ...acme, issues: [{ status: 'open', title: 'A' }] }], []);

    assert.strictEqual(row.openIssueCount, 1);
  });
});

describe('summarise', () => {
  const { summarise } = require('./queue');

  /** Builds a queue row whose steps have the given statuses, in order. */
  function row(id, statuses) {
    const steps = createDefaultOnboardingSteps().map((s, i) => ({ ...s, status: statuses[i] }));
    const [built] = buildQueue([{ id, name: id }], [{ customerId: id, steps }]);
    return built;
  }

  const notStarted = row('a', ['pending', 'pending', 'pending', 'pending']);
  const inProgress = row('b', ['completed', 'in_progress', 'pending', 'pending']);
  const startedNothingCompleted = row('c', ['in_progress', 'pending', 'pending', 'pending']);
  const done = row('d', ['completed', 'completed', 'completed', 'completed']);
  const partlyDoneAndFailed = row('e', ['completed', 'completed', 'failed', 'pending']);
  const failedFirstStep = row('f', ['failed', 'pending', 'pending', 'pending']);

  it('should count a 0% customer with no failed step as not started', () => {
    assert.deepStrictEqual(summarise([notStarted]), { total: 1, notStarted: 1, inProgress: 0, done: 0, failed: 0 });
  });

  it('should count a partly done customer as in progress', () => {
    assert.deepStrictEqual(summarise([inProgress]), { total: 1, notStarted: 0, inProgress: 1, done: 0, failed: 0 });
  });

  it('should count a 0% customer with an in_progress step as not started (bucketing is by percent)', () => {
    assert.strictEqual(startedNothingCompleted.progressPercent, 0);
    assert.strictEqual(summarise([startedNothingCompleted]).notStarted, 1);
  });

  it('should count a 100% customer as done', () => {
    assert.deepStrictEqual(summarise([done]), { total: 1, notStarted: 0, inProgress: 0, done: 1, failed: 0 });
  });

  it('should count a partly done customer with a failed step as failed, not in progress', () => {
    assert.ok(partlyDoneAndFailed.progressPercent > 0 && partlyDoneAndFailed.progressPercent < 100);
    assert.deepStrictEqual(summarise([partlyDoneAndFailed]), { total: 1, notStarted: 0, inProgress: 0, done: 0, failed: 1 });
  });

  it('should count a 0% customer with a failed step as failed, not not started', () => {
    assert.deepStrictEqual(summarise([failedFirstStep]), { total: 1, notStarted: 0, inProgress: 0, done: 0, failed: 1 });
  });

  it('should put every customer in exactly one bucket, so the counts sum to the total', () => {
    const queue = [notStarted, inProgress, startedNothingCompleted, done, partlyDoneAndFailed, failedFirstStep];
    const s = summarise(queue);

    assert.deepStrictEqual(s, { total: 6, notStarted: 2, inProgress: 1, done: 1, failed: 2 });
    assert.strictEqual(s.notStarted + s.inProgress + s.done + s.failed, s.total);
  });

  it('should return all zeros for an empty queue', () => {
    assert.deepStrictEqual(summarise([]), { total: 0, notStarted: 0, inProgress: 0, done: 0, failed: 0 });
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
