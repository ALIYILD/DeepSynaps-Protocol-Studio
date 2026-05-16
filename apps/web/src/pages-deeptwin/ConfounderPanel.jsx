/**
 * ConfounderPanel.jsx — DeepTwin confounder display panel
 */

import React from "react";

const SEVERITY_STYLES = {
  high: "bg-red-50 border-red-200 text-red-800",
  moderate: "bg-yellow-50 border-yellow-200 text-yellow-800",
  low: "bg-green-50 border-green-200 text-green-800",
};

export default function ConfounderPanel({ snapshot }) {
  if (!snapshot) return null;
  const confounders = snapshot.confounders || [];

  return (
    <div className="space-y-4">
      {confounders.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          No confounders detected.
        </div>
      )}
      {confounders.map((cf) => (
        <div key={cf.confounder_id || cf.confounderId} className={`rounded-lg border p-5 ${SEVERITY_STYLES[cf.severity] || SEVERITY_STYLES.low}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">&#9888;</span>
            <h4 className="text-sm font-semibold capitalize">{cf.confounder_type || cf.confounderType}</h4>
            <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide bg-white/60">
              {cf.severity}
            </span>
          </div>
          <p className="text-sm opacity-90">{cf.description}</p>
          {cf.mitigation_suggestion && (
            <p className="text-xs opacity-70 mt-2">
              <span className="font-medium">Suggestion:</span> {cf.mitigation_suggestion}
            </p>
          )}
          {cf.impact_estimate && (
            <p className="text-xs opacity-70 mt-1">
              <span className="font-medium">Impact:</span> {cf.impact_estimate}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
