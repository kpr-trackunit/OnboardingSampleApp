import React, { useState } from 'react';
import CompletenessBadge from './CompletenessBadge';

// One customer's row. Blank or whitespace-only values show "Missing".
// Edit turns the field cells into inputs; Save sends them through onSave and,
// if the save fails, stays in edit mode with the error shown.
function CustomerInfoRow({ customer, fields, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Per-field messages from the server, keyed by field
  const [fieldErrors, setFieldErrors] = useState({});

  const startEditing = () => {
    setDraft(Object.fromEntries(fields.map(f => [f.key, customer[f.key] || ''])));
    setError(null);
    setFieldErrors({});
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await onSave(customer.id, draft);
      setEditing(false);
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.errors || {});
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr data-customer-id={customer.id} className={editing ? 'editing' : undefined}>
      <td className="customer-name">{customer.name}</td>
      {fields.map(field => (
        <td key={field.key} data-field={field.key}>
          {editing
            ? (
              <>
                <input
                  type="text"
                  aria-label={field.label}
                  value={draft[field.key]}
                  onChange={e => setDraft(d => ({ ...d, [field.key]: e.target.value }))}
                  disabled={saving}
                  aria-invalid={fieldErrors[field.key] ? true : undefined}
                />
                {fieldErrors[field.key] && (
                  <div className="field-error">{fieldErrors[field.key]}</div>
                )}
              </>
            )
            : <FieldValue value={customer[field.key]} />}
        </td>
      ))}
      <td className="completeness"><CompletenessBadge missing={customer.missingInfo} /></td>
      <td className="row-actions">
        {editing
          ? (
            <>
              <button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              <button onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
              {error && <div className="row-error" role="alert">⚠️ {error}</div>}
            </>
          )
          : <button onClick={startEditing}>Edit</button>}
      </td>
    </tr>
  );
}

function FieldValue({ value }) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return <span className="missing">Missing</span>;
  return text;
}

export default CustomerInfoRow;
