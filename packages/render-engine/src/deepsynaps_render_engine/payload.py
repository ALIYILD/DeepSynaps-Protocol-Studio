"""ReportPayload — versioned, structured schema for clinical reports.

Why this exists
---------------
Until now every report surface invented its own shape. That made it
impossible to:

* version the contract (downstream PDF/HTML viewers couldn't safely cache);
* enforce the **observed-vs-interpretation-vs-suggested-action** separation
  every clinical-decision-support reviewer asks for;
* surface evidence-strength, cautions, and limitations consistently.

This module defines the schema. Renderers (HTML/PDF/DOCX) consume it.
The contract is intentionally additive — new optional fields can be
appended without bumping the schema id; breaking changes bump the id.

Schema id is the **single source of truth** for downstream consumers.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Schema versioning
# ---------------------------------------------------------------------------

REPORT_PAYLOAD_SCHEMA_ID: str = "deepsynaps.report-payload/v1"
"""Bumped only on breaking schema changes. Additive fields keep this id."""

REPORT_GENERATOR_VERSION_DEFAULT: str = "deepsynaps-render-engine/2026.04.26"


EvidenceStrength = Literal[
    "Strong",
    "Moderate",
    "Limited",
    "Conflicting",
    "Evidence pending",
]
"""Per-claim evidence strength label. ``"Evidence pending"`` is the
honest answer when no grading is available — never fabricate a strength."""


CitationStatus = Literal["verified", "unverified", "retracted"]
"""Citation verification status against the local evidence corpus.
``"unverified"`` is the explicit signal a citation could not be resolved."""


# ---------------------------------------------------------------------------
# Citation
# ---------------------------------------------------------------------------


class CitationRef(BaseModel):
    """A single citation reference embedded in a report section.

    Fields are intentionally permissive on identifiers — at least one of
    ``doi`` / ``pmid`` / ``url`` should be present, otherwise ``status``
    must be ``"unverified"`` and ``raw_text`` must carry the original
    string so reviewers can act on it.
    """

    citation_id: str = Field(..., description="Stable id within this payload (e.g. 'C1').")
    title: str = ""
    authors: list[str] = Field(default_factory=list)
    year: Optional[int] = None
    journal: Optional[str] = None

    doi: Optional[str] = None
    pmid: Optional[str] = None
    url: Optional[str] = None
    raw_text: Optional[str] = None

    evidence_level: Optional[str] = Field(
        default=None,
        description=(
            "GRADE-style level (A/B/C/D) or descriptor "
            "('Systematic Review', 'RCT', 'Cohort', 'Case Series'). "
            "Use None + status='unverified' if not available."
        ),
    )
    retrieved_at: Optional[str] = Field(
        default=None,
        description="ISO 8601 UTC timestamp when this citation was verified.",
    )
    status: CitationStatus = "unverified"

    def doi_url(self) -> Optional[str]:
        """Build a clickable DOI URL when a DOI is present."""
        if self.doi:
            doi = self.doi.strip()
            if doi.lower().startswith("http"):
                return doi
            return f"https://doi.org/{doi}"
        return None

    def pubmed_url(self) -> Optional[str]:
        if self.pmid:
            return f"https://pubmed.ncbi.nlm.nih.gov/{self.pmid.strip()}/"
        return None

    def best_link(self) -> Optional[str]:
        return self.doi_url() or self.pubmed_url() or self.url


# ---------------------------------------------------------------------------
# Section content
# ---------------------------------------------------------------------------


class InterpretationItem(BaseModel):
    """A model-derived interpretation of an observed finding.

    Carries its own evidence-strength label so each claim can be badged
    in the rendered output. Strength is explicit — no implicit defaults.
    """

    text: str
    evidence_strength: EvidenceStrength = "Evidence pending"
    evidence_refs: list[str] = Field(
        default_factory=list,
        description="citation_id values of supporting refs in this payload.",
    )
    counter_evidence_refs: list[str] = Field(
        default_factory=list,
        description="citation_id values of conflicting refs in this payload.",
    )


class SuggestedAction(BaseModel):
    """A decision-support suggestion. Decision-support language is
    enforced in the renderer, not the schema, so callers can stay terse."""

    text: str
    rationale: Optional[str] = None
    requires_clinician_review: bool = True
    """Default True — every suggestion is presented as 'consider', never
    'do'. Setting False is reserved for purely informational messages."""


class ReportSection(BaseModel):
    """One section of a report.

    The renderer enforces visual separation between ``observed[]`` (raw
    measured signals or finding strings), ``interpretations[]`` (what
    the model thinks), and ``suggested_actions[]`` (decision-support).

    ``cautions`` and ``limitations`` are always rendered, even when
    empty, so a clinician can never miss a missing-data signal.
    """

    section_id: str
    title: str
    observed: list[str] = Field(default_factory=list)
    interpretations: list[InterpretationItem] = Field(default_factory=list)
    suggested_actions: list[SuggestedAction] = Field(default_factory=list)

    confidence: Optional[Literal["high", "medium", "low", "insufficient"]] = None

    evidence_refs: list[str] = Field(default_factory=list)
    cautions: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    counter_evidence_refs: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Top-level payload
# ---------------------------------------------------------------------------


class ReportPayload(BaseModel):
    """The structured report payload.

    Stamped with ``schema_id`` and ``generator_version`` so consumers
    can persist and compare reports across deploys safely.
    """

    schema_id: str = REPORT_PAYLOAD_SCHEMA_ID
    generator_version: str = REPORT_GENERATOR_VERSION_DEFAULT
    generated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO 8601 UTC timestamp.",
    )

    report_id: Optional[str] = None
    patient_id: Optional[str] = None

    title: str
    audience: Literal["clinician", "patient", "both"] = "both"
    """``both`` means the renderer should produce a toggle UI."""

    summary: str = ""
    """One paragraph plain-English overview. Always rendered first."""

    sections: list[ReportSection] = Field(default_factory=list)
    citations: list[CitationRef] = Field(default_factory=list)

    # Globals — apply across the whole report when no per-section value.
    global_cautions: list[str] = Field(default_factory=list)
    global_limitations: list[str] = Field(default_factory=list)

    decision_support_disclaimer: str = (
        "This report is a clinical decision-support tool. It does not replace "
        "independent clinical judgement. Verify all findings with the patient's "
        "qualified clinician before acting."
    )


__all__ = [
    "REPORT_PAYLOAD_SCHEMA_ID",
    "REPORT_GENERATOR_VERSION_DEFAULT",
    "EvidenceStrength",
    "CitationStatus",
    "CitationRef",
    "InterpretationItem",
    "SuggestedAction",
    "ReportSection",
    "ReportPayload",
]
