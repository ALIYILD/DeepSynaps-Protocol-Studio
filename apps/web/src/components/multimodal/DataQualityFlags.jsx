/**
 * DataQualityFlags — Shows missing/stale data with severity badges,
 * actionable suggestions, and timestamps.
 */
import React from "react";

const SEVERITY_STYLES = {
  high: "bg-red-100 text-red-800 border-red-300",
  moderate: "bg-orange-100 text-orange-800 border-orange-300",
  low: "bg-green-100 text-green-800 border-green-300",
};

const SUGGESTION_ICONS = {
  assessment: (
    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  qeeg: (
    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  mri: (
    <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  biomarker: (
    <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  medication: (
    <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  wearable: (
    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  voice: (
    <svg className="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  ),
  patient_checkin: (
    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const DEFAULT_ICON = (
  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export default function DataQualityFlags({ flags = [] }) {
  if (!flags || flags.length === 0) {
    return (
      <div className="bg-green-50 rounded-lg border border-green-200 p-6 text-center" data-testid="quality-flags-empty">
        <svg className="w-8 h-8 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-green-800 font-medium">All data quality checks passed</p>
        <p className="text-xs text-green-600 mt-1">No missing or stale data detected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="quality-flags">
      {/* Safety disclaimer */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
        <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <p className="text-sm text-yellow-800">
          Data quality flags are decision support only. Verify with source systems before clinical action.
        </p>
      </div>

      {/* Review banner */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 flex items-center gap-2">
        <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-semibold text-yellow-800">Requires clinician review</span>
      </div>

      {/* Flag cards */}
      {flags.map((flag, idx) => {
        const severity = flag.confidence > 0.85 ? "high" : flag.confidence > 0.6 ? "moderate" : "low";
        const severityClass = SEVERITY_STYLES[severity];
        const modality = flag.modalities_involved?.[0] || "unknown";
        const icon = SUGGESTION_ICONS[modality] || DEFAULT_ICON;

        return (
          <div
            key={flag.insight_id || idx}
            className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
            data-testid={`quality-flag-${idx}`}
          >
            <div className="p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  {icon}
                  <span className="text-sm font-semibold text-gray-800 capitalize">
                    {modality}
                  </span>
                </div>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${severityClass}`} data-testid={`severity-badge-${idx}`}>
                  {severity === "high" ? "Missing" : severity === "moderate" ? "Stale" : "Low quality"}
                </span>
              </div>

              {/* Summary */}
              <p className="text-sm text-gray-700 mb-3" data-testid={`flag-summary-${idx}`}>
                {flag.summary}
              </p>

              {/* Confidence */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-500">Flag confidence:</span>
                <div className="w-16 bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${
                      severity === "high" ? "bg-red-500" : severity === "moderate" ? "bg-orange-500" : "bg-green-500"
                    }`}
                    style={{ width: `${Math.round(flag.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{Math.round(flag.confidence * 100)}%</span>
              </div>

              {/* Supporting events */}
              {flag.supporting_events?.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-gray-500">Evidence: </span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {flag.supporting_events.map((ev) => (
                      <span key={ev} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-mono">
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Suggestion bar */}
            <div className="bg-gray-50 px-4 py-2 border-t border-gray-100 flex items-start gap-2">
              <svg className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <div className="text-xs text-gray-600">
                <span className="font-semibold text-gray-700">Suggestion: </span>
                {getSuggestion(modality)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getSuggestion(modality) {
  const suggestions = {
    assessment: "Schedule a follow-up cognitive assessment.",
    qeeg: "Arrange qEEG recording session.",
    mri: "Consider structural MRI if clinically indicated.",
    biomarker: "Order relevant biomarker panel.",
    medication: "Review medication history with patient.",
    wearable: "Ensure wearable device is active and syncing.",
    voice: "Schedule voice sample collection.",
    patient_checkin: "Send patient check-in reminder.",
  };
  return suggestions[modality] || "Verify with source systems.";
}
