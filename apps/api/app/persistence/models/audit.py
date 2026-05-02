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

class AgentRunAudit(Base):
    """One row per agent invocation — powers the "what did agent X say to
    clinician Y on Tuesday at 14:32" admin view, plus future ratelimit /
    abuse detection and refund handling.

    Mirrors the ``AiSummaryAudit`` shape: opaque UUID PK, indexed
    ``created_at`` for time-bucket queries, indexed ``actor_id`` for
    per-user history, plus the agent-specific fields (agent id, message
    + reply previews, latency, ok/error). Previews are length-bounded by
    :func:`app.services.agents.audit.record_run` so PHI dumps don't
    silently balloon row size.
    """

    __tablename__ = "agent_run_audit"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: uuid.uuid4().hex)
    created_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    # Nullable so guest probes / anonymous landing-page calls can still be
    # audited (e.g. for abuse detection on unauthenticated traffic).
    actor_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    clinic_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    agent_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    message_preview: Mapped[str] = mapped_column(String(220), nullable=False, default="")
    reply_preview: Mapped[str] = mapped_column(String(520), nullable=False, default="")
    # JSON-encoded list of tool ids actually fetched by the broker.
    context_used_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    ok: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Phase 7 — per-run token + cost accounting. Nullable so legacy rows
    # written before the migration still load. New writes always populate
    # these via :func:`app.services.agents.audit.record_run`.
    tokens_in_used: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True, default=0)
    tokens_out_used: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True, default=0)
    # ``cost_pence`` is computed by the runner from a fixed price card —
    # it is NOT a real bill, just a decision-support indicator the budget
    # pre-check uses to short-circuit runaway clinics.
    cost_pence: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True, default=0)


# ── Clinical Intelligence Workbench Models (migration 048) ───────────────────

class QualityFinding(Base):
    """A QA non-conformance / CAPA item.

    Honest, regulator-credible record. ``status`` transitions are append-only
    via :class:`QualityFindingRevision`; closed findings are immutable
    (reopen creates a new revision so audit trail is preserved). ``source_*``
    fields enable cross-surface drill-out into adverse_events / sessions /
    reports / documents / qeeg / brain_map_planner.
    """

    __tablename__ = "quality_findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinic_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    finding_type: Mapped[str] = mapped_column(
        String(48),
        nullable=False,
        default="non_conformance",
        index=True,
    )  # non_conformance | sae_followup | documentation_gap | protocol_deviation | capa | observation
    severity: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="minor",
        index=True,
    )  # minor | major | critical
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="open",
        index=True,
    )  # open | in_progress | closed | reopened
    owner_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    capa_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    capa_due_date: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    source_target_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    source_target_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    evidence_links_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    closed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    closure_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    reporter_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

class QualityFindingRevision(Base):
    """Immutable revision row for every QualityFinding state change."""

    __tablename__ = "quality_finding_revisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    finding_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("quality_findings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    revision_idx: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    action: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    snapshot_json: Mapped[str] = mapped_column(Text(), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── IRB Manager (launch-audit 2026-04-30) ────────────────────────────────────
# Regulator-credible IRB protocol register. Distinct from the legacy
# ``irb_studies`` table (kept intact for back-compat with the old IRB router):
# this surface is the canonical /api/v1/irb/protocols home, with PI validation
# against the ``users`` table, append-only revision history, and explicit
# amendment / closure / reopen audit events.
