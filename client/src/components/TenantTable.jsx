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

function TenantTable({ tenants, onStatusChange, busyCustomerId }) {
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
            <td><StatusBadge status={tenant.status} /></td>
            <td>{tenant.plan}</td>
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

export default TenantTable;
