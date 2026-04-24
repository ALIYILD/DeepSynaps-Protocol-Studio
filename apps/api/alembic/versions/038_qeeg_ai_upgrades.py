"""Add the CONTRACT_V2 §2 AI-upgrade columns + knowledge-graph tables.

This migration wires in the ten AI upgrades from
``CONTRACT_V2.md`` §2:

* Ten new nullable columns on ``qeeg_analyses`` (eight JSON blobs for
  the embedding / brain-age / risk / centiles / explainability /
  similar-cases / protocol-recommendation / longitudinal dicts, plus
  two small integer columns that track the patient's session number
  and days-from-baseline).
* Two new tables for the hypergraph knowledge-graph primitives
  (``kg_entities`` and ``kg_hyperedges``).

Notes
-----
* We intentionally **do not** issue ``CREATE EXTENSION vector`` in this
  migration. That statement requires superuser privileges in Postgres
  and is a no-op in SQLite (which the test suite uses). If a deployment
  needs pgvector semantics on top of the ``embedding_json`` TEXT column
  it must be enabled out-of-band by an operator; the application code
  can then treat the column as either JSON text or a pgvector value
  transparently.
* All columns are nullable to remain additive. Legacy analyses keep
  working — every AI-upgrade endpoint populates its column on demand.
* ``kg_entities.embedding_json`` is a TEXT column (JSON list) rather
  than a pgvector value so SQLite dev / test envs can round-trip the
  data without dialect adapters.

Revision ID: 038_qeeg_ai_upgrades
Revises: 037_qeeg_mne_pipeline_fields
Create Date: 2026-04-24
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "038_qeeg_ai_upgrades"
down_revision = "037_qeeg_mne_pipeline_fields"
branch_labels = None
depends_on = None


# ── Column additions to qeeg_analyses ────────────────────────────────────────

_NEW_JSON_COLUMNS: tuple[str, ...] = (
    "embedding_json",            # 200-dim LaBraM-style vector as JSON list
    "brain_age_json",            # CONTRACT_V2 §1 brain_age dict
    "risk_scores_json",          # CONTRACT_V2 §1 risk_scores dict
    "centiles_json",             # CONTRACT_V2 §1 centiles dict
    "explainability_json",       # CONTRACT_V2 §1 explainability dict
    "similar_cases_json",        # list[dict] — top-K neighbours
    "protocol_recommendation_json",  # ProtocolRecommendation dict
    "longitudinal_json",         # cached trajectory summary snapshot
)

_NEW_INT_COLUMNS: tuple[str, ...] = (
    "session_number",      # 1-based ordinal across the patient's sessions
    "days_from_baseline",  # integer days since baseline (0 for baseline)
)


def upgrade() -> None:
    # ── qeeg_analyses — new nullable JSON + integer columns ──────────────
    for col in _NEW_JSON_COLUMNS:
        op.add_column(
            "qeeg_analyses",
            sa.Column(col, sa.Text(), nullable=True),
        )
    for col in _NEW_INT_COLUMNS:
        op.add_column(
            "qeeg_analyses",
            sa.Column(col, sa.Integer(), nullable=True),
        )

    # ── Knowledge-graph hypergraph tables (CONTRACT_V2 §3) ───────────────
    # Note: pgvector support, if enabled, should be added by a follow-up
    # migration run with elevated privileges. The ``embedding_json``
    # column here stores a JSON list of floats so the feature is usable
    # without pgvector.
    op.create_table(
        "kg_entities",
        sa.Column(
            "entity_id",
            sa.Integer(),
            primary_key=True,
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("type", sa.String(32), nullable=True),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("embedding_json", sa.Text(), nullable=True),
    )

    op.create_table(
        "kg_hyperedges",
        sa.Column(
            "edge_id",
            sa.Integer(),
            primary_key=True,
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("relation", sa.String(64), nullable=True),
        sa.Column("entity_ids_json", sa.Text(), nullable=True),
        sa.Column("paper_ids_json", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    # Drop KG tables first — nothing depends on them.
    op.drop_table("kg_hyperedges")
    op.drop_table("kg_entities")

    # Then undo the column additions in reverse order so re-running is
    # clean on either dialect.
    for col in reversed(_NEW_INT_COLUMNS):
        op.drop_column("qeeg_analyses", col)
    for col in reversed(_NEW_JSON_COLUMNS):
        op.drop_column("qeeg_analyses", col)
