/**
 * CorrelationHighlights.jsx — DeepTwin correlation review panel
 */

import React from "react";

export default function CorrelationHighlights({ snapshot }) {
  if (!snapshot) return null;
  const correlations = snapshot.correlation_findings || [];

  return (
    <div className="space-y-4">
      {correlations.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          No correlations detected in the current time window.
        </div>
      )}
      {correlations.map((c) => (
        <div key={c.insight_id} className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">{c.summary}</h4>
              <p className="text-xs text-gray-500 mt-1">
                Modalities: {(c.modalities_involved || []).join(", ")} &middot;
                Confidence: {Math.round((c.confidence || 0) * 100)}%
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {(c.modalities_involved || []).length} modalities
            </span>
          </div>
          {c.safety_labels && c.safety_labels.map((label, i) => (
            <div key={i} className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 text-amber-700 text-xs font-medium">
              <span>&#9888;</span> {label}
            </div>
          ))}
          {c.uncertainty_drivers && c.uncertainty_drivers.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 font-medium">Uncertainty drivers:</p>
              <ul className="mt-1 list-disc list-inside text-xs text-gray-500">
                {c.uncertainty_drivers.map((u, i) => <li key={i}>{u}</li>)}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
