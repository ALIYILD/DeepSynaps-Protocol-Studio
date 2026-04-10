from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, UniqueConstraint
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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow, onupdate=datetime.utcnow)


class Subscription(Base):
    __tablename__ = "subscriptions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    package_id: Mapped[str] = mapped_column(String(50), default="explorer")
    status: Mapped[str] = mapped_column(String(50), default="active")  # active, canceled, past_due
    seat_limit: Mapped[int] = mapped_column(Integer(), default=1)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow, onupdate=datetime.utcnow)


class TeamMember(Base):
    __tablename__ = "team_members"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subscription_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), default="member")  # owner, admin, member
    invited_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    joined_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)


# ── Clinical Practice Models ────────────────────────────────────────────────────

class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    dob: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow, onupdate=datetime.utcnow)


class ClinicalSession(Base):
    __tablename__ = "clinical_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    scheduled_at: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer(), default=60)
    modality: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    protocol_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    session_number: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    total_sessions: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="scheduled")  # scheduled, completed, cancelled, no_show
    outcome: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # positive, neutral, negative
    session_notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    adverse_events: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    billing_code: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    billing_status: Mapped[str] = mapped_column(String(30), default="unbilled")  # unbilled, billed, paid
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow, onupdate=datetime.utcnow)


class AssessmentRecord(Base):
    __tablename__ = "assessment_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    template_id: Mapped[str] = mapped_column(String(64), nullable=False)
    template_title: Mapped[str] = mapped_column(String(255), nullable=False)
    data_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    clinician_notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="draft")  # draft, completed
    score: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow, onupdate=datetime.utcnow)


class PrescribedProtocol(Base):
    __tablename__ = "prescribed_protocols"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    condition: Mapped[str] = mapped_column(String(120), nullable=False)
    modality: Mapped[str] = mapped_column(String(60), nullable=False)
    device: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    protocol_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    sessions_total: Mapped[int] = mapped_column(Integer(), default=12)
    sessions_completed: Mapped[int] = mapped_column(Integer(), default=0)
    status: Mapped[str] = mapped_column(String(30), default="active")  # active, completed, paused
    started_at: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Neuromodulation Platform Models ──────────────────────


class TreatmentCourse(Base):
    __tablename__ = "treatment_courses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow, onupdate=datetime.utcnow)


class TreatmentCourseReview(Base):
    __tablename__ = "treatment_course_reviews"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    reviewer_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    review_type: Mapped[str] = mapped_column(String(40), nullable=False)
    outcome: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    milestone_session: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)


class ConsentRecord(Base):
    __tablename__ = "consent_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    consent_type: Mapped[str] = mapped_column(String(40), nullable=False)
    modality_slug: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    signed: Mapped[bool] = mapped_column(Boolean(), default=False)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    document_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow, onupdate=datetime.utcnow)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
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
    access_token_enc: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    refresh_token_enc: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    scope: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)
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
    synced_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)


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
    synced_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=datetime.utcnow, index=True)
