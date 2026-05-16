/**
 * ConfounderCard — Yellow warning styling for potential confounders.
 * Shows severity badges, impact estimates, mitigation suggestions.
 */
import React from "react";

const SEVERITY_STYLES = {
  high: "bg-red-100 text-red-800 border-red-300",
  moderate: "bg-orange-100 text-orange-800 border-orange-300",
  low: "bg-yellow-100 text-yellow-800 border-yellow-300",
};

export default function ConfounderCard({ confounder }) {
  if (!confounder) return null;

  const {
    insight_id,
    summary = "",
    confidence = 0,
    confounders = [],
    supporting_events = [],
    uncertainty_drivers = [],
    safety_labels = [],
    modalities_involved = [],
  } = confounder;

  return (
    <div className="bg-amber-50 rounded-lg shadow-md border border-yellow-300 overflow-hidden mb-4" data-testid="confounder-card">
      {/* Warning header */}
      <div className="bg-yellow-100 border-b border-yellow-300 px-4 py-2 flex items-center gap-2">
        <svg className="w-5 h-5 text-yellow-700" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-yellow-900">Potential Confounder</span>
          <span className="text-xs px-2 py-0.5 rounded bg-yellow-200 text-yellow-800 font-medium">
            Requires clinician review
          </span>
        </div>
      </div>

      <div className="p-4">
        {/* Modality tags */}
        {modalities_involved?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {modalities_involved.map((mod) => (
              <span key={mod} className="px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800 border border-yellow-300 capitalize">
                {mod}
              </span>
            ))}
          </div>
        )}

        {/* Summary */}
        <p className="text-sm text-gray-800 mb-4 leading-relaxed" data-testid="confounder-summary">
          {summary}
        </p>

        {/* Confounder candidates */}
        {confounders?.map((candidate, idx) => {
          const severity = candidate.severity || "moderate";
          const severityClass = SEVERITY_STYLES[severity] || SEVERITY_STYLES.moderate;

          return (
            <div key={candidate.confounder_id || idx} className="bg-white rounded border border-yellow-200 p-3 mb-3" data-testid={`confounder-candidate-${idx}`}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-500 uppercase">
                  {candidate.confounder_type}
                </span>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${severityClass}`} data-testid={`severity-badge-${idx}`}>
                  {severity} severity
                </span>
              </div>

              <p className="text-sm text-gray-700 mb-2">{candidate.description}</p>

              {candidate.impact_estimate && (
                <div className="mb-2">
                  <span className="text-xs font-semibold text-orange-600 uppercase">Estimated impact</span>
                  <p className="text-sm text-gray-700" data-testid={`impact-estimate-${idx}`}>
                    {candidate.impact_estimate}
                  </p>
                </div>
              )}

              {candidate.mitigation_suggestion && (
                <div className="mb-2">
                  <span className="text-xs font-semibold text-teal-600 uppercase">Mitigation</span>
                  <p className="text-sm text-gray-700 flex items-start gap-1.5" data-testid={`mitigation-${idx}`}>
                    <svg className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {candidate.mitigation_suggestion}
                  </p>
                </div>
              )}

              {candidate.evidence_events?.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase">Evidence events</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {candidate.evidence_events.map((ev) => (
                      <span key={ev} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-mono">
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Confidence */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">Confidence:</span>
          <div className="w-20 bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${confidence >= 0.6 ? "bg-orange-500" : "bg-yellow-500"}`}
              style={{ width: `${Math.round(confidence * 100)}%` }}
            />
          </div>
          <span className="text-xs text-gray-600">{Math.round(confidence * 100)}%</span>
        </div>

        {/* Uncertainty drivers */}
        {uncertainty_drivers?.length > 0 && (
          <div className="mt-2 pt-2 border-t border-yellow-200">
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
