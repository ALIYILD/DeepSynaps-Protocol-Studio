/**
 * DeepTwinPage.jsx — Main DeepTwin patient intelligence page
 * Phase 4: Governed multimodal patient synthesis layer
 */

import React, { useState, useEffect } from "react";
import PatientOverview from "./PatientOverview";
import ModalityCoverage from "./ModalityCoverage";
import CorrelationHighlights from "./CorrelationHighlights";
import ConfounderPanel from "./ConfounderPanel";
import RankedHypotheses from "./RankedHypotheses";
import EvidencePanel from "./EvidencePanel";
import ClinicianReview from "./ClinicianReview";
import ReportHandoff from "./ReportHandoff";
import ForecastPanel from "./ForecastPanel";

const SAFETY_DISCLAIMER =
  "DeepTwin provides decision support only and requires clinician review. " +
  "It does not diagnose, prescribe, prove causality, or predict outcomes. " +
  "All insights are temporal associations, not causal proof.";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "modalities", label: "Modalities" },
  { id: "correlations", label: "Correlations" },
  { id: "confounders", label: "Confounders" },
  { id: "hypotheses", label: "Hypotheses" },
  { id: "evidence", label: "Evidence" },
  { id: "review", label: "Clinician Review" },
  { id: "handoff", label: "Export / Handoff" },
  { id: "forecast", label: "Forecast" },
];

export default function DeepTwinPage({ patientId, clinicianId, clinicId }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    // In production, this calls the API
    // fetch(`/api/v1/deeptwin/patients/${patientId}/snapshot?clinician_id=${clinicianId}`, ...)
    setTimeout(() => {
      setSnapshot({
        patient_id: patientId,
        snapshot_id: "dts_demo_001",
        generated_at: new Date().toISOString(),
        modality_coverage: {
          assessment: true, qeeg: true, mri: true, biomarker: false,
          lab: true, medication: true, intervention: true, session: true,
          voice: false, text: true, video: false, movement: false,
          wearable: true, digital_phenotyping: false, risk_signal: true,
          report: true, document: true, patient_checkin: true,
        },
        recency_status: {
          assessment: "fresh", qeeg: "stale", mri: "stale", lab: "fresh",
          medication: "fresh", intervention: "fresh", wearable: "fresh",
        },
        correlation_findings: [
          {
            insight_id: "ins_001",
            insight_type: "correlation",
            summary: "Sleep improvement aligned with symptom improvement",
            confidence: 0.72,
            safety_labels: ["Temporal association only. Not causal proof."],
          },
        ],
        confounders: [
          {
            confounder_id: "cnf_001",
            confounder_type: "medication_changes",
            description: "Recent medication dose adjustment",
            severity: "moderate",
          },
        ],
        ranked_hypotheses: [
          {
            insight_id: "hyp_001",
            insight_type: "hypothesis",
            summary: "Intervention-related change: symptom improvement",
            confidence: 0.68,
            safety_labels: ["Ranked hypothesis. Requires clinician review."],
          },
        ],
        forecast_status: "unavailable: no calibrated model",
        clinician_review_status: { reviewed: false, hypotheses_reviewed: 0, hypotheses_total: 1 },
      });
      setLoading(false);
    }, 300);
  }, [patientId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto text-center py-20">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          <p className="mt-4 text-gray-600">Loading DeepTwin snapshot...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Safety Disclaimer Banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-start gap-3">
          <span className="text-amber-600 text-lg shrink-0">&#9888;</span>
          <p className="text-sm text-amber-800 leading-relaxed">{SAFETY_DISCLAIMER}</p>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">DeepTwin</h1>
            <p className="text-sm text-gray-500 mt-1">
              Patient: {patientId} &middot; Snapshot: {snapshot?.snapshot_id} &middot; Generated: {snapshot?.generated_at ? new Date(snapshot.generated_at).toLocaleString() : ""}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {snapshot?.clinician_review_status?.reviewed ? "Reviewed" : "Awaiting Review"}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              {Object.values(snapshot?.modality_coverage || {}).filter(Boolean).length}/18 Modalities
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 overflow-x-auto">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveTab(section.id)}
                className={
                  "px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors " +
                  (activeTab === section.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300")
                }
              >
                {section.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "overview" && <PatientOverview snapshot={snapshot} />}
        {activeTab === "modalities" && <ModalityCoverage snapshot={snapshot} />}
        {activeTab === "correlations" && <CorrelationHighlights snapshot={snapshot} />}
        {activeTab === "confounders" && <ConfounderPanel snapshot={snapshot} />}
        {activeTab === "hypotheses" && <RankedHypotheses snapshot={snapshot} />}
        {activeTab === "evidence" && <EvidencePanel snapshot={snapshot} />}
        {activeTab === "review" && (
          <ClinicianReview snapshot={snapshot} patientId={patientId} clinicianId={clinicianId} />
        )}
        {activeTab === "handoff" && <ReportHandoff snapshot={snapshot} patientId={patientId} clinicianId={clinicianId} />}
        {activeTab === "forecast" && <ForecastPanel snapshot={snapshot} />}
      </div>
    </div>
  );
}
