/**
 * ModalityCoverage.jsx — DeepTwin modality coverage + recency + quality panel
 */

import React from "react";

const ALL_MODALITIES = [
  "assessment", "qeeg", "mri", "biomarker", "lab", "medication",
  "intervention", "session", "voice", "text", "video", "movement",
  "wearable", "digital_phenotyping", "risk_signal", "report", "document", "patient_checkin",
];

const RECENCY_STYLES = {
  fresh: "bg-green-100 text-green-800 border-green-200",
  stale: "bg-yellow-100 text-yellow-800 border-yellow-200",
  old: "bg-orange-100 text-orange-800 border-orange-200",
  missing: "bg-gray-100 text-gray-400 border-gray-200",
};

export default function ModalityCoverage({ snapshot }) {
  if (!snapshot) return null;
  const mc = snapshot.modality_coverage || {};
  const rs = snapshot.recency_status || {};

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Modality Coverage</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {ALL_MODALITIES.map((mod) => {
          const present = mc[mod] || false;
          const recency = rs[mod] || (present ? "unknown" : "missing");
          const style = present ? (RECENCY_STYLES[recency] || RECENCY_STYLES.fresh) : RECENCY_STYLES.missing;
          return (
            <div key={mod} className={`rounded-md border p-3 ${style}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{mod.replace(/_/g, " ")}</span>
                <span className="text-xs uppercase tracking-wide">{present ? recency : "missing"}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-100 border border-green-200 inline-block" /> Fresh</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-100 border border-yellow-200 inline-block" /> Stale</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-100 border border-orange-200 inline-block" /> Old</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200 inline-block" /> Missing</span>
      </div>
    </div>
  );
}
