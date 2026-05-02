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

class EvidenceSavedCitation(Base):
    """Patient-linked citation saved from an Evidence Intelligence result."""
    __tablename__ = "evidence_saved_citations"
    __table_args__ = (
        UniqueConstraint("actor_id", "patient_id", "finding_id", "paper_id", name="uq_evidence_saved_citation"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    finding_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    finding_label: Mapped[str] = mapped_column(String(255), nullable=False)
    claim: Mapped[str] = mapped_column(Text(), nullable=False)
    paper_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    paper_title: Mapped[str] = mapped_column(Text(), nullable=False)
    pmid: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    doi: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    context_kind: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    analysis_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    report_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    citation_payload_json: Mapped[str] = mapped_column(Text(), nullable=False)
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

class DsPaper(Base):
    """One row per ingested paper in the 87,654-paper evidence corpus.

    Canonical deduplication key is ``pmid``; ``doi`` is the fallback.
    The ``embedding`` column holds OpenAI text-embedding-3-small (1536-dim)
    vectors on Postgres; degrades to Text on SQLite.
    """
    __tablename__ = "ds_papers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pmid: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, unique=True, index=True)
    doi: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True, index=True)
    openalex_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, unique=True)
    title: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    abstract: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    year: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True, index=True)
    journal: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    authors_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    pub_types_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    cited_by_count: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    is_oa: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    oa_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    sources_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    evidence_type: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    evidence_level: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    grade: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    retracted: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    retraction_doi: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    embedding_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    embedding = _embedding_column_1536()
    ingested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    refreshed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class DsClaimCitation(Base):
    """Links a validated clinical claim to one or more papers."""
    __tablename__ = "ds_claim_citations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    claim_text: Mapped[str] = mapped_column(Text(), nullable=False)
    claim_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    paper_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("ds_papers.id", ondelete="SET NULL"), nullable=True, index=True)
    citation_type: Mapped[str] = mapped_column(String(20), nullable=False, default="supports")
    relevance_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    evidence_grade: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    supporting_quote: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    validation_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    issues_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    actor_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    validator_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class DsGroundingAudit(Base):
    """Append-only, hash-chained audit log for grounding decisions.

    No UPDATE or DELETE permitted; tamper evidence via SHA-256 chain.
    """
    __tablename__ = "ds_grounding_audit"

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    study_identifier: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    claim_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    decided_by: Mapped[str] = mapped_column(String(64), nullable=False, default="system")
    prev_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    row_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, default=lambda: datetime.now(timezone.utc))

class DsHgEdgeCitation(Base):
    """Links a KG hyperedge to a validated claim citation for provenance."""
    __tablename__ = "ds_hg_edge_citations"
    __table_args__ = (
        UniqueConstraint("edge_id", "citation_id", name="uq_edge_citation"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    edge_id: Mapped[int] = mapped_column(Integer(), ForeignKey("kg_hyperedges.edge_id", ondelete="CASCADE"), nullable=False, index=True)
    citation_id: Mapped[str] = mapped_column(String(36), ForeignKey("ds_claim_citations.id", ondelete="CASCADE"), nullable=False, index=True)
    enriched_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, default=lambda: datetime.now(timezone.utc))


# ── Agent Marketplace — per-run audit trail (migration 048) ──────────────────

class IRBProtocol(Base):
    """An IRB-approved protocol registered in the IRB Manager.

    Honest, regulator-credible record. PI must be a real ``User``; status
    transitions are append-only via :class:`IRBProtocolRevision`; closed
    protocols are immutable in-place (reopen creates a new revision so the
    audit trail is preserved). ``risk_level`` aligns with the IRB-recognised
    minimal / greater_than_minimal categories.
    """

    __tablename__ = "irb_protocols"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinic_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    protocol_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)  # site-assigned (e.g. DS-2024-001)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    irb_board: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    irb_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    sponsor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pi_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    phase: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)  # I, II, III, IV, observational, pilot, feasibility
    status: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default="pending",
        index=True,
    )  # pending | active | suspended | closed | reopened
    risk_level: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)  # minimal | greater_than_minimal
    approval_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    expiry_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    enrollment_target: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    enrolled_count: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    consent_version: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    closed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    closure_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

class IRBProtocolAmendment(Base):
    """Amendment record on an IRB protocol.

    Distinct from ``irb_amendments`` (legacy table for ``irb_studies``).
    Every amendment requires a non-empty ``reason`` so a regulator can audit
    the rationale; a ``revision_idx`` tracks ordering.
    """

    __tablename__ = "irb_protocol_amendments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    protocol_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("irb_protocols.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amendment_type: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str] = mapped_column(Text(), nullable=False)
    reason: Mapped[str] = mapped_column(Text(), nullable=False)
    submitted_by: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="submitted")  # submitted | approved | rejected
    consent_version_after: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

class IRBProtocolRevision(Base):
    """Append-only revision row for every IRBProtocol state change."""

    __tablename__ = "irb_protocol_revisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    protocol_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("irb_protocols.id", ondelete="CASCADE"),
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

class ClinicalTrial(Base):
    """A clinical trial registered against a real :class:`IRBProtocol`.

    The trial register is the second regulator-credible loop after IRB Manager
    (#334). Trials FK to a real ``IRBProtocol`` so the IRB approval chain is
    enforced at write time — trials cannot exist against fabricated protocols.
    Trials are *closeable* (one-way; reopen is intentionally NOT supported);
    enrolment rows are append-only with explicit withdrawal reasons. Multi-
    site coordination lives in the ``sites_json`` blob.
    """

    __tablename__ = "clinical_trials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clinic_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    irb_protocol_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("irb_protocols.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    nct_number: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str] = mapped_column(Text(), nullable=False, default="")
    sponsor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pi_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    phase: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    status: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default="planning",
        index=True,
    )  # planning | recruiting | active | paused | completed | terminated | closed
    sites_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)  # JSON list of {id,name,address?,pi_user_id?}
    enrollment_target: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    enrollment_actual: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    paused_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    pause_reason: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    closed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    closure_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    created_by: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

class ClinicalTrialEnrollment(Base):
    """Append-only per-patient enrollment row on a :class:`ClinicalTrial`.

    Patient must be a real :class:`Patient` row owned by the same clinic as
    the trial (or by the actor in the no-clinic / demo case). Withdrawals
    require a non-empty reason so a regulator can audit attrition.
    """

    __tablename__ = "clinical_trial_enrollments"
    __table_args__ = (
        UniqueConstraint(
            "trial_id",
            "patient_id",
            name="uq_clinical_trial_enrollment_trial_patient",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trial_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("clinical_trials.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    arm: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default="active",
        index=True,
    )  # active | withdrawn | completed | lost_to_followup
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
    )
    withdrawn_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    withdrawal_reason: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    enrolled_by: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    consent_doc_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

class ClinicalTrialRevision(Base):
    """Append-only revision row for every :class:`ClinicalTrial` state change."""

    __tablename__ = "clinical_trial_revisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trial_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("clinical_trials.id", ondelete="CASCADE"),
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


# ── Patient Symptom Journal (launch-audit 2026-05-01, migration 068) ──────────
