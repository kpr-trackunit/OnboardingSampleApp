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
 * Each entity shows a Complete/Incomplete badge, with the reasons listed below
 * the picker (slice 2). MappingView is where the column and value editors go
 * (slices 3 and 4).
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
        // Keep a customer already picked (StrictMode runs this effect twice, and the second load can land after a pick)
        if (data.length > 0) setCustomerId(current => current || data[0].id);
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
    // Wait for the picked customer's overview, so a stale one never asks for a mapping the new customer lacks
    if (!entry?.mapping || overview?.customerId !== customerId) return;
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
              {e.entity} <CompletenessBadge completeness={e.completeness} />
            </button>
          ))}
        </div>
      </div>

      {overview && <CompletenessSummary entities={overview.entities} />}

      {!overview && <p>Loading...</p>}
      {overview && entry && !entry.mapping && (
        <div className="placeholder mapping-empty"><p>No mapping yet</p></div>
      )}
      {entry?.mapping && !detail && <p>Loading...</p>}
      {detail && <MappingView mapping={detail.mapping} fields={detail.fields} file={detail.file} />}
    </div>
  );
}

function CompletenessBadge({ completeness }) {
  const complete = completeness?.complete;
  return (
    <span className={`completeness-badge ${complete ? 'complete' : 'incomplete'}`}>
      {complete ? 'Complete' : 'Incomplete'}
    </span>
  );
}

// Detected format, Ambiguous, or why there is none
function DateFormatStatus({ dateFormat }) {
  if (!dateFormat) return null;
  const { format, status } = dateFormat;
  let text;
  if (status === 'ambiguous') text = <span className="completeness-badge ambiguous">Ambiguous</span>;
  else if (status === 'not_needed') text = <span className="muted">not needed (no dates in the file)</span>;
  else if (format) text = <><code>{format}</code> <span className="muted">({status})</span></>;
  else text = <span className="muted">not set</span>;
  return <p className="date-status">Date format: {text}</p>;
}

/**
 * One card per entity: badge, date format and the reasons it isn't complete.
 * Strict reasons are highlighted; reasons that don't block (a default will be used) are muted.
 */
function CompletenessSummary({ entities }) {
  return (
    <div className="completeness-summary">
      {entities.map(({ entity, completeness }) => (
        <div
          key={entity}
          className="entity-status"
          data-entity={entity}
          data-complete={String(Boolean(completeness?.complete))}
        >
          <h4>{entity} <CompletenessBadge completeness={completeness} /></h4>
          <DateFormatStatus dateFormat={completeness?.dateFormat} />
          {completeness?.reasons.length > 0 && (
            <ul className="completeness-reasons">
              {completeness.reasons.map((reason, i) => (
                <li
                  key={i}
                  className={`reason ${reason.strict ? 'strict' : ''} ${reason.blocking ? 'blocking' : 'warning'}`}
                  data-code={reason.code}
                >
                  {reason.strict && <span className="field-tag strict">strict</span>} {reason.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export default DataMappingTab;
