"""Evidence Citation Validator tables: ds_papers, ds_claim_citations,
ds_grounding_audit, ds_hg_edge_citations.

Creates the pgvector-backed literature corpus, claim-citation linkage,
hash-chained grounding audit trail, and hypergraph edge citation tables
as specified in ``evidence_citation_validator.md``.

Design contract
---------------
* **Additive only.** Four new tables; no existing tables modified.
* **Postgres-only pgvector.** On SQLite the ``embedding`` column is
  created as TEXT; the IVFFlat index is skipped.
* **Safe on extension-missing hosts.** ``CREATE EXTENSION IF NOT EXISTS
  vector`` is a safety net; if it fails the migration logs CRITICAL
  and continues — downstream code falls back to the TEXT path.

Revision ID: 045_evidence_citation_validator
Revises: 044_merge_outcome_and_patient_event_heads
Create Date: 2026-04-25
"""
from __future__ import annotations

import logging

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "045_evidence_citation_validator"
down_revision = "044_merge_outcome_and_patient_event_heads"
branch_labels = None
depends_on = None

log = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _is_postgres(bind: sa.engine.Engine) -> bool:
    return bind.dialect.name == "postgresql"


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


# ── Upgrade ──────────────────────────────────────────────────────────────────

def upgrade() -> None:
    bind = op.get_bind()
    is_pg = _is_postgres(bind)

    # 1. ds_papers — evidence corpus
    if not _has_table(bind, "ds_papers"):
        op.create_table(
            "ds_papers",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("pmid", sa.String(20), nullable=True, unique=True, index=True),
            sa.Column("doi", sa.String(255), nullable=True, unique=True, index=True),
            sa.Column("openalex_id", sa.String(60), nullable=True, unique=True),
            sa.Column("title", sa.Text(), nullable=True),
            sa.Column("abstract", sa.Text(), nullable=True),
            sa.Column("year", sa.Integer(), nullable=True, index=True),
            sa.Column("journal", sa.String(512), nullable=True),
            sa.Column("authors_json", sa.Text(), nullable=True),
            sa.Column("pub_types_json", sa.Text(), nullable=True),
            sa.Column("cited_by_count", sa.Integer(), nullable=True),
            sa.Column("is_oa", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("oa_url", sa.String(1024), nullable=True),
            sa.Column("sources_json", sa.Text(), nullable=True),
            sa.Column("evidence_type", sa.String(60), nullable=True),
            sa.Column("evidence_level", sa.String(20), nullable=True),
            sa.Column("grade", sa.String(1), nullable=True),
            sa.Column("retracted", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("retraction_doi", sa.String(255), nullable=True),
            sa.Column("embedding_json", sa.Text(), nullable=True),
            # embedding column added below for Postgres only
            sa.Column("ingested_at", sa.DateTime(), nullable=True),
            sa.Column("refreshed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        log.info("Created ds_papers table")

    # 2. ds_claim_citations
    if not _has_table(bind, "ds_claim_citations"):
        op.create_table(
            "ds_claim_citations",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("claim_text", sa.Text(), nullable=False),
            sa.Column("claim_hash", sa.String(64), nullable=False, index=True),
            sa.Column("paper_id", sa.String(36), sa.ForeignKey("ds_papers.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("citation_type", sa.String(20), nullable=False, server_default="supports"),
            sa.Column("relevance_score", sa.Float(), nullable=True),
            sa.Column("evidence_grade", sa.String(1), nullable=True),
            sa.Column("supporting_quote", sa.Text(), nullable=True),
            sa.Column("confidence", sa.Float(), nullable=True),
            sa.Column("validation_status", sa.String(30), nullable=False, server_default="pending"),
            sa.Column("issues_json", sa.Text(), nullable=True),
            sa.Column("actor_id", sa.String(64), nullable=True, index=True),
            sa.Column("validator_version", sa.String(20), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        log.info("Created ds_claim_citations table")

    # 3. ds_grounding_audit — append-only, hash-chained
    if not _has_table(bind, "ds_grounding_audit"):
        op.create_table(
            "ds_grounding_audit",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("event_id", sa.String(64), nullable=False, unique=True, index=True),
            sa.Column("event_type", sa.String(60), nullable=False),
            sa.Column("study_identifier", sa.String(60), nullable=True),
            sa.Column("claim_hash", sa.String(64), nullable=True, index=True),
            sa.Column("decision", sa.String(20), nullable=False),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("confidence", sa.Float(), nullable=True),
            sa.Column("decided_by", sa.String(64), nullable=False, server_default="system"),
            sa.Column("prev_hash", sa.String(64), nullable=True),
            sa.Column("row_hash", sa.String(64), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        log.info("Created ds_grounding_audit table")

    # 4. ds_hg_edge_citations
    if not _has_table(bind, "ds_hg_edge_citations"):
        op.create_table(
            "ds_hg_edge_citations",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("edge_id", sa.Integer(), sa.ForeignKey("kg_hyperedges.edge_id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("citation_id", sa.String(36), sa.ForeignKey("ds_claim_citations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("enriched_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("edge_id", "citation_id", name="uq_edge_citation"),
        )
        log.info("Created ds_hg_edge_citations table")

    # 5. Postgres-only: native pgvector embedding column + IVFFlat index
    if is_pg:
        try:
            op.execute("CREATE EXTENSION IF NOT EXISTS vector")
        except Exception as exc:
            log.critical("Cannot enable pgvector extension: %s — continuing without native embeddings", exc)
            return

        # Verify the extension is actually available
        row = bind.execute(
            sa.text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
        ).fetchone()
        if row is None:
            log.critical("pgvector extension not present after CREATE EXTENSION; skipping embedding column")
            return

        try:
            op.execute('ALTER TABLE ds_papers ADD COLUMN IF NOT EXISTS embedding vector(1536)')
            log.info("Added ds_papers.embedding vector(1536) column")
        except Exception as exc:
            log.warning("Failed to add embedding column: %s", exc)

        try:
            op.execute(
                "CREATE INDEX IF NOT EXISTS idx_ds_papers_embedding_ivfflat "
                "ON ds_papers USING ivfflat (embedding vector_cosine_ops) "
                "WITH (lists = 300)"
            )
            log.info("Created IVFFlat index on ds_papers.embedding")
        except Exception as exc:
            log.warning("Failed to create IVFFlat index (table may be empty — run after backfill): %s", exc)

        # Full-text search index on title + abstract
        try:
            op.execute(
                "CREATE INDEX IF NOT EXISTS idx_ds_papers_fts "
                "ON ds_papers USING GIN "
                "(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(abstract,'')))"
            )
            log.info("Created GIN FTS index on ds_papers")
        except Exception as exc:
            log.warning("Failed to create FTS index: %s", exc)


# ── Downgrade ────────────────────────────────────────────────────────────────

def downgrade() -> None:
    bind = op.get_bind()

    for table in ("ds_hg_edge_citations", "ds_grounding_audit", "ds_claim_citations", "ds_papers"):
        if _has_table(bind, table):
            op.drop_table(table)
            log.info("Dropped %s", table)
