"""Pydantic v2 domain models for the QA scoring engine."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class ArtifactType(StrEnum):
    """Artifact types produced by DeepSynaps Studio."""

    QEEG_NARRATIVE = "qeeg_narrative"
    MRI_REPORT = "mri_report"
    PROTOCOL_DRAFT = "protocol_draft"
    BRAIN_TWIN_SUMMARY = "brain_twin_summary"


class CheckSeverity(StrEnum):
    """Three-tier severity model for QA findings."""

    BLOCK = "BLOCK"
    WARNING = "WARNING"
    INFO = "INFO"


class Verdict(StrEnum):
    """QA run verdict."""

    PASS = "PASS"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    FAIL = "FAIL"


# ---------------------------------------------------------------------------
# Artifact & Spec
# ---------------------------------------------------------------------------

class Artifact(BaseModel):
    """Any Studio-produced document subject to QA."""

    artifact_id: str
    artifact_type: ArtifactType
    content: str = Field(default="", description="Full text or serialised body")
    metadata: dict[str, Any] = Field(default_factory=dict)
    sections: list[dict[str, Any]] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    schema_ref: str = Field(default="", description="e.g. studio/schemas/qeeg_narrative.json")


class QASpec(BaseModel):
    """Defines which checks apply to a given artifact type."""

    spec_id: str
    artifact_type: ArtifactType
    required_sections: list[str] = Field(default_factory=list)
    citation_floor: int = Field(default=3, description="Minimum valid citations")
    reading_level_min: float = Field(default=10.0, description="Flesch-Kincaid grade min")
    reading_level_max: float = Field(default=18.0, description="Flesch-Kincaid grade max")
    banned_terms: list[str] = Field(default_factory=list)
    schema_ref: str = Field(default="", description="JSON Schema path for conformance check")
    check_ids: list[str] = Field(
        default_factory=list,
        description="Check IDs enabled for this spec",
    )


# ---------------------------------------------------------------------------
# Check definition & result
# ---------------------------------------------------------------------------

class Check(BaseModel):
    """A single executable QA rule definition."""

    check_id: str
    category: str
    severity: CheckSeverity
    description: str = ""
    weight: float = Field(default=0.0, description="Contribution to numeric score")


class CheckResult(BaseModel):
    """Result of running one Check against one Artifact."""

    check_id: str
    severity: CheckSeverity
    passed: bool
    location: str = Field(default="", description="e.g. sections.clinical_impression")
    message: str = ""
    detail: str = ""


# ---------------------------------------------------------------------------
# Score & QAResult
# ---------------------------------------------------------------------------

class Score(BaseModel):
    """Numeric score and per-category breakdown."""

    numeric: float = Field(default=0.0, ge=0.0, le=100.0)
    breakdown: dict[str, float] = Field(default_factory=dict)
    block_count: int = 0
    warning_count: int = 0
    info_count: int = 0


class QAResult(BaseModel):
    """Complete output of one QA run."""

    run_id: str
    artifact_id: str
    spec_id: str
    check_results: list[CheckResult] = Field(default_factory=list)
    score: Score = Field(default_factory=Score)
    verdict: Verdict = Verdict.FAIL
    hash_chain: str = Field(default="", description="SHA-256 of (prev_hash || run payload)")
    timestamp_utc: str = ""


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

class QAAuditEntry(BaseModel):
    """Hash-chain audit record for a QA run."""

    entry_id: str
    run_id: str
    artifact_id: str
    artifact_type: str = ""
    spec_id: str = ""
    score: float = 0.0
    verdict: str = ""
    block_count: int = 0
    warning_count: int = 0
    info_count: int = 0
    operator: str = ""
    timestamp_utc: str = ""
    prev_hash: str = Field(default="GENESIS", description="SHA-256 of previous entry")
    this_hash: str = ""


# ---------------------------------------------------------------------------
# Demotion
# ---------------------------------------------------------------------------

class DemotionEvent(BaseModel):
    """Logged when an artifact is demoted to ADVISORY tier."""

    artifact_id: str
    from_tier: str = "STANDARD"
    to_tier: str = "ADVISORY"
    trigger: str = ""
    qa_run_id: str = ""
    operator: str = ""
    timestamp_utc: str = ""
    hash_chain: str = ""
