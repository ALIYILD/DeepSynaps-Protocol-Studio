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
    # True when this analysis was created in demo mode (canned sample report).
    # Doctor-ready compliance: every downstream consumer must be able to tell
    # real pipeline output from demo / placeholder data.
    demo_mode: Mapped[Optional[bool]] = mapped_column(Boolean(), nullable=True, default=False)
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


class MedicalImageAsset(Base):
    """One row per non-diagnostic medical-image preview (PR #619 follow-up).

    PR #619 shipped the MIQ-inspired Quick Look preview with file-based
    sidecar JSON persistence; this model is the DB promotion. The router
    dual-writes (sidecar + DB row) so the legacy file-based reader keeps
    working through the migration window. Mirrors the sidecar payload
    one-to-one — column names match the JSON keys used by
    ``app.routers.medical_images_router._write_sidecar``.

    Scoping
    -------
    * ``patient_id`` is nullable — uploads can be standalone (e.g. a
      clinician previewing a file before linking it to a patient).
    * ``clinic_id`` carries the multi-tenant gate (resolved from the
      uploader's actor at write time).

    Indexes are tuned for the query patterns that the report-context
    layer and the patient-index endpoint actually use:
    ``patient_id`` (latest-by-patient), ``(clinic_id, created_at desc)``
    (clinic-admin lists), ``created_by`` (audit).
    """

    __tablename__ = "medical_image_assets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    patient_id: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True, index=True
    )
    upload_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    filename: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    file_format: Mapped[str] = mapped_column(String(32), nullable=False)
    storage_path: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ready")
    error: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    preview_paths_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    warning_flags_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    clinician_imaging_note: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True
    )
    created_by: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )
    created_by_role: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    clinic_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("clinics.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), index=True
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)


class MriViewerState(Base):
    """Per-user viewer state persistence for MRI analyses (Phase 2 feature).

    Stores UI state (slice position, ROI visibility, overlay alpha, etc.) per
    user × analysis combination, enabling resumable viewing sessions.

    Added 2026-05-09 as part of MRI DeepDive Phase 2/4 (Backend + DB).
    """

    __tablename__ = "mri_viewer_states"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("mri_analyses.analysis_id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Viewer state as JSON: {
    #   "slice_index": {"x": 100, "y": 100, "z": 50},
    #   "roi_visibility": {"atlas": true, "custom_roi": false},
    #   "overlay_alpha": 0.7,
    #   "active_modality": "structural",
    #   "crosshair_enabled": true
    # }
    state_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (UniqueConstraint("analysis_id", "user_id", name="uq_mri_viewer_state"),)
