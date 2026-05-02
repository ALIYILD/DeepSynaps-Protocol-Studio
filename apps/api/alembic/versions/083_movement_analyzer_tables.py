"""Movement Analyzer snapshot + audit tables (MA-1, 2026-05-02).

Caches JSON workspace payload per patient; audit trail for recompute/annotation.
Revision ID: 083_movement_analyzer_tables
Revises: 082_irb_amendment_workflow
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "083_movement_analyzer_tables"
down_revision = "082_irb_amendment_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "movement_analyzer_snapshots",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("schema_version", sa.String(16), nullable=False, server_default="1"),
        sa.Column("pipeline_version", sa.String(32), nullable=False, server_default="0.1.0"),
        sa.Column("computed_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("patient_id", name="uq_movement_analyzer_patient"),
    )
    op.create_index("ix_movement_analyzer_snapshots_patient_id", "movement_analyzer_snapshots", ["patient_id"])
    op.create_index("ix_movement_analyzer_snapshots_computed_at", "movement_analyzer_snapshots", ["computed_at"])

    op.create_table(
        "movement_analyzer_audit",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("patient_id", sa.String(36), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=True),
        sa.Column("detail_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_movement_analyzer_audit_patient_id", "movement_analyzer_audit", ["patient_id"])
    op.create_index("ix_movement_analyzer_audit_actor_id", "movement_analyzer_audit", ["actor_id"])
    op.create_index("ix_movement_analyzer_audit_created_at", "movement_analyzer_audit", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_movement_analyzer_audit_created_at", table_name="movement_analyzer_audit")
    op.drop_index("ix_movement_analyzer_audit_actor_id", table_name="movement_analyzer_audit")
    op.drop_index("ix_movement_analyzer_audit_patient_id", table_name="movement_analyzer_audit")
    op.drop_table("movement_analyzer_audit")
    op.drop_index("ix_movement_analyzer_snapshots_computed_at", table_name="movement_analyzer_snapshots")
    op.drop_index("ix_movement_analyzer_snapshots_patient_id", table_name="movement_analyzer_snapshots")
    op.drop_table("movement_analyzer_snapshots")
