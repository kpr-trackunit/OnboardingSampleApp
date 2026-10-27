import React, { useState, useEffect } from 'react';
import './MappingPreview.css';

const DEBOUNCE_MS = 300;

/**
 * Preview of the first rows of the customer's file, before and after mapping (slice 8).
 * Each cell shows the standard value, with the source value next to it when they differ.
 * Values that used a default are highlighted; errors are shown per row.
 *
 * Refetches when the customer or entity changes, and when the mapping changes:
 * - mapping: an unsaved mapping (what the editor shows). When given, it is sent in the
 *   request body and previewed instead of the stored one. Changes are debounced.
 *   Compared by value, so a new object with the same content doesn't refetch.
 * - version: bump it (e.g. after a save) to refetch the stored mapping.
 * @param {{ customerId: string, entity: string, mapping?: object, version?: number, limit?: number }} props
 */
function MappingPreview({ customerId, entity, mapping, version = 0, limit = 5 }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const draft = mapping ? JSON.stringify(mapping) : null;

  // A different file: don't show the last one's rows while loading
  useEffect(() => setPreview(null), [customerId, entity]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const timer = setTimeout(() => {
      fetch(`/api/mappings/${customerId}/${entity}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft ? { mapping: JSON.parse(draft), limit } : { limit })
      })
        .then(async res => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
          return body;
        })
        .then(body => { if (!cancelled) setPreview(body); })
        .catch(err => { if (!cancelled) { setPreview(null); setError(err.message); } });
    }, draft ? DEBOUNCE_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerId, entity, draft, version, limit]);

  return (
    <section className="mapping-section mapping-preview" data-entity={entity}>
      <h3>Preview</h3>
      {error && <p className="preview-error">{error}</p>}
      {!error && !preview && <p>Loading...</p>}
      {!error && preview && <PreviewTable preview={preview} />}
    </section>
  );
}

function PreviewTable({ preview }) {
  const { rows, columns, total } = preview;
  if (rows.length === 0) return <p className="muted">The file has no rows to preview</p>;

  // Target fields in order; a picklist's <field>Source is shown inside its cell instead
  const record = rows[0].record;
  const fields = Object.keys(record).filter(key => !(key.endsWith('Source') && key.slice(0, -'Source'.length) in record));

  return (
    <>
      <p className="muted">
        First {rows.length} of {total} rows: the standard value, with the source value next to it.
        {' '}<span className="defaulted-key">Highlighted</span> values used a default.
      </p>
      <div className="preview-scroll">
        <table className="data-table preview-table">
          <thead>
            <tr>
              <th>Line</th>
              {fields.map(field => (
                <th key={field}>
                  <code>{field}</code>
                  <div className="muted preview-column">{columns[field] ? `← ${columns[field]}` : 'unmapped'}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => <PreviewRow key={row.line} row={row} fields={fields} columns={columns} colSpan={fields.length + 1} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}

function display(value) {
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function PreviewRow({ row, fields, columns, colSpan }) {
  const warnings = Object.fromEntries(row.warnings.map(w => [w.field, w]));
  const errors = Object.fromEntries(row.errors.map(e => [e.field, e]));

  return (
    <>
      <tr data-line={row.line} className={row.errors.length > 0 ? 'has-errors' : ''}>
        <td>{row.line}</td>
        {fields.map(field => {
          const value = display(row.record[field]);
          const source = columns[field] ? display(String(row.source[columns[field]] ?? '').trim()) : '';
          const problem = errors[field] || warnings[field];
          const className = errors[field] ? 'error' : warnings[field] ? 'defaulted' : '';
          return (
            <td key={field} data-field={field} className={className} title={problem?.message}>
              <span className="preview-value">{value}</span>
              {source !== value && source !== '' && <span className="preview-source">← {source}</span>}
            </td>
          );
        })}
      </tr>
      {row.errors.length > 0 && (
        <tr className="preview-errors" data-line={row.line}>
          <td colSpan={colSpan}>
            <ul>{row.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
          </td>
        </tr>
      )}
    </>
  );
}

export default MappingPreview;
