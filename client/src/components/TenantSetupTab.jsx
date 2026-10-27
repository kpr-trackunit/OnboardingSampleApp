import React, { useState, useEffect } from 'react';
import TenantTable from './TenantTable';

function TenantSetupTab() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/tenants')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Invalid response format');
        return data;
      })
      .then(data => {
        setTenants(data);
        setError(null);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch tenants:', err);
        setError(err.message);
        setTenants([]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="placeholder"><p>Loading...</p></div>;
  }

  if (error) {
    return (
      <div className="placeholder">
        <p style={{ color: '#dc2626' }}>⚠️ Failed to load tenants</p>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>{error}</p>
      </div>
    );
  }

  if (tenants.length === 0) {
    return <div className="placeholder"><p>No tenants to set up</p></div>;
  }

  return (
    <div>
      <h2>Tenant Setup</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        {tenants.length} tenant(s)
      </p>
      <TenantTable tenants={tenants} />
    </div>
  );
}

export default TenantSetupTab;
