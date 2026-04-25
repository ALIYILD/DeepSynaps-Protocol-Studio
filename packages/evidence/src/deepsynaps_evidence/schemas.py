"""Pydantic 2.x domain models for the Evidence Citation Validator.

These models are pure data schemas with no DB or network dependency.
They mirror the specification in ``evidence_citation_validator.md`` sections 5.1-5.4.
"""
from __future__ import annotations

import hashlib
from typing import Literal, Optional

from pydantic import BaseModel, Field, computed_field


# ── Enums / Literals ─────────────────────────────────────────────────────────

EvidenceGrade = Literal["A", "B", "C", "D"]
ConfidenceLabel = Literal["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"]
CitationType = Literal["supports", "informs", "contradicts", "safety_note"]
IssueSeverity = Literal["block", "warning", "info"]
IssueType = Literal[
    "fabricated_pmid",
    "retracted_paper",
    "off_topic",
    "unsupported_claim",
    "low_confidence",
    "placeholder_leakage",
    "strong_claim_ungrounded",
    "empty_claim",
    "low_citation_density",
    "corpus_miss",
]


# ── Core Models ──────────────────────────────────────────────────────────────

class Claim(BaseModel):
    """A de-identified clinical assertion to be validated against the corpus."""

    claim_text: str = Field(..., max_length=2000)
    claim_category: str = ""
    section_id: str = ""
    source_sentence: str = ""
    eeg_feature_refs: list[str] = Field(default_factory=list)
    asserted_pmids: list[str] = Field(
        default_factory=list,
        description="PMIDs asserted by an LLM that must be verified against the corpus.",
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def claim_hash(self) -> str:
        """SHA-256 of the normalised claim text."""
        normalised = " ".join(self.claim_text.lower().split())
        return hashlib.sha256(normalised.encode()).hexdigest()


class Citation(BaseModel):
    """A validated bibliographic reference grounding a Claim."""

    paper_id: str
    pmid: Optional[str] = None
    doi: Optional[str] = None
    title: str = ""
    authors_short: str = ""
    year: Optional[int] = None
    journal: Optional[str] = None

    citation_type: CitationType = "supports"
    evidence_grade: Optional[EvidenceGrade] = None
    relevance_score: float = 0.0
    supporting_quote: str = ""
    formatted_inline: str = ""
    formatted_reference: str = ""
    retracted: bool = False


class ValidationIssue(BaseModel):
    """A single problem detected during citation validation."""

    claim_id: str = ""
    issue_type: IssueType
    severity: IssueSeverity
    message: str
    study_identifier: Optional[str] = None


class ValidationResult(BaseModel):
    """Output of a single claim validation."""

    claim_hash: str
    claim_text: str = ""
    citations: list[Citation] = Field(default_factory=list)
    grounding_score: float = 0.0
    confidence_label: ConfidenceLabel = "INSUFFICIENT"
    issues: list[ValidationIssue] = Field(default_factory=list)
    pmids_verified: int = 0
    pmids_fabricated: int = 0
    pmids_retracted: int = 0
    audit_event_id: Optional[str] = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def passed(self) -> bool:
        """True if no blocking issues are present."""
        return not any(i.severity == "block" for i in self.issues)


class ValidationRequest(BaseModel):
    """Inbound request to validate one or more clinical claims."""

    claims: list[Claim] = Field(..., min_length=1, max_length=50)
    max_citations_per_claim: int = Field(default=5, ge=1, le=20)
    min_relevance: float = Field(default=0.15, ge=0.0, le=1.0)
    require_pmid: bool = True
