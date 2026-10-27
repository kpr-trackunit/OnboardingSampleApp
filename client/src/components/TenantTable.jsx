import React, { useState } from 'react';
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

function TenantTable({ tenants, onStatusChange, busyCustomerId, onPlanChange }) {
  return (
    <table className="tenant-table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Status</th>
          <th>Plan</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {tenants.map(tenant => (
          <tr key={tenant.id} data-customer-id={tenant.customerId}>
            <td>{tenant.customerName}</td>
            <td>
              <StatusBadge status={tenant.status} />
              {tenant.status === 'failed' && tenant.failureReason && (
                <div className="failure-reason">{tenant.failureReason}</div>
              )}
            </td>
            <td><PlanSelect tenant={tenant} onPlanChange={onPlanChange} /></td>
            <td>{new Date(tenant.createdAt).toLocaleDateString()}</td>
            <td className="tenant-actions">
              <StatusActions
                tenant={tenant}
                onStatusChange={onStatusChange}
                busy={busyCustomerId === tenant.customerId}
              />
            </td>
          </tr>
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

export default TenantTable;
