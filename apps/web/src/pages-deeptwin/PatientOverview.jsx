/**
 * PatientOverview.jsx — DeepTwin patient overview panel
 */

import React from "react";

const RECENCY_COLORS = { fresh: "bg-green-100 text-green-800", stale: "bg-yellow-100 text-yellow-800", old: "bg-orange-100 text-orange-800", missing: "bg-gray-100 text-gray-500" };

export default function PatientOverview({ snapshot }) {
  if (!snapshot) return null;
  const mc = snapshot.modality_coverage || {};
  const rs = snapshot.recency_status || {};
  const activeCount = Object.values(mc).filter(Boolean).length;
  const totalCount = Object.keys(mc).length;

  return (
    <div className="space-y-6">
      {/* Modality Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Active Modalities</p>
          <p className="text-2xl font-bold text-blue-600">{activeCount}/{totalCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Correlations</p>
          <p className="text-2xl font-bold text-blue-600">{(snapshot.correlation_findings || []).length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Confounders</p>
          <p className="text-2xl font-bold text-amber-600">{(snapshot.confounders || []).length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Hypotheses</p>
          <p className="text-2xl font-bold text-purple-600">{(snapshot.ranked_hypotheses || []).length}</p>
        </div>
      </div>

      {/* Key Changes */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Changes</h3>
        {(snapshot.ranked_hypotheses || []).length > 0 ? (
          <ul className="space-y-3">
            {snapshot.ranked_hypotheses.map((h) => (
              <li key={h.insight_id} className="flex items-start gap-3 p-3 rounded-md bg-gray-50">
                <span className="text-purple-500 mt-0.5">&#9679;</span>
                <div>
                  <p className="text-sm text-gray-900">{h.summary}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Confidence: {Math.round((h.confidence || 0) * 100)}% &middot;
                    Requires clinician review
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 italic">No significant changes detected.</p>
        )}
      </div>

      {/* Forecast Warning */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-lg">&#128161;</span>
          <div>
            <p className="text-sm font-medium text-gray-700">Forecast</p>
            <p className="text-sm text-gray-500">{snapshot.forecast_status || "unavailable: no calibrated model"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
