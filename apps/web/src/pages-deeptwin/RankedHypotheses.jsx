/**
 * RankedHypotheses.jsx — DeepTwin ranked hypothesis display panel
 */

import React, { useState } from "react";

const GRADE_COLORS = { A: "bg-green-100 text-green-800", B: "bg-blue-100 text-blue-800", C: "bg-yellow-100 text-yellow-800", D: "bg-red-100 text-red-800" };

export default function RankedHypotheses({ snapshot, onReviewAction }) {
  const [expanded, setExpanded] = useState({});
  if (!snapshot) return null;
  const hypotheses = snapshot.ranked_hypotheses || [];

  const toggle = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="space-y-4">
      {/* Safety Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <span className="text-amber-600 text-lg shrink-0">&#9888;</span>
        <p className="text-sm text-amber-800">
          Ranked hypotheses are decision support only. Each requires individual clinician review. They are not diagnoses.
        </p>
      </div>

      {hypotheses.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          No hypotheses generated.
        </div>
      )}

      {hypotheses.map((h, idx) => (
        <div key={h.insight_id} className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700 text-sm font-bold">
                {idx + 1}
              </span>
              <div>
                <h4 className="text-sm font-medium text-gray-900">{h.summary}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{ width: `${Math.min((h.confidence || 0) * 100, 94)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{Math.round((h.confidence || 0) * 100)}%</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(h.evidence_grade || h.evidenceGrade) && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[h.evidence_grade || h.evidenceGrade] || GRADE_COLORS.D}`}>
                  Grade {h.evidence_grade || h.evidenceGrade}
                </span>
              )}
              {h.research_only && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                  Research Only
                </span>
              )}
            </div>
          </div>

          {/* Expanded Details */}
          {expanded[h.insight_id] && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
              {h.uncertainty_drivers && h.uncertainty_drivers.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-700">Uncertainty Drivers</p>
                  <ul className="mt-1 list-disc list-inside text-xs text-gray-500">
                    {h.uncertainty_drivers.map((u, i) => <li key={i}>{u}</li>)}
                  </ul>
                </div>
              )}
              {h.supporting_events && h.supporting_events.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-700">Supporting Events</p>
                  <p className="text-xs text-gray-500">{h.supporting_events.length} events</p>
                </div>
              )}
              {h.conflicting_events && h.conflicting_events.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-700">Conflicting Events</p>
                  <p className="text-xs text-gray-500">{h.conflicting_events.length} events</p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => toggle(h.insight_id)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {expanded[h.insight_id] ? "Less" : "More"}
            </button>
            {onReviewAction && (
              <>
                <button
                  onClick={() => onReviewAction("accept", h.insight_id)}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700 hover:bg-green-200"
                >
                  Accept
                </button>
                <button
                  onClick={() => onReviewAction("reject", h.insight_id)}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-red-100 text-red-700 hover:bg-red-200"
                >
                  Reject
                </button>
                <button
                  onClick={() => onReviewAction("note", h.insight_id)}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Note
                </button>
              </>
            )}
          </div>

          {h.safety_labels && h.safety_labels.map((label, i) => (
            <p key={i} className="mt-2 text-xs text-amber-600 font-medium">{label}</p>
          ))}
        </div>
      ))}
    </div>
  );
}
