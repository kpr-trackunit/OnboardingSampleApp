import React, { useState } from 'react';
import { saveCustomer } from '../api';

const ISSUE_STATUSES = ['open', 'in-progress', 'resolved'];

// Per-customer config and issues, shown as an expandable panel on each card in the Customers tab.
export default function CustomerDetails({ customer, onSaved }) {
  return (
    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
      <ConfigEditor customer={customer} onSaved={onSaved} />
      <CustomerIssues customer={customer} onSaved={onSaved} />
    </div>
  );
}

function ConfigEditor({ customer, onSaved }) {
  const [rows, setRows] = useState(
    Object.entries(customer.config || {}).map(([key, value]) => ({ key, value }))
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateRow = (i, field, value) => {
    setSaved(false);
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const config = Object.fromEntries(rows.filter(r => r.key.trim()).map(r => [r.key, r.value]));
      await saveCustomer(customer.id, { config });
      await onSaved();
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ marginBottom: '20px' }}>
      <h4 style={{ marginBottom: '12px' }}>Config</h4>
      {rows.length === 0 && <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '8px' }}>No config yet</p>}
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
          <input
            type="text"
            aria-label="Config key"
            placeholder="key"
            value={row.key}
            onChange={e => updateRow(i, 'key', e.target.value)}
            style={{ padding: '6px 8px' }}
          />
          <input
            type="text"
            aria-label="Config value"
            placeholder="value"
            value={row.value}
            onChange={e => updateRow(i, 'value', e.target.value)}
            style={{ padding: '6px 8px', flex: 1 }}
          />
          <button
            onClick={() => { setSaved(false); setRows(rows.filter((_, idx) => idx !== i)); }}
            aria-label="Remove config row"
          >
            ✕
          </button>
        </div>
      ))}
      <button onClick={() => { setSaved(false); setRows([...rows, { key: '', value: '' }]); }} style={{ padding: '4px 12px' }}>
        + Add config
      </button>
      <div style={{ marginTop: '12px' }}>
        <button onClick={save} disabled={saving} style={{ padding: '6px 16px' }}>
          {saving ? 'Saving...' : 'Save config'}
        </button>
        {saved && <span style={{ marginLeft: '12px', color: '#10b981' }}>Saved</span>}
      </div>
      {error && <p style={{ color: '#dc2626', marginTop: '12px' }}>⚠️ {error}</p>}
    </section>
  );
}

function CustomerIssues({ customer, onSaved }) {
  const issues = customer.issues || [];
  const [title, setTitle] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const saveIssues = async (next) => {
    setSaving(true);
    setError(null);
    try {
      await saveCustomer(customer.id, { issues: next });
      await onSaved();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addIssue = async (e) => {
    e.preventDefault();
    if (await saveIssues([...issues, { title, status: 'open' }])) setTitle('');
  };

  return (
    <section>
      <h4>Issues</h4>
      {issues.length === 0 && (
        <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: '8px 0' }}>No issues</p>
      )}
      <ul className="checklist">
        {issues.map((issue, i) => (
          <li key={i}>
            <span>{issue.title}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <select
                aria-label={`Status of ${issue.title}`}
                value={issue.status}
                disabled={saving}
                onChange={e =>
                  saveIssues(issues.map((x, idx) => (idx === i ? { ...x, status: e.target.value } : x)))
                }
              >
                {ISSUE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                aria-label={`Remove ${issue.title}`}
                disabled={saving}
                onClick={() => saveIssues(issues.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={addIssue} style={{ marginTop: '8px' }}>
        <input
          type="text"
          aria-label={`New issue for ${customer.name}`}
          placeholder="New issue"
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{ padding: '6px 8px', marginRight: '8px', minWidth: '260px' }}
        />
        <button type="submit" disabled={saving || !title.trim()} style={{ padding: '6px 16px' }}>
          Add issue
        </button>
      </form>
      {error && <p style={{ color: '#dc2626', marginTop: '12px' }}>⚠️ {error}</p>}
    </section>
  );
}
