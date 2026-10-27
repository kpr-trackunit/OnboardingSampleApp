import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatDuration, statusSince, formatTimeInStatus } from './statusHistory.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatDuration', () => {
  it('rounds down to the largest whole unit, with plurals', () => {
    assert.strictEqual(formatDuration(0), 'less than a minute');
    assert.strictEqual(formatDuration(59 * 1000), 'less than a minute');
    assert.strictEqual(formatDuration(MINUTE), '1 minute');
    assert.strictEqual(formatDuration(59 * MINUTE + 59 * 1000), '59 minutes');
    assert.strictEqual(formatDuration(HOUR), '1 hour');
    assert.strictEqual(formatDuration(23 * HOUR), '23 hours');
    assert.strictEqual(formatDuration(DAY), '1 day');
    assert.strictEqual(formatDuration(3 * DAY + 5 * HOUR), '3 days');
  });

  it('treats a negative or invalid span (clock skew, bad date) as less than a minute', () => {
    assert.strictEqual(formatDuration(-5 * MINUTE), 'less than a minute');
    assert.strictEqual(formatDuration(NaN), 'less than a minute');
  });
});

describe('statusSince / formatTimeInStatus', () => {
  const createdAt = '2025-01-15T10:00:00.000Z';
  const created = Date.parse(createdAt);

  it('counts from createdAt when there is no history', () => {
    const tenant = { status: 'pending', createdAt, statusHistory: [] };
    assert.strictEqual(statusSince(tenant), createdAt);
    assert.strictEqual(formatTimeInStatus(tenant, created + 2 * HOUR), 'pending for 2 hours');
    // Tenants from before history existed have no statusHistory at all
    assert.strictEqual(formatTimeInStatus({ status: 'pending', createdAt }, created + DAY), 'pending for 1 day');
  });

  it('counts from the last history entry', () => {
    const tenant = {
      status: 'provisioning',
      createdAt,
      statusHistory: [
        { at: '2025-01-16T10:00:00.000Z', from: 'pending', to: 'provisioning' },
        { at: '2025-01-17T10:00:00.000Z', from: 'provisioning', to: 'failed', reason: 'x' },
        { at: '2025-01-18T10:00:00.000Z', from: 'failed', to: 'provisioning' }
      ]
    };
    assert.strictEqual(statusSince(tenant), '2025-01-18T10:00:00.000Z');
    const now = Date.parse('2025-01-21T11:00:00.000Z');
    assert.strictEqual(formatTimeInStatus(tenant, now), 'provisioning for 3 days');
  });
});
