import React from 'react';
import './TenantTable.css';

// Matches TENANT_PLANS in server/src/models/index.js
const PLANS = ['starter', 'professional', 'enterprise'];

function TenantTable({ tenants, onPlanChange }) {
  return (
    <table className="tenant-table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Status</th>
          <th>Plan</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {tenants.map(tenant => (
          <tr key={tenant.id} data-customer-id={tenant.customerId}>
            <td>{tenant.customerName}</td>
            <td><StatusBadge status={tenant.status} /></td>
            <td><PlanSelect tenant={tenant} onPlanChange={onPlanChange} /></td>
            <td>{new Date(tenant.createdAt).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
