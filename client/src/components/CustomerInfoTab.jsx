import React, { useState, useEffect } from 'react';
import CustomerInfoTable from './CustomerInfoTable';
import { CompletenessCount } from './CompletenessBadge';
import { saveCustomer } from '../api';

// Customer Info (onboarding step 1): one row per customer with the basics CS
// needs before onboarding starts. App.jsx mounts this only while the tab is
// shown, so fetching on mount re-fetches every time the tab opens.
function CustomerInfoTab() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/customers')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid response format');
        return data;
      })
      .then(data => {
        setCustomers(data);
        setError(null);
      })
      .catch(err => {
        console.error('Failed to fetch customers:', err);
        setError(err.message);
        setCustomers([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Saves one customer's info, then re-fetches the list so anything the
  // server derives from it (e.g. missingInfo for the completeness badge) is
  // fresh. If the re-fetch fails, the saved customer is swapped in instead.
  // Save errors are re-thrown so the row can show them and stay in edit mode.
  const handleSave = async (id, info) => {
    const saved = await saveCustomer(id, info);
    try {
      const res = await fetch('/api/customers');
      const data = res.ok ? await res.json() : null;
      if (!Array.isArray(data)) throw new Error('Re-fetch failed');
      setCustomers(data);
    } catch {
      setCustomers(prev => prev.map(c => (c.id === id ? saved : c)));
    }
    return saved;
  };

  if (loading) {
    return <div className="placeholder"><p>Loading...</p></div>;
  }

  if (error) {
    return (
      <div className="placeholder">
        <p style={{ color: '#dc2626' }}>⚠️ Failed to load customers</p>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Customer Info</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        Industry, region and contact email for each customer
      </p>
      {customers.length > 0 && <CompletenessCount customers={customers} />}
      {customers.length === 0
        ? <div className="placeholder"><p>No customers yet</p></div>
        : <CustomerInfoTable customers={customers} onSave={handleSave} />}
    </div>
  );
}

export default CustomerInfoTab;
