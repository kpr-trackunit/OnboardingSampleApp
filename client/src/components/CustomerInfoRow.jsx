import React, { useState } from 'react';
import { useRegions, regionOptions } from '../regions';

// One customer's row. Blank or whitespace-only values show "Missing".
// Edit turns the field cells into inputs (region is a dropdown of the server's
// regions); Save sends them through onSave and, if the save fails, stays in
// edit mode with the server's message next to each invalid field.
function CustomerInfoRow({ customer, fields, onSave }) {
  const regions = useRegions();
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
                <FieldInput
                  field={field}
                  value={draft[field.key]}
                  onChange={value => setDraft(d => ({ ...d, [field.key]: value }))}
                  disabled={saving}
                  errorId={fieldErrors[field.key] ? `${customer.id}-${field.key}-error` : undefined}
                  regions={regions}
                />
                {fieldErrors[field.key] && (
                  <div className="field-error" id={`${customer.id}-${field.key}-error`}>
                    {fieldErrors[field.key]}
                  </div>
                )}
              </>
            )
            : <FieldValue value={customer[field.key]} />}
        </td>
      ))}
      <td className="row-actions">
        {editing
          ? (
            <>
              <button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              <button onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
              {/* Field errors show next to their fields; this is for anything else */}
              {error && Object.keys(fieldErrors).length === 0 && (
                <div className="row-error" role="alert">⚠️ {error}</div>
              )}
            </>
          )
          : <button onClick={startEditing}>Edit</button>}
      </td>
    </tr>
  );
}

// Region is a dropdown of the allowed regions plus a blank option (blank is
// "missing", not invalid). A current value that isn't in the list is offered
// too, so opening Edit doesn't lose it; the server rejects it on Save.
function FieldInput({ field, value, onChange, disabled, errorId, regions }) {
  const common = {
    'aria-label': field.label,
    value,
    onChange: e => onChange(e.target.value),
    disabled,
    'aria-invalid': errorId ? true : undefined,
    'aria-describedby': errorId
  };
  if (field.key === 'region') {
    return (
      <select {...common}>
        <option value="" />
        {regionOptions(regions, value).map(region => (
          <option key={region} value={region}>{region}</option>
        ))}
      </select>
    );
  }
  return <input type="text" {...common} />;
}

function FieldValue({ value }) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return <span className="missing">Missing</span>;
  return text;
}

export default CustomerInfoRow;
