import React from 'react';
import CustomerInfoRow from './CustomerInfoRow';
import './CustomerInfoTable.css';

// The info fields shown per customer, in column order
export const INFO_FIELDS = [
  { key: 'industry', label: 'Industry' },
  { key: 'region', label: 'Region' },
  { key: 'contactEmail', label: 'Contact email' }
];

function CustomerInfoTable({ customers }) {
  return (
    <table className="customer-info-table">
      <thead>
        <tr>
          <th>Customer</th>
          {INFO_FIELDS.map(field => <th key={field.key}>{field.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {customers.map(customer => (
          <CustomerInfoRow key={customer.id} customer={customer} fields={INFO_FIELDS} />
        ))}
      </tbody>
    </table>
  );
}

export default CustomerInfoTable;
