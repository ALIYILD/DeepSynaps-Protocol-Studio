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
