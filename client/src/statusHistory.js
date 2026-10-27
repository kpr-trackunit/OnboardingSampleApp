/**
 * Pure helpers for a tenant's status history (no React, so they can be unit-tested with node --test).
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * Human-readable length of a span, rounded down to its largest whole unit.
 * @param {number} ms
 * @returns {string} e.g. "less than a minute", "5 minutes", "2 hours", "3 days"
 */
export function formatDuration(ms) {
  if (!(ms >= MINUTE)) return 'less than a minute';
  if (ms < HOUR) return plural(Math.floor(ms / MINUTE), 'minute');
  if (ms < DAY) return plural(Math.floor(ms / HOUR), 'hour');
  return plural(Math.floor(ms / DAY), 'day');
}

/**
 * When the tenant entered its current status: the last history entry, or createdAt if it has none.
 * @param {{ createdAt: string, statusHistory?: { at: string }[] }} tenant
 * @returns {string} ISO timestamp
 */
export function statusSince(tenant) {
  const history = tenant.statusHistory || [];
  return history.length ? history[history.length - 1].at : tenant.createdAt;
}

/**
 * How long the tenant has been in its current status, e.g. "provisioning for 3 days".
 * @param {{ status: string, createdAt: string, statusHistory?: { at: string }[] }} tenant
 * @param {number} [now] - Epoch ms; injectable for tests
 * @returns {string}
 */
export function formatTimeInStatus(tenant, now = Date.now()) {
  return `${tenant.status} for ${formatDuration(now - Date.parse(statusSince(tenant)))}`;
}
