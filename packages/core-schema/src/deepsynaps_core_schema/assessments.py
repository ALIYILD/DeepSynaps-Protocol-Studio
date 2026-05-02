"""Assessments router payload types.

Promoted out of ``apps/api/app/routers/assessments_router.py`` per
Architect Rec #5. The ``AssessmentOut.from_record`` constructor that
took a SQLAlchemy ``AssessmentRecord`` row used to live alongside this
class; it is now a router-side helper so this package stays free of any
persistence dependency.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Assessment schemas ───────────────────────────────────────────────────────


class AssessmentCreate(BaseModel):
    template_id: Optional[str] = None
    template_title: Optional[str] = None
    # Frontend Library form-filler uses `scale_id` as alias for template_id.
    scale_id: Optional[str] = None
    patient_id: Optional[str] = None
    data: dict = {}
    clinician_notes: Optional[str] = None
    status: str = "draft"
    score: Optional[str] = None
    score_numeric: Optional[float] = None
    items: Optional[dict] = None
    subscales: Optional[dict] = None
    interpretation: Optional[str] = None
    severity: Optional[str] = None
    respondent_type: Optional[str] = None  # 'patient' | 'clinician' | 'caregiver'
    phase: Optional[str] = None  # 'baseline' | 'mid' | 'post' | 'follow_up' | 'weekly' | 'pre_session' | 'post_session'
    due_date: Optional[str] = None  # ISO date
    due_at: Optional[str] = None  # alias used by new frontend
    completed_at: Optional[str] = None
    scale_version: Optional[str] = None
    bundle_id: Optional[str] = None


class AssessmentUpdate(BaseModel):
    patient_id: Optional[str] = None
    data: Optional[dict] = None
    clinician_notes: Optional[str] = None
    status: Optional[str] = None
    score: Optional[str] = None
    score_numeric: Optional[float] = None
    items: Optional[dict] = None
    subscales: Optional[dict] = None
    interpretation: Optional[str] = None
    severity: Optional[str] = None
    respondent_type: Optional[str] = None
    phase: Optional[str] = None
    due_date: Optional[str] = None
    due_at: Optional[str] = None
    completed_at: Optional[str] = None
    scale_version: Optional[str] = None
    bundle_id: Optional[str] = None
    # When True, skip server-side canonical score validation (for rare
    # clinician-override cases where item text is copyrighted and not submitted).
    override_score_validation: Optional[bool] = None


class AssessmentOut(BaseModel):
    id: str
    clinician_id: str
    patient_id: Optional[str]
    template_id: str
    template_title: str
    # scale_id: alias of template_id for new frontend (pgAssessmentsHub + Library)
    scale_id: str
    data: dict
    items: Optional[dict] = None
    subscales: Optional[dict] = None
    clinician_notes: Optional[str]
    status: str
    score: Optional[str]
    score_numeric: Optional[float] = None
    severity: Optional[str] = None
    severity_label: Optional[str] = None
    interpretation: Optional[str] = None
    respondent_type: Optional[str] = None
    phase: Optional[str] = None
    due_date: Optional[str] = None
    due_at: Optional[str] = None
    completed_at: Optional[str] = None
    scale_version: Optional[str] = None
    bundle_id: Optional[str] = None
    approved_status: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    ai_summary: Optional[str] = None
    ai_model: Optional[str] = None
    ai_confidence: Optional[float] = None
    ai_generated: bool = False
    ai_generated_at: Optional[str] = None
    escalated: bool = False
    escalated_at: Optional[str] = None
    escalation_reason: Optional[str] = None
    escalated_by: Optional[str] = None
    created_at: str
    updated_at: str


class AssessmentListResponse(BaseModel):
    items: list[AssessmentOut]
    total: int


# ── Assessment Template Schemas ──────────────────────────────────────────────


class AssessmentField(BaseModel):
    id: str
    label: str
    type: str  # "likert5" | "likert4" | "text" | "number" | "yesno" | "select" | "score_entry"
    options: list[str] = []
    required: bool = True
    reverse_scored: bool = False


class AssessmentSection(BaseModel):
    id: str
    title: str
    fields: list[AssessmentField]


class LicensingInfo(BaseModel):
    tier: str  # 'public_domain' | 'us_gov' | 'academic' | 'licensed' | 'restricted'
    source: str
    url: Optional[str] = None
    attribution: str
    embedded_text_allowed: bool = False
    notes: Optional[str] = None


class AssessmentTemplateOut(BaseModel):
    id: str
    title: str
    abbreviation: str
    description: str
    conditions: list[str]
    instructions: str
    sections: list[AssessmentSection] = Field(default_factory=list)
    scoring_info: str
    time_minutes: int
    respondent_type: str = "patient"  # 'patient' | 'clinician' | 'caregiver'
    score_only: bool = False  # true for licensed instruments where items cannot be embedded
    licensing: LicensingInfo
    version: str = "1.0.0"


class ScaleCatalogEntry(BaseModel):
    id: str
    title: str
    abbreviation: str
    conditions: list[str]
    respondent_type: str
    score_only: bool
    score_range: dict
    licensing: LicensingInfo
    time_minutes: int
    version: str = "1.0.0"


# ── Assignment / bulk-assign ─────────────────────────────────────────────────


class AssessmentAssignRequest(BaseModel):
    patient_id: str
    template_id: str
    clinician_notes: Optional[str] = None
    due_date: Optional[str] = None  # ISO date
    phase: Optional[str] = None
    bundle_id: Optional[str] = None
    respondent_type: Optional[str] = None


class BulkAssignmentItem(BaseModel):
    """Per-assignment payload used by the new pgAssessmentsHub frontend."""
    patient_id: str
    scale_id: Optional[str] = None  # alias of template_id
    template_id: Optional[str] = None
    due_at: Optional[str] = None  # alias of due_date
    due_date: Optional[str] = None
    phase: Optional[str] = None
    bundle_id: Optional[str] = None
    recurrence: Optional[str] = None
    clinician_notes: Optional[str] = None


class BulkAssignRequest(BaseModel):
    # Legacy shape (pages-clinical-tools.js): one patient, many templates.
    patient_id: Optional[str] = None
    # Cap at 50 templates per request — prevents memory/CPU DoS via a
    # massive template_ids array and bounds the per-request commit count.
    template_ids: Optional[list[str]] = Field(default=None, max_length=50)
    phase: Optional[str] = None
    due_date: Optional[str] = None
    bundle_id: Optional[str] = None
    clinician_notes: Optional[str] = None
    # New shape (design-v2 Hub): list of per-patient assignments. Cap at 100
    # — same DoS argument; legitimate clinic workflows assign tens, not
    # thousands, of items at once.
    assignments: Optional[list[BulkAssignmentItem]] = Field(default=None, max_length=100)


class BulkAssignResponse(BaseModel):
    created: list[AssessmentOut]
    failed: list[dict]
    total: int


# ── CSV export / approve / escalate / AI summary ─────────────────────────────


class CsvExportResponseV2(BaseModel):
    csv: str
    rows: int
    generated_at: str
    demo: bool = False


class AssessmentApproveRequest(BaseModel):
    approved: bool = True
    review_notes: Optional[str] = None


class AssessmentEscalateRequest(BaseModel):
    reason: Optional[str] = None
    severity: Optional[str] = None  # optional override, usually "critical"
    notes: Optional[str] = None


class AiSummaryResponse(BaseModel):
    summary: str
    model: str
    confidence: float
    red_flags: list[str] = Field(default_factory=list)
    source: str  # "llm" | "deterministic_stub"
