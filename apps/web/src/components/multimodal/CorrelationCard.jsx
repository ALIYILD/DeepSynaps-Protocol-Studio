/**
 * CorrelationCard — Shows temporal association pairs with confidence badge
 * and "Temporal association only" safety label.
 */
import React from "react";

export default function CorrelationCard({ correlation }) {
  if (!correlation) return null;

  const {
    insight_id,
    summary = "",
    supporting_events = [],
    conflicting_events = [],
    confidence = 0,
    uncertainty_drivers = [],
    safety_labels = [],
    modalities_involved = [],
  } = correlation;

  // Confidence badge color
  let confidenceBadgeClass = "bg-red-100 text-red-800 border-red-300";
  if (confidence > 0.7) {
    confidenceBadgeClass = "bg-green-100 text-green-800 border-green-300";
  } else if (confidence > 0.5) {
    confidenceBadgeClass = "bg-yellow-100 text-yellow-800 border-yellow-300";
  }

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden mb-4" data-testid="correlation-card">
      {/* Review banner */}
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center gap-2" data-testid="review-banner">
        <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-semibold text-yellow-800">Requires clinician review</span>
      </div>

      <div className="p-4">
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {/* Confidence badge */}
          <span className={`px-2.5 py-1 text-xs font-semibold rounded border ${confidenceBadgeClass}`} data-testid="confidence-badge">
            Confidence: {Math.round(confidence * 100)}%
          </span>

          {/* Safety label */}
          <span className="px-2.5 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800 border border-blue-300" data-testid="safety-label">
            Temporal association only
          </span>

          {/* Modality tags */}
          {modalities_involved?.map((mod) => (
            <span key={mod} className="px-2 py-1 text-xs rounded bg-purple-50 text-purple-700 border border-purple-200 capitalize">
              {mod}
            </span>
          ))}
        </div>

        {/* Summary */}
        <p className="text-sm text-gray-800 mb-3 leading-relaxed" data-testid="correlation-summary">
          {summary}
        </p>

        {/* Supporting events */}
        {supporting_events?.length > 0 && (
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-green-600 uppercase mb-1">Supporting events</h4>
            <div className="flex flex-wrap gap-1">
              {supporting_events.map((ev) => (
                <a
                  key={ev}
                  href={`#event-${ev}`}
                  className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-200 font-mono hover:bg-green-100 transition-colors"
                >
                  {ev}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Conflicting events */}
        {conflicting_events?.length > 0 && (
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-red-600 uppercase mb-1">Conflicting events</h4>
            <div className="flex flex-wrap gap-1">
              {conflicting_events.map((ev) => (
                <a
                  key={ev}
                  href={`#event-${ev}`}
                  className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded border border-red-200 font-mono hover:bg-red-100 transition-colors"
                >
                  {ev}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Uncertainty drivers */}
        {uncertainty_drivers?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100" data-testid="uncertainty-drivers">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Uncertainty drivers</h4>
            <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
              {uncertainty_drivers.map((driver, idx) => (
                <li key={idx}>{driver}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
