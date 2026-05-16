/**
 * ClinicianReview.jsx — DeepTwin clinician review workspace
 */

import React, { useState } from "react";

export default function ClinicianReview({ snapshot, patientId, clinicianId }) {
  const [note, setNote] = useState("");
  const [reviews, setReviews] = useState([]);
  const [requestModalities, setRequestModalities] = useState([]);
  const [success, setSuccess] = useState(null);

  if (!snapshot) return null;

  const hypotheses = snapshot.ranked_hypotheses || [];
  const status = snapshot.clinician_review_status || {};

  const handleAction = (action, hypothesisId) => {
    const review = {
      review_id: `rev_${Date.now()}`,
      action,
      hypothesis_id: hypothesisId,
      note: note,
      clinician_id: clinicianId,
      reviewed_at: new Date().toISOString(),
    };
    setReviews((prev) => [...prev, review]);
    setNote("");
    setSuccess(`Action "${action}" recorded for hypothesis ${hypothesisId}`);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleRequestData = () => {
    const review = {
      review_id: `rev_${Date.now()}`,
      action: "request_data",
      hypothesis_id: "all",
      requested_modalities: requestModalities,
      note,
      clinician_id: clinicianId,
      reviewed_at: new Date().toISOString(),
    };
    setReviews((prev) => [...prev, review]);
    setRequestModalities([]);
    setNote("");
    setSuccess("Data request recorded");
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleMarkReviewed = () => {
    const review = {
      review_id: `rev_${Date.now()}`,
      action: "mark_reviewed",
      hypothesis_id: "all",
      note,
      clinician_id: clinicianId,
      reviewed_at: new Date().toISOString(),
    };
    setReviews((prev) => [...prev, review]);
    setNote("");
    setSuccess("Snapshot marked as reviewed");
    setTimeout(() => setSuccess(null), 3000);
  };

  const MODALITY_OPTIONS = [
    "assessment", "qeeg", "mri", "biomarker", "lab", "voice", "video", "wearable",
  ];

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* Review Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Review Status</h3>
        <div className="flex items-center gap-6 text-sm">
          <span className={status.reviewed ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
            {status.reviewed ? "Reviewed" : "Awaiting Review"}
          </span>
          <span className="text-gray-500">
            {status.hypotheses_reviewed || 0} of {status.hypotheses_total || hypotheses.length} hypotheses reviewed
          </span>
        </div>
      </div>

      {/* Hypothesis Actions */}
      {hypotheses.map((h) => (
        <div key={h.insight_id} className="bg-white rounded-lg border border-gray-200 p-5">
          <h4 className="text-sm font-medium text-gray-900 mb-3">{h.summary}</h4>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleAction("accept", h.insight_id)}
              className="px-4 py-2 text-sm font-medium rounded-md bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
            >
              &#10003; Accept
            </button>
            <button
              onClick={() => handleAction("reject", h.insight_id)}
              className="px-4 py-2 text-sm font-medium rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            >
              &#10007; Reject
            </button>
            <button
              onClick={() => handleAction("note", h.insight_id)}
              className="px-4 py-2 text-sm font-medium rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
            >
              &#9998; Note
            </button>
          </div>
        </div>
      ))}

      {/* Note Input */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">Clinical Note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter clinical observation, rationale, or follow-up plan..."
        />
      </div>

      {/* Request More Data */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Request Additional Data</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {MODALITY_OPTIONS.map((mod) => (
            <label key={mod} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 text-sm cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                value={mod}
                checked={requestModalities.includes(mod)}
                onChange={(e) => {
                  if (e.target.checked) setRequestModalities((p) => [...p, mod]);
                  else setRequestModalities((p) => p.filter((m) => m !== mod));
                }}
              />
              <span className="capitalize">{mod.replace(/_/g, " ")}</span>
            </label>
          ))}
        </div>
        <button
          onClick={handleRequestData}
          disabled={requestModalities.length === 0}
          className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Request Data
        </button>
      </div>

      {/* Mark Reviewed */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <button
          onClick={handleMarkReviewed}
          className="px-6 py-3 text-sm font-semibold rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors"
        >
          Mark Snapshot as Reviewed
        </button>
      </div>

      {/* Review History */}
      {reviews.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Review History</h3>
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.review_id} className="text-xs text-gray-600 border-l-2 border-gray-300 pl-3 py-1">
                <span className="font-medium capitalize">{r.action}</span> on {r.hypothesis_id}
                {r.note && <span className="block text-gray-400 mt-1">Note: {r.note}</span>}
                <span className="block text-gray-400">{new Date(r.reviewed_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
