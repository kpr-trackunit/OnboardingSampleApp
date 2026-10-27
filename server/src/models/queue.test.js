const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildQueue, openIssueCount } = require('./queue');
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
