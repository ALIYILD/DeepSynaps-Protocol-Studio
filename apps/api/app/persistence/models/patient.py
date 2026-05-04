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


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    dob: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    primary_condition: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    secondary_conditions: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON list
    primary_modality: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    referring_clinician: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    insurance_provider: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    insurance_number: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    consent_signed: Mapped[bool] = mapped_column(Boolean(), default=False)
    consent_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="active")  # active, on_hold, discharged
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # WinEEG-style EEG Studio patient card (JSON): identification / clinical /
    # anthropometric / demographic — see app.eeg_database.profile.DEFAULT_PROFILE.
    eeg_studio_profile_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # Structured medical-history blob — see routers/patients_router.py for shape.
    # Holds sections, safety flags/ack, and meta (version, reviewed_by/at).
    medical_history: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class ConsentRecord(Base):
    __tablename__ = "consent_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    consent_type: Mapped[str] = mapped_column(String(40), nullable=False)
    modality_slug: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)  # active, withdrawn, expired
    signed: Mapped[bool] = mapped_column(Boolean(), default=False)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    document_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class PhenotypeAssignment(Base):
    __tablename__ = "phenotype_assignments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    phenotype_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    phenotype_name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    rationale: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    qeeg_supported: Mapped[bool] = mapped_column(Boolean(), default=False)
    confidence: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class OutcomeSeries(Base):
    __tablename__ = "outcome_series"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    course_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    assessment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    template_id: Mapped[str] = mapped_column(String(64), nullable=False)
    template_title: Mapped[str] = mapped_column(String(255), nullable=False)
    score: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    score_numeric: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    measurement_point: Mapped[str] = mapped_column(String(40), nullable=False)
    administered_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class OutcomeEvent(Base):
    __tablename__ = "outcome_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    outcome_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("outcome_series.id", ondelete="SET NULL"), nullable=True, index=True)
    qeeg_analysis_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    mri_analysis_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    assessment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
    source_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    source_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    payload_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    recorded_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), index=True)

class ReviewQueueItem(Base):
    __tablename__ = "review_queue_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    item_type: Mapped[str] = mapped_column(String(40), nullable=False)
    target_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(40), nullable=False)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    assigned_to: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    due_by: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class IntakePacket(Base):
    __tablename__ = "intake_packets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="incomplete")
    chief_complaint: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    history_of_present_illness: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    psychiatric_history: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    medical_history: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    medications: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    allergies: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    prior_neuromod_treatments: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    contraindication_screening_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    baseline_assessments_complete: Mapped[bool] = mapped_column(Boolean(), default=False)
    consent_obtained: Mapped[bool] = mapped_column(Boolean(), default=False)
    clinician_notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ── Patient Provisioning Models ──────────────────────────────────────────────

class PatientInvite(Base):
    __tablename__ = "patient_invites"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invite_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    patient_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    patient_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    clinic_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    condition: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    activated_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)


# ── Messaging Model ──────────────────────────────────────────────────────────

class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sender_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    recipient_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    patient_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    body: Mapped[str] = mapped_column(Text(), nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    thread_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    priority: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)


# ── Wearable Monitoring Models ────────────────────────────────────────────────
