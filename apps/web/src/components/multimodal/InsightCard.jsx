/**
 * InsightCard — Generic card for any IntelligenceOutput.
 * Always shows "Requires clinician review" banner.
 */
import React from "react";

const EVIDENCE_GRADE_COLORS = {
  A: "bg-green-100 text-green-800 border-green-300",
  B: "bg-blue-100 text-blue-800 border-blue-300",
  C: "bg-yellow-100 text-yellow-800 border-yellow-300",
  D: "bg-red-100 text-red-800 border-red-300",
};

export default function InsightCard({ insight }) {
  if (!insight) return null;

  const {
    insight_id,
    insight_type,
    modalities_involved = [],
    summary = "",
    supporting_events = [],
    conflicting_events = [],
    evidence_links = [],
    confidence = 0,
    uncertainty_drivers = [],
    safety_labels = [],
    clinician_review_required = true,
  } = insight;

  const evidenceGrade = evidence_links?.[0]?.evidence_grade || "D";
  const gradeClass = EVIDENCE_GRADE_COLORS[evidenceGrade] || EVIDENCE_GRADE_COLORS.D;

  const confidencePercent = Math.round((confidence || 0) * 100);
  let confidenceColor = "bg-red-500";
  if (confidence >= 0.7) confidenceColor = "bg-green-500";
  else if (confidence >= 0.5) confidenceColor = "bg-yellow-500";
  else if (confidence >= 0.3) confidenceColor = "bg-orange-500";

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden mb-4" data-testid="insight-card">
      {/* Clinician review banner */}
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center gap-2" data-testid="review-banner">
        <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-semibold text-yellow-800">
          Requires clinician review
        </span>
      </div>

      <div className="p-4">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`px-2 py-1 text-xs font-medium rounded border ${gradeClass}`} data-testid="evidence-grade">
            Evidence: {evidenceGrade}
          </span>
          <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 border border-gray-300 capitalize" data-testid="insight-type">
            {insight_type?.replace("_", " ")}
          </span>
          {modalities_involved?.map((mod) => (
            <span key={mod} className="px-2 py-1 text-xs rounded bg-purple-50 text-purple-700 border border-purple-200">
              {mod}
            </span>
          ))}
        </div>

        {/* Summary */}
        <p className="text-sm text-gray-800 mb-4 leading-relaxed" data-testid="insight-summary">
          {summary}
        </p>

        {/* Confidence bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Confidence</span>
            <span data-testid="confidence-value">{confidencePercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full ${confidenceColor}`}
              style={{ width: `${Math.min(confidencePercent, 100)}%` }}
              data-testid="confidence-bar"
            />
          </div>
        </div>

        {/* Uncertainty drivers */}
        {uncertainty_drivers?.length > 0 && (
          <div className="mb-4" data-testid="uncertainty-drivers">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Uncertainty drivers</h4>
            <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
              {uncertainty_drivers.map((driver, idx) => (
                <li key={idx}>{driver}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Supporting events */}
        {supporting_events?.length > 0 && (
          <div className="mb-3" data-testid="supporting-events">
            <h4 className="text-xs font-semibold text-green-600 uppercase mb-1">
              Supporting events ({supporting_events.length})
            </h4>
            <div className="flex flex-wrap gap-1">
              {supporting_events.map((ev) => (
                <span key={ev} className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-200 font-mono">
                  {ev}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Conflicting events */}
        {conflicting_events?.length > 0 && (
          <div className="mb-3" data-testid="conflicting-events">
            <h4 className="text-xs font-semibold text-red-600 uppercase mb-1">
              Conflicting events ({conflicting_events.length})
            </h4>
            <div className="flex flex-wrap gap-1">
              {conflicting_events.map((ev) => (
                <span key={ev} className="text-xs px-2 py-0.5 bg-red-50 text-red-700 rounded border border-red-200 font-mono">
                  {ev}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Safety labels */}
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100" data-testid="safety-labels">
          {safety_labels?.map((label, idx) => (
            <span
              key={idx}
              className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600 border border-gray-200"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
