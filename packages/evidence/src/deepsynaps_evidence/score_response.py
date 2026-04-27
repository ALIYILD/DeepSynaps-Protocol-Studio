"""Unified ScoreResponse schema for clinical decision-support scores.

This module is the SINGLE source of truth for the wire shape of every
clinical decision-support score surfaced by the platform (anxiety,
depression, stress, MCI / cognitive risk, brain-age, relapse risk,
adherence risk, response probability).

Design rules (decision-support, NOT diagnostic):
- Validated patient assessments (PHQ-9, GAD-7, PSS-10, MoCA, …) are the
  PRIMARY anchor when present. Biomarker / model outputs are SUPPORTING.
- ``confidence`` is a coarse {low, med, high} ordinal — never a floating
  probability dressed up as one.
- ``uncertainty_band`` is OPTIONAL. When present it must be on the same
  scale as ``value`` (so a downstream UI can plot it without rescaling).
- ``cautions`` is a structured list — every safety/quality concern gets
  its own entry with a short ``code`` so consumers can render badges.
- ``method_provenance`` carries enough audit metadata to replay the
  computation: model id, version, and an opaque ``inputs_hash``.
- ``evidence_refs`` is a list of small dicts — render-engine and the
  Evidence stream own the deep linking.

The schema is intentionally narrow. Stream 4 owns it; other streams
should NOT extend it without a handoff (see
``docs/overnight/2026-04-26-night/score_api_contracts.md``).
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ── Enums / Literals ─────────────────────────────────────────────────────────

ConfidenceBand = Literal["low", "med", "high", "no_data"]
"""Coarse, ordinal confidence taxonomy. ``no_data`` is reserved for the
explicit "we did not have enough inputs to score" branch — it is NOT
the same as low confidence."""

ScoreScale = Literal[
    "raw_assessment",          # native scale of a validated assessment (PHQ-9 0..27 …)
    "similarity_index",        # 0..1, biomarker similarity (NOT a calibrated probability)
    "probability",             # 0..1, calibrated probability (rare — flag carefully)
    "years",                   # absolute years (brain-age)
    "percentile",              # 0..100 percentile of a normative cohort
    "rate_pct",                # 0..100 adherence-style rate
    "research_grade",          # research-only, no clinical scale
]


# ── Sub-models ───────────────────────────────────────────────────────────────


class TopContributor(BaseModel):
    """A single feature that materially influenced the score."""

    feature: str = Field(..., description="Stable feature key (e.g. 'phq9_total', 'frontal_alpha_asymmetry').")
    weight: Optional[float] = Field(
        None,
        description=(
            "Magnitude of the contribution (>=0). Units depend on the score; "
            "callers may leave it None for rule-based scores where weight "
            "is implicit."
        ),
    )
    direction: Optional[str] = Field(
        None,
        description=(
            "Plain-language direction of effect — e.g. 'higher_when_elevated', "
            "'higher_when_reduced', 'protective'. NEVER a causal claim."
        ),
    )
    value: Optional[Any] = Field(
        None,
        description="Observed value of the feature, when available.",
    )


class Caution(BaseModel):
    """A structured safety / quality caution attached to a score."""

    code: str = Field(
        ...,
        description=(
            "Short kebab-case code for UI badge rendering — e.g. "
            "'low-input-quality', 'missing-validated-anchor', "
            "'out-of-distribution-age', 'research-grade-score', "
            "'stub-model-fallback'."
        ),
    )
    severity: Literal["info", "warning", "block"] = "info"
    message: str = Field(..., description="Human-readable, hedged message.")


class EvidenceRef(BaseModel):
    """Lightweight pointer to an evidence record."""

    ref_id: str = Field(..., description="Internal evidence id / pmid / doi.")
    title: Optional[str] = None
    grade: Optional[str] = Field(
        None,
        description="GRADE-style letter when known (A/B/C/D).",
    )
    url: Optional[str] = None
    relation: Literal["supports", "informs", "contradicts", "safety_note"] = "informs"


class MethodProvenance(BaseModel):
    """Audit metadata — enough to replay a score computation."""

    model_config = ConfigDict(protected_namespaces=())

    model_id: str = Field(
        ...,
        description=(
            "Stable identifier of the scorer/model — e.g. "
            "'gad7-anchor-v1', 'qeeg-similarity-stub', "
            "'qeeg-brain-age-fcnn-v0'."
        ),
    )
    version: str = Field("v0", description="Semver-ish version of the scorer.")
    inputs_hash: str = Field(
        ...,
        description="SHA-256 hex digest of the canonicalised inputs.",
    )
    upstream_is_stub: bool = Field(
        False,
        description="True when the underlying model fell back to a stub.",
    )


# ── Main response model ──────────────────────────────────────────────────────


class ScoreResponse(BaseModel):
    """Unified clinical decision-support score envelope.

    NEVER use this model to claim a diagnosis. Wording must always hedge
    ("may indicate", "consistent with", "discuss with clinician").
    """

    score_id: str = Field(
        ...,
        description=(
            "Stable score identifier — e.g. 'anxiety', 'depression', "
            "'stress', 'mci', 'brain_age', 'relapse_risk', "
            "'adherence_risk', 'response_probability'."
        ),
    )
    value: Optional[float] = Field(
        None,
        description="Numeric score value on ``scale``. None when no_data.",
    )
    scale: ScoreScale
    interpretation: str = Field(
        "",
        description=(
            "Hedged plain-language interpretation. Must use language like "
            "'consistent with…', 'may indicate…', 'discuss with clinician'."
        ),
    )
    confidence: ConfidenceBand = "no_data"
    uncertainty_band: Optional[tuple[float, float]] = Field(
        None,
        description="(lo, hi) on the same units as ``value``.",
    )
    top_contributors: list[TopContributor] = Field(default_factory=list)
    assessment_anchor: Optional[str] = Field(
        None,
        description=(
            "Validated assessment anchoring the score (e.g. 'PHQ-9', "
            "'GAD-7', 'PSS-10', 'MoCA'). None when no validated "
            "assessment was used as primary anchor."
        ),
    )
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)
    cautions: list[Caution] = Field(default_factory=list)
    method_provenance: MethodProvenance
    computed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # ── Validators ───────────────────────────────────────────────────────────

    @field_validator("uncertainty_band")
    @classmethod
    def _band_ordered(cls, v: Optional[tuple[float, float]]) -> Optional[tuple[float, float]]:
        if v is None:
            return None
        lo, hi = v
        if lo > hi:
            raise ValueError("uncertainty_band[0] must be <= uncertainty_band[1]")
        return v

    # ── Convenience helpers ─────────────────────────────────────────────────

    def has_validated_anchor(self) -> bool:
        return bool(self.assessment_anchor)

    def is_research_grade(self) -> bool:
        return self.scale == "research_grade" or any(
            c.code == "research-grade-score" for c in self.cautions
        )


# ── Helpers ──────────────────────────────────────────────────────────────────


def hash_inputs(inputs: dict[str, Any]) -> str:
    """Deterministic SHA-256 of an inputs dict.

    The dict is canonicalised with ``sort_keys=True``; non-serialisable
    values fall back to ``repr`` so the hash is still stable across
    interpreters.
    """
    try:
        canonical = json.dumps(inputs, sort_keys=True, default=repr)
    except TypeError:
        canonical = repr(sorted(inputs.items()))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def cap_confidence(
    requested: ConfidenceBand,
    *,
    has_validated_anchor: bool,
    research_grade: bool,
) -> ConfidenceBand:
    """Enforce policy: scores without a validated anchor cannot reach ``high``;
    research-grade scores cannot exceed ``med``.
    """
    order = ("no_data", "low", "med", "high")
    rank = {b: i for i, b in enumerate(order)}
    cap = "high"
    if not has_validated_anchor:
        cap = "med"
    if research_grade:
        cap = "med"
    if rank[requested] > rank[cap]:
        return cap  # type: ignore[return-value]
    return requested


__all__ = [
    "Caution",
    "ConfidenceBand",
    "EvidenceRef",
    "MethodProvenance",
    "ScoreResponse",
    "ScoreScale",
    "TopContributor",
    "cap_confidence",
    "hash_inputs",
]
