import React, { useEffect, useState } from 'react';

const BUCKETS = [
  { key: 'total', label: 'Total' },
  { key: 'notStarted', label: 'Not started' },
  { key: 'inProgress', label: 'In progress' },
  { key: 'done', label: 'Done' },
  { key: 'failed', label: 'Failed' }
];

/**
 * Summary strip above the onboarding queue. Renders the counts from
 * GET /api/onboarding/summary; the bucketing lives on the server (summarise()).
 * Fetches on mount, so it is fresh every time the Dashboard is rendered.
 */
export default function SummaryStrip() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/onboarding/summary')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled) setSummary(data); })
      .catch(() => { if (!cancelled) setSummary(null); });
    return () => { cancelled = true; };
  }, []);

  if (!summary) return null;

  return (
    <div
      className="summary-strip"
      data-testid="summary-strip"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px', color: '#374151' }}
    >
      {BUCKETS.map((bucket, i) => (
        <React.Fragment key={bucket.key}>
          {i > 0 && <span aria-hidden="true" style={{ color: '#9ca3af' }}>·</span>}
          <span data-testid={`summary-${bucket.key}`}>
            {bucket.label} <strong>{summary[bucket.key]}</strong>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
