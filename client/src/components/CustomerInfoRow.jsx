import React from 'react';

// One customer's row. Blank or whitespace-only values show "Missing".
function CustomerInfoRow({ customer, fields }) {
  return (
    <tr data-customer-id={customer.id}>
      <td className="customer-name">{customer.name}</td>
      {fields.map(field => (
        <td key={field.key} data-field={field.key}>
          <FieldValue value={customer[field.key]} />
        </td>
      ))}
    </tr>
  );
}

function FieldValue({ value }) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return <span className="missing">Missing</span>;
  return text;
}

export default CustomerInfoRow;
