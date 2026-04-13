"""Typed validation for clinician home-program task provenance (homeProgramSelection).

Internal audit fields may include confidence tiers; patient-facing views should use
`patient_safe_home_program_selection` which strips scores/tiers by default.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ConfidenceTier = Literal["high", "medium", "low", "unknown"]


def confidence_tier_from_score(score: float | None) -> ConfidenceTier:
    """Deterministic tier from 0–100 resolver score (matches web `confidenceTierFromScore`)."""
    if score is None:
        return "unknown"
    try:
        n = float(score)
    except (TypeError, ValueError):
        return "unknown"
    if n >= 85:
        return "high"
    if n >= 60:
        return "medium"
    if n >= 0:
        return "low"
    return "unknown"


class HomeProgramSelection(BaseModel):
    """Validated payload stored as JSON alongside home program tasks (camelCase in API)."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid", str_strip_whitespace=True)

    condition_id: str | None = Field(default=None, alias="conditionId", max_length=64)
    confidence_score: float | None = Field(default=None, alias="confidenceScore", ge=0.0, le=100.0)
    confidence_tier: ConfidenceTier | None = Field(default=None, alias="confidenceTier")
    match_method: str | None = Field(default=None, alias="matchMethod", max_length=64)
    matched_field: str | None = Field(default=None, alias="matchedField", max_length=256)
    matched_value: str | None = Field(default=None, alias="matchedValue", max_length=512)
    source_course_id: str | None = Field(default=None, alias="sourceCourseId", max_length=64)
    source_course_label: str | None = Field(default=None, alias="sourceCourseLabel", max_length=512)
    auto_linked_course: bool = Field(default=False, alias="autoLinkedCourse")
    course_link_auto_set: bool = Field(default=False, alias="courseLinkAutoSet")
    applied_at: str | None = Field(default=None, alias="appliedAt", max_length=64)
    template_id: str | None = Field(default=None, alias="templateId", max_length=128)
    sort_score: float | None = Field(default=None, alias="sortScore")
    provenance_version: int = Field(default=1, alias="provenanceVersion", ge=1, le=256)
    protocol_id: str | None = Field(default=None, alias="protocolId", max_length=64)
    assessment_bundle_id: str | None = Field(default=None, alias="assessmentBundleId", max_length=64)
    recommendation_source: str | None = Field(default=None, alias="recommendationSource", max_length=128)

    @field_validator("match_method", "matched_field", "condition_id", mode="before")
    @classmethod
    def _reject_nested_objects(cls, v: Any) -> Any:
        if v is not None and not isinstance(v, (str, int, float, bool)):
            raise TypeError("must be a string or null")
        return v

    @model_validator(mode="after")
    def _sync_auto_link_flags(self) -> HomeProgramSelection:
        linked = self.auto_linked_course or self.course_link_auto_set
        object.__setattr__(self, "auto_linked_course", linked)
        object.__setattr__(self, "course_link_auto_set", linked)
        return self

    @model_validator(mode="after")
    def _tier_from_score_authoritative(self) -> HomeProgramSelection:
        """When a score is present, tier is derived from it (avoids stale UI tier after score edits)."""
        if self.confidence_score is not None:
            object.__setattr__(self, "confidence_tier", confidence_tier_from_score(self.confidence_score))
        return self


def parse_home_program_selection(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    """Validate a provenance dict; returns camelCase dict or None.

    Raises ``ValueError`` for non-object inputs; Pydantic ``ValidationError`` for invalid fields.
    """
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("homeProgramSelection must be a JSON object")
    if not raw:
        return None
    model = HomeProgramSelection.model_validate(raw)
    return model.model_dump(mode="json", by_alias=True, exclude_none=True)


def patient_safe_home_program_selection(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    """Strip internal audit signals for default patient-facing channels (no raw tiers/scores)."""
    if raw is None:
        return None
    safe: dict[str, Any] = {}
    if raw.get("conditionId"):
        safe["conditionId"] = raw["conditionId"]
    if raw.get("templateId"):
        safe["templateId"] = raw["templateId"]
    if raw.get("sourceCourseLabel"):
        safe["sourceCourseLabel"] = raw["sourceCourseLabel"]
    # Optional neutral copy — no confidenceScore / confidenceTier / matchMethod
    return safe or None
