"""Add research_datasets table (Slice C scaffold).

Specification + lifecycle row for one anonymized research export.
Depends on Slice B (``102_research_consent``) because preflight queries
need ``research_consents`` to exist to filter rows by patient consent
state. If Slice B has not landed when this PR is merged, our merge step
will rebase ``down_revision`` to point at the then-current head.

The table is intentionally created EMPTY — no seed data, no demo rows.
The build endpoint that would populate it is feature-flagged off via
``RESEARCH_EXPORT_ENABLED`` in :mod:`app.routers.research_dataset_router`.

Revision ID: 103_research_dataset
Revises: 102_research_consent
Create Date: 2026-05-11
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "103_research_dataset"
down_revision = "102_research_consent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "research_datasets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_by_actor_id", sa.String(length=64), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        # JSON blobs: list[str] of clinic ids / table names / quasi-id fields.
        sa.Column("source_clinic_ids", sa.JSON(), nullable=False),
        sa.Column("included_tables", sa.JSON(), nullable=False),
        sa.Column("quasi_id_fields", sa.JSON(), nullable=False),
        sa.Column(
            "k_anonymity_threshold",
            sa.Integer(),
            nullable=False,
            server_default="5",
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("build_log", sa.Text(), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=True),
        # Populated only when status='ready'; intentionally NOT set in this PR.
        sa.Column("export_uri", sa.String(length=1024), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_research_datasets_created_by_actor_id",
        "research_datasets",
        ["created_by_actor_id"],
        unique=False,
    )
    op.create_index(
        "ix_research_datasets_status",
        "research_datasets",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_research_datasets_status", table_name="research_datasets"
    )
    op.drop_index(
        "ix_research_datasets_created_by_actor_id",
        table_name="research_datasets",
    )
    op.drop_table("research_datasets")
