"""Shared fixtures for deepsynaps_evidence package tests.

Provides an in-memory SQLite session with stand-in SQLAlchemy model
classes for DsPaper, DsClaimCitation, DsGroundingAudit, KgHyperedge,
and DsHgEdgeCitation. These mirror the real models in
``app.persistence.models`` closely enough that corpus_adapter, audit,
validator, and hypergraph can be exercised without importing the full
apps/api stack.

The modules under test use lazy imports via ``_import_models()``; this
conftest patches those functions (via monkeypatch) before tests run.

Session isolation strategy
--------------------------
We use a single session-scoped connection with per-test savepoints so
that committed data from one test does not leak into the next.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import pytest
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Session, mapped_column, Mapped, sessionmaker


# ── Stand-in declarative base (no dependency on apps/api) ────────────────────

class Base(DeclarativeBase):
    pass


# ── Stand-in model: DsPaper ──────────────────────────────────────────────────

class DsPaper(Base):
    """Minimal stand-in for app.persistence.models.DsPaper."""

    __tablename__ = "ds_papers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pmid: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, unique=True, index=True)
    doi: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True, index=True)
    title: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    abstract: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    authors_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    year: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    journal: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    grade: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    retracted: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    evidence_level: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    embedding: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )


# ── Stand-in model: DsClaimCitation ─────────────────────────────────────────

class DsClaimCitation(Base):
    """Minimal stand-in for app.persistence.models.DsClaimCitation."""

    __tablename__ = "ds_claim_citations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    claim_text: Mapped[str] = mapped_column(Text(), nullable=False)
    claim_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    paper_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("ds_papers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    citation_type: Mapped[str] = mapped_column(String(20), nullable=False, default="supports")
    relevance_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    evidence_grade: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    supporting_quote: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    validation_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    issues_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    actor_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    validator_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )


# ── Stand-in model: DsGroundingAudit ────────────────────────────────────────

class DsGroundingAudit(Base):
    """Minimal stand-in for app.persistence.models.DsGroundingAudit."""

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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


# ── Stand-in model: KgHyperedge ──────────────────────────────────────────────

class KgHyperedge(Base):
    """Minimal stand-in for app.persistence.models.KgHyperedge."""

    __tablename__ = "kg_hyperedges"

    edge_id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    relation: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    entity_ids_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    paper_ids_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)


# ── Stand-in model: DsHgEdgeCitation ────────────────────────────────────────

class DsHgEdgeCitation(Base):
    """Minimal stand-in for app.persistence.models.DsHgEdgeCitation."""

    __tablename__ = "ds_hg_edge_citations"
    __table_args__ = (
        UniqueConstraint("edge_id", "citation_id", name="uq_edge_citation"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    edge_id: Mapped[int] = mapped_column(
        Integer(),
        ForeignKey("kg_hyperedges.edge_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    citation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("ds_claim_citations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    enriched_at: Mapped[datetime] = mapped_column(
        DateTime(), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


# ── Engine: session-scoped, shared in-memory SQLite ──────────────────────────

@pytest.fixture(scope="session")
def engine():
    """Session-scoped in-memory SQLite engine with all stand-in tables."""
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        echo=False,
    )
    Base.metadata.create_all(eng)
    return eng


# ── Function-scoped session with DELETE-based teardown ───────────────────────
#
# We cannot use savepoints reliably across SQLAlchemy sessions that call
# session.commit() internally (audit, validator both commit). Instead we
# truncate (DELETE FROM) every table after each test. This is the same
# pattern used by the API conftest's fast-truncate path.

_TABLES_IN_DELETE_ORDER = [
    "ds_hg_edge_citations",
    "ds_claim_citations",
    "ds_grounding_audit",
    "ds_papers",
    "kg_hyperedges",
]


@pytest.fixture()
def db_session(engine):
    """Function-scoped session. Tables are cleared before each test."""
    SessionFactory = sessionmaker(bind=engine)
    session = SessionFactory()

    # Clear all tables before the test (insertion order safe via FK deps)
    try:
        for tbl in _TABLES_IN_DELETE_ORDER:
            session.execute(text(f"DELETE FROM {tbl}"))
        session.commit()
    except Exception:
        session.rollback()

    try:
        yield session
    finally:
        session.close()


# ── Seed fixture ─────────────────────────────────────────────────────────────

@pytest.fixture()
def seed_papers(db_session):
    """Insert a few well-known papers for lookup tests.

    Returns a dict keyed by pmid.
    """
    papers = [
        DsPaper(
            id="paper-001",
            pmid="11111111",
            doi="10.1/paper1",
            title="rTMS for Major Depressive Disorder: a systematic review",
            abstract="We performed a meta-analysis of rTMS studies for MDD.",
            authors_json='["Smith J", "Jones K", "Lee M", "Brown T"]',
            year=2022,
            journal="Journal of Clinical Psychiatry",
            grade="A",
            evidence_level="HIGHEST",
            retracted=False,
        ),
        DsPaper(
            id="paper-002",
            pmid="22222222",
            doi="10.2/paper2",
            title="Neurofeedback in ADHD: randomised controlled trial",
            abstract="Double-blind RCT of neurofeedback for attention deficit disorder.",
            authors_json='["Garcia R", "Chen W"]',
            year=2021,
            journal="Neuropsychopharmacology",
            grade="B",
            evidence_level="HIGH",
            retracted=False,
        ),
        DsPaper(
            id="paper-003",
            pmid="33333333",
            doi="10.3/paper3",
            title="Retracted study on alpha wave entrainment",
            abstract="This paper was retracted due to data fabrication.",
            authors_json='["Fake A"]',
            year=2019,
            journal="Retracted Neuroscience",
            grade="D",
            evidence_level="LOW",
            retracted=True,
        ),
    ]
    for p in papers:
        db_session.add(p)
    db_session.commit()

    return {p.pmid: p for p in papers}


# ── Module-level patches so lazy _import_models() returns stand-in classes ───

@pytest.fixture(autouse=True)
def patch_audit_models(monkeypatch):
    """Make deepsynaps_evidence.audit._import_models return stand-in DsGroundingAudit."""
    import deepsynaps_evidence.audit as audit_mod
    monkeypatch.setattr(audit_mod, "_import_models", lambda: DsGroundingAudit)


@pytest.fixture(autouse=True)
def patch_corpus_adapter_models(monkeypatch):
    """Make deepsynaps_evidence.corpus_adapter._import_models return stand-in DsPaper."""
    import deepsynaps_evidence.corpus_adapter as adapter_mod
    monkeypatch.setattr(adapter_mod, "_import_models", lambda: DsPaper)


@pytest.fixture(autouse=True)
def patch_hypergraph_models(monkeypatch):
    """Make deepsynaps_evidence.hypergraph._import_models return stand-in models."""
    import deepsynaps_evidence.hypergraph as hg_mod
    monkeypatch.setattr(
        hg_mod, "_import_models", lambda: (DsHgEdgeCitation, KgHyperedge)
    )
    # Also patch the DsClaimCitation reference used inside the module body
    monkeypatch.setattr("deepsynaps_evidence.hypergraph.DsClaimCitation", DsClaimCitation, raising=False)
