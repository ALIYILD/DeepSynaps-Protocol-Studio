import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAppState } from "../app/useAppStore";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ContraindicationWarning } from "../components/ui/ContraindicationWarning";
import { EmptyState } from "../components/ui/EmptyState";
import { EvidenceGradeBadge } from "../components/ui/EvidenceGradeBadge";
import { InfoNotice } from "../components/ui/InfoNotice";
import { PageHeader } from "../components/ui/PageHeader";
import { Skeleton, SkeletonText } from "../components/ui/Skeleton";
import { DRAFT_SUPPORT_ONLY, OFF_LABEL_REVIEW_REQUIRED, PROFESSIONAL_USE_ONLY } from "../content/disclaimers";
import { stagedUploadExamples } from "../data/mockData";
import { ApiError } from "../lib/api/client";
import {
  exportProtocolDocx,
  fetchEvidenceLibrary,
  generateCaseSummary,
  generateProtocolDraft,
} from "../lib/api/services";
import {
  CaseSummary,
  EvidenceItem,
  Modality,
  ProtocolDraft,
  UploadedAsset,
} from "../types/domain";

// ── Evidence grade helpers ────────────────────────────────────────────────────

const EVIDENCE_ORDER: Record<string, number> = {
  Guideline: 0,
  "Systematic Review": 1,
  Emerging: 2,
  Consensus: 3,
  Registry: 4,
};

function sortByEvidence(items: EvidenceItem[]): EvidenceItem[] {
  return [...items].sort(
    (a, b) =>
      (EVIDENCE_ORDER[a.evidenceLevel] ?? 99) -
      (EVIDENCE_ORDER[b.evidenceLevel] ?? 99),
  );
}

function evidenceLevelToGradeLetter(level: string): string {
  switch (level) {
    case "Guideline":
      return "A";
    case "Systematic Review":
      return "B";
    case "Emerging":
      return "C";
    case "Consensus":
      return "C";
    case "Registry":
      return "D";
    default:
      return level;
  }
}

function mapEvidenceLevelToThreshold(
  level: string,
): "Guideline" | "Systematic Review" | "Consensus" | "Registry" {
  switch (level) {
    case "Guideline":
      return "Guideline";
    case "Systematic Review":
      return "Systematic Review";
    case "Emerging":
      return "Consensus";
    default:
      return "Registry";
  }
}

// ── Tab type ──────────────────────────────────────────────────────────────────

type ActiveTab = "evidence" | "off-label" | "personalized";

// ── Regulatory status badge helper ────────────────────────────────────────────

function regulatoryBadgeTone(
  status: string,
): "success" | "info" | "warning" | "neutral" {
  switch (status) {
    case "Approved":
      return "success";
    case "Cleared":
      return "info";
    case "Emerging":
      return "warning";
    default:
      return "neutral";
  }
}

function approvalBadgeTone(
  badge: string,
): "success" | "warning" | "accent" | "neutral" {
  switch (badge) {
    case "approved use":
      return "success";
    case "off-label":
      return "warning";
    case "emerging evidence":
      return "warning";
    default:
      return "accent";
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ProtocolsPage() {
  const { role } = useAppState();
  const [searchParams] = useSearchParams();

  // Pre-fill from patient prescribe flow (?patient=X&condition=Y&modality=Z)
  const prefilledPatient   = searchParams.get("patient") ?? null;
  const prefilledCondition = searchParams.get("condition") ?? "All";
  const prefilledModality  = searchParams.get("modality") ?? "All";

  // Shared
  const [activeTab, setActiveTab] = useState<ActiveTab>("evidence");
  const [allProtocols, setAllProtocols] = useState<EvidenceItem[]>([]);
  const [protocolsLoading, setProtocolsLoading] = useState(true);

  // List filtering
  const [search, setSearch] = useState("");
  const [filterCondition, setFilterCondition] = useState(prefilledCondition);
  const [filterModality, setFilterModality] = useState(prefilledModality);

  // Selected + generation
  const [selected, setSelected] = useState<EvidenceItem | null>(null);
  const [draft, setDraft] = useState<ProtocolDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [offLabelAcknowledged, setOffLabelAcknowledged] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);

  // Personalized tab
  const [stagedUploads, setStagedUploads] = useState<UploadedAsset[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [caseSummary, setCaseSummary] = useState<CaseSummary | null>(null);
  const [analyseError, setAnalyseError] = useState<string | null>(null);

  const detailPanelRef = useRef<HTMLDivElement>(null);

  // Load protocols on mount
  useEffect(() => {
    let cancelled = false;
    setProtocolsLoading(true);

    fetchEvidenceLibrary()
      .then(({ items }) => {
        if (cancelled) return;
        setAllProtocols(sortByEvidence(items));
      })
      .catch(() => {
        if (cancelled) return;
        setAllProtocols([]);
      })
      .finally(() => {
        if (!cancelled) setProtocolsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Unique conditions and modalities for filter dropdowns
  const conditionOptions = useMemo(
    () => ["All", ...new Set(allProtocols.map((p) => p.condition))],
    [allProtocols],
  );
  const modalityOptions = useMemo(
    () => ["All", ...new Set(allProtocols.map((p) => p.modality))],
    [allProtocols],
  );

  // Evidence-based list (all protocols, with search/condition/modality filters)
  const evidenceProtocols = useMemo(() => {
    const q = search.toLowerCase();
    return sortByEvidence(
      allProtocols.filter((p) => {
        const matchSearch =
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.condition.toLowerCase().includes(q) ||
          p.modality.toLowerCase().includes(q);
        const matchCondition =
          filterCondition === "All" || p.condition === filterCondition;
        const matchModality =
          filterModality === "All" || p.modality === filterModality;
        return matchSearch && matchCondition && matchModality;
      }),
    );
  }, [allProtocols, search, filterCondition, filterModality]);

  // Off-label list — Emerging, Consensus, Registry evidence levels only
  const offLabelProtocols = useMemo(() => {
    const q = search.toLowerCase();
    return sortByEvidence(
      allProtocols.filter((p) => {
        const matchSearch =
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.condition.toLowerCase().includes(q) ||
          p.modality.toLowerCase().includes(q);
        const isOffLabel =
          p.evidenceLevel === "Emerging" ||
          p.evidenceLevel === "Consensus" ||
          p.evidenceLevel === "Registry";
        return matchSearch && isOffLabel;
      }),
    );
  }, [allProtocols, search]);

  // Personalized matched protocols — filtered by suggested modalities
  const personalizedMatchedProtocols = useMemo(() => {
    if (!caseSummary || caseSummary.suggestedModalities.length === 0) return [];
    return sortByEvidence(
      allProtocols.filter((p) =>
        caseSummary.suggestedModalities.includes(p.modality),
      ),
    );
  }, [allProtocols, caseSummary]);

  function handleTabChange(tab: ActiveTab) {
    setActiveTab(tab);
    setSelected(null);
    setDraft(null);
    setGenerateError(null);
    setOffLabelAcknowledged(false);
  }

  function handleSelectProtocol(item: EvidenceItem) {
    setSelected(item);
    setDraft(null);
    setGenerateError(null);
    setOffLabelAcknowledged(false);
    setTimeout(() => {
      detailPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
  }

  async function handleGenerate() {
    if (!selected) return;
    setGenerating(true);
    setGenerateError(null);
    setDraft(null);

    try {
      const result = await generateProtocolDraft({
        role,
        condition: selected.condition,
        symptomCluster: selected.symptomCluster,
        modality: selected.modality,
        device: selected.relatedDevices?.[0] ?? "Any compatible device",
        setting: "Clinic",
        evidenceThreshold: mapEvidenceLevelToThreshold(selected.evidenceLevel),
        offLabel: activeTab === "off-label",
      });
      setDraft(result);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setGenerateError(caught.message);
      } else {
        setGenerateError("Protocol draft could not be generated.");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleExportDocx() {
    if (!selected) return;
    setExportingDocx(true);
    try {
      const blob = await exportProtocolDocx(
        {
          condition: selected.condition,
          modality: selected.modality,
          device: selected.relatedDevices?.[0] ?? "Any compatible device",
          setting: "Clinic",
          evidence_threshold: mapEvidenceLevelToThreshold(selected.evidenceLevel),
          off_label: activeTab === "off-label",
        },
        role,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `protocol_${selected.condition}_${selected.modality}.docx`.replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore — draft is still visible
    } finally {
      setExportingDocx(false);
    }
  }

  function stageUpload(upload: UploadedAsset) {
    setStagedUploads((current) =>
      current.find((u) => u.id === upload.id) ? current : [...current, upload],
    );
  }

  async function handleAnalyse() {
    if (stagedUploads.length === 0) return;
    setAnalysing(true);
    setAnalyseError(null);
    setCaseSummary(null);

    try {
      const result = await generateCaseSummary({
        role,
        uploads: stagedUploads.map((u) => ({
          type: u.type,
          fileName: u.fileName,
          summary: u.summary,
        })),
      });
      setCaseSummary(result);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setAnalyseError(caught.message);
      } else {
        setAnalyseError("Document analysis could not be completed.");
      }
    } finally {
      setAnalysing(false);
    }
  }

  const activeList =
    activeTab === "evidence" ? evidenceProtocols : offLabelProtocols;

  return (
    <div className="grid gap-6">
      <PageHeader
        icon="⚡"
        eyebrow="Protocols"
        title="Protocol Library"
        description="Browse evidence-based and off-label neuromodulation protocols, or upload patient documents for personalised matching."
      />

      {prefilledPatient && (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-soft-border)" }}
        >
          <span className="text-lg" aria-hidden="true">👥</span>
          <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            Prescribing for <strong>{prefilledPatient}</strong> — filters pre-set from patient profile.
          </p>
        </div>
      )}

      <InfoNotice
        title="Clinical reference only"
        body={`${PROFESSIONAL_USE_ONLY} ${DRAFT_SUPPORT_ONLY}`}
      />

      {/* Tab bar */}
      <div className="flex gap-2 rounded-2xl bg-[var(--bg-subtle)] p-1.5 w-fit">
        {(
          [
            { id: "evidence" as ActiveTab, label: "Evidence-Based" },
            { id: "off-label" as ActiveTab, label: "Off-Label" },
            { id: "personalized" as ActiveTab, label: "Personalized" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 ${
              activeTab === tab.id
                ? "bg-[var(--bg-strong)] text-[var(--accent)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1 & 2: Evidence-Based / Off-Label */}
      {(activeTab === "evidence" || activeTab === "off-label") && (
        <div className="grid gap-6 xl:grid-cols-[35%_1fr]">
          {/* Left: Protocol list */}
          <div className="flex flex-col gap-4">
            {/* Search and filters */}
            <div className="flex flex-col gap-3">
              <input
                type="search"
                placeholder="Search protocols, conditions, modalities…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={filterCondition}
                  onChange={(e) => setFilterCondition(e.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  {conditionOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={filterModality}
                  onChange={(e) => setFilterModality(e.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  {modalityOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Protocol list */}
            <div className="flex flex-col gap-2">
              {protocolsLoading ? (
                <>
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </>
              ) : activeList.length === 0 ? (
                <div className="rounded-xl border border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">
                  No protocols match your filters.
                </div>
              ) : (
                activeList.map((item) => (
                  <ProtocolListItem
                    key={item.id}
                    item={item}
                    isSelected={selected?.id === item.id}
                    onClick={() => handleSelectProtocol(item)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right: Detail panel */}
          <div
            ref={detailPanelRef}
            className="xl:sticky xl:top-6 xl:self-start xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto"
          >
            {!selected ? (
              <EmptyState
                icon="📋"
                title="Select a protocol"
                body="Choose a protocol from the list to view its details and generate a draft."
              />
            ) : draft ? (
              <DraftView
                draft={draft}
                selected={selected}
                role={role}
                activeTab={activeTab}
                exportingDocx={exportingDocx}
                onExportDocx={() => void handleExportDocx()}
                onClear={() => {
                  setDraft(null);
                  setGenerateError(null);
                }}
              />
            ) : (
              <ProtocolDetail
                item={selected}
                activeTab={activeTab}
                generating={generating}
                generateError={generateError}
                offLabelAcknowledged={offLabelAcknowledged}
                onOffLabelAcknowledge={setOffLabelAcknowledged}
                role={role}
                onGenerate={() => void handleGenerate()}
              />
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Personalized */}
      {activeTab === "personalized" && (
        <PersonalizedTab
          role={role}
          stagedUploads={stagedUploads}
          onStageUpload={stageUpload}
          analysing={analysing}
          caseSummary={caseSummary}
          analyseError={analyseError}
          onAnalyse={() => void handleAnalyse()}
          matchedProtocols={personalizedMatchedProtocols}
          onViewProtocol={(item) => {
            handleTabChange("evidence");
            setActiveTab("evidence");
            setSelected(item);
          }}
        />
      )}
    </div>
  );
}

// ── Protocol list item ────────────────────────────────────────────────────────

function ProtocolListItem({
  item,
  isSelected,
  onClick,
}: {
  item: EvidenceItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition cursor-pointer ${
        isSelected
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] hover:border-[var(--accent)]/30 hover:bg-[var(--bg-subtle)]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <EvidenceGradeBadge grade={evidenceLevelToGradeLetter(item.evidenceLevel)} size="sm" />
        <span className="text-sm font-semibold text-[var(--text)]">{item.title}</span>
      </div>
      <p className="mt-1.5 text-xs text-[var(--text-muted)]">
        {item.condition} &middot; {item.modality}
      </p>
      <div className="mt-2">
        <Badge tone={regulatoryBadgeTone(item.regulatoryStatus)}>
          {item.regulatoryStatus}
        </Badge>
      </div>
    </button>
  );
}

// ── Protocol detail (pre-generate) ───────────────────────────────────────────

function ProtocolDetail({
  item,
  activeTab,
  generating,
  generateError,
  offLabelAcknowledged,
  onOffLabelAcknowledge,
  role,
  onGenerate,
}: {
  item: EvidenceItem;
  activeTab: ActiveTab;
  generating: boolean;
  generateError: string | null;
  offLabelAcknowledged: boolean;
  onOffLabelAcknowledge: (v: boolean) => void;
  role: string;
  onGenerate: () => void;
}) {
  const isOffLabelTab = activeTab === "off-label";
  const canGenerate = !isOffLabelTab || offLabelAcknowledged;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <EvidenceGradeBadge
            grade={evidenceLevelToGradeLetter(item.evidenceLevel)}
            size="lg"
            showDescription
          />
          <Badge tone={regulatoryBadgeTone(item.regulatoryStatus)}>
            {item.regulatoryStatus}
          </Badge>
        </div>
      </div>

      <h2 className="mt-4 font-display text-2xl font-semibold text-[var(--text)]">
        {item.title}
      </h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {item.condition} &middot; {item.modality}
      </p>
      <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{item.summary}</p>

      {item.evidenceStrength && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
            Evidence strength
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{item.evidenceStrength}</p>
        </div>
      )}

      {item.relatedDevices.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Related devices
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.relatedDevices.map((d) => (
              <Badge key={d} tone="neutral">
                {d}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {item.supportedMethods.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Supported methods
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm text-[var(--text-muted)]">
            {item.supportedMethods.map((m) => (
              <li key={m} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ContraindicationWarning items={item.contraindications} />

      {item.approvedNotes.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Approved use notes
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm text-[var(--text-muted)]">
            {item.approvedNotes.map((n) => (
              <li key={n} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--success)]" aria-hidden="true" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.emergingNotes.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Emerging notes
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm text-[var(--text-muted)]">
            {item.emergingNotes.map((n) => (
              <li key={n} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--warning)]" aria-hidden="true" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.references.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Evidence references
          </p>
          <ul className="mt-2 grid gap-1 text-xs text-[var(--text-muted)]">
            {item.references.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {isOffLabelTab && (
        <div className="mt-5">
          <InfoNotice
            title="Off-label use"
            body={`${DRAFT_SUPPORT_ONLY} ${OFF_LABEL_REVIEW_REQUIRED} This protocol has emerging or limited evidence and must not be used without independent clinical review.`}
            tone="warning"
          >
            <label className="mt-2 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 flex-shrink-0"
                checked={offLabelAcknowledged}
                onChange={(e) => onOffLabelAcknowledge(e.target.checked)}
              />
              <span className="leading-5 text-[var(--warning-text)]">
                I acknowledge this is off-label and requires independent clinician review before any operational use.
              </span>
            </label>
          </InfoNotice>
        </div>
      )}

      <div className="mt-5">
        {generateError && (
          <div className="mb-4">
            <InfoNotice title="Generation failed" body={generateError} tone="warning" />
          </div>
        )}
        {role === "guest" ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-center text-sm text-[var(--text-muted)]">
            Clinician access required to generate protocol drafts.
          </div>
        ) : (
          <Button
            className="w-full"
            disabled={generating || !canGenerate}
            onClick={onGenerate}
          >
            {generating ? "Generating…" : "Generate Protocol Draft"}
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── Draft view (post-generate) ────────────────────────────────────────────────

function DraftView({
  draft,
  selected,
  role,
  activeTab,
  exportingDocx,
  onExportDocx,
  onClear,
}: {
  draft: ProtocolDraft;
  selected: EvidenceItem;
  role: string;
  activeTab: ActiveTab;
  exportingDocx: boolean;
  onExportDocx: () => void;
  onClear: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={approvalBadgeTone(draft.approvalStatusBadge)}>
            {draft.approvalStatusBadge}
          </Badge>
          <EvidenceGradeBadge grade={draft.evidenceGrade} size="lg" showDescription />
        </div>
        {role !== "guest" && (
          <Button
            variant="secondary"
            disabled={exportingDocx}
            onClick={onExportDocx}
          >
            {exportingDocx ? "Exporting…" : "Export DOCX"}
          </Button>
        )}
      </div>

      <h2 className="mt-4 font-display text-2xl font-semibold text-[var(--text)]">
        {selected.title}
      </h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {selected.condition} &middot; {selected.modality}
      </p>

      {draft.offLabelReviewRequired && (
        <div className="mt-4 rounded-2xl border-2 border-[var(--warning-border)] bg-[var(--warning-bg)] px-5 py-4">
          <div className="flex items-center gap-2">
            <svg
              aria-hidden="true"
              className="h-5 w-5 flex-shrink-0 text-[var(--warning-text)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <span className="text-sm font-bold text-[var(--warning-text)]">
              Off-label use — independent clinical review required
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--warning-text)] opacity-80">
            {draft.disclaimers.draftSupportOnly ?? DRAFT_SUPPORT_ONLY}{" "}
            {draft.disclaimers.offLabelReviewRequired ?? OFF_LABEL_REVIEW_REQUIRED}
          </p>
        </div>
      )}

      <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">{draft.rationale}</p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <DraftBlock title="Target region" items={[draft.targetRegion]} />
        <DraftBlock
          title="Session frequency & duration"
          items={[draft.sessionFrequency, draft.duration]}
        />
        <DraftBlock title="Escalation logic" items={draft.escalationLogic} />
        <DraftBlock title="Monitoring plan" items={draft.monitoringPlan} />
      </div>

      <div className="mt-4">
        <ContraindicationWarning items={draft.contraindications} />
      </div>

      {draft.patientCommunicationNotes.length > 0 && (
        <div className="mt-4">
          <DraftBlock
            title="Patient communication notes"
            items={draft.patientCommunicationNotes}
          />
        </div>
      )}

      <div className="mt-5">
        <Button variant="ghost" className="w-full" onClick={onClear}>
          ← Clear / Try another
        </Button>
      </div>
    </Card>
  );
}

function DraftBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
      <h3 className="font-display text-base font-semibold text-[var(--text)]">{title}</h3>
      <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-[var(--text-muted)]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

// ── Personalized tab ──────────────────────────────────────────────────────────

function PersonalizedTab({
  role,
  stagedUploads,
  onStageUpload,
  analysing,
  caseSummary,
  analyseError,
  onAnalyse,
  matchedProtocols,
  onViewProtocol,
}: {
  role: string;
  stagedUploads: UploadedAsset[];
  onStageUpload: (upload: UploadedAsset) => void;
  analysing: boolean;
  caseSummary: CaseSummary | null;
  analyseError: string | null;
  onAnalyse: () => void;
  matchedProtocols: EvidenceItem[];
  onViewProtocol: (item: EvidenceItem) => void;
}) {
  const uploadTypeIcons: Record<string, string> = {
    PDF: "📄",
    "qEEG Summary": "📊",
    "MRI Report": "🧠",
    "Intake Form": "📝",
    "Clinician Notes": "🗒️",
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
      {/* Left: upload panel */}
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="font-display text-xl font-semibold text-[var(--text)]">
            Upload Documents
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Stage patient documents to generate personalised protocol suggestions. All uploads are simulated in this MVP session only.
          </p>

          <div className="mt-4 grid gap-2">
            {stagedUploadExamples.map((upload) => {
              const isStaged = stagedUploads.some((u) => u.id === upload.id);
              return (
                <div
                  key={upload.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] px-4 py-3"
                >
                  <div className="flex items-center gap-3 text-sm text-[var(--text)]">
                    <span aria-hidden="true" className="text-base">
                      {uploadTypeIcons[upload.type] ?? "📄"}
                    </span>
                    <span>{upload.type}</span>
                    {isStaged && (
                      <Badge tone="success">Staged</Badge>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    className="text-xs px-3 py-1.5"
                    disabled={isStaged}
                    onClick={() => onStageUpload(upload)}
                  >
                    {isStaged ? "Added" : `Add ${upload.type}`}
                  </Button>
                </div>
              );
            })}
          </div>

          {stagedUploads.length > 0 && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-muted)]">
              {stagedUploads.length} document{stagedUploads.length !== 1 ? "s" : ""} staged.
            </div>
          )}

          <div className="mt-4">
            {role === "guest" ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-center text-sm text-[var(--text-muted)]">
                Clinician access required to analyse documents.
              </div>
            ) : (
              <Button
                className="w-full"
                disabled={stagedUploads.length === 0 || analysing}
                onClick={onAnalyse}
              >
                {analysing ? "Analysing…" : "Analyse Documents"}
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Right: suggestions panel */}
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="font-display text-xl font-semibold text-[var(--text)]">
            Protocol Suggestions
          </h2>

          {analyseError && (
            <div className="mt-4">
              <InfoNotice title="Analysis failed" body={analyseError} tone="warning" />
            </div>
          )}

          {!caseSummary && !analyseError && (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Stage documents and click Analyse Documents to receive matched protocol suggestions based on your uploaded patient data.
            </p>
          )}

          {analysing && (
            <div className="mt-4 grid gap-3">
              <Skeleton className="h-5 w-1/3" />
              <SkeletonText lines={4} />
            </div>
          )}

          {caseSummary && !analysing && (
            <div className="mt-4 grid gap-4">
              <InfoNotice
                title="Clinical reference only"
                body="This analysis is for clinical reference only. All protocol decisions require independent clinician review."
                tone="warning"
              />

              {caseSummary.suggestedModalities.length > 0 && (
                <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-strong)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Suggested modalities
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {caseSummary.suggestedModalities.map((m) => (
                      <Badge key={m} tone="accent">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                {caseSummary.presentingSymptoms.length > 0 && (
                  <CaseSummaryBlock
                    title="Presenting symptoms"
                    items={caseSummary.presentingSymptoms}
                  />
                )}
                {caseSummary.redFlags.length > 0 && (
                  <CaseSummaryBlock
                    title="Red flags"
                    items={caseSummary.redFlags}
                    tone="danger"
                  />
                )}
                {caseSummary.relevantFindings.length > 0 && (
                  <CaseSummaryBlock
                    title="Relevant findings"
                    items={caseSummary.relevantFindings}
                  />
                )}
                {caseSummary.possibleTargets.length > 0 && (
                  <CaseSummaryBlock
                    title="Possible targets"
                    items={caseSummary.possibleTargets}
                  />
                )}
              </div>

              {matchedProtocols.length > 0 && (
                <section>
                  <h3 className="font-display text-base font-semibold text-[var(--text)]">
                    Matching protocols
                  </h3>
                  <div className="mt-3 grid gap-2">
                    {matchedProtocols.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => onViewProtocol(item)}
                        className="w-full rounded-xl border border-[var(--border)] p-3 text-left transition hover:border-[var(--accent)]/30 hover:bg-[var(--bg-subtle)]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <EvidenceGradeBadge
                            grade={evidenceLevelToGradeLetter(item.evidenceLevel)}
                            size="sm"
                          />
                          <span className="text-sm font-semibold text-[var(--text)]">
                            {item.title}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {item.condition} &middot; {item.modality}
                        </p>
                        <p className="mt-1.5 text-xs text-[var(--accent)]">
                          View matching protocol →
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {matchedProtocols.length === 0 &&
                caseSummary.suggestedModalities.length > 0 && (
                  <div className="rounded-xl border border-[var(--border)] p-4 text-center text-sm text-[var(--text-muted)]">
                    No protocols in the library match the suggested modalities.
                  </div>
                )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function CaseSummaryBlock({
  title,
  items,
  tone = "neutral",
}: {
  title: string;
  items: string[];
  tone?: "neutral" | "danger";
}) {
  const borderClass =
    tone === "danger"
      ? "border-[var(--danger-border)] bg-[var(--danger-bg)]"
      : "border-[var(--border)] bg-[var(--bg-strong)]";
  const textClass =
    tone === "danger" ? "text-[var(--danger-text)]" : "text-[var(--text-muted)]";

  return (
    <section className={`rounded-xl border p-4 ${borderClass}`}>
      <h4 className={`text-xs font-semibold uppercase tracking-wide ${textClass} opacity-80`}>
        {title}
      </h4>
      <ul className={`mt-2 grid gap-1.5 text-sm leading-6 ${textClass}`}>
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span
              className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${tone === "danger" ? "bg-[var(--danger-text)]" : "bg-[var(--accent)]"}`}
              aria-hidden="true"
            />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
