import React from 'react';

/**
 * Read-only view of one Mapping (customer × entity), in three sections:
 * columns, picklist value maps, and date format. Each section is its own
 * component so later slices can swap in editors: ColumnMappings gets a header
 * dropdown per field (slice 3), ValueMappings a value/default editor (slice 4),
 * DateFormat a format picker for ambiguous detection (slice 2).
 * @param {{ mapping: object, fields: { field: string, type: string, required: boolean, strict: boolean, values: string[] | null }[] }} props
 */
function MappingView({ mapping, fields }) {
  return (
    <div className="mapping-view" data-entity={mapping.entity}>
      <ColumnMappings columns={mapping.columns} fields={fields} />
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

// Each target field next to its source column, e.g. name ← companyName
function ColumnMappings({ columns, fields }) {
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
            const column = columns[field.field];
            return (
              <tr key={field.field} data-field={field.field}>
                <td><code>{field.field}</code> <FieldTags field={field} /></td>
                <td className="arrow">←</td>
                <td>{column ? <code>{column}</code> : <span className="muted">unmapped</span>}</td>
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
