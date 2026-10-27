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
