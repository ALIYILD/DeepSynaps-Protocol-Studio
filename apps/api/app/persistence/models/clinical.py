"""Auto-split bucket — see app.persistence.models package docstring.

This file contains a domain-grouped subset of the SQLAlchemy ORM classes
formerly in ``apps/api/app/persistence/models.py``. The split is shim-only:
every class is re-exported from ``app.persistence.models`` so callers see
no behavioural change. All classes share the single ``Base`` from
``app.database`` (re-exported here via ``_base``) — verify with
``Patient.metadata is AuditEventRecord.metadata``.
"""
from __future__ import annotations

from ._base import (  # noqa: F401 — re-export surface for class definitions
    Base,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Mapped,
    Optional,
    String,
    Text,
    UniqueConstraint,
    datetime,
    event,
    mapped_column,
    sa_text,
    timezone,
    uuid,
    _HAS_PGVECTOR,
    _PgVector,
    _embedding_column,
    _embedding_column_1536,
)


class ClinicalSession(Base):
    __tablename__ = "clinical_sessions"
    __table_args__ = (
        CheckConstraint(
            "billing_status IN ('unbilled', 'billed', 'paid')",
            name='ck_clinical_sessions_billing_status',
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    scheduled_at: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer(), default=60)
    modality: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    protocol_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    session_number: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    total_sessions: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    appointment_type: Mapped[str] = mapped_column(String(50), default='session')  # session, assessment, new_patient, follow_up, phone, consultation
    status: Mapped[str] = mapped_column(String(30), default="scheduled")  # scheduled, confirmed, checked_in, in_progress, completed, cancelled, no_show
    outcome: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # positive, neutral, negative
    session_notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    adverse_events: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    room_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    device_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    confirmed_at: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    checked_in_at: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    completed_at: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    cancelled_at: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    rescheduled_from: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    billing_code: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    billing_status: Mapped[str] = mapped_column(String(30), default='unbilled')
    recurrence_group: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class ClinicalSessionEvent(Base):
    __tablename__ = "clinical_session_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("clinical_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    payload_json: Mapped[str] = mapped_column(Text(), default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), index=True)

class AssessmentRecord(Base):
    __tablename__ = "assessment_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey('patients.id', ondelete='CASCADE'), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    template_id: Mapped[str] = mapped_column(String(64), nullable=False)
    template_title: Mapped[str] = mapped_column(String(255), nullable=False)
    data_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    clinician_notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="draft")  # draft, pending, completed
    score: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Governance fields (migration 020): respondent type, phase, due date, scale version,
    # bundle linkage, clinician approval trail, AI provenance, and source label.
    respondent_type: Mapped[str] = mapped_column(String(30), nullable=False, default="patient")
    phase: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, index=True)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True, index=True)
    scale_version: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    bundle_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    approved_status: Mapped[str] = mapped_column(String(30), nullable=False, default="unreviewed")
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    ai_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="manual")
    # Go-live additions (migration 026_assessments_golive) — all nullable for backward compatibility.
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True, index=True)
    score_numeric: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    subscales_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON obj, e.g. Y-BOCS {obsessions:..., compulsions:...}
    items_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON {item_id: response}
    interpretation: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ai_model: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    ai_confidence: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    escalated: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False, index=True)
    escalated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    escalation_reason: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    escalated_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class PrescribedProtocol(Base):
    __tablename__ = "prescribed_protocols"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    condition: Mapped[str] = mapped_column(String(120), nullable=False)
    modality: Mapped[str] = mapped_column(String(60), nullable=False)
    device: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    protocol_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    sessions_total: Mapped[int] = mapped_column(Integer(), default=12)
    sessions_completed: Mapped[int] = mapped_column(Integer(), default=0)
    status: Mapped[str] = mapped_column(String(30), default="active")  # active, completed, paused
    started_at: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ── Neuromodulation Platform Models ──────────────────────

class TreatmentCourse(Base):
    __tablename__ = "treatment_courses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    protocol_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    condition_slug: Mapped[str] = mapped_column(String(120), nullable=False)
    modality_slug: Mapped[str] = mapped_column(String(60), nullable=False)
    device_slug: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    target_region: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    phenotype_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    evidence_grade: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    on_label: Mapped[bool] = mapped_column(Boolean(), default=True)
    planned_sessions_total: Mapped[int] = mapped_column(Integer(), default=20)
    planned_sessions_per_week: Mapped[int] = mapped_column(Integer(), default=5)
    planned_session_duration_minutes: Mapped[int] = mapped_column(Integer(), default=40)
    planned_frequency_hz: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    planned_intensity: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    coil_placement: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="pending_approval")
    approved_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    sessions_delivered: Mapped[int] = mapped_column(Integer(), default=0)
    clinician_notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    protocol_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    review_required: Mapped[bool] = mapped_column(Boolean(), default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class TreatmentCourseReview(Base):
    __tablename__ = "treatment_course_reviews"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_courses.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    review_type: Mapped[str] = mapped_column(String(40), nullable=False)
    outcome: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    milestone_session: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class ProtocolVersion(Base):
    __tablename__ = "protocol_versions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    protocol_ref: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer(), default=1)
    condition_slug: Mapped[str] = mapped_column(String(120), nullable=False)
    modality_slug: Mapped[str] = mapped_column(String(60), nullable=False)
    device_slug: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    parameters_json: Mapped[str] = mapped_column(Text(), nullable=False)
    evidence_grade: Mapped[str] = mapped_column(String(20), nullable=False)
    on_label: Mapped[bool] = mapped_column(Boolean(), default=True)
    governance_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    is_current: Mapped[bool] = mapped_column(Boolean(), default=True)

class DeliveredSessionParameters(Base):
    __tablename__ = "delivered_session_parameters"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    course_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    device_slug: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    device_serial: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    coil_position: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    frequency_hz: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    intensity_pct_rmt: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    pulses_delivered: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    side: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    montage: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    tech_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    tolerance_rating: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    interruptions: Mapped[bool] = mapped_column(Boolean(), default=False)
    interruption_reason: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    post_session_notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    checklist_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class AdverseEvent(Base):
    __tablename__ = "adverse_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    onset_timing: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    resolution: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    action_taken: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    reported_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

    # ── Launch-audit 2026-04-30: regulatory classification + review trail ──
    # Body system (MedDRA SOC subset): nervous, psychiatric, cardiac, gi, skin,
    # general, other. AI may suggest from event_type but clinician confirms.
    body_system: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    # Expectedness vs the protocol's known risk profile.
    # Values: "expected", "unexpected", "unknown". Defaults to "unknown" until
    # the clinician confirms or the protocol risk profile asserts.
    expectedness: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    expectedness_source: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # SAE auto-classification (severity == 'serious' or one of: death,
    # hospitalization, life_threatening, persistent_disability,
    # congenital_anomaly, important_medical_event).
    is_serious: Mapped[bool] = mapped_column(Boolean(), default=False, index=True)
    sae_criteria: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Reportable to regulator (SAE AND unexpected AND related-or-possibly).
    reportable: Mapped[bool] = mapped_column(Boolean(), default=False, index=True)
    relatedness: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Clinician review + sign-off audit fields.
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    signed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Regulator/IRB escalation audit fields.
    escalated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    escalated_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    escalation_target: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    escalation_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # MedDRA codes (optional — preferred term + system organ class).
    meddra_pt: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    meddra_soc: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    # Demo flag for seeded records.
    is_demo: Mapped[bool] = mapped_column(Boolean(), default=False, index=True)

class FormDefinition(Base):
    """Clinician-defined form/questionnaire definition."""
    __tablename__ = "form_definitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    form_type: Mapped[str] = mapped_column(String(60), nullable=False, default="custom")  # custom, intake, outcome, screening
    questions_json: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")
    scoring_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # scoring rules
    status: Mapped[str] = mapped_column(String(30), default="draft")  # draft, active, archived
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class DocumentTemplate(Base):
    """Clinician-authored document template (letter / consent / handout / ...).

    Stored as plain markdown so the modal builder is a single textarea. The
    Documents Hub renders these alongside the bundled DOCUMENT_TEMPLATES
    from `apps/web/src/documents-templates.js` — the bundled set is read-only
    starter content; rows here are user-customisable.
    """
    __tablename__ = "document_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(40), nullable=False, default="letter")
    body_markdown: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

class HomeTaskTemplate(Base):
    """Clinician-authored home task template (mood journal / breathing / etc.).

    Backs the Tasks page (`pgHomePrograms` in `apps/web/src/pages-clinical-tools.js`)
    Templates tab. Templates carry a free-form JSON payload so the schema can
    evolve without migrations — current shape mirrors the in-memory template
    object: `{title, type, frequency, instructions, reason, conditionId?,
    conditionName?, category?}`. The bundled DEFAULT_TEMPLATES + condition
    library remain read-only starter content; rows in this table are
    clinician-customisable and survive device switches.
    """
    __tablename__ = "home_task_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

class SessionRecording(Base):
    """Clinician-owned session recording (audio/video) — minimal media-storage MVP.

    Bytes live on the local Fly volume under
    `{media_storage_root}/recordings/{owner_clinician_id}/{id}` (the storage
    layout is partitioned by clinician so a directory delete cleans up an
    owner's blobs). The DB row is the source of truth — `file_path` is the
    storage-relative path so reads don't need the absolute disk root.
    """
    __tablename__ = "session_recordings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    patient_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(80), nullable=False)
    byte_size: Mapped[int] = mapped_column(BigInteger(), nullable=False)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class AgentSkill(Base):
    """Admin-configurable AI Practice Agent skill (replaces hard-coded grid).

    Backs the AI Practice Agents page (`pgAgentChat` in
    `apps/web/src/pages-agents.js`). The bundled CLINICIAN_SKILLS constant
    in that file is kept as a read-only fallback used when the API is
    unavailable; rows in this table are the source of truth otherwise.
    `run_payload_json` is intentionally free-form (e.g. prompt template +
    optional tool calls) so we can extend the skill schema without a
    migration.
    """
    __tablename__ = "agent_skills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    category_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    icon: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    run_payload_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    enabled: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer(), nullable=False, default=0, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

class FormSubmission(Base):
    """Patient's completed form submission."""
    __tablename__ = "form_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    form_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    responses_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    score: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    score_numeric: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    scoring_details_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="submitted")  # submitted, scored, reviewed
    submitted_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── Medication Safety Models ──────────────────────────────────────────────────

class PatientMedication(Base):
    """Medication record for a patient."""
    __tablename__ = "patient_medications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    generic_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    drug_class: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    dose: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    frequency: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    route: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)  # oral, topical, IV, etc.
    indication: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    prescriber: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    started_at: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    stopped_at: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean(), default=True, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class MedicationInteractionLog(Base):
    """Log of interaction checks performed for a patient."""
    __tablename__ = "medication_interaction_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    medications_checked_json: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")
    interactions_found_json: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")
    severity_summary: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # none, mild, moderate, severe
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

# ── Nutrition Analyzer (MVP scaffold) ─────────────────────────────────────────

class PatientNutritionDietLog(Base):
    """Single-day nutrition intake aggregation for decision-support scaffolding."""

    __tablename__ = "patient_nutrition_diet_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    log_day: Mapped[str] = mapped_column(String(20), nullable=False)  # YYYY-MM-DD
    calories_kcal: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    protein_g: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    carbs_g: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    fat_g: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    sodium_mg: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    fiber_g: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class PatientSupplement(Base):
    """Over-the-counter or clinician-documented supplement for nutrition analysis."""

    __tablename__ = "patient_supplements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    dose: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    frequency: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    started_at: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )


class NutritionAnalyzerAudit(Base):
    """Append-only nutrition analyzer events for MVP audit trail."""

    __tablename__ = "nutrition_analyzer_audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    actor_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class MedicationAnalyzerAudit(Base):
    """Durable audit row for Medication Analyzer clinician actions and reads.

    Complements the umbrella :class:`AuditEventRecord` stream (regulatory
    index); stores structured detail for research QA and cross-team review.
    """
    __tablename__ = "medication_analyzer_audit"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    audit_ref: Mapped[Optional[str]] = mapped_column(String(96), nullable=True, index=True)
    ruleset_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    detail_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), index=True
    )


class MedicationAnalyzerReviewNote(Base):
    """Clinician review notes attached to the Medication Analyzer context."""

    __tablename__ = "medication_analyzer_review_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    note_text: Mapped[str] = mapped_column(Text(), nullable=False)
    linked_recommendation_ids_json: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), index=True)


class MedicationAnalyzerTimelineEvent(Base):
    """Clinician-entered timeline annotations (does not replace Rx source rows)."""

    __tablename__ = "medication_analyzer_timeline_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    occurred_at: Mapped[str] = mapped_column(String(64), nullable=False)
    medication_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    payload_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    source_origin: Mapped[str] = mapped_column(String(48), nullable=False, default="clinician_entry")
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), index=True)

# ── Neuromodulation Bio Database Models ──────────────────────────────────────

class ClinicalCatalogItem(Base):
    """Reference catalog row for neuromodulation-relevant clinical items."""

    __tablename__ = "clinical_catalog_items"
    __table_args__ = (
        CheckConstraint(
            "item_type IN ('medication', 'supplement', 'vitamin', 'lab_test', 'biomarker')",
            name="ck_clinical_catalog_items_item_type",
        ),
        UniqueConstraint(
            "item_type",
            "slug",
            name="uq_clinical_catalog_items_type_slug",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    item_type: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    aliases_json: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")
    default_unit: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    unit_options_json: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")
    neuromodulation_relevance: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    evidence_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class PatientSubstance(Base):
    """Patient-specific medication / supplement / vitamin record."""

    __tablename__ = "patient_substances"
    __table_args__ = (
        CheckConstraint(
            "substance_type IN ('medication', 'supplement', 'vitamin')",
            name="ck_patient_substances_substance_type",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    catalog_item_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("clinical_catalog_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    substance_type: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    generic_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    dose: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    dose_unit: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    frequency: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    route: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    indication: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    stopped_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True, index=True)
    source: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class PatientLabResult(Base):
    """Timestamped lab test or biomarker observation for a patient."""

    __tablename__ = "patient_lab_results"
    __table_args__ = (
        CheckConstraint(
            "(lab_test_name IS NOT NULL) OR (biomarker_name IS NOT NULL)",
            name="ck_patient_lab_results_named_result",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    catalog_item_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("clinical_catalog_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    lab_test_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    biomarker_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    specimen_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    value_text: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    value_numeric: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    reference_range_low: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    reference_range_high: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    reference_range_text: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    abnormal_flag: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    collected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True, index=True)
    reported_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    source_lab: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    fasting_state: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ── Reminder Campaign Models ──────────────────────────────────────────────────

class ReminderCampaign(Base):
    """Scheduled reminder campaign for a patient cohort."""
    __tablename__ = "reminder_campaigns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    campaign_type: Mapped[str] = mapped_column(String(60), nullable=False, default="session")  # session, medication, assessment, general
    channel: Mapped[str] = mapped_column(String(30), nullable=False, default="email")  # email, sms, push, telegram
    schedule_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")  # cron or offset rules
    message_template: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    patient_ids_json: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")  # targeted patients
    active: Mapped[bool] = mapped_column(Boolean(), default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class ReminderOutboxMessage(Base):
    """Individual queued or sent reminder message."""
    __tablename__ = "reminder_outbox_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(30), nullable=False)
    message_body: Mapped[str] = mapped_column(Text(), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)  # queued, sent, delivered, failed
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    error_detail: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── IRB Study Models ──────────────────────────────────────────────────────────

class ClinicianHomeProgramTask(Base):
    """Between-session home program task assigned by a clinician (full task JSON + validated provenance)."""

    __tablename__ = "clinician_home_program_tasks"

    id: Mapped[str] = mapped_column(String(96), primary_key=True)
    server_task_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    task_json: Mapped[str] = mapped_column(Text(), nullable=False)
    revision: Mapped[int] = mapped_column(Integer(), nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class PatientHomeProgramTaskCompletion(Base):
    """Patient-reported completion / feedback for a home program task instance."""

    __tablename__ = "patient_home_program_task_completions"
    __table_args__ = (UniqueConstraint("patient_id", "server_task_id", name="uq_pt_task_completion_patient_server_task"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    server_task_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    completed: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, index=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    difficulty: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    feedback_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    feedback_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    media_upload_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

class Annotation(Base):
    """Clinician pin-to-finding annotation (CONTRACT_V3 §3, migration 042).

    A freeform note authored by a clinician and attached to a specific
    location within a qEEG or MRI analysis — e.g. a stim target card, a
    z-score cell, an ROI, or a free-text section. Used to convey
    disagreement, follow-up items, clarifications, or patient-facing
    notes. Soft-delete only (``deleted_at``).

    Notes
    -----
    Tags are stored as a JSON-encoded ``Text`` blob so the SQLite test
    env can round-trip them without a JSONB column type.
    """

    __tablename__ = "annotations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    analysis_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    analysis_type: Mapped[str] = mapped_column(String(16), nullable=False)
    author_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    author_name: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    target_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    target_ref: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    text: Mapped[str] = mapped_column(Text(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    resolved_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    tags_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)

class RiskStratificationResult(Base):
    """Per-patient, per-category traffic-light risk level (upserted on compute)."""
    __tablename__ = "risk_stratification_results"
    __table_args__ = (
        UniqueConstraint("patient_id", "category", name="uq_risk_patient_category"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False)  # allergy, suicide_risk, mental_crisis, self_harm, harm_to_others, seizure_risk, implant_risk, medication_interaction
    level: Mapped[str] = mapped_column(String(10), nullable=False, default="green")  # green, amber, red
    confidence: Mapped[str] = mapped_column(String(20), nullable=False, default="no_data")  # high, medium, low, no_data
    rationale: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    data_sources_json: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")
    evidence_refs_json: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")
    override_level: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    override_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    override_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    override_reason: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class RiskStratificationAudit(Base):
    """Immutable log of every risk-level change for governance traceability."""
    __tablename__ = "risk_stratification_audit"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    previous_level: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    new_level: Mapped[str] = mapped_column(String(10), nullable=False)
    trigger: Mapped[str] = mapped_column(String(60), nullable=False)  # assessment_completed, medication_added, manual_override, etc.
    actor_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class PatientRiskFormulation(Base):
    """Person-centred formulation + safety plan blob for Risk Analyzer workspace."""

    __tablename__ = "patient_risk_formulation"

    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patients.id", ondelete="CASCADE"), primary_key=True
    )
    formulation_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    safety_plan_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
    updated_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class RiskAnalyzerAudit(Base):
    """Append-only Risk Analyzer events (formulation save, safety plan, notes)."""

    __tablename__ = "risk_analyzer_audit"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    payload_summary: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    payload_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class DigitalPhenotypingPatientState(Base):
    """Per-patient consent domains + UI settings for the Digital Phenotyping Analyzer."""

    __tablename__ = "digital_phenotyping_patient_state"

    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patients.id", ondelete="CASCADE"), primary_key=True
    )
    domains_enabled_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    ui_settings_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    consent_scope_version: Mapped[str] = mapped_column(String(64), nullable=False, default="2026.04")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
    updated_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class DigitalPhenotypingAudit(Base):
    """Append-only audit trail for Digital Phenotyping Analyzer actions."""

    __tablename__ = "digital_phenotyping_audit"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    detail_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    actor_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class DigitalPhenotypingObservation(Base):
    """User- or sync-entered data points for the Digital Phenotyping MVP (EMA, estimates, device backfill)."""

    __tablename__ = "digital_phenotyping_observations"
    __table_args__ = (Index("ix_dpa_obs_patient_recorded", "patient_id", "recorded_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(32), nullable=False)  # manual, device_sync
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, index=True)
    payload_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class MovementAnalyzerSnapshot(Base):
    """Cached Movement Analyzer page payload (per-patient, versioned JSON).

    Recomputed on demand via POST .../recompute. Clinician annotations append
    audit rows; payload_json stores the full serialisable workspace snapshot.
    """

    __tablename__ = "movement_analyzer_snapshots"
    __table_args__ = (UniqueConstraint("patient_id", name="uq_movement_analyzer_patient"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    payload_json: Mapped[str] = mapped_column(Text(), nullable=False)
    schema_version: Mapped[str] = mapped_column(String(16), nullable=False, default="1")
    pipeline_version: Mapped[str] = mapped_column(String(32), nullable=False, default="0.1.0")
    computed_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class MovementAnalyzerAudit(Base):
    """Immutable audit log for Movement Analyzer (recompute, annotation)."""

    __tablename__ = "movement_analyzer_audit"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(40), nullable=False)  # recompute | annotate | view
    actor_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    detail_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), index=True)


# ── Evidence Citation Validator Models (migration 045) ────────────────────────
#
# Implements the pgvector-backed literature corpus, claim-citation linkage,
# hash-chained grounding audit trail, and hypergraph edge citation enrichment
# defined in ``evidence_citation_validator.md``.

class PatientAgentActivation(Base):
    """Clinic-level activation record for a patient-facing agent (Phase 8).

    Phase 7 (PR #221) shipped this flow with a module-scoped in-memory set
    that did not survive a Fly machine restart. Phase 8 promotes it to a
    real audit-style table:

    * One row per (clinic_id, agent_id) attestation event.
    * Soft-delete via ``deactivated_at`` / ``deactivated_by`` — never
      hard-delete; the row is the audit evidence of who attested what.
    * Re-activating a previously-deactivated pair creates a *new* row;
      the prior soft-deleted row is preserved.
    * Active uniqueness is enforced by a partial unique index over
      ``(clinic_id, agent_id) WHERE deactivated_at IS NULL`` — declared
      at the migration level (sqlite + postgres both support it). Mirrors
      :class:`AgentSubscription`'s column conventions.

    Production guardrail still lives in
    :func:`app.services.patient_agent_activation.is_activated`: even with
    an active row present, callers see ``False`` unless
    ``DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED=1``.
    """

    __tablename__ = "patient_agent_activation"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: uuid.uuid4().hex
    )
    # Clinic owning the activation. Not a FK — the activation table is
    # operator audit, and we keep it loose so a clinic deletion doesn't
    # silently lose the attestation history.
    clinic_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Agent canonical id (e.g. "patient.care_companion"). Not a FK —
    # agents live in the in-process AGENT_REGISTRY.
    agent_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    # Free-text attestation written by the super-admin. Service-layer
    # enforces a >= 32-char minimum so this is never trivial.
    attestation: Mapped[str] = mapped_column(Text(), nullable=False)
    # Actor id of the super-admin recording the attestation.
    attested_by: Mapped[str] = mapped_column(String(64), nullable=False)
    attested_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    # Soft-delete: when present, the row is treated as historical and the
    # partial unique index ignores it. ``deactivated_by`` records the
    # actor that flipped the row off.
    deactivated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(), nullable=True
    )
    deactivated_by: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )


# Partial unique index — only enforce uniqueness for rows where
# ``deactivated_at IS NULL``. SQLite (>= 3.8) and Postgres both honour the
# dialect-specific ``*_where`` kwargs; the metadata-driven schema build
# (``Base.metadata.create_all``) emits the partial WHERE clause natively
# so the test harness exercises the same constraint as production.
Index(
    "uq_active_pair",
    PatientAgentActivation.clinic_id,
    PatientAgentActivation.agent_id,
    unique=True,
    sqlite_where=sa_text("deactivated_at IS NULL"),
    postgresql_where=sa_text("deactivated_at IS NULL"),
)


# ── Phase 9 — per-clinic monthly cost cap (migration 053) ───────────────────

class FusionCase(Base):
    """Persistent, review-governed multimodal fusion case summary."""
    __tablename__ = "fusion_cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    qeeg_analysis_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    mri_analysis_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    assessment_ids_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    course_ids_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # ── AI-generated payload (additive JSON columns) ──
    summary: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    confidence_grade: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, default="heuristic")
    recommendations_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    modality_agreement_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    protocol_fusion_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    explainability_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    safety_cockpit_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    red_flags_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    governance_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    patient_facing_report_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    limitations_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    missing_modalities_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    provenance_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # ── Review state machine ──
    report_state: Mapped[str] = mapped_column(String(30), nullable=False, default="FUSION_DRAFT_AI")
    reviewer_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    clinician_amendments: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    report_version: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    signed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    # ── Metadata ──
    partial: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    source_qeeg_state: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    source_mri_state: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    radiology_review_required: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    mri_registration_confidence: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class FusionCaseAudit(Base):
    """Immutable audit trail for FusionCase state transitions."""
    __tablename__ = "fusion_case_audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    fusion_case_id: Mapped[str] = mapped_column(String(36), ForeignKey("fusion_cases.id", ondelete="CASCADE"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(50), nullable=False)
    previous_state: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    new_state: Mapped[str] = mapped_column(String(30), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class FusionCaseFinding(Base):
    """Per-target finding review record for fusion cases."""
    __tablename__ = "fusion_case_findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    fusion_case_id: Mapped[str] = mapped_column(String(36), ForeignKey("fusion_cases.id", ondelete="CASCADE"), nullable=False, index=True)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False)
    claim_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING_REVIEW")
    evidence_grade: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    clinician_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    amended_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── Phase 12 — onboarding wizard funnel telemetry (migration 056) ────────────

class OnboardingEvent(Base):
    """Single event emitted by the agent-onboarding wizard.

    Phase 10 shipped the four-step wizard but no telemetry — we had no idea
    how many users dropped off, where, or whether the Stripe step was the
    main blocker. This table is the funnel substrate: each row is a single
    step transition recorded by the browser. The accompanying
    ``/api/v1/onboarding/funnel`` endpoint aggregates them into the
    started → completed conversion rate that ops monitors weekly.

    Design contract
    ---------------
    * ``clinic_id`` and ``actor_id`` are both nullable — the wizard renders
      pre-login (anonymous browser visiting the studio for the first time)
      and after login. Anonymous events still feed the funnel; we just lose
      the per-clinic dimension for them.
    * ``actor_id`` uses ``ON DELETE SET NULL`` so deleting a user does not
      orphan their funnel rows; we keep the audit trail with a NULL actor.
    * ``step`` is a small string enum, validated at the API boundary
      (``app.routers.onboarding_router._VALID_STEPS``). Stored as a plain
      VARCHAR so we can ship a new step name without an enum migration.
    * ``payload_json`` is small free-form JSON (package id, agent id, count
      of invitees) serialised to TEXT — cross-dialect (SQLite + Postgres)
      and never queried structurally.
    * ``created_at`` is indexed because the funnel query always filters by
      ``created_at >= now() - interval``; without the index Postgres would
      degrade to a seq scan as the table grows.
    """

    __tablename__ = "onboarding_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clinic_id: Mapped[Optional[str]] = mapped_column(
        String(64),
        ForeignKey("clinics.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    step: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    payload_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )


# ── Onboarding wizard launch-audit (migration 067) ───────────────────────────

class OnboardingState(Base):
    """Server-side onboarding wizard state, one row per actor.

    Lifecycle
    ---------
    * Created on first ``GET /api/v1/onboarding/state`` for an authenticated
      actor (defaults: current_step='welcome', is_demo=False).
    * Updated by ``POST /api/v1/onboarding/state`` and the step-complete /
      skip / seed-demo endpoints.
    * ``is_demo`` is sticky: once a user picks "use sample data" or "skip
      setup with sample data", the flag remains True so downstream surfaces
      can render DEMO banners on records seeded during the wizard.
    * ``completed_at`` / ``abandoned_at`` are mutually exclusive (the API
      enforces this; the DB does not, so we can backfill if a definition
      changes later).

    Why server-side?
    ----------------
    Pre-launch audit (2026-05-01) found resume-from-step relied on
    ``localStorage`` only, which loses progress when the user finishes
    onboarding on a different device or after a browser-data wipe. This
    table is the source of truth; localStorage remains a best-effort
    fallback when the API is unreachable.
    """

    __tablename__ = "onboarding_state"

    actor_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    clinic_id: Mapped[Optional[str]] = mapped_column(
        String(64),
        ForeignKey("clinics.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    current_step: Mapped[str] = mapped_column(
        String(64), nullable=False, default="welcome"
    )
    is_demo: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    abandoned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    abandon_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


# ── Phase 13 — DeepTwin persistence and clinician review (migration 062) ──────
#
# DeepTwin previously computed every output on-the-fly with no historical
# record.  These tables add auditability: every analysis run, simulation,
# and clinician note is now persisted and reviewable.

class DeepTwinAnalysisRun(Base):
    """Persisted output of a DeepTwin analysis (correlation, prediction, AI summary)."""

    __tablename__ = "deeptwin_analysis_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    analysis_type: Mapped[str] = mapped_column(String(40), nullable=False)
    input_sources_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    output_summary_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    limitations_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    model_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

class DeepTwinSimulationRun(Base):
    """Persisted output of a DeepTwin simulation run."""

    __tablename__ = "deeptwin_simulation_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    proposed_protocol_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    assumptions_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    predicted_direction_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    evidence_links_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    limitations: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    clinician_review_required: Mapped[bool] = mapped_column(Boolean(), default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

class DeepTwinClinicianNote(Base):
    """Clinician annotation attached to a patient twin context."""

    __tablename__ = "deeptwin_clinician_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    note_text: Mapped[str] = mapped_column(Text(), nullable=False)
    related_analysis_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    related_simulation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── QA Findings (launch-audit 2026-04-30) ────────────────────────────────────
# Non-conformance / CAPA records surfaced by the Quality Assurance page.
# Distinct from the artifact-level QA scoring engine in deepsynaps_qa.
