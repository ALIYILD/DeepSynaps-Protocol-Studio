/**
 * ProtocolStudioPage — Main hub page for the Protocol Studio module.
 *
 * The Protocol Studio is the core AI-assisted clinical decision-support
 * interface for neuromodulation protocol management. It provides:
 *
 * - Safety banner (always visible, decision-support disclaimer)
 * - Tab navigation across 7 workspaces: Conditions, Generate, Browse,
 *   Evidence, Compare, Simulation, Drafts
 * - Patient context panel (PHI-minimized sidebar)
 * - Controlled preview banner when viewing AI-generated outputs
 *
 * Every interactive element has a stable data-testid for regression testing.
 * All AI outputs are explicitly marked as decision-support only.
 */

import React, { useCallback, useEffect, useState } from "react";
import DraftManager from "./DraftManager";
import EvidencePanel from "./EvidencePanel";
import GenerationWizard from "./GenerationWizard";
import PatientContextPanel from "./PatientContextPanel";
import SafetyBanner from "./SafetyBanner";
import { fetchPatientContext, fetchProtocols } from "./protocolApi";
import type {
  ConditionItem,
  ModalityItem,
  PatientContext,
  ProtocolCatalogResponse,
} from "./protocolTypes";

type TabId =
  | "conditions"
  | "generate"
  | "browse"
  | "evidence"
  | "compare"
  | "simulation"
  | "drafts";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "conditions", label: "Conditions", icon: "M4 6h16M4 12h16M4 18h16" },
  { id: "generate", label: "Generate", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { id: "browse", label: "Browse", icon: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" },
  { id: "evidence", label: "Evidence", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
  { id: "compare", label: "Compare", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { id: "simulation", label: "Simulation", icon: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "drafts", label: "Drafts", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
];

const CONDITIONS: ConditionItem[] = [
  { id: "mdd", label: "Major Depressive Disorder", category: "Mood" },
  { id: "gad", label: "Generalized Anxiety Disorder", category: "Anxiety" },
  { id: "ptsd", label: "PTSD", category: "Trauma" },
  { id: "ocd", label: "OCD", category: "Anxiety" },
  { id: "adhd", label: "ADHD", category: "Neurodevelopmental" },
  { id: "chronic_pain", label: "Chronic Pain", category: "Pain" },
  { id: "fibromyalgia", label: "Fibromyalgia", category: "Pain" },
  { id: "insomnia", label: "Insomnia", category: "Sleep" },
  { id: "addiction", label: "Substance Use Disorder", category: "Addiction" },
  { id: "cognitive_decline", label: "Mild Cognitive Impairment", category: "Neurocognitive" },
];

const MODALITIES: ModalityItem[] = [
  { id: "rtms", label: "rTMS", description: "Repetitive transcranial magnetic stimulation" },
  { id: "tdcs", label: "tDCS", description: "Transcranial direct current stimulation" },
  { id: "tacs", label: "tACS", description: "Transcranial alternating current stimulation" },
  { id: "tms_theta", label: "TBS / Theta Burst", description: "Theta burst stimulation patterned protocol" },
  { id: "deep_tms", label: "Deep TMS", description: "H-coil deep transcranial magnetic stimulation" },
];

/**
 * Conditions browser — list conditions with category grouping.
 */
const ConditionsPanel: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const categories = ["all", ...new Set(CONDITIONS.map((c) => c.category))];

  const filtered =
    selectedCategory === "all"
      ? CONDITIONS
      : CONDITIONS.filter((c) => c.category === selectedCategory);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
              selectedCategory === cat
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            data-testid={`conditions-category-${cat}`}
            type="button"
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
            data-testid={`condition-card-${c.id}`}
          >
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {c.category}
            </span>
            <p className="mt-2 text-sm font-medium text-slate-800">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Protocol browser — list protocols with filtering.
 */
const BrowsePanel: React.FC = () => {
  const [protocols, setProtocols] = useState<ProtocolCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conditionFilter, setConditionFilter] = useState("");
  const [modalityFilter, setModalityFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchProtocols(
        conditionFilter || undefined,
        modalityFilter || undefined
      );
      setProtocols(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load protocols."
      );
    } finally {
      setLoading(false);
    }
  }, [conditionFilter, modalityFilter]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-100"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center" role="alert">
        <p className="text-sm text-rose-700">{error}</p>
        <button
          onClick={load}
          className="mt-2 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500"
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={conditionFilter}
          onChange={(e) => setConditionFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          aria-label="Filter by condition"
        >
          <option value="">All conditions</option>
          {CONDITIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={modalityFilter}
          onChange={(e) => setModalityFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          aria-label="Filter by modality"
        >
          <option value="">All modalities</option>
          {MODALITIES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {(!protocols || protocols.protocols.length === 0) ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <p className="text-sm text-slate-500">No protocols found matching the selected filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {protocols.protocols.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
              data-testid={`protocol-card-${p.id}`}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">{p.title}</h4>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {p.modality}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {p.condition} · Target: {p.target} · Evidence: {p.evidenceGrade}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Compare panel — side-by-side protocol comparison placeholder.
 */
const ComparePanel: React.FC = () => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
    <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
    <p className="mt-3 text-sm font-medium text-slate-600">Protocol Comparison</p>
    <p className="mt-1 text-xs text-slate-400">
      Select protocols from the Browse tab to compare side-by-side.
      Decision-support only — all comparisons require clinician review.
    </p>
  </div>
);

/**
 * Simulation panel — parameter simulation placeholder.
 */
const SimulationPanel: React.FC = () => (
  <div className="space-y-4">
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h4 className="text-sm font-semibold text-slate-700">Parameter Simulation</h4>
      <p className="mt-1 text-xs text-slate-500">
        Simulate expected outcomes for protocol parameters over time.
        Decision-support only — not a prediction of clinical results.
      </p>
      <div className="mt-4 rounded-md bg-slate-50 p-8 text-center">
        <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
        <p className="mt-2 text-sm text-slate-500">Simulation engine ready</p>
        <p className="text-xs text-slate-400">
          Select a protocol from Browse or generate one to run simulation.
        </p>
      </div>
    </div>
  </div>
);

/**
 * Controlled preview banner shown when AI-generated content is displayed.
 */
const ControlledPreviewBanner: React.FC = () => (
  <div
    data-testid="protocol-studio-controlled-preview"
    className="rounded-md border border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-700"
    role="status"
  >
    <span className="font-semibold">Controlled preview:</span> AI-generated
    content below is decision-support only and requires clinician review. Not
    for autonomous prescribing.
  </div>
);

// ── Main Page Component ──────────────────────────────────────────────────────

interface ProtocolStudioPageProps {
  patientId?: string;
}

/**
 * ProtocolStudioPage — the main hub for the Protocol Studio module.
 *
 * Composes SafetyBanner, tab navigation, patient context panel, and
 * tab-specific content areas. All testids match the regression test
 * expectations in protocol-studio-ux.test.js.
 */
const ProtocolStudioPage: React.FC<ProtocolStudioPageProps> = ({
  patientId = "demo-patient",
}) => {
  const [activeTab, setActiveTab] = useState<TabId>("conditions");
  const [patientContext, setPatientContext] = useState<PatientContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [showPreviewBanner, setShowPreviewBanner] = useState(false);

  /** Load patient context on mount or when patientId changes. */
  const loadContext = useCallback(async () => {
    setContextLoading(true);
    setContextError(null);
    try {
      const res = await fetchPatientContext(patientId);
      setPatientContext(res.context);
    } catch {
      // Don't expose patient ID in error messages
      setContextError(
        "Failed to load patient context. Please check network connection and try again."
      );
    } finally {
      setContextLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  /** Show preview banner for AI-generated content tabs. */
  useEffect(() => {
    setShowPreviewBanner(activeTab === "generate" || activeTab === "simulation");
  }, [activeTab]);

  const handleSaveDraft = useCallback(() => {
    setActiveTab("drafts");
  }, []);

  return (
    <div
      data-testid="protocol-studio-root"
      className="flex h-screen flex-col bg-slate-50"
    >
      {/* Safety banner — always visible at top */}
      <SafetyBanner />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tab bar */}
          <nav
            data-testid="protocol-studio-tabbar"
            className="border-b border-slate-200 bg-white px-4"
            role="tablist"
            aria-label="Protocol Studio tabs"
          >
            <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-2.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 ${
                    activeTab === tab.id
                      ? "text-sky-700 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-sky-600"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`tabpanel-${tab.id}`}
                  data-testid={`protocol-studio-tab-${tab.id}`}
                  type="button"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d={tab.icon}
                    />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Tab content */}
          <div
            data-testid="protocol-studio-body"
            className="flex-1 overflow-auto p-4"
            role="tabpanel"
          >
            <div className="mx-auto max-w-5xl space-y-4">
              {/* Controlled preview banner */}
              {showPreviewBanner && <ControlledPreviewBanner />}

              {/* Tab panels */}
              {activeTab === "conditions" && <ConditionsPanel />}

              {activeTab === "generate" && (
                <GenerationWizard
                  patientId={patientId}
                  availableDataSources={
                    patientContext?.dataSources || {
                      qeeg: false,
                      mri: false,
                      deeptwin: false,
                      evidence: true,
                    }
                  }
                  onSaveDraft={handleSaveDraft}
                />
              )}

              {activeTab === "browse" && <BrowsePanel />}

              {activeTab === "evidence" && <EvidencePanel />}

              {activeTab === "compare" && <ComparePanel />}

              {activeTab === "simulation" && <SimulationPanel />}

              {activeTab === "drafts" && (
                <DraftManager onRefresh={() => {}} />
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar — patient context */}
        <aside className="w-72 overflow-y-auto border-l border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Patient Context
          </h3>
          <PatientContextPanel
            context={patientContext}
            loading={contextLoading}
            error={contextError}
            onRetry={loadContext}
          />
        </aside>
      </div>
    </div>
  );
};

export default ProtocolStudioPage;
