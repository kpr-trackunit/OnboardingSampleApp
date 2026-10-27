import React, { useState, useEffect } from 'react';
import TenantSetupTab from './components/TenantSetupTab';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'customers', label: 'Customers' },
  { id: 'customer-info', label: 'Customer Info' },
  { id: 'data-mapping', label: 'Data Mapping' },
  { id: 'tenant-setup', label: 'Tenant Setup' },
  { id: 'import', label: 'Import' }
];

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [onboardingData, setOnboardingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customers, setCustomers] = useState([]);

  const loadCustomers = () =>
    fetch('/api/customers')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(setCustomers)
      .catch(err => console.error('Failed to fetch customers:', err));

  const loadOnboarding = () =>
    fetch('/api/onboarding')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid response format');
        return data;
      })
      .then(data => {
        setOnboardingData(data);
        setError(null);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch onboarding data:', err);
        setError(err.message);
        setOnboardingData([]);
        setLoading(false);
      });

  useEffect(() => {
    loadCustomers();
  }, []);

  // Re-fetch whenever the Dashboard is shown, so changes made on other tabs
  // (e.g. a tenant marked active) are reflected
  useEffect(() => {
    if (activeTab === 'dashboard') loadOnboarding();
  }, [activeTab]);

  return (
    <div className="app">
      <header>
        <h1>Onboarding Dashboard</h1>
        <p>Customer Success Team - Internal Tool</p>
      </header>

      <nav className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {activeTab === 'dashboard' && (
          <DashboardTab data={onboardingData} loading={loading} error={error} />
        )}
        {activeTab === 'customers' && <CustomerListTab customers={customers} onSaved={loadCustomers} />}
        {activeTab === 'customer-info' && (
          <PlaceholderTab title="Customer Info" description="Collect and validate customer information" />
        )}
        {activeTab === 'data-mapping' && (
          <DataMappingTab customers={customers} onSaved={loadCustomers} />
        )}
        {activeTab === 'tenant-setup' && (
          <>
            <TenantSetupTab />
            <CustomerIssuesTab customers={customers} onSaved={loadCustomers} />
          </>
        )}
        {activeTab === 'import' && <ImportTab />}
      </main>
    </div>
  );
}

function DashboardTab({ data, loading, error }) {
  if (loading) {
    return <div className="placeholder"><p>Loading...</p></div>;
  }

  if (error) {
    return (
      <div className="placeholder">
        <p style={{ color: '#dc2626' }}>⚠️ Failed to load onboarding data</p>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return <div className="placeholder"><p>No customers in the onboarding queue</p></div>;
  }

  return (
    <div>
      <h2>Onboarding Queue</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        {data.length} customer(s) awaiting onboarding
      </p>

      {data.map(item => (
        <div key={item.customerId} className="customer-card">
          <h3>{item.customerName}</h3>
          <div className="customer-meta">
            <span>📍 {item.customerRegion}</span>
            <span>🏭 {item.customerIndustry}</span>
          </div>

          <div className="progress-section">
            <ProgressBar percent={item.progressPercent} />
            <Checklist steps={item.steps} />
          </div>
        </div>
      ))}
    </div>
  );
}

async function saveCustomer(id, updates) {
  const res = await fetch(`/api/customers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}

function AddCustomerForm({ onAdded }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setName('');
      await onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: '24px' }}>
      <input
        type="text"
        aria-label="Customer name"
        placeholder="New customer name"
        value={name}
        onChange={e => setName(e.target.value)}
        required
        style={{ padding: '8px 12px', marginRight: '8px', minWidth: '260px' }}
      />
      <button type="submit" disabled={saving || !name.trim()} style={{ padding: '8px 16px' }}>
        {saving ? 'Saving...' : 'Add Customer'}
      </button>
      {error && <p style={{ color: '#dc2626', marginTop: '12px' }}>⚠️ {error}</p>}
    </form>
  );
}

function CustomerListTab({ customers, onSaved }) {
  return (
    <div>
      <h2>Customers</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>{customers.length} customer(s)</p>
      <AddCustomerForm onAdded={onSaved} />
      {customers.length === 0 && <div className="placeholder"><p>No customers yet</p></div>}
      {customers.map(c => (
        <CustomerCard key={c.id} customer={c} onSaved={onSaved} />
      ))}
    </div>
  );
}

function CustomerCard({ customer, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveCustomer(customer.id, { name });
      await onSaved();
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    const unresolved = (customer.issues || []).filter(i => i.status !== 'resolved').length;
    return (
      <div className="customer-card">
        <h3>{customer.name}</h3>
        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>{unresolved} unresolved issue(s)</p>
        <button
          onClick={() => { setName(customer.name); setError(null); setEditing(true); }}
          style={{ marginTop: '8px', padding: '4px 12px' }}
        >
          Edit name
        </button>
      </div>
    );
  }

  return (
    <div className="customer-card">
      <input
        type="text"
        aria-label="Customer name"
        value={name}
        onChange={e => setName(e.target.value)}
        style={{ padding: '8px 12px', minWidth: '260px', marginRight: '8px' }}
      />
      <button onClick={save} disabled={saving || !name.trim()} style={{ padding: '6px 16px', marginRight: '8px' }}>
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button onClick={() => setEditing(false)} disabled={saving} style={{ padding: '6px 16px' }}>Cancel</button>
      {error && <p style={{ color: '#dc2626', marginTop: '12px' }}>⚠️ {error}</p>}
    </div>
  );
}

function DataMappingTab({ customers, onSaved }) {
  const [selectedId, setSelectedId] = useState('');
  const customer = customers.find(c => c.id === selectedId);

  return (
    <div>
      <h2>Data Mapping</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>Per-customer config used to map data to the platform.</p>
      <select
        aria-label="Select customer"
        value={selectedId}
        onChange={e => setSelectedId(e.target.value)}
        style={{ padding: '8px 12px', marginBottom: '20px', minWidth: '260px' }}
      >
        <option value="">Select a customer...</option>
        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {customer && <ConfigEditor key={customer.id} customer={customer} onSaved={onSaved} />}
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
    <div className="customer-card">
      <h3 style={{ marginBottom: '12px' }}>{customer.name} config</h3>
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
    </div>
  );
}

const ISSUE_STATUSES = ['open', 'in-progress', 'resolved'];

function CustomerIssuesTab({ customers, onSaved }) {
  const openCount = customers.reduce(
    (n, c) => n + (c.issues || []).filter(i => i.status !== 'resolved').length,
    0
  );

  return (
    <div>
      <h2>Customer Issues</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        {openCount} unresolved issue(s) across {customers.length} customer(s)
      </p>
      {customers.map(c => (
        <CustomerIssues key={c.id} customer={c} onSaved={onSaved} />
      ))}
    </div>
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
    <div className="customer-card">
      <h3>{customer.name}</h3>
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
          placeholder="New tenant setup issue"
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{ padding: '6px 8px', marginRight: '8px', minWidth: '260px' }}
        />
        <button type="submit" disabled={saving || !title.trim()} style={{ padding: '6px 16px' }}>
          Add issue
        </button>
      </form>
      {error && <p style={{ color: '#dc2626', marginTop: '12px' }}>⚠️ {error}</p>}
    </div>
  );
}

function ProgressBar({ percent }) {
  return (
    <div className="progress-bar-container">
      <div 
        className="progress-bar" 
        style={{ width: `${Math.max(percent, 0)}%` }}
      >
        {percent > 0 ? `${percent}%` : ''}
      </div>
    </div>
  );
}

function Checklist({ steps }) {
  return (
    <ul className="checklist">
      {steps.map(step => (
        <li key={step.id}>
          <span className={`step-status ${step.status}`}>
            {step.status === 'completed' ? '✓' : step.order}
          </span>
          <span>{step.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#9ca3af' }}>
            {step.status.replace('_', ' ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ImportTab() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch('/api/import/sources')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setSources(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch import sources:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  async function runImport(source, file) {
    const key = `${source.sourceKey}-${file.entity}`;
    setImporting(key);
    try {
      const url = `/api/import/${source.sourceKey}/${file.entity}`;
      const res = await fetch(url, { method: 'POST' });
      const summary = await res.json();
      if (!res.ok) throw new Error(summary.error || `HTTP ${res.status}`);

      const records = await fetch(url).then(r => r.json());
      setResult({ source, summary, records, error: null });
    } catch (err) {
      console.error('Import failed:', err);
      setResult({ source, summary: { entity: file.entity }, records: [], error: err.message });
    } finally {
      setImporting(null);
    }
  }

  if (loading) {
    return <div className="placeholder"><p>Loading...</p></div>;
  }

  if (error) {
    return (
      <div className="placeholder">
        <p style={{ color: '#dc2626' }}>⚠️ Failed to load import sources</p>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>{error}</p>
      </div>
    );
  }

  if (sources.length === 0) {
    return <div className="placeholder"><p>No customer data waiting to be imported</p></div>;
  }

  return (
    <div>
      <h2>Import</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        {sources.length} source(s) with data waiting to be imported
      </p>

      <table className="data-table sources-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Entity</th>
            <th>File</th>
            <th>Rows</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sources.map(source => source.files.map((file, index) => (
            <tr key={`${source.sourceKey}-${file.entity}`} data-source={source.sourceKey}>
              {index === 0 && <td rowSpan={source.files.length} className="source-label">{source.label}</td>}
              <td>{file.entity}</td>
              <td><code>{file.filename}</code></td>
              <td>{file.rowCount} rows</td>
              <td>
                {file.importable ? (
                  <button
                    className="button"
                    disabled={importing !== null}
                    onClick={() => runImport(source, file)}
                  >
                    {importing === `${source.sourceKey}-${file.entity}` ? 'Importing...' : `Import ${file.entity}`}
                  </button>
                ) : (
                  <span className="muted">No mapping yet</span>
                )}
              </td>
            </tr>
          )))}
        </tbody>
      </table>

      {result && <ImportResult {...result} />}
    </div>
  );
}

function ImportResult({ source, summary, records, error }) {
  if (error) {
    return (
      <div className="import-result">
        <p style={{ color: '#dc2626' }}>⚠️ Failed to import {summary.entity} for {source.label}: {error}</p>
      </div>
    );
  }

  // Show canonical fields; picklist originals (<field>Source) appear under their standard value
  const columns = records.length > 0
    ? Object.keys(records[0]).filter(key => !['id', 'customerId'].includes(key) && !key.endsWith('Source'))
    : [];

  return (
    <div className="import-result">
      <h3>{source.label}</h3>
      <p className="import-summary">
        Imported {summary.imported} {summary.entity}
        {summary.rejected > 0 && `, ${summary.rejected} rejected`}
      </p>

      <table className="data-table records-table">
        <thead>
          <tr>{columns.map(column => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {records.map(record => (
            <tr key={record.id}>
              {columns.map(column => (
                <td key={column}>
                  {formatValue(record[column])}
                  {record[`${column}Source`] !== undefined && record[`${column}Source`] !== record[column] && (
                    <div className="muted">{record[`${column}Source`]}</div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

function PlaceholderTab({ title, description }) {
  return (
    <div className="placeholder">
      <h2>{title}</h2>
      <p>{description}</p>
      <p style={{ marginTop: '20px', fontSize: '0.9rem' }}>
        🚧 This section is ready to be built
      </p>
    </div>
  );
}

export default App;
