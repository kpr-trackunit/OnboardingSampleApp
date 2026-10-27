import React, { useState, useEffect } from 'react';
import CustomerInfoTable from './CustomerInfoTable';
import { CompletenessCount } from './CompletenessBadge';

// Customer Info (onboarding step 1): one row per customer with the basics CS
// needs before onboarding starts. App.jsx mounts this only while the tab is
// shown, so fetching on mount re-fetches every time the tab opens.
function CustomerInfoTab() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [incompleteOnly, setIncompleteOnly] = useState(false);

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

  // The count stays whole-list; the toggle only narrows the rows
  const shown = incompleteOnly ? customers.filter(c => c.missingInfo.length > 0) : customers;

  return (
    <div>
      <h2>Customer Info</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        Industry, region and contact email for each customer
      </p>
      {customers.length > 0 && <CompletenessCount customers={customers} />}
      {customers.length > 0 && (
        <label style={{ display: 'block', margin: '8px 0 12px' }}>
          <input
            type="checkbox"
            checked={incompleteOnly}
            onChange={e => setIncompleteOnly(e.target.checked)}
          />{' '}
          Show incomplete only
        </label>
      )}
      {customers.length === 0
        ? <div className="placeholder"><p>No customers yet</p></div>
        : <CustomerInfoTable customers={shown} />}
    </div>
  );
}

export default CustomerInfoTab;
