from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditEventRecord(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    target_id: Mapped[str] = mapped_column(String(64), index=True)
    target_type: Mapped[str] = mapped_column(String(32), index=True)
    action: Mapped[str] = mapped_column(String(32), index=True)
    role: Mapped[str] = mapped_column(String(32), index=True)
    actor_id: Mapped[str] = mapped_column(String(64), index=True)
    note: Mapped[str] = mapped_column(Text())
    created_at: Mapped[str] = mapped_column(String(64), index=True)


class ClinicalDatasetSnapshotRecord(Base):
    __tablename__ = "clinical_dataset_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    source_hash: Mapped[str] = mapped_column(String(128), index=True)
    source_root: Mapped[str] = mapped_column(String(512))
    total_records: Mapped[int] = mapped_column(Integer)
    counts_json: Mapped[str] = mapped_column(Text())
    created_at: Mapped[str] = mapped_column(String(64), index=True)


class ClinicalSeedRecord(Base):
    __tablename__ = "clinical_seed_records"
    __table_args__ = (
        UniqueConstraint("dataset_name", "record_key", name="uq_clinical_seed_dataset_record"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_name: Mapped[str] = mapped_column(String(64), index=True)
    record_key: Mapped[str] = mapped_column(String(64), index=True)
    snapshot_id: Mapped[str] = mapped_column(String(64), index=True)
    source_file: Mapped[str] = mapped_column(String(256))
    payload_json: Mapped[str] = mapped_column(Text())
    content_hash: Mapped[str] = mapped_column(String(128), index=True)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="guest")
    package_id: Mapped[str] = mapped_column(String(50), default="explorer")
    clinic_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    is_verified: Mapped[bool] = mapped_column(Boolean(), default=False)
    is_active: Mapped[bool] = mapped_column(Boolean(), default=True)
    # Settings API — profile extensions (migration 024_settings_schema)
    credentials: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    license_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    pending_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pending_email_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    pending_email_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Subscription(Base):
    __tablename__ = "subscriptions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    package_id: Mapped[str] = mapped_column(String(50), default="explorer")
    status: Mapped[str] = mapped_column(String(50), default="active")  # active, canceled, past_due
    seat_limit: Mapped[int] = mapped_column(Integer(), default=1)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class TeamMember(Base):
    __tablename__ = "team_members"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subscription_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), default="member")  # owner, admin, member
    invited_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    joined_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── Clinical Practice Models ────────────────────────────────────────────────────

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
    # Structured medical-history blob — see routers/patients_router.py for shape.
    # Holds sections, safety flags/ack, and meta (version, reviewed_by/at).
    medical_history: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


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


class QEEGRecord(Base):
    __tablename__ = "qeeg_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    recording_type: Mapped[str] = mapped_column(String(30), nullable=False)
    recording_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    equipment: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    eyes_condition: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    raw_data_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    summary_notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    findings_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
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


class DeviceConnection(Base):
    __tablename__ = "device_connections"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default='disconnected')
    consent_given: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    consent_given_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    connected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    external_device_id: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    # Encrypted via app.crypto.encrypt_token() before write; decrypt with decrypt_token() on read.
    # WEARABLE_TOKEN_ENC_KEY env var must be set before real OAuth flows are enabled.
    # V1: these fields are empty (OAuth added in V2). Empty = no tokens stored yet.
    access_token_enc: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    refresh_token_enc: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    scope: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)


class WearableObservation(Base):
    __tablename__ = "wearable_observations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    connection_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    metric_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    value: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    value_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, index=True)
    aggregation_window: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    quality_flag: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class WearableDailySummary(Base):
    __tablename__ = "wearable_daily_summaries"
    __table_args__ = (
        UniqueConstraint("patient_id", "source", "date", name="uq_wearable_daily_patient_source_date"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    rhr_bpm: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    hrv_ms: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    sleep_duration_h: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    sleep_consistency_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    steps: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    spo2_pct: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    skin_temp_delta: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    readiness_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    mood_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    pain_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    anxiety_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    data_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class WearableAlertFlag(Base):
    __tablename__ = "wearable_alert_flags"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    flag_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)  # info, warning, urgent
    detail: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    metric_snapshot: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, index=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    dismissed: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False, index=True)
    auto_generated: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)


class AiSummaryAudit(Base):
    __tablename__ = "ai_summary_audit"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False)
    summary_type: Mapped[str] = mapped_column(String(32), nullable=False)
    prompt_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    response_preview: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    sources_used: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    model_used: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), index=True)


# ── Media Upload & AI Analysis Models ────────────────────────────────────────


class MediaConsent(Base):
    __tablename__ = "media_consents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    consent_type: Mapped[str] = mapped_column(String(40), nullable=False)  # "upload_voice"|"upload_video"|"upload_text"|"ai_analysis"
    granted: Mapped[bool] = mapped_column(Boolean(), default=False)
    granted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    retention_days: Mapped[int] = mapped_column(Integer(), default=365)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class PatientMediaUpload(Base):
    __tablename__ = "patient_media_uploads"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    uploaded_by: Mapped[str] = mapped_column(String(36), nullable=False)
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "voice"|"video"|"text"
    file_ref: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    text_content: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    patient_note: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="uploaded")  # uploaded|pending_review|approved_for_analysis|analyzing|analyzed|clinician_reviewed|rejected|reupload_requested
    consent_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class PatientMediaTranscript(Base):
    __tablename__ = "patient_media_transcripts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    upload_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    transcript_text: Mapped[str] = mapped_column(Text(), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)  # "whisper-1"|"whisper-local"
    language: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    word_count: Mapped[int] = mapped_column(Integer(), default=0)
    processing_seconds: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class PatientMediaAnalysis(Base):
    __tablename__ = "patient_media_analysis"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    upload_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    transcript_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    triggered_by: Mapped[str] = mapped_column(String(36), nullable=False)
    model_used: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    structured_summary: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    symptoms_mentioned: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)       # JSON array
    side_effects_mentioned: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)   # JSON array
    functional_impact: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)        # JSON
    adherence_mentions: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)       # JSON
    follow_up_questions: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)      # JSON array
    chart_note_draft: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    comparison_notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)         # JSON trend notes
    approved_for_clinical_use: Mapped[bool] = mapped_column(Boolean(), default=False)
    clinician_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    clinician_reviewer_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    clinician_amendments: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class PatientMediaReviewAction(Base):
    __tablename__ = "patient_media_review_actions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    upload_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)  # "approve"|"reject"|"request_reupload"|"flag_urgent"|"mark_reviewed"
    reason: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class ClinicianMediaNote(Base):
    __tablename__ = "clinician_media_notes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    clinician_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    note_type: Mapped[str] = mapped_column(String(40), nullable=False)  # "post_session"|"clinical_update"|"adverse_event"|"progress"
    media_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "voice"|"text"|"video"
    file_ref: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    text_content: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="recorded")  # "recorded"|"transcribed"|"draft_generated"|"draft_approved"|"finalized"
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class MediaRedFlag(Base):
    __tablename__ = "media_red_flags"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    upload_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    clinician_note_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    flag_type: Mapped[str] = mapped_column(String(60), nullable=False)  # "safety_concern"|"adverse_event_signal"|"urgent_symptom"|"medication_issue"
    extracted_text: Mapped[str] = mapped_column(Text(), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="medium")  # "low"|"medium"|"high"|"critical"
    ai_generated: Mapped[bool] = mapped_column(Boolean(), default=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    dismissed: Mapped[bool] = mapped_column(Boolean(), default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class ClinicianMediaTranscript(Base):
    __tablename__ = "clinician_media_transcripts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    note_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    transcript_text: Mapped[str] = mapped_column(Text(), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    language: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    word_count: Mapped[int] = mapped_column(Integer(), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class ClinicianNoteDraft(Base):
    __tablename__ = "clinician_note_drafts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    note_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    generated_by: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    session_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    treatment_update_draft: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    adverse_event_draft: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    patient_friendly_summary: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    task_suggestions: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)   # JSON array
    status: Mapped[str] = mapped_column(String(20), default="generated")             # "generated"|"edited"|"approved"|"rejected"
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    clinician_edits: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── Home Device Workflow Models (Phase 1) ───────────────────────────────────────

class DeviceSourceRegistry(Base):
    """Registry of device source types. V1 seeds one 'manual' entry.
    Phase 3: add vendor rows with adapter_class paths for direct integration."""
    __tablename__ = "device_source_registry"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # tDCS | tACS | TMS | CES | tPBM | PEMF | other
    device_category: Mapped[str] = mapped_column(String(80), nullable=False)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # not_integrated | csv_import | health_kit_bridge | vendor_api_v1 | vendor_api_v2
    integration_status: Mapped[str] = mapped_column(String(50), default="not_integrated")
    # Phase 3: fully-qualified Python class path e.g. "app.adapters.halo.HaloAdapter"
    adapter_class: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    # JSON: {"session_duration": true, "intensity": false, "montage": false, ...}
    capabilities_json: Mapped[str] = mapped_column(Text(), default="{}")
    oauth_required: Mapped[bool] = mapped_column(Boolean(), default=False)
    webhook_supported: Mapped[bool] = mapped_column(Boolean(), default=False)
    documentation_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean(), default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class HomeDeviceAssignment(Base):
    """Clinician assigns a home neuromodulation device to a patient within a course.
    Carries prescribed parameters and patient-facing instructions."""
    __tablename__ = "home_device_assignments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    assigned_by: Mapped[str] = mapped_column(String(36), nullable=False)  # clinician user id
    # FK to DeviceSourceRegistry — NULL in V1 (manual; no registry entry required)
    source_registry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    device_name: Mapped[str] = mapped_column(String(200), nullable=False)
    device_model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    device_serial: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    device_category: Mapped[str] = mapped_column(String(80), nullable=False, default="other")
    # JSON: {intensity_ma, duration_min, montage, electrode_placement, frequency_hz, ...}
    parameters_json: Mapped[str] = mapped_column(Text(), default="{}")
    instructions_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    session_frequency_per_week: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    planned_total_sessions: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    # active | paused | completed | revoked
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    revoke_reason: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class DeviceSessionLog(Base):
    """Patient-reported home neuromodulation session.
    Clinician must review before any clinical interpretation."""
    __tablename__ = "device_session_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assignment_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    session_date: Mapped[str] = mapped_column(String(10), nullable=False)     # YYYY-MM-DD
    logged_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean(), default=True)
    actual_intensity: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)   # e.g. "1.5mA"
    electrode_placement: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    side_effects_during: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    tolerance_rating: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)     # 1–5
    mood_before: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)          # 1–5
    mood_after: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)           # 1–5
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    media_upload_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # pending_review | reviewed | flagged
    status: Mapped[str] = mapped_column(String(30), default="pending_review", index=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class PatientAdherenceEvent(Base):
    """Structured adherence, side-effect, tolerance, and concern reports from patient."""
    __tablename__ = "patient_adherence_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    assignment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # adherence_report | side_effect | tolerance_change | break_request | concern | positive_feedback
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # low | moderate | high | urgent  (nullable for non-symptom events)
    severity: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    report_date: Mapped[str] = mapped_column(String(10), nullable=False)    # YYYY-MM-DD
    body: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # JSON: {side_effect_type, frequency, duration, impact_on_function, timing_relative_to_session}
    structured_json: Mapped[str] = mapped_column(Text(), default="{}")
    media_upload_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # open | acknowledged | resolved | escalated
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    resolution_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class DeviceSyncEvent(Base):
    """Phase 3 hook: raw events from vendor adapters or HealthKit bridge, pre-reconciliation.
    V1: table exists but is unused — ready for Phase 2/3 adapter polling."""
    __tablename__ = "device_sync_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assignment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source_registry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # session_auto_detected | firmware_update | connection_lost | sync_completed | error
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    event_data: Mapped[str] = mapped_column(Text(), default="{}")   # raw vendor payload / inferred
    # vendor_api | health_kit | android_health | manual | csv_import
    source: Mapped[str] = mapped_column(String(80), nullable=False, default="manual")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    synced_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    reconciled: Mapped[bool] = mapped_column(Boolean(), default=False)
    reconciled_session_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class HomeDeviceReviewFlag(Base):
    """Auto-generated flags for clinician attention — missed sessions, tolerance drops, etc.
    Must be reviewed/dismissed by clinician before closure."""
    __tablename__ = "home_device_review_flags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    assignment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    session_log_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    adherence_event_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # missed_sessions | tolerance_drop | side_effect_escalation | unusual_report
    # adherence_concern | parameter_deviation | urgent_symptom | sync_anomaly
    flag_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    # info | warning | urgent
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="warning")
    detail: Mapped[str] = mapped_column(Text(), nullable=False)
    auto_generated: Mapped[bool] = mapped_column(Boolean(), default=True)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), index=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    dismissed: Mapped[bool] = mapped_column(Boolean(), default=False, index=True)
    resolution: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── Forms & Assessments Models ────────────────────────────────────────────────

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

class IRBStudy(Base):
    """Institutional Review Board study record."""
    __tablename__ = "irb_studies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    irb_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    sponsor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    principal_investigator: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phase: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # I, II, III, IV, observational
    status: Mapped[str] = mapped_column(String(40), default="pending")  # pending, approved, active, closed, suspended, withdrawn
    approval_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    expiry_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    enrollment_target: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    enrolled_count: Mapped[int] = mapped_column(Integer(), default=0)
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    protocol_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class IRBAmendment(Base):
    """Amendment request on an IRB study."""
    __tablename__ = "irb_amendments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    study_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    amendment_type: Mapped[str] = mapped_column(String(60), nullable=False)  # protocol_change, enrollment_expansion, etc.
    description: Mapped[str] = mapped_column(Text(), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="submitted")  # submitted, under_review, approved, rejected
    submitted_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class IRBAdverseEvent(Base):
    """Adverse event report within an IRB study context."""
    __tablename__ = "irb_adverse_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    study_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    patient_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)  # mild, moderate, severe, serious, unexpected
    description: Mapped[str] = mapped_column(Text(), nullable=False)
    relatedness: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # unrelated, possibly, probably, definitely
    status: Mapped[str] = mapped_column(String(30), default="open")  # open, under_review, closed, reported_to_irb
    reported_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── Literature Library Models ─────────────────────────────────────────────────

class LiteraturePaper(Base):
    """Clinical literature reference in the library."""
    __tablename__ = "literature_papers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    added_by: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(1024), nullable=False)
    authors: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    journal: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    year: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True, index=True)
    doi: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pubmed_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    abstract: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    modality: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    condition: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    evidence_grade: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    study_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)  # RCT, meta-analysis, case-series, etc.
    tags_json: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")
    url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class LiteratureProtocolTag(Base):
    """Many-to-many: paper tagged to a protocol."""
    __tablename__ = "literature_protocol_tags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    paper_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    protocol_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    tagged_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class LiteratureReadingList(Base):
    """User's personal reading list entries."""
    __tablename__ = "literature_reading_list"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    paper_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class LiteratureCuration(Base):
    """Per-user curation verdict on a literature-watch paper, keyed by PMID.

    Used by the Library "Needs review" tab triage buttons:
      - mark-relevant      → flag the paper as worth a closer look
      - promote            → promote the paper to formal protocol references
      - not-relevant       → exclude from future surfacing
    Keyed on PMID (not LiteraturePaper.id) because most rows surfaced by
    literature_watch_cron have no LiteraturePaper row yet — they live in the
    snapshot JSON, not the curated library.
    """
    __tablename__ = "literature_curation"
    __table_args__ = (UniqueConstraint("pmid", "user_id", name="uq_literature_curation_pmid_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pmid: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)  # mark-relevant | promote | not-relevant
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


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


class TelegramPendingLink(Base):
    """Short-lived code for linking Telegram to a web account (patient or clinician bot)."""

    __tablename__ = "telegram_pending_links"

    code: Mapped[str] = mapped_column(String(8), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_role: Mapped[str] = mapped_column(String(32), nullable=False)
    bot_kind: Mapped[str] = mapped_column(String(16), nullable=False)  # patient | clinician
    expires_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, index=True)


class TelegramUserChat(Base):
    """Maps a Telegram chat_id to a user for a specific bot (patient vs clinician)."""

    __tablename__ = "telegram_user_chats"
    __table_args__ = (UniqueConstraint("user_id", "bot_kind", name="uq_tg_user_bot_kind"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    chat_id: Mapped[str] = mapped_column(String(32), nullable=False)
    bot_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class SalesInquiry(Base):
    """Landing page sales/contact form submission (optionally forwarded to Telegram)."""

    __tablename__ = "sales_inquiries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True, index=True)
    message: Mapped[str] = mapped_column(Text(), nullable=False)
    source: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # landing | dashboard | patient_portal | other
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), index=True)


# ── Leads & Reception Models ─────────────────────────────────────────────────


class ClinicLead(Base):
    __tablename__ = "clinic_leads"
    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=lambda: "LEAD-" + str(uuid.uuid4())[:8])
    clinician_id: Mapped[str] = mapped_column(String(100), index=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    source: Mapped[str] = mapped_column(String(50), default='phone')  # phone, website, referral, walk-in
    condition: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    stage: Mapped[str] = mapped_column(String(50), default='new', index=True)  # new, contacted, qualified, booked, lost
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    follow_up: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # ISO date
    converted_appointment_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[str] = mapped_column(String(50), default=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    updated_at: Mapped[str] = mapped_column(String(50), default=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), onupdate=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))


class ReceptionCall(Base):
    __tablename__ = "reception_calls"
    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=lambda: "CALL-" + str(uuid.uuid4())[:8])
    clinician_id: Mapped[str] = mapped_column(String(100), index=True)
    name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    direction: Mapped[str] = mapped_column(String(20), default='inbound')  # inbound, outbound
    duration: Mapped[int] = mapped_column(Integer(), default=0)
    outcome: Mapped[str] = mapped_column(String(50), default='info-given')
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    call_time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    call_date: Mapped[str] = mapped_column(String(20), index=True)
    created_at: Mapped[str] = mapped_column(String(50), default=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))


class ReceptionTask(Base):
    __tablename__ = "reception_tasks"
    id: Mapped[str] = mapped_column(String(100), primary_key=True, default=lambda: "TASK-" + str(uuid.uuid4())[:8])
    clinician_id: Mapped[str] = mapped_column(String(100), index=True)
    text: Mapped[str] = mapped_column(String(500))
    due: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    done: Mapped[bool] = mapped_column(Boolean(), default=False)
    priority: Mapped[str] = mapped_column(String(20), default='medium')
    created_at: Mapped[str] = mapped_column(String(50), default=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))


# ── Settings API Models (migration 024_settings_schema) ────────────────────────
# See apps/api/SETTINGS_API_DESIGN.md for the full contract.


class Clinic(Base):
    """Owning organization for multi-user accounts.

    Users link via `users.clinic_id` (FK added in migration 024 with
    ON DELETE SET NULL so orphaning a clinic doesn't delete users).
    """
    __tablename__ = "clinics"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # E.164
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")  # IANA TZ
    logo_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    specialties: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON array
    working_hours: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON map
    retention_days: Mapped[int] = mapped_column(Integer(), default=2555)  # 7y HIPAA default
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ClinicTeamInvite(Base):
    """Pending team invitations (48h TTL, single-use token)."""
    __tablename__ = "clinic_team_invites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinic_id: Mapped[str] = mapped_column(String(36), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)  # admin/clinician/technician/read-only
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    invited_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    invited_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)


class User2FASecret(Base):
    """TOTP secret (one row per user). Fernet-encrypted at rest.

    `enabled=False` until the user completes the verify step in /auth/2fa/verify.
    """
    __tablename__ = "user_2fa_secrets"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    secret_encrypted: Mapped[str] = mapped_column(String(255), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean(), default=False)
    backup_codes_encrypted: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON of hashed codes
    enabled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)


class UserSession(Base):
    """Active refresh-token session (for 'log out other devices')."""
    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)


class UserPreferences(Base):
    """Per-user UI + notification + clinical workflow preferences.

    Schema mirrors the design doc. Notification prefs / quiet hours /
    reminder timing are JSON-encoded Text columns (SQLite-compatible).
    """
    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    notification_prefs: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")  # JSON matrix
    quiet_hours: Mapped[str] = mapped_column(Text(), nullable=False, default='{"enabled":false,"from":"22:00","to":"07:00"}')
    digest_freq: Mapped[str] = mapped_column(String(16), default="daily")  # daily/weekly/off
    reminder_timing: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")  # JSON array
    language: Mapped[str] = mapped_column(String(8), default="en")
    date_format: Mapped[str] = mapped_column(String(8), default="ISO")  # ISO/US/EU
    time_format: Mapped[str] = mapped_column(String(4), default="24h")
    first_day: Mapped[str] = mapped_column(String(8), default="monday")
    units: Mapped[str] = mapped_column(String(16), default="metric")  # metric/imperial
    number_format: Mapped[str] = mapped_column(String(16), default="US")
    session_default_duration_min: Mapped[int] = mapped_column(Integer(), default=45)
    auto_logout_min: Mapped[int] = mapped_column(Integer(), default=30)  # 0 = never
    analytics_opt_in: Mapped[bool] = mapped_column(Boolean(), default=True)
    error_reports_opt_in: Mapped[bool] = mapped_column(Boolean(), default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ClinicDefaults(Base):
    """Per-clinic clinical defaults (one row per clinic)."""
    __tablename__ = "clinic_defaults"

    clinic_id: Mapped[str] = mapped_column(String(36), ForeignKey("clinics.id", ondelete="CASCADE"), primary_key=True)
    default_protocol_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    default_session_duration_min: Mapped[int] = mapped_column(Integer(), default=45)
    default_followup_weeks: Mapped[int] = mapped_column(Integer(), default=4)
    default_course_length: Mapped[int] = mapped_column(Integer(), default=20)
    default_consent_template_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    custom_consent_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    default_disclaimer: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    default_assessments: Mapped[str] = mapped_column(Text(), nullable=False, default="[]")  # JSON array
    ae_protocol: Mapped[str] = mapped_column(String(32), default="auto-notify")
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class DataExport(Base):
    """Async GDPR Article 20 data-export job."""
    __tablename__ = "data_exports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    clinic_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("clinics.id", ondelete="SET NULL"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued/running/ready/failed/expired
    file_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    file_bytes: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)


# ── Clinical Finance Hub ────────────────────────────────────────────────────────
# Invoices, patient payments, and insurance claims. See migration
# 025_finance_hub_tables.py. The router at apps/api/app/routers/finance_router.py
# exposes these under /api/v1/finance for the web Clinical Finance Hub.


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    invoice_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # e.g. INV-00123
    patient_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False)  # denormalized
    service: Mapped[str] = mapped_column(String(500), nullable=False)
    amount: Mapped[float] = mapped_column(Float(), nullable=False)  # ex-VAT
    vat_rate: Mapped[float] = mapped_column(Float(), nullable=False, default=0.20)  # e.g. 0.20
    vat: Mapped[float] = mapped_column(Float(), nullable=False, default=0.0)
    total: Mapped[float] = mapped_column(Float(), nullable=False)  # amount + vat
    paid: Mapped[float] = mapped_column(Float(), nullable=False, default=0.0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="GBP")
    issue_date: Mapped[str] = mapped_column(String(20), nullable=False)  # YYYY-MM-DD
    due_date: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft|sent|paid|overdue|partial|void
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    __table_args__ = (
        CheckConstraint("status IN ('draft','sent','paid','overdue','partial','void')", name='ck_invoices_status'),
        UniqueConstraint("clinician_id", "invoice_number", name='uq_invoices_clinician_number'),
    )


class PatientPayment(Base):
    __tablename__ = "patient_payments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    invoice_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Float(), nullable=False)
    method: Mapped[str] = mapped_column(String(30), nullable=False, default="card")  # card|bacs|cash|cheque|stripe|manual
    reference: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    payment_date: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


class InsuranceClaim(Base):
    __tablename__ = "insurance_claims"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    claim_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # INS-00123
    patient_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("patients.id", ondelete="SET NULL"), nullable=True, index=True)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    insurer: Mapped[str] = mapped_column(String(120), nullable=False)
    policy_number: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False)  # e.g. "TMS Pre-auth"
    amount: Mapped[float] = mapped_column(Float(), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft|submitted|pending|approved|rejected|paid
    submitted_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    decision_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    __table_args__ = (
        CheckConstraint("status IN ('draft','submitted','pending','approved','rejected','paid')", name='ck_insurance_status'),
    )
