/**
 * SynthesisDashboard — DeepTwin Prep Page
 * Tabbed interface combining all multimodal intelligence components.
 * Always displays safety disclaimer banner.
 */
import React, { useState, useEffect, useCallback } from "react";
import TimelineView from "../components/multimodal/TimelineView";
import CorrelationCard from "../components/multimodal/CorrelationCard";
import ConfounderCard from "../components/multimodal/ConfounderCard";
import DataQualityFlags from "../components/multimodal/DataQualityFlags";
import InsightCard from "../components/multimodal/InsightCard";
import {
  fetchTimeline,
  fetchCorrelations,
  fetchConfounders,
  fetchQualityFlags,
  requestSynthesis,
} from "../api";

const TABS = [
  { id: "timeline", label: "Timeline", icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )},
  { id: "correlations", label: "Correlations", icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  )},
  { id: "confounders", label: "Confounders", icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  )},
  { id: "quality", label: "Quality Flags", icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )},
  { id: "synthesis", label: "Synthesis", icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  )},
];

export default function SynthesisDashboard({
  patientId = "demo-patient-001",
  clinicianId = "clinician-001",
}) {
  const [activeTab, setActiveTab] = useState("timeline");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Data states
  const [timelineData, setTimelineData] = useState(null);
  const [correlationData, setCorrelationData] = useState(null);
  const [confounderData, setConfounderData] = useState(null);
  const [qualityData, setQualityData] = useState(null);
  const [synthesisData, setSynthesisData] = useState(null);

  const clearError = () => setError(null);

  const loadTimeline = useCallback(async (params = {}) => {
    setLoading(true);
    clearError();
    try {
      const data = await fetchTimeline(patientId, { clinician_id: clinicianId, ...params });
      setTimelineData(data);
    } catch (err) {
      setError({ tab: "timeline", message: err.message });
    } finally {
      setLoading(false);
    }
  }, [patientId, clinicianId]);

  const loadCorrelations = useCallback(async (params = {}) => {
    setLoading(true);
    clearError();
    try {
      const data = await fetchCorrelations(patientId, { clinician_id: clinicianId, ...params });
      setCorrelationData(data);
    } catch (err) {
      setError({ tab: "correlations", message: err.message });
    } finally {
      setLoading(false);
    }
  }, [patientId, clinicianId]);

  const loadConfounders = useCallback(async () => {
    setLoading(true);
    clearError();
    try {
      const data = await fetchConfounders(patientId, { clinician_id: clinicianId });
      setConfounderData(data);
    } catch (err) {
      setError({ tab: "confounders", message: err.message });
    } finally {
      setLoading(false);
    }
  }, [patientId, clinicianId]);

  const loadQualityFlags = useCallback(async () => {
    setLoading(true);
    clearError();
    try {
      const data = await fetchQualityFlags(patientId, { clinician_id: clinicianId });
      setQualityData(data);
    } catch (err) {
      setError({ tab: "quality", message: err.message });
    } finally {
      setLoading(false);
    }
  }, [patientId, clinicianId]);

  const loadSynthesis = useCallback(async (body = {}) => {
    setLoading(true);
    clearError();
    try {
      const data = await requestSynthesis(patientId, body);
      setSynthesisData(data);
    } catch (err) {
      setError({ tab: "synthesis", message: err.message });
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  // Auto-load on tab switch
  useEffect(() => {
    switch (activeTab) {
      case "timeline":
        if (!timelineData) loadTimeline();
        break;
      case "correlations":
        if (!correlationData) loadCorrelations();
        break;
      case "confounders":
        if (!confounderData) loadConfounders();
        break;
      case "quality":
        if (!qualityData) loadQualityFlags();
        break;
      case "synthesis":
        if (!synthesisData) loadSynthesis();
        break;
    }
  }, [activeTab]);

  // Initial load
  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const handleTimelineFilterChange = (filters) => {
    const params = {};
    if (filters.modalities?.length > 0) params.modality = filters.modalities;
    if (filters.dateFrom) params.from_date = filters.dateFrom;
    if (filters.dateTo) params.to_date = filters.dateTo;
    loadTimeline(params);
  };

  const handleSynthesisRequest = () => {
    loadSynthesis({
      include_modalities: ["assessment", "qeeg", "mri", "biomarker", "wearable"],
      date_range: ["2024-01-01", "2024-12-31"],
      focus_areas: ["cognitive", "sleep", "medication"],
      min_confidence: 0.3,
      max_hypotheses: 5,
    });
  };

  return (
    <div className="min-h-screen bg-gray-100" data-testid="synthesis-dashboard">
      {/* Safety disclaimer banner */}
      <div className="bg-red-50 border-b border-red-200 px-4 py-3" data-testid="safety-banner">
        <div className="max-w-7xl mx-auto flex items-start gap-3">
          <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-red-800">Safety Disclaimer</p>
            <p className="text-sm text-red-700">
              This dashboard is decision support only and requires clinician review.
              It does not constitute a diagnosis or treatment recommendation.
              All outputs are temporal associations — never causal proof.
            </p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">DeepSynaps Protocol Studio</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Patient: <span className="font-mono text-gray-700">{patientId}</span> |
                Clinician: <span className="font-mono text-gray-700">{clinicianId}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-blue-600" data-testid="loading-indicator">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-4">
        <div className="max-w-7xl mx-auto">
          <nav className="flex gap-1 -mb-px overflow-x-auto" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
                data-testid={`tab-${tab.id}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab panels */}
      <div className="px-4 py-6">
        <div className="max-w-7xl mx-auto">
          {/* Error display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4" role="alert" data-testid="error-message">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-red-800">Error loading data</p>
                  <p className="text-sm text-red-600">{error.message}</p>
                </div>
              </div>
            </div>
          )}

          {/* Timeline panel */}
          {activeTab === "timeline" && (
            <div role="tabpanel" id="panel-timeline" data-testid="panel-timeline">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Multimodal Timeline</h2>
              <TimelineView
                patientId={patientId}
                events={timelineData?.events || []}
                availableModalities={[...new Set((timelineData?.events || []).map((e) => e.modality))].sort()}
                onFilterChange={handleTimelineFilterChange}
              />
            </div>
          )}

          {/* Correlations panel */}
          {activeTab === "correlations" && (
            <div role="tabpanel" id="panel-correlations" data-testid="panel-correlations">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Correlation Findings</h2>
              <div className="mb-4 flex items-center gap-3">
                <label className="text-sm text-gray-600">Window (days):</label>
                <select
                  onChange={(e) => loadCorrelations({ window_days: parseInt(e.target.value) })}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                  data-testid="window-select"
                  defaultValue={30}
                >
                  <option value={7}>7</option>
                  <option value={14}>14</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                  <option value={90}>90</option>
                </select>
                <label className="text-sm text-gray-600">Min confidence:</label>
                <select
                  onChange={(e) => loadCorrelations({ min_confidence: parseFloat(e.target.value) })}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                  data-testid="confidence-select"
                  defaultValue={0.5}
                >
                  <option value={0.3}>0.3</option>
                  <option value={0.5}>0.5</option>
                  <option value={0.7}>0.7</option>
                  <option value={0.85}>0.85</option>
                </select>
              </div>
              {correlationData?.correlations?.length === 0 && (
                <p className="text-sm text-gray-500 italic">No correlations found with current filters.</p>
              )}
              {(correlationData?.correlations || []).map((corr) => (
                <CorrelationCard key={corr.insight_id} correlation={corr} />
              ))}
            </div>
          )}

          {/* Confounders panel */}
          {activeTab === "confounders" && (
            <div role="tabpanel" id="panel-confounders" data-testid="panel-confounders">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Potential Confounders</h2>
              {confounderData?.confounders?.length === 0 && (
                <p className="text-sm text-gray-500 italic">No confounders detected.</p>
              )}
              {(confounderData?.confounders || []).map((conf) => (
                <ConfounderCard key={conf.insight_id} confounder={conf} />
              ))}
            </div>
          )}

          {/* Quality Flags panel */}
          {activeTab === "quality" && (
            <div role="tabpanel" id="panel-quality" data-testid="panel-quality">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Quality Flags</h2>
              <DataQualityFlags flags={qualityData?.quality_flags || []} />
            </div>
          )}

          {/* Synthesis panel */}
          {activeTab === "synthesis" && (
            <div role="tabpanel" id="panel-synthesis" data-testid="panel-synthesis">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Full Synthesis</h2>
                <button
                  onClick={handleSynthesisRequest}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  data-testid="run-synthesis-btn"
                >
                  Run Synthesis
                </button>
              </div>

              {synthesisData && (
                <div className="space-y-6">
                  {/* Evidence summary */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4" data-testid="evidence-summary">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Evidence Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-blue-50 rounded p-2 text-center">
                        <div className="text-lg font-bold text-blue-700">{synthesisData.evidence_summary?.total_insights || 0}</div>
                        <div className="text-xs text-blue-600">Total Insights</div>
                      </div>
                      <div className="bg-purple-50 rounded p-2 text-center">
                        <div className="text-lg font-bold text-purple-700">{synthesisData.evidence_summary?.correlations || 0}</div>
                        <div className="text-xs text-purple-600">Correlations</div>
                      </div>
                      <div className="bg-orange-50 rounded p-2 text-center">
                        <div className="text-lg font-bold text-orange-700">{synthesisData.evidence_summary?.confounders || 0}</div>
                        <div className="text-xs text-orange-600">Confounders</div>
                      </div>
                      <div className="bg-green-50 rounded p-2 text-center">
                        <div className="text-lg font-bold text-green-700">{synthesisData.evidence_summary?.hypotheses || 0}</div>
                        <div className="text-xs text-green-600">Hypotheses</div>
                      </div>
                    </div>
                    {synthesisData.evidence_summary?.average_confidence !== undefined && (
                      <p className="text-xs text-gray-500 mt-2">
                        Average confidence: {Math.round(synthesisData.evidence_summary.average_confidence * 100)}%
                      </p>
                    )}
                  </div>

                  {/* Hypotheses */}
                  {synthesisData.ranked_hypotheses?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Ranked Hypotheses</h3>
                      {synthesisData.ranked_hypotheses.map((hyp) => (
                        <InsightCard key={hyp.insight_id} insight={hyp} />
                      ))}
                    </div>
                  )}

                  {/* Timeline summary */}
                  {synthesisData.timeline?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Timeline ({synthesisData.timeline.length} events)
                      </h3>
                      <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 max-h-64 overflow-y-auto">
                        {synthesisData.timeline.slice(0, 10).map((evt) => (
                          <div key={evt.event_id} className="text-xs text-gray-600 py-1 border-b border-gray-100 last:border-0">
                            <span className="font-mono text-gray-400">{new Date(evt.timestamp).toLocaleDateString()}</span>
                            {" "}<span className="font-medium capitalize">{evt.modality}</span>
                            {" — "}{evt.value_summary}
                          </div>
                        ))}
                        {synthesisData.timeline.length > 10 && (
                          <p className="text-xs text-gray-400 mt-2 italic">
                            ...and {synthesisData.timeline.length - 10} more events
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Synthesis disclaimer */}
                  <p className="text-xs text-gray-500 italic bg-gray-50 rounded p-3 border border-gray-200" data-testid="synthesis-disclaimer">
                    {synthesisData.safety_disclaimer}
                  </p>
                </div>
              )}

              {!synthesisData && !loading && !error && (
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
                  <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <p className="text-sm text-gray-600">Run synthesis to see combined intelligence output.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
