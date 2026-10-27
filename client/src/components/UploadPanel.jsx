import React, { useState, useEffect } from 'react';

// Same order as the server's ENTITY_FILES
const ENTITIES = ['clients', 'contacts', 'accounts', 'transactions'];

/**
 * Upload a customer's CSV files (data-mapping slice 6): pick a customer, then one
 * file input per entity. The file is sent as text/csv to
 * POST /api/import/:customerId/:entity/upload, which holds it in memory and
 * replaces any earlier upload. The first upload creates an empty mapping to fill
 * in on the Data Mapping tab.
 * @param {{ onUploaded: () => void }} props - Called after each upload so the source list refreshes
 */
function UploadPanel({ onUploaded }) {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [uploading, setUploading] = useState(null);
  const [status, setStatus] = useState(null); // { entity, message, error }

  useEffect(() => {
    fetch('/api/customers')
      .then(res => (res.ok ? res.json() : []))
      .then(data => {
        setCustomers(data);
        if (data.length > 0) setCustomerId(current => current || data[0].id);
      })
      .catch(err => console.error('Failed to fetch customers:', err));
  }, []);

  async function upload(entity, input) {
    const file = input.files?.[0];
    if (!file || !customerId) return;
    setUploading(entity);
    setStatus(null);
    try {
      const res = await fetch(
        `/api/import/${encodeURIComponent(customerId)}/${entity}/upload?filename=${encodeURIComponent(file.name)}`,
        { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: await file.text() }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

      const { upload: saved, mappingCreated, replaced } = body;
      const parts = [`${replaced ? 'Replaced' : 'Uploaded'} ${saved.filename} (${saved.rowCount} rows)`];
      if (mappingCreated) parts.push(`empty ${entity} mapping created: map it on the Data Mapping tab`);
      setStatus({ entity, message: parts.join(', '), error: false });
      onUploaded();
    } catch (err) {
      setStatus({ entity, message: `Upload failed: ${err.message}`, error: true });
    } finally {
      setUploading(null);
      input.value = '';
    }
  }

  return (
    <section className="upload-panel">
      <h3>Upload a customer's files</h3>
      <p className="muted">
        CSV files are kept in memory until the server restarts, and replace any earlier upload for that entity.
      </p>
      <label className="upload-customer">
        Customer{' '}
        <select aria-label="Upload customer" value={customerId} onChange={e => setCustomerId(e.target.value)}>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="upload-entities">
        {ENTITIES.map(entity => (
          <label key={entity} className="upload-entity" data-entity={entity}>
            <span>{entity}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label={`Upload ${entity} CSV`}
              disabled={!customerId || uploading !== null}
              onChange={e => upload(entity, e.target)}
            />
          </label>
        ))}
      </div>
      {uploading && <p className="muted">Uploading {uploading}...</p>}
      {status && (
        <p className={`upload-status ${status.error ? 'error' : ''}`} role="status" data-entity={status.entity}>
          {status.message}
        </p>
      )}
    </section>
  );
}

export default UploadPanel;
