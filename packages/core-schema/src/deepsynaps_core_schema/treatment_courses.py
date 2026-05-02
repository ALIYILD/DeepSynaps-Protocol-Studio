"""Treatment-courses router payload types.

Promoted out of ``apps/api/app/routers/treatment_courses_router.py`` per
Architect Rec #5. The ``CourseOut.from_record`` and
``SessionLogOut.from_record`` / ``ReviewQueueOut.from_record`` constructors
take SQLAlchemy ORM rows as input; that wiring lives in the router (not in
this package) so this module remains free of any persistence dependency.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from .models import PersistedPersonalizationExplainability


# ── Course schemas ───────────────────────────────────────────────────────────


class CourseCreate(BaseModel):
    patient_id: str
    protocol_id: str                          # Registry Protocol_ID (e.g. "P001")
    condition_slug: Optional[str] = None      # Override — inferred from registry if omitted
    modality_slug: Optional[str] = None       # Override — inferred from registry if omitted
    device_slug: Optional[str] = None
    phenotype_id: Optional[str] = None
    clinician_notes: Optional[str] = None
    # Optional compact snapshot from generate-draft when include_personalization_debug was true (never fabricated).
    personalization_explainability: Optional[PersistedPersonalizationExplainability] = None


class CourseUpdate(BaseModel):
    clinician_notes: Optional[str] = None
    status: Optional[str] = None             # Only admin/clinician may set; activate endpoint preferred


class CourseActivate(BaseModel):
    notes: Optional[str] = None             # Optional approval note
    # Safety-override acknowledgement (required when patient has blocking MH
    # flags or has never been reviewed). See activate_course + safety_preflight.
    override_safety: bool = False
    override_reason: Optional[str] = None


class SafetyPreflightResponse(BaseModel):
    course_id: str
    patient_id: str
    requires_review: bool
    structured_flags: dict
    used_sections: list[str]
    source_meta: dict
    # True if the caller must pass override_safety=True + override_reason to activate.
    override_required: bool
    blocking_flags: list[str]


class CourseOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    protocol_id: str
    condition_slug: str
    modality_slug: str
    device_slug: Optional[str]
    target_region: Optional[str]
    phenotype_id: Optional[str]
    evidence_grade: Optional[str]
    on_label: bool
    planned_sessions_total: int
    planned_sessions_per_week: int
    planned_session_duration_minutes: int
    planned_frequency_hz: Optional[str]
    planned_intensity: Optional[str]
    coil_placement: Optional[str]
    status: str
    approved_by: Optional[str]
    approved_at: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]
    sessions_delivered: int
    clinician_notes: Optional[str]
    review_required: bool
    governance_warnings: list[str]
    personalization_explainability: Optional[PersistedPersonalizationExplainability] = None
    created_at: str
    updated_at: str


class CourseListResponse(BaseModel):
    items: list[CourseOut]
    total: int


# ── Delivered session schemas ────────────────────────────────────────────────


class SessionLog(BaseModel):
    device_slug: Optional[str] = None
    device_serial: Optional[str] = None
    coil_position: Optional[str] = None
    frequency_hz: Optional[str] = None
    intensity_pct_rmt: Optional[str] = None
    pulses_delivered: Optional[int] = None
    duration_minutes: Optional[int] = None
    side: Optional[str] = None
    montage: Optional[str] = None
    tolerance_rating: Optional[str] = None   # "well-tolerated" | "moderate" | "poor"
    interruptions: bool = False
    interruption_reason: Optional[str] = None
    post_session_notes: Optional[str] = None
    checklist: dict = {}                      # Technician safety checklist responses


class SessionLogOut(BaseModel):
    id: str
    course_id: str
    session_id: str
    device_slug: Optional[str]
    coil_position: Optional[str]
    frequency_hz: Optional[str]
    intensity_pct_rmt: Optional[str]
    pulses_delivered: Optional[int]
    duration_minutes: Optional[int]
    tolerance_rating: Optional[str]
    interruptions: bool
    interruption_reason: Optional[str]
    post_session_notes: Optional[str]
    checklist: dict = {}
    created_at: str


class SessionLogListResponse(BaseModel):
    items: list[SessionLogOut]
    total: int


# ── Review queue schemas ─────────────────────────────────────────────────────


class ReviewQueueOut(BaseModel):
    id: str
    item_type: str
    target_id: str
    target_type: str
    patient_id: str
    patient_name: Optional[str]        # enriched: "{first} {last}" from Patient record
    course_id: Optional[str]           # alias for target_id when target_type == "treatment_course"
    course_name: Optional[str]         # "{condition_slug} · {modality_slug}"
    condition_slug: Optional[str]      # enriched from linked TreatmentCourse
    modality_slug: Optional[str]       # enriched from linked TreatmentCourse
    primary_condition: Optional[str]   # enriched from Patient record
    assigned_to: Optional[str]
    priority: str
    status: str
    created_by: str
    due_by: Optional[str]
    notes: Optional[str]
    created_at: str


class ReviewQueueListResponse(BaseModel):
    items: list[ReviewQueueOut]
    total: int


class AssignReviewerBody(BaseModel):
    assigned_to: Optional[str] = None  # None / empty string → unassign


class ReviewActionCreate(BaseModel):
    review_item_id: str
    action: str                     # "approve" | "reject" | "escalate" | "comment"
    notes: Optional[str] = None


class ReviewActionOut(BaseModel):
    review_item_id: str
    actor_id: str
    action: str
    notes: Optional[str]
    created_at: str
    item_status: str                # updated status of the queue item after the action


# ── Course-Detail launch-audit schemas ───────────────────────────────────────


_COURSE_DETAIL_DISCLAIMERS = (
    "Course Detail aggregates data for clinical review only.",
    "Pause / resume / close transitions require a clinician note and are immutably audited.",
    "Demo courses are not regulator-submittable; exports are tagged accordingly.",
)


class CourseDetailResponse(BaseModel):
    """Aggregated read used by the Course Detail page header & tabs.

    Does not duplicate large nested payloads (sessions, AE) — those still
    have dedicated endpoints — but does provide enough scalar context for
    the page header, status banners, and DEMO labelling without N+1.
    """

    course: CourseOut
    sessions_total: int
    sessions_delivered: int
    sessions_planned: int
    completion_pct: int
    has_serious_ae: bool
    is_demo: bool
    is_terminal: bool
    last_session_at: Optional[str] = None
    disclaimers: list[str] = Field(default_factory=lambda: list(_COURSE_DETAIL_DISCLAIMERS))


class CourseSessionsSummaryResponse(BaseModel):
    course_id: str
    sessions_total: int
    sessions_planned: int
    sessions_delivered: int
    interrupted: int
    deviations: int
    with_post_notes: int
    with_checklist: int
    by_tolerance: dict[str, int] = Field(default_factory=dict)
    last_session_at: Optional[str] = None
    first_session_at: Optional[str] = None
    is_demo: bool = False


class CourseAuditEventOut(BaseModel):
    event_id: str
    target_id: str
    target_type: str
    action: str
    role: str
    actor_id: str
    note: str
    created_at: str


class CourseAuditEventsResponse(BaseModel):
    course_id: str
    items: list[CourseAuditEventOut] = Field(default_factory=list)
    total: int = 0
    disclaimers: list[str] = Field(default_factory=lambda: list(_COURSE_DETAIL_DISCLAIMERS))


class CourseAuditEventIn(BaseModel):
    event: str = Field(..., min_length=1, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    using_demo_data: bool = False


class CourseAuditEventAck(BaseModel):
    accepted: bool
    event_id: str


class CourseTransitionBody(BaseModel):
    note: str = Field(..., min_length=1, max_length=1024)
