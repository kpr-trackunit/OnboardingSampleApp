import React, { useState, useEffect } from 'react';
import { saveCustomer } from './api';
import CustomerDetails from './components/CustomerDetails';
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
          <PlaceholderTab title="Data Mapping" description="Map customer data to platform configuration" />
        )}
        {activeTab === 'tenant-setup' && (
          <TenantSetupTab />
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
  const [showDetails, setShowDetails] = useState(false);
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
          style={{ marginTop: '8px', marginRight: '8px', padding: '4px 12px' }}
        >
          Edit name
        </button>
        <button
          onClick={() => setShowDetails(!showDetails)}
          aria-expanded={showDetails}
          style={{ marginTop: '8px', padding: '4px 12px' }}
        >
          {showDetails ? 'Hide config & issues' : 'Config & issues'}
        </button>
        {showDetails && <CustomerDetails customer={customer} onSaved={onSaved} />}
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
