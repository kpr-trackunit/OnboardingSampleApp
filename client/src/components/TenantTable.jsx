import React from 'react';
import './TenantTable.css';

function TenantTable({ tenants }) {
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
            <td>{tenant.plan}</td>
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

export default TenantTable;
