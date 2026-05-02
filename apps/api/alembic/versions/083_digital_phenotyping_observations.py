"""Digital phenotyping — manual / device-sourced observation log (MVP).

Revision ID: 083_digital_phenotyping_observations
Revises: 082_digital_phenotyping_state_audit
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "083_digital_phenotyping_observations"
down_revision = "082_digital_phenotyping_state_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "digital_phenotyping_observations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("recorded_at", sa.DateTime(), nullable=False, index=True),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index(
        "ix_dpa_obs_patient_recorded",
        "digital_phenotyping_observations",
        ["patient_id", "recorded_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_dpa_obs_patient_recorded", table_name="digital_phenotyping_observations")
    op.drop_table("digital_phenotyping_observations")
