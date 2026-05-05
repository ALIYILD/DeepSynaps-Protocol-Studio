"""Assessments v2 router payload types.

Promoted out of ``apps/api/app/routers/assessments_v2_router.py`` per
Architect Rec #5 so the request/response contract can be reused outside
the FastAPI router layer.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class AssessmentRegistryEntry(BaseModel):
    id: str
    name: str
    abbreviation: str | None = None
    category: str | None = None
    condition_tags: list[str] = Field(default_factory=list)
    symptom_domains: list[str] = Field(default_factory=list)
    age_range: str | None = None
    informant: str | None = None
    modality_context: list[str] = Field(default_factory=list)
    fillable_in_platform: bool
    scorable_in_platform: bool
    scoring_status: str
    licence_status: str
    external_link: str | None = None
    instructions_summary: str | None = None
    scoring_summary: str | None = None
    interpretation_caveat: str | None = None
    evidence_grade: str | None = None
    evidence_links: list[str] = Field(default_factory=list)
    live_literature_query: str | None = None
    required_role: str = "clinician"
    audit_required: bool = True
    clinician_review_required: bool = True


class LibraryResponse(BaseModel):
    items: list[AssessmentRegistryEntry]
    total: int
    source: str = "v1_templates"


class AssignRequestV2(BaseModel):
    assessment_id: str = Field(..., description="Template/scale id (e.g., phq9).")
    due_date: Optional[str] = None
    phase: Optional[str] = None
    bundle_id: Optional[str] = None
    respondent_type: Optional[str] = None
    clinician_notes: Optional[str] = None


class QueueItemV2(BaseModel):
    assignment_id: str
    patient_id: str
    assessment_id: str
    assessment_title: str
    status: str
    due_date: Optional[str] = None
    respondent_type: Optional[str] = None
    phase: Optional[str] = None
    bundle_id: Optional[str] = None
    score_numeric: Optional[float] = None
    severity: Optional[str] = None
    severity_label: Optional[str] = None
    red_flags: list[str] = Field(default_factory=list)
    clinician_review_required: bool = True
    licence_status: str | None = None
    score_only: bool = False
    external_link: str | None = None


class QueueResponseV2(BaseModel):
    items: list[QueueItemV2]
    total: int


class FormAccessState(BaseModel):
    fillable_in_platform: bool
    score_only: bool
    licence_status: str
    external_link: str | None = None
    message: str | None = None


class AssignmentFormResponse(BaseModel):
    assignment_id: str
    assessment_id: str
    assessment_title: str
    licensing: dict[str, Any] = Field(default_factory=dict)
    access: FormAccessState
    template: dict[str, Any] | None = None
    clinician_review_required: bool = True


class SubmitResponsesRequest(BaseModel):
    status: str = Field("in_progress", description="in_progress|completed")
    items: dict[str, Any] | list[Any] | None = None
    score_numeric: float | None = None
    clinician_notes: str | None = None


class ScoreResponseV2(BaseModel):
    assignment_id: str
    assessment_id: str
    scoring_status: str
    raw_score: float | None = None
    subscale_scores: dict[str, Any] | None = None
    missing_items: list[str] = Field(default_factory=list)
    severity: str | None = None
    severity_label: str | None = None
    red_flags: list[str] = Field(default_factory=list)
    limitations: str
    clinician_review_required: bool = True


class EvidenceHealthV2(BaseModel):
    ok: bool
    local_corpus_available: bool
    local_corpus_note: str
    live_literature_available: bool
    live_literature_note: str


class EvidenceRefV2(BaseModel):
    title: str
    authors: str | None = None
    year: int | None = None
    doi: str | None = None
    pmid: str | None = None
    journal: str | None = None
    study_type: str | None = None
    population: str | None = None
    condition: str | None = None
    assessment_tool: str | None = None
    limitations: str | None = None
    evidence_grade: str | None = None
    status: str = "local"
    source_link: str | None = None


class EvidenceSearchResponseV2(BaseModel):
    status: str
    items: list[EvidenceRefV2]
    total: int


class RecommendRequestV2(BaseModel):
    patient_id: str
    condition: str | None = None
    age_years: int | None = None
    symptom_domains: list[str] = Field(default_factory=list)
    clinician_question: str | None = None


class RecommendedAssessmentV2(BaseModel):
    assessment_id: str
    reason: str
    informant: str | None = None
    priority: str = "normal"
    fillable_in_platform: bool
    scorable_in_platform: bool
    licence_status: str
    clinician_review_required: bool = True


class RecommendResponseV2(BaseModel):
    source: str
    recommended: list[RecommendedAssessmentV2]
    caveats: list[str]
