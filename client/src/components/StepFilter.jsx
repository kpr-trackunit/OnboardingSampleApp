import React from 'react';
import './StepFilter.css';

export const ALL = 'all';
export const DONE = 'done';

/**
 * The filter chips for a list of queue rows: All, one per step (in step order),
 * then Done, each with the number of rows it matches. Pure, so it's easy to test.
 * Steps come from the rows' own `steps`, so a step nobody is waiting on still gets a chip (count 0).
 * @param {{ steps: { id: string, name: string, order: number }[], currentStep: { id: string } | null }[]} rows
 * @returns {{ key: string, label: string, count: number }[]}
 */
export function stepFilterChips(rows) {
  const steps = new Map();
  for (const row of rows) {
    for (const step of row.steps || []) {
      if (!steps.has(step.id)) steps.set(step.id, step);
    }
  }
  const stepChips = [...steps.values()]
    .sort((a, b) => a.order - b.order)
    .map(step => ({ key: step.id, label: step.name, count: rows.filter(r => matchesStepFilter(r, step.id)).length }));
  return [
    { key: ALL, label: 'All', count: rows.length },
    ...stepChips,
    { key: DONE, label: 'Done', count: rows.filter(r => matchesStepFilter(r, DONE)).length }
  ];
}

/**
 * Whether a queue row matches a filter key: All matches everything, Done matches
 * rows with no current step, and a step id matches rows waiting on that step.
 */
export function matchesStepFilter(row, key) {
  if (key === ALL) return true;
  if (key === DONE) return row.currentStep === null;
  return row.currentStep?.id === key;
}

/**
 * Single-select chips above the Dashboard cards. A radio group rather than buttons,
 * since exactly one filter is active at a time.
 */
export default function StepFilter({ rows, value, onChange }) {
  return (
    <div className="step-filter" role="radiogroup" aria-label="Filter by current step">
      {stepFilterChips(rows).map(chip => (
        <label
          key={chip.key}
          className={`step-filter-chip${chip.key === value ? ' step-filter-chip--active' : ''}`}
          data-filter-key={chip.key}
        >
          <input
            type="radio"
            name="step-filter"
            value={chip.key}
            checked={chip.key === value}
            onChange={() => onChange(chip.key)}
          />
          {chip.label} <span className="step-filter-count">{chip.count}</span>
        </label>
      ))}
    </div>
  );
}
