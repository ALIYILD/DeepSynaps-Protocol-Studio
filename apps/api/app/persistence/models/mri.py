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


class MriAnalysis(Base):
    """One MRI Analyzer run per row; JSON columns match the ``MRIReport`` schema."""
    __tablename__ = "mri_analyses"

    analysis_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    patient_id: Mapped[str] = mapped_column(Text(), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), index=True,
    )
    modalities_present_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    structural_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    functional_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    diffusion_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    stim_targets_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    medrag_query_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    overlays_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    qc_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # 200-d cross-modal embedding as a JSON list of floats (pgvector-portable).
    embedding_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # Native pgvector sibling (migration 041). See ``QEEGAnalysis.embedding``.
    embedding = _embedding_column()
    pipeline_version: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    norm_db_version: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    # Job + state tracking.
    job_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    upload_ref: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    condition: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    age: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    sex: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    failure_reason: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # ── MRI Clinical Workbench (migration 053) ────────────────────────────
    safety_cockpit_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    red_flags_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    claim_governance_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    patient_facing_report_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    report_state: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, default="MRI_DRAFT_AI")
    reviewer_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    report_version: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    signed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    interpretability_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    atlas_metadata_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

class MriReportAudit(Base):
    """Immutable audit trail for MRI report state transitions."""
    __tablename__ = "mri_report_audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(String(36), ForeignKey("mri_analyses.analysis_id", ondelete="CASCADE"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(50), nullable=False)
    previous_state: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    new_state: Mapped[str] = mapped_column(String(30), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class MriReportFinding(Base):
    """Per-target finding review record for MRI analyses."""
    __tablename__ = "mri_report_findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(String(36), ForeignKey("mri_analyses.analysis_id", ondelete="CASCADE"), nullable=False, index=True)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False)
    claim_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING_REVIEW")
    evidence_grade: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    clinician_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    amended_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class MriTargetPlan(Base):
    """Stimulation target governance record for MRI analyses."""
    __tablename__ = "mri_target_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(String(36), ForeignKey("mri_analyses.analysis_id", ondelete="CASCADE"), nullable=False, index=True)
    target_index: Mapped[int] = mapped_column(Integer(), nullable=False)
    anatomical_label: Mapped[str] = mapped_column(String(64), nullable=False)
    modality_compatibility: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    atlas_version: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    registration_confidence: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    coordinate_uncertainty_mm: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    contraindications: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    evidence_grade: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    off_label_flag: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    match_rationale: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    caution_rationale: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    required_checks: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class MriTimelineEvent(Base):
    """Longitudinal patient event log for MRI clinical workbench."""
    __tablename__ = "mri_timeline_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(Text(), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_analysis_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mri_analyses.analysis_id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    event_date: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class MriUpload(Base):
    """One row per ``POST /mri/upload`` call; points at the on-disk blob."""
    __tablename__ = "mri_uploads"

    upload_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    patient_id: Mapped[Optional[str]] = mapped_column(Text(), nullable=True, index=True)
    path: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    filename: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    mimetype: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc),
    )
