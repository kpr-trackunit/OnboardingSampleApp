import React, { useState } from 'react';
import { formatTimeInStatus } from '../statusHistory';
import './TenantTable.css';

// Next status actions offered per status (mirrors TENANT_STATUS_TRANSITIONS on the server).
// needsReason: the action asks for a failure reason before it is sent.
const STATUS_ACTIONS = {
  pending: [{ label: 'Start', to: 'provisioning' }],
  provisioning: [
    { label: 'Mark active', to: 'active' },
    { label: 'Mark failed', to: 'failed', needsReason: true }
  ],
  active: [],
  failed: [{ label: 'Retry', to: 'provisioning' }]
};

// Matches TENANT_PLANS in server/src/models/index.js
const PLANS = ['starter', 'professional', 'enterprise'];

// Matches TENANT_REGIONS in server/src/models/index.js
const REGIONS = ['North America', 'EU', 'UK', 'APAC'];

// Number of header columns; the history sub-row spans them all
const COLUMN_COUNT = 6;

function TenantTable({ tenants, onStatusChange, busyCustomerId, onPlanChange, onRegionChange }) {
  // customerIds whose history sub-row is open
  const [openHistory, setOpenHistory] = useState(() => new Set());
  const toggleHistory = customerId => setOpenHistory(current => {
    const next = new Set(current);
    if (next.has(customerId)) next.delete(customerId);
    else next.add(customerId);
    return next;
  });

  return (
    <table className="tenant-table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Status</th>
          <th>Plan</th>
          <th>Region</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {tenants.map(tenant => (
          <React.Fragment key={tenant.id}>
          <tr data-customer-id={tenant.customerId}>
            <td>{tenant.customerName}</td>
            <td>
              <StatusBadge status={tenant.status} />
              {tenant.status === 'failed' && tenant.failureReason && (
                <div className="failure-reason">{tenant.failureReason}</div>
              )}
              <HistoryToggle
                tenant={tenant}
                open={openHistory.has(tenant.customerId)}
                onToggle={() => toggleHistory(tenant.customerId)}
              />
            </td>
            <td><PlanSelect tenant={tenant} onPlanChange={onPlanChange} /></td>
            <td><RegionSelect tenant={tenant} onRegionChange={onRegionChange} /></td>
            <td>{new Date(tenant.createdAt).toLocaleDateString()}</td>
            <td className="tenant-actions">
              <StatusActions
                tenant={tenant}
                onStatusChange={onStatusChange}
                busy={busyCustomerId === tenant.customerId}
              />
            </td>
          </tr>
          {openHistory.has(tenant.customerId) && <HistoryRow tenant={tenant} />}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

// Only the valid next action(s) for the tenant's current status are shown.
// An action that needs a reason opens an inline form instead of firing straight away.
function StatusActions({ tenant, onStatusChange, busy }) {
  const [reasonAction, setReasonAction] = useState(null);
  const actions = STATUS_ACTIONS[tenant.status] || [];

  if (reasonAction && actions.includes(reasonAction)) {
    return (
      <ReasonForm
        action={reasonAction}
        busy={busy}
        onCancel={() => setReasonAction(null)}
        onSubmit={async reason => {
          if (await onStatusChange(tenant.customerId, reasonAction.to, reason)) {
            setReasonAction(null);
          }
        }}
      />
    );
  }

  return actions.map(action => (
    <button
      key={action.to}
      disabled={busy}
      onClick={() =>
        action.needsReason ? setReasonAction(action) : onStatusChange(tenant.customerId, action.to)
      }
    >
      {action.label}
    </button>
  ));
}

// Inline reason prompt; it can't be submitted while the reason is blank
function ReasonForm({ action, busy, onCancel, onSubmit }) {
  const [reason, setReason] = useState('');
  const blank = reason.trim() === '';

  return (
    <form
      className="reason-form"
      onSubmit={e => {
        e.preventDefault();
        if (!blank) onSubmit(reason.trim());
      }}
    >
      <input
        type="text"
        aria-label="Failure reason"
        placeholder="Why did it fail?"
        value={reason}
        onChange={e => setReason(e.target.value)}
        autoFocus
      />
      <button type="submit" disabled={busy || blank}>{action.label}</button>
      <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
    </form>
  );
}

// Opens/closes the row's status history timeline
function HistoryToggle({ tenant, open, onToggle }) {
  return (
    <button
      type="button"
      className="history-toggle"
      aria-expanded={open}
      aria-controls={`history-${tenant.id}`}
      onClick={onToggle}
    >
      {open ? 'Hide history' : 'History'}
    </button>
  );
}

// Sub-row under a tenant: how long it has been in its current status, then every
// status change (oldest first) with its time, and the reason on failed entries
function HistoryRow({ tenant }) {
  const history = tenant.statusHistory || [];
  return (
    <tr className="history-row" id={`history-${tenant.id}`} data-history-for={tenant.customerId}>
      <td colSpan={COLUMN_COUNT}>
        <div className="time-in-status">{formatTimeInStatus(tenant)}</div>
        {history.length === 0 ? (
          <p className="history-empty">No status changes yet.</p>
        ) : (
          <ol className="status-timeline">
            {history.map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="history-entry">
                <span className="history-transition">{entry.from} → {entry.to}</span>
                <time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time>
                {entry.reason && <span className="history-reason">{entry.reason}</span>}
              </li>
            ))}
          </ol>
        )}
      </td>
    </tr>
  );
}

// Colour comes from the status class: pending | provisioning | active | failed
function StatusBadge({ status }) {
  return <span className={`status-badge ${status}`}>{status}</span>;
}

// Plan can be changed at any status; saves as soon as a new plan is picked
function PlanSelect({ tenant, onPlanChange }) {
  return (
    <select
      className="plan-select"
      aria-label={`Plan for ${tenant.customerName}`}
      value={tenant.plan}
      onChange={e => onPlanChange(tenant.customerId, e.target.value)}
    >
      {PLANS.map(plan => <option key={plan} value={plan}>{plan}</option>)}
    </select>
  );
}

// Region can be changed at any status; saves as soon as a new region is picked.
// A region prefilled from the customer that isn't in the list is still offered, so it isn't lost.
function RegionSelect({ tenant, onRegionChange }) {
  const regions = tenant.region && !REGIONS.includes(tenant.region)
    ? [tenant.region, ...REGIONS]
    : REGIONS;
  return (
    <select
      className="region-select"
      aria-label={`Region for ${tenant.customerName}`}
      value={tenant.region || ''}
      onChange={e => onRegionChange(tenant.customerId, e.target.value)}
    >
      {!tenant.region && <option value="" disabled>Select region</option>}
      {regions.map(region => <option key={region} value={region}>{region}</option>)}
    </select>
  );
}

export default TenantTable;
