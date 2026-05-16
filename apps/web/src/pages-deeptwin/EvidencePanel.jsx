/**
 * EvidencePanel.jsx — DeepTwin evidence links display panel
 */

import React from "react";

const GRADE_COLORS = { A: "bg-green-100 text-green-800", B: "bg-blue-100 text-blue-800", C: "bg-yellow-100 text-yellow-800", D: "bg-red-100 text-red-800" };

export default function EvidencePanel({ snapshot }) {
  if (!snapshot) return null;
  const evidence = snapshot.evidence_links || [];

  return (
    <div className="space-y-4">
      {evidence.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          No evidence links attached to current hypotheses.
        </div>
      )}
      {evidence.map((ev, idx) => (
        <div key={ev.evidence_id || idx} className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-gray-900">{ev.citation}</h4>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${GRADE_COLORS[ev.evidence_grade] || GRADE_COLORS.D}`}>
                  Grade {ev.evidence_grade || "D"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Source: {ev.source_type} &middot;
                Confidence: {Math.round((ev.confidence || 0) * 100)}%
              </p>
            </div>
            <div className="flex flex-col gap-1 items-end shrink-0">
              {ev.research_only && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                  Research Only
                </span>
              )}
              {ev.conflicting && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                  Conflicting
                </span>
              )}
            </div>
          </div>
          {ev.url && (
            <a
              href={ev.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              View source &#8599;
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
