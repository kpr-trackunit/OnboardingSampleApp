import React from 'react';
import './CurrentStepBadge.css';

/**
 * Shows the step a customer is waiting on, from the queue row's `currentStep`
 * (`{ id, name }`, or null when every step is completed).
 */
export default function CurrentStepBadge({ step }) {
  return step ? (
    <span className="current-step-badge" data-step-id={step.id}>Next: {step.name}</span>
  ) : (
    <span className="current-step-badge current-step-badge--done">Done</span>
  );
}
