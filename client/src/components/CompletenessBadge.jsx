import React from 'react';

// Human labels for the field keys the server puts in `missingInfo`
const FIELD_LABELS = {
  name: 'name',
  industry: 'industry',
  region: 'region',
  contactEmail: 'email'
};

// "Complete" (green) or "Missing: region, email" (amber), from the server's
// `missingInfo` list. The server decides what's missing; this only renders it.
function CompletenessBadge({ missing }) {
  const fields = Array.isArray(missing) ? missing : [];
  if (fields.length === 0) {
    return <span className="completeness-badge complete">Complete</span>;
  }
  const labels = fields.map(field => FIELD_LABELS[field] || field);
  return <span className="completeness-badge incomplete">Missing: {labels.join(', ')}</span>;
}

// "N of M complete", counted from the same `missingInfo` lists
export function CompletenessCount({ customers }) {
  const complete = customers.filter(c => Array.isArray(c.missingInfo) && c.missingInfo.length === 0).length;
  return <p className="completeness-count">{complete} of {customers.length} complete</p>;
}

export default CompletenessBadge;
