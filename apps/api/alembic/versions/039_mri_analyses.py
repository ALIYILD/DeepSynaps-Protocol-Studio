"""Add the MRI Analyzer tables (mri_analyses + mri_uploads).

Wires the `deepsynaps_mri` package (``packages/mri-pipeline/``) into the
Studio DB. Mirrors the authoritative schema in
``packages/mri-pipeline/medrag_extensions/04_migration_mri.sql``.

Notes
-----
* The reference SQL uses PostgreSQL-only features (``UUID`` type, ``TEXT[]``
  arrays, ``JSONB`` columns, the ``vector`` pgvector extension, HNSW
  indexes on the 200-d embedding, GIN indexes on JSONB). SQLite — the
  engine this test suite runs on — supports none of those. We translate
  everything into portable ``Text`` blobs + plain indexes so SQLite and
  Postgres can both bootstrap a fresh DB without dialect-specific CREATE
  EXTENSION / CREATE INDEX USING hnsw statements.
* A follow-up migration (run with pgvector + elevated privileges) can
  lift ``embedding_json`` into a ``vector(200)`` column and add the HNSW
  index + JSONB GIN indexes in Postgres when operators are ready. The
  application code treats ``embedding_json`` as either a JSON TEXT blob
  or a pgvector value transparently.
* All JSON blobs are nullable so legacy rows stay queryable.
* Every column except the primary key + timestamps is nullable.

Revision ID: 039_mri_analyses
Revises: 038_qeeg_ai_upgrades
Create Date: 2026-04-24
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "039_mri_analyses"
down_revision = "038_qeeg_ai_upgrades"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the ``mri_analyses`` + ``mri_uploads`` tables."""
    # ── mri_analyses ────────────────────────────────────────────────────
    op.create_table(
        "mri_analyses",
        sa.Column("analysis_id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("patient_id", sa.Text(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        # Top-level report fields persisted as JSON text blobs.
        sa.Column("modalities_present_json", sa.Text(), nullable=True),
        sa.Column("structural_json", sa.Text(), nullable=True),
        sa.Column("functional_json", sa.Text(), nullable=True),
        sa.Column("diffusion_json", sa.Text(), nullable=True),
        sa.Column("stim_targets_json", sa.Text(), nullable=True),
        sa.Column("medrag_query_json", sa.Text(), nullable=True),
        sa.Column("overlays_json", sa.Text(), nullable=True),
        sa.Column("qc_json", sa.Text(), nullable=True),
        # 200-d cross-modal embedding — stored as a JSON list of floats so
        # SQLite dev/test rounds-trip cleanly. Postgres deployments can
        # lift this into a pgvector(200) column out-of-band.
        sa.Column("embedding_json", sa.Text(), nullable=True),
        sa.Column("pipeline_version", sa.String(16), nullable=True),
        sa.Column("norm_db_version", sa.String(16), nullable=True),
        # Pipeline job tracking (Celery AsyncResult id or background uuid).
        sa.Column("job_id", sa.String(64), nullable=True, index=True),
        sa.Column(
            "state",
            sa.String(16),
            nullable=False,
            server_default=sa.text("'queued'"),
        ),
        # Inputs — link back to the upload row + analysis request metadata.
        sa.Column("upload_ref", sa.Text(), nullable=True),
        sa.Column("condition", sa.String(32), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("sex", sa.String(4), nullable=True),
    )
    op.create_index(
        "idx_mri_analyses_created",
        "mri_analyses",
        ["created_at"],
    )

    # ── mri_uploads ─────────────────────────────────────────────────────
    op.create_table(
        "mri_uploads",
        sa.Column("upload_id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("patient_id", sa.Text(), nullable=True, index=True),
        sa.Column("path", sa.Text(), nullable=True),
        sa.Column("filename", sa.Text(), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column("mimetype", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    """Drop both MRI tables — clean rollback."""
    op.drop_table("mri_uploads")
    op.drop_index("idx_mri_analyses_created", table_name="mri_analyses")
    op.drop_table("mri_analyses")
