/**
 * EvidenceLinksCard — Compact reusable evidence link display.
 *
 * Shows 3-5 evidence citations for an analyzer finding.
 * Displays: title, evidence grade, study type, year, source,
 * PubMed/DOI links, research-only badge, caveats.
 *
 * Props:
 *   evidenceLinks: Array<{ id, title, source, evidence_grade, study_type,
 *                          year, doi, pmid, url, condition, modality,
 *                          relevance_score, research_only, conflicting, caveat }>
 *   analyzerType: string — "qeeg", "mri", "biomarker", etc.
 *   maxVisible: number — max links to show (default 5)
 *   showDeepLink: boolean — show "Open in Evidence Research" link (default true)
 */

import React, { useState } from "react";

// ── Grade badge colors ────────────────────────────────────────────────────────
const GRADE_COLORS = {
  A: { bg: "#D1FAE5", text: "#065F46", border: "#10B981" }, // green
  B: { bg: "#DBEAFE", text: "#1E40AF", border: "#3B82F6" }, // blue
  C: { bg: "#FEF3C7", text: "#92400E", border: "#F59E0B" }, // amber
  D: { bg: "#FEE2E2", text: "#991B1B", border: "#EF4444" }, // red
};

const STUDY_TYPE_LABELS = {
  RCT: "Randomized Controlled Trial",
  systematic_review: "Systematic Review",
  observational: "Observational Study",
  expert_opinion: "Expert Opinion",
  unknown: "Study",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function GradeBadge({ grade }) {
  const colors = GRADE_COLORS[grade] || GRADE_COLORS.D;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 700,
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        whiteSpace: "nowrap",
      }}
      data-testid={`grade-badge-${grade}`}
    >
      Grade {grade}
    </span>
  );
}

function ResearchOnlyBadge() {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        backgroundColor: "#F3F4F6",
        color: "#6B7280",
        border: "1px solid #D1D5DB",
        whiteSpace: "nowrap",
        marginLeft: "6px",
      }}
      data-testid="research-only-badge"
    >
      Research Only
    </span>
  );
}

function ConflictingBadge() {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        backgroundColor: "#FFF7ED",
        color: "#C2410C",
        border: "1px solid #FDBA74",
        whiteSpace: "nowrap",
        marginLeft: "6px",
      }}
      data-testid="conflicting-badge"
    >
      Conflicting Evidence
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EvidenceLinksCard({
  evidenceLinks = [],
  analyzerType = "",
  maxVisible = 5,
  showDeepLink = true,
}) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? evidenceLinks : evidenceLinks.slice(0, maxVisible);
  const hasMore = evidenceLinks.length > maxVisible;

  // Safety disclaimer — always shown
  const safetyText =
    "Evidence links support clinician review and do not establish diagnosis or treatment recommendations.";

  // Deep link to Evidence Research page
  const deepLinkUrl = analyzerType
    ? `/pages-research-evidence?q=${encodeURIComponent(analyzerType)}`
    : "/pages-research-evidence";

  return (
    <div
      style={{
        border: "1px solid #E5E7EB",
        borderRadius: "8px",
        padding: "16px",
        backgroundColor: "#FAFAFA",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: "13px",
        lineHeight: "1.5",
      }}
      data-testid="evidence-links-card"
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: 700,
            color: "#111827",
          }}
          data-testid="evidence-card-title"
        >
          Evidence ({evidenceLinks.length})
        </h4>
        {showDeepLink && (
          <a
            href={deepLinkUrl}
            style={{
              fontSize: "12px",
              color: "#2563EB",
              textDecoration: "none",
              fontWeight: 600,
            }}
            data-testid="evidence-deep-link"
          >
            Open in Evidence Research →
          </a>
        )}
      </div>

      {/* Evidence list */}
      {visible.length === 0 ? (
        <DegradedState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {visible.map((ev) => (
            <EvidenceItem key={ev.id || ev.evidence_id} evidence={ev} />
          ))}
        </div>
      )}

      {/* Show more / less */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: "12px",
            background: "none",
            border: "none",
            color: "#2563EB",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
          }}
          data-testid="evidence-show-more"
        >
          {expanded
            ? "Show less"
            : `Show ${evidenceLinks.length - maxVisible} more`}
        </button>
      )}

      {/* Safety disclaimer */}
      <p
        style={{
          marginTop: "12px",
          marginBottom: 0,
          fontSize: "11px",
          color: "#6B7280",
          fontStyle: "italic",
          borderTop: "1px solid #E5E7EB",
          paddingTop: "8px",
        }}
        data-testid="evidence-safety-disclaimer"
      >
        {safetyText}
      </p>
    </div>
  );
}

// ── Single evidence item ─────────────────────────────────────────────────────

function EvidenceItem({ evidence }) {
  const {
    title = "Untitled evidence",
    source = "unknown",
    evidence_grade = "D",
    study_type = "unknown",
    year,
    doi,
    pmid,
    url,
    relevance_score = 0,
    research_only = false,
    conflicting = false,
    caveat,
  } = evidence;

  const studyLabel = STUDY_TYPE_LABELS[study_type] || study_type;

  // Build PubMed link
  const pubmedUrl = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null;
  // Build DOI link
  const doiUrl = doi ? `https://doi.org/${doi}` : null;

  return (
    <div
      style={{
        padding: "10px 12px",
        backgroundColor: "#FFFFFF",
        borderRadius: "6px",
        border: "1px solid #E5E7EB",
      }}
      data-testid="evidence-item"
    >
      {/* Title + badges */}
      <div style={{ marginBottom: "6px" }}>
        <span
          style={{ fontWeight: 600, color: "#1F2937", fontSize: "13px" }}
          data-testid="evidence-title"
        >
          {title}
        </span>
        <GradeBadge grade={evidence_grade} />
        {research_only && <ResearchOnlyBadge />}
        {conflicting && <ConflictingBadge />}
      </div>

      {/* Meta line */}
      <div
        style={{
          fontSize: "12px",
          color: "#6B7280",
          marginBottom: "6px",
        }}
        data-testid="evidence-meta"
      >
        {studyLabel}
        {year ? ` • ${year}` : ""}
        {source !== "unknown" ? ` • ${source}` : ""}
        {relevance_score > 0 ? ` • relevance ${(relevance_score * 100).toFixed(0)}%` : ""}
      </div>

      {/* Links */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {pubmedUrl && (
          <a
            href={pubmedUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "12px", color: "#2563EB" }}
            data-testid="evidence-pubmed-link"
          >
            PubMed {pmid}
          </a>
        )}
        {doiUrl && (
          <a
            href={doiUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "12px", color: "#2563EB" }}
            data-testid="evidence-doi-link"
          >
            DOI
          </a>
        )}
        {url && !pubmedUrl && !doiUrl && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "12px", color: "#2563EB" }}
            data-testid="evidence-url-link"
          >
            Source
          </a>
        )}
      </div>

      {/* Caveat */}
      {caveat && (
        <p
          style={{
            marginTop: "6px",
            marginBottom: 0,
            fontSize: "11px",
            color: "#92400E",
            fontStyle: "italic",
          }}
          data-testid="evidence-caveat"
        >
          ⚠ {caveat}
        </p>
      )}
    </div>
  );
}

// ── Degraded state ────────────────────────────────────────────────────────────

function DegradedState() {
  return (
    <div
      style={{
        padding: "20px",
        textAlign: "center",
        color: "#6B7280",
        fontSize: "13px",
      }}
      data-testid="evidence-degraded-state"
    >
      <p style={{ margin: "0 0 8px 0", fontWeight: 600 }}>Evidence Unavailable</p>
      <p style={{ margin: 0, fontSize: "12px" }}>
        No evidence links found for this finding. This may be due to limited
        research data or an evidence database update in progress.
      </p>
    </div>
  );
}
