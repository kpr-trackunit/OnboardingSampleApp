import React from 'react';
import './TenantTable.css';

// Next status actions offered per status (mirrors TENANT_STATUS_TRANSITIONS on the server).
// provisioning -> failed exists on the server but its UI (with a reason) comes in slice 3.
const STATUS_ACTIONS = {
  pending: [{ label: 'Start', to: 'provisioning' }],
  provisioning: [{ label: 'Mark active', to: 'active' }],
  active: [],
  failed: []
};

// Matches TENANT_PLANS in server/src/models/index.js
const PLANS = ['starter', 'professional', 'enterprise'];

// Matches TENANT_REGIONS in server/src/models/index.js
const REGIONS = ['North America', 'EU', 'UK', 'APAC'];

function TenantTable({ tenants, onStatusChange, busyCustomerId, onPlanChange, onRegionChange }) {
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
          <tr key={tenant.id} data-customer-id={tenant.customerId}>
            <td>{tenant.customerName}</td>
            <td><StatusBadge status={tenant.status} /></td>
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
        ))}
      </tbody>
    </table>
  );
}

// Only the valid next action(s) for the tenant's current status are shown
function StatusActions({ tenant, onStatusChange, busy }) {
  const actions = STATUS_ACTIONS[tenant.status] || [];
  return actions.map(action => (
    <button
      key={action.to}
      disabled={busy}
      onClick={() => onStatusChange(tenant.customerId, action.to)}
    >
      {action.label}
    </button>
  ));
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
