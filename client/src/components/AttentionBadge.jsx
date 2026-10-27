import React from 'react';
import './AttentionBadge.css';

// Card class for a queue row: adds the red "needs attention" style when flagged by the server.
export function attentionCardClass(needsAttention) {
  return needsAttention ? 'customer-card needs-attention' : 'customer-card';
}

// "Needs attention" badge for a queue row with a failed step; renders nothing otherwise.
export default function AttentionBadge({ needsAttention }) {
  if (!needsAttention) return null;
  return <span className="attention-badge">Needs attention</span>;
}
