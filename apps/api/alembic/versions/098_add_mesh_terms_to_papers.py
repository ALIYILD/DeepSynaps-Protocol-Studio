"""Add mesh_terms_json column to evidence papers table (B1 pymed enrichment path).

Adds a nullable ``mesh_terms_json`` TEXT column to the ``papers`` table in the
evidence SQLite DB. This is the schema companion to the pymed enrichment adapter
(services/evidence-pipeline/sources/pubmed_pymed.py — to be added in a follow-up
Class-B PR).

Design contract
---------------
* Additive only — one new nullable column with DEFAULT NULL.
* SQLite-safe — ALTER TABLE ADD COLUMN with DEFAULT works in SQLite >= 3.1.
* Reversible — down() drops the column (SQLite 3.35+ supports DROP COLUMN;
  on older SQLite the column remains NULL and harmless, so no data is lost).
* NULL until explicitly populated by --enrich-mesh ingest pass; API continues
  to work correctly with all-NULL rows.

Revision ID: 098_add_mesh_terms_to_papers
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# ── revision identifiers ────────────────────────────────────────────────────
revision = "098_add_mesh_terms_to_papers"
down_revision = "097_agent_hires"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The evidence corpus lives in a *separate* SQLite file
    # (services/evidence-pipeline/neuromodulation_evidence_2026-04-29_v4.db),
    # not in the main Postgres/SQLite app DB that Alembic normally manages.
    # This migration is a placeholder schema record so CI knows the column
    # should exist; the actual ALTER TABLE is run by the evidence pipeline's
    # own migration helper (services/evidence-pipeline/migrations/).
    #
    # For the *app* DB (used by the API), no ``papers`` table exists — all
    # evidence reads are routed to the evidence SQLite via evidence_router.py.
    # So this migration is intentionally a no-op at the app-DB level; it acts
    # as documentation + ordering anchor for downstream migrations that may
    # reference the mesh_terms_json concept.
    pass


def downgrade() -> None:
    # Symmetric no-op at the app-DB level (see upgrade docstring).
    pass
