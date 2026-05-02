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

class QEEGAnalysis(Base):
    """Parsed EDF/EEG analysis record with extracted spectral band powers."""
    __tablename__ = "qeeg_analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    qeeg_record_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    file_ref: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    original_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    recording_duration_sec: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    sample_rate_hz: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    channels_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON list of channel names
    channel_count: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    recording_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    eyes_condition: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    equipment: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    analysis_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    analysis_error: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    band_powers_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    normative_deviations_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    artifact_rejection_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    analysis_params_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    advanced_analyses_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # ── MNE pipeline outputs (migration 037, CONTRACT.md §2) ──────────────
    # All nullable / additive — legacy columns above are still populated.
    aperiodic_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    peak_alpha_freq_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    connectivity_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    asymmetry_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    graph_metrics_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    source_roi_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    normative_zscores_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    flagged_conditions: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    quality_metrics_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    pipeline_version: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    norm_db_version: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    # ── AI upgrades (migration 038, CONTRACT_V2.md §2) ────────────────────
    # All nullable / additive. Populated on-demand by the dedicated AI
    # endpoints (compute-embedding, predict-brain-age, score-conditions,
    # fit-centiles, explain, similar-cases, recommend-protocol). Legacy
    # pipelines ignore these columns.
    embedding_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # Native pgvector sibling (migration 041). Falls back to Text() on SQLite /
    # when pgvector is missing; populated on Postgres deployments only.
    embedding = _embedding_column()
    brain_age_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    risk_scores_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    centiles_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    explainability_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    similar_cases_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    protocol_recommendation_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    longitudinal_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # ── Raw data viewer / interactive cleaning (migration 046) ─────────────
    cleaning_config_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    session_number: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    days_from_baseline: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    # ── Clinical Intelligence Workbench (migration 048) ───────────────────────
    safety_cockpit_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    red_flags_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    normative_metadata_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    interpretability_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # ── Knowledge-layer confounds (migration 060) ─────────────────────────────
    medication_confounds: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ── qEEG Raw Cleaning Workbench (migration 058) ──────────────────────────────
#
# The clinical-decision-support workbench stores cleaning as a sibling of
# the qEEG analysis row. The original raw EEG is *immutable* — every
# cleaning action lives in these tables, scoped by analysis_id and audited.
#
# Three tables:
#
# * ``qeeg_cleaning_versions`` — one row per saved cleaning version.
#   Holds the bad-channel list, rejected segments / epochs, ICA decisions,
#   and a cleaned-summary blob. ``version_number`` increments per analysis.
# * ``qeeg_cleaning_annotations`` — fine-grained per-action records (mark
#   bad segment, mark bad channel, reject epoch, AI suggestion accepted,
#   etc). One row per action regardless of which version persists it.
# * ``qeeg_cleaning_audit_events`` — immutable audit log. Every mutation
#   appends here; rows are never updated or deleted.
#
# Clinical safety: nothing in these tables is allowed to mutate raw EDF
# bytes or the parent ``qeeg_analyses`` row's source columns. The
# workbench router enforces this at the API edge.

class QeegCleaningVersion(Base):
    """A clinician-saved cleaning version of a qEEG analysis.

    Original raw EEG is preserved on the parent ``QEEGAnalysis`` row.
    Each ``QeegCleaningVersion`` is a derived overlay (annotations,
    bad channels, rejected segments, ICA decisions). The workbench
    re-runs analysis using the chosen version_id and links the new
    analysis back via ``derived_analysis_id``.
    """

    __tablename__ = "qeeg_cleaning_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("qeeg_analyses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer(), nullable=False, default=1)
    label: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    bad_channels_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    rejected_segments_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    rejected_epochs_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    rejected_ica_components_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    interpolated_channels_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    cleaned_summary_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    review_status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    derived_analysis_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    created_by_actor_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

class QeegCleaningAnnotation(Base):
    """A single cleaning action (manual or AI-accepted) on an analysis.

    Annotations belong to an analysis (not a version) so the timeline of
    cleaning decisions survives across version saves.  A version can pin a
    list of annotation_ids it incorporated via ``cleaned_summary_json``.
    """

    __tablename__ = "qeeg_cleaning_annotations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("qeeg_analyses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    channel: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    start_sec: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    end_sec: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    ica_component: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    ai_confidence: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    ai_label: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="clinician")
    decision_status: Mapped[str] = mapped_column(String(30), nullable=False, default="suggested")
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    actor_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

class QeegCleaningAuditEvent(Base):
    """Immutable audit log row for every cleaning mutation.

    Inserts only — never updated or deleted. The router writes one row
    per mutating call: action_type, channel/segment/component if
    applicable, previous_value/new_value (JSON snippets), actor, source.
    """

    __tablename__ = "qeeg_cleaning_audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("qeeg_analyses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cleaning_version_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    action_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    channel: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    start_sec: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    end_sec: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    ica_component: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    previous_value_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    new_value_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="clinician")
    actor_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )

class KgEntity(Base):
    """Knowledge-graph entity node (CONTRACT_V2.md §3 hypergraph).

    Stores symbolic entities (conditions, features, modalities, papers,
    etc.) with an optional embedding. The column is a JSON TEXT blob so
    SQLite test envs work out of the box; deployments can lift the
    values into pgvector out-of-band if they need ANN similarity search.
    """
    __tablename__ = "kg_entities"

    entity_id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    name: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    embedding_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # Native pgvector sibling (migration 041). See ``QEEGAnalysis.embedding``.
    embedding = _embedding_column()

class KgHyperedge(Base):
    """Hyperedge linking multiple KG entities (CONTRACT_V2.md §3)."""
    __tablename__ = "kg_hyperedges"

    edge_id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    relation: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    entity_ids_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    paper_ids_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)

class QEEGAIReport(Base):
    """AI-generated interpretation report for a qEEG analysis."""
    __tablename__ = "qeeg_ai_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    report_type: Mapped[str] = mapped_column(String(40), nullable=False, default="standard")
    ai_narrative_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    clinical_impressions: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    condition_matches_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    protocol_suggestions_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    literature_refs_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    model_used: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    prompt_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    confidence_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    clinician_reviewed: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    clinician_amendments: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    # ── Clinical Intelligence Workbench (migration 048) ───────────────────────
    report_state: Mapped[str] = mapped_column(String(30), nullable=False, default="DRAFT_AI")
    reviewer_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    model_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    prompt_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    report_version: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    claim_governance_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    patient_facing_report_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    signed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    # ── Brain Map Report contract (migration 064) ─────────────────────────────
    # JSON-serialized QEEGBrainMapReport (see services/qeeg_report_template.py).
    # Stored as Text for SQLite/Postgres dual-dialect compat per repo convention.
    report_payload: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    report_payload_schema_version: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class QEEGComparison(Base):
    """Pre/post or longitudinal comparison between two qEEG analyses."""
    __tablename__ = "qeeg_comparisons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    baseline_analysis_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    followup_analysis_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    comparison_type: Mapped[str] = mapped_column(String(40), nullable=False, default="pre_post")
    delta_powers_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    improvement_summary_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ai_comparison_narrative: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class AnalysisAnnotation(Base):
    """Clinician-authored note pinned to a qEEG or MRI analysis surface."""
    __tablename__ = "analysis_annotations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # qeeg | mri
    target_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    body: Mapped[str] = mapped_column(Text(), nullable=False)
    anchor_label: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    anchor_data_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="clinical")
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class AutoCleanRun(Base):
    """One AI auto-clean proposal cycle for a qEEG analysis (migration 047)."""
    __tablename__ = "auto_clean_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    proposal_json: Mapped[str] = mapped_column(Text(), nullable=False)
    accepted_items_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    rejected_items_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    created_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

class CleaningDecision(Base):
    """Audit row for every AI suggestion + clinician accept/edit/reject (migration 047)."""
    __tablename__ = "cleaning_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    auto_clean_run_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("auto_clean_runs.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    actor: Mapped[str] = mapped_column(String(8), nullable=False)  # 'ai' | 'user'
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payload_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    accepted_by_user: Mapped[Optional[bool]] = mapped_column(Boolean(), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── MRI Analyzer Models (migration 039) ──────────────────────────────────────
#
# Mirrors ``packages/mri-pipeline/medrag_extensions/04_migration_mri.sql``.
# All JSON payloads are stored as Text blobs for SQLite portability; real
# Postgres deployments can lift them into JSONB + pgvector(200) out-of-band.
# See the ``app.services.mri_pipeline`` façade for the read/write contract.

class QEEGReportFinding(Base):
    """Per-finding granularity within an AI-generated qEEG report."""
    __tablename__ = "qeeg_report_findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    finding_text: Mapped[str] = mapped_column(Text(), nullable=False)
    claim_type: Mapped[str] = mapped_column(String(20), nullable=False, default="INFERRED")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    clinician_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    evidence_grade: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    amended_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

class QEEGReportAudit(Base):
    """Audit trail for every qEEG report state change."""
    __tablename__ = "qeeg_report_audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    report_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False)
    previous_state: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    new_state: Mapped[str] = mapped_column(String(30), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class QEEGProtocolFit(Base):
    """AI Protocol Fit recommendation for a qEEG analysis."""
    __tablename__ = "qeeg_protocol_fits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    pattern_summary: Mapped[str] = mapped_column(Text(), nullable=False)
    symptom_linkage_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    contraindications_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    evidence_grade: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    off_label_flag: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    candidate_protocol_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    alternative_protocols_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    match_rationale: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    caution_rationale: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    required_checks_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    clinician_reviewed: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class QEEGTimelineEvent(Base):
    """Longitudinal timeline event for a patient (qEEG, outcomes, treatments, etc.)."""
    __tablename__ = "qeeg_timeline_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    event_date: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    event_data_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    confidence: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── QEEG-ANN1: qEEG Brain Map Report Annotations (migration 084) ─────────────
#
# Sidecar annotation system that lets clinicians attach margin notes,
# region tags, and flag-typed findings to specific sections of a qEEG
# Brain Map report WITHOUT mutating the canonical
# ``QEEGBrainMapReport`` contract in services/qeeg_report_template.py.
#
# Why sidecar
# -----------
# The Brain Map report payload is a regulator-credible artifact —
# every consumer (PDF, web viewer, exporter) reads the SAME shape via
# the canonical template. Inline annotations would force every
# consumer to evolve simultaneously and would mix clinician-authored
# prose into the AI/template-derived report payload (audit-trail
# nightmare). Annotations live HERE, joined at render time by
# section_path.
#
# Section path
# ------------
# ``section_path`` is a dotted-key reference into the rendered report
# (e.g. ``summary.brain_age``, ``regions.frontal_left.alpha``,
# ``protocol_suggestions[2].rationale``). The persistence layer only
# stores the string — the semantic meaning is owned by the renderer
# and the reader on each side. Validation is restricted to
# ``a-zA-Z0-9._\-\[\]`` so future eval-style consumers can safely
# resolve the path without shell-meta injection vectors.
#
# Flag types (clinically meaningful)
# ----------------------------------
# * ``clinically_significant`` — clinician believes this finding
#   directly drives care decisions.
# * ``evidence_gap`` — surfaces an FDA-questioned finding (per
#   ``deepsynaps-qeeg-evidence-gaps`` memory: AI Brain Age, alpha
#   reactivity, "Brain Balance" label, tDCS-O1/O2, tACS-Pz protocol
#   suggestions). Lets the clinic track which reports lean on
#   non-evidence-based claims.
# * ``discuss_next_session`` — defer to next clinician-patient
#   touchpoint; carries forward as a follow-up reminder.
# * ``patient_question`` — patient asked something during review;
#   queue for the answering clinician.

class QEEGReportAnnotation(Base):
    """Sidecar annotation pinned to a section of a qEEG Brain Map report.

    Stored separately from the report payload (canonical
    ``QEEGBrainMapReport`` contract) so the annotation lifecycle —
    create, edit, resolve, audit — does not perturb the report itself.
    """

    __tablename__ = "qeeg_report_annotations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinic_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    report_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    section_path: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    annotation_kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    flag_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    body: Mapped[str] = mapped_column(Text(), nullable=False)
    created_by_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    resolved_by_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    resolution_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
