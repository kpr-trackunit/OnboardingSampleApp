import React, { useState, useEffect } from 'react';
import MappingView from './MappingView';
import './DataMapping.css';

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

/**
 * Data Mapping tab: pick a customer and an entity, then see how that customer's
 * file is mapped onto the standard model.
 * The entity picker is where completeness badges go (slice 2); MappingView is
 * where the column and value editors go (slices 3 and 4).
 */
function DataMappingTab() {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [overview, setOverview] = useState(null); // GET /api/mappings/:customerId
  const [entity, setEntity] = useState('clients');
  const [detail, setDetail] = useState(null); // GET /api/mappings/:customerId/:entity
  const [error, setError] = useState(null);

  useEffect(() => {
    getJson('/api/customers')
      .then(data => {
        setCustomers(data);
        if (data.length > 0) setCustomerId(data[0].id);
      })
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (!customerId) return;
    setOverview(null);
    getJson(`/api/mappings/${customerId}`)
      .then(setOverview)
      .catch(err => setError(err.message));
  }, [customerId]);

  const entry = overview?.entities.find(e => e.entity === entity);

  useEffect(() => {
    setDetail(null);
    if (!entry?.mapping) return;
    getJson(`/api/mappings/${customerId}/${entity}`)
      .then(setDetail)
      .catch(err => setError(err.message));
  }, [customerId, entity, entry?.mapping]);

  if (error) {
    return (
      <div className="placeholder">
        <p style={{ color: '#dc2626' }}>⚠️ Failed to load mappings</p>
        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="data-mapping">
      <h2>Data Mapping</h2>
      <p className="muted" style={{ marginBottom: '20px' }}>
        How each customer's files are mapped onto the standard model
      </p>

      <div className="mapping-picker">
        <label>
          Customer{' '}
          <select aria-label="Customer" value={customerId} onChange={e => setCustomerId(e.target.value)}>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <div className="entity-picker" role="group" aria-label="Entity">
          {(overview?.entities || []).map(e => (
            <button
              key={e.entity}
              className={`entity-option ${e.entity === entity ? 'active' : ''}`}
              aria-pressed={e.entity === entity}
              onClick={() => setEntity(e.entity)}
            >
              {e.entity}
            </button>
          ))}
        </div>
      </div>

      {!overview && <p>Loading...</p>}
      {overview && entry && !entry.mapping && (
        <div className="placeholder mapping-empty"><p>No mapping yet</p></div>
      )}
      {entry?.mapping && !detail && <p>Loading...</p>}
      {detail && <MappingView mapping={detail.mapping} fields={detail.fields} />}
    </div>
  );
}

export default DataMappingTab;
