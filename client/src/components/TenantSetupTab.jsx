import React, { useState, useEffect } from 'react';
import TenantTable from './TenantTable';

function TenantSetupTab() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busyCustomerId, setBusyCustomerId] = useState(null);

  const changeStatus = async (customerId, status) => {
    setBusyCustomerId(customerId);
    setActionError(null);
    try {
      const res = await fetch(`/api/tenants/${customerId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setTenants(current => current.map(t => (t.customerId === customerId ? body : t)));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyCustomerId(null);
    }
  };
  const [saveError, setSaveError] = useState(null);

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

  // Save a plan change, then show the server's copy of the tenant in its row
  const savePlan = async (customerId, plan) => {
    try {
      const res = await fetch(`/api/tenants/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTenants(current => current.map(t => (
        t.customerId === customerId ? { ...t, ...data } : t
      )));
      setSaveError(null);
    } catch (err) {
      console.error('Failed to save plan:', err);
      setSaveError(`Could not save plan: ${err.message}`);
    }
  };

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
      {actionError && <p style={{ color: '#dc2626', marginBottom: '12px' }}>⚠️ {actionError}</p>}
      {saveError && <p role="alert" style={{ color: '#dc2626' }}>{saveError}</p>}
      <TenantTable
        tenants={tenants}
        onStatusChange={changeStatus}
        busyCustomerId={busyCustomerId}
        onPlanChange={savePlan}
      />
    </div>
  );
}

export default TenantSetupTab;
