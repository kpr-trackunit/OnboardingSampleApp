import React from 'react';

/**
 * View of one Mapping (customer × entity), in three sections: columns,
 * picklist value maps, and date format. Each section is its own component so
 * later slices can swap in editors: ColumnMappings has a header dropdown per
 * field (slice 3), ValueMappings gets a value/default editor (slice 4),
 * DateFormat a format picker for ambiguous detection.
 * @param {{
 *   mapping: object,
 *   fields: { field: string, type: string, required: boolean, strict: boolean, values: string[] | null }[],
 *   headers: string[],
 *   onColumnChange: (field: string, column: string | null) => void,
 *   saving: string | null
 * }} props - saving is the field whose column is being saved
 */
function MappingView({ mapping, fields, headers, onColumnChange, saving }) {
  return (
    <div className="mapping-view" data-entity={mapping.entity}>
      <ColumnMappings
        columns={mapping.columns}
        fields={fields}
        headers={headers}
        onColumnChange={onColumnChange}
        saving={saving}
      />
      <ValueMappings values={mapping.values} fields={fields.filter(f => f.type === 'picklist')} />
      <DateFormat dateFormat={mapping.dateFormat} detected={mapping.dateFormatDetected} />
    </div>
  );
}

function FieldTags({ field }) {
  return (
    <>
      {field.required && <span className="field-tag required">required</span>}
      {field.strict && <span className="field-tag strict">strict</span>}
    </>
  );
}

const UNMAPPED = '';

/**
 * Each target field next to a dropdown of the file's headers, e.g. name ← companyName.
 * Picking a header (or "unmapped") saves straight away; there is no Save button.
 * A mapped column that isn't in the file's headers stays listed, marked "not in file".
 */
function ColumnMappings({ columns, fields, headers, onColumnChange, saving }) {
  return (
    <section className="mapping-section">
      <h3>Columns</h3>
      <table className="data-table column-mappings">
        <thead>
          <tr>
            <th>Target field</th>
            <th></th>
            <th>Source column</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(field => {
            const column = columns[field.field] || UNMAPPED;
            const missing = column !== UNMAPPED && !headers.includes(column);
            // Fields with no target definition (type unknown) can't be edited through the API
            const editable = field.type !== 'unknown';
            return (
              <tr key={field.field} data-field={field.field}>
                <td><code>{field.field}</code> <FieldTags field={field} /></td>
                <td className="arrow">←</td>
                <td>
                  <select
                    className="column-select"
                    aria-label={`Source column for ${field.field}`}
                    value={column}
                    disabled={!editable || saving !== null}
                    onChange={e => onColumnChange(field.field, e.target.value === UNMAPPED ? null : e.target.value)}
                  >
                    <option value={UNMAPPED}>unmapped</option>
                    {headers.map(header => <option key={header} value={header}>{header}</option>)}
                    {missing && <option value={column}>{column} (not in file)</option>}
                  </select>
                  {saving === field.field && <span className="muted"> Saving...</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// Each picklist field's source → standard value map, plus its default
function ValueMappings({ values, fields }) {
  if (fields.length === 0) return null;

  return (
    <section className="mapping-section">
      <h3>Values</h3>
      {fields.map(field => {
        const { map = {}, default: fallback = null } = values[field.field] || {};
        const entries = Object.entries(map);
        return (
          <div key={field.field} className="value-mapping" data-field={field.field}>
            <h4><code>{field.field}</code> <FieldTags field={field} /></h4>
            {entries.length === 0 ? (
              <p className="muted">No values mapped</p>
            ) : (
              <table className="data-table value-map">
                <tbody>
                  {entries.map(([source, standard]) => (
                    <tr key={source}>
                      <td><code>{source}</code></td>
                      <td className="arrow">→</td>
                      <td>{standard}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="value-default">
              Default:{' '}
              {field.strict
                ? <span className="muted">none (strict: unmapped values reject the row)</span>
                : fallback ?? <span className="muted">none</span>}
            </p>
          </div>
        );
      })}
    </section>
  );
}

function DateFormat({ dateFormat, detected }) {
  return (
    <section className="mapping-section">
      <h3>Date format</h3>
      <p className="date-format">
        {dateFormat ? <code>{dateFormat}</code> : <span className="muted">not set</span>}
        {detected && <span className="muted"> ({detected})</span>}
      </p>
    </section>
  );
}

export default MappingView;
