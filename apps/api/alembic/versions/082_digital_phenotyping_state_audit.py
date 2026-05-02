"""Digital Phenotyping Analyzer — patient consent/settings + audit trail.

Revision ID: 082_digital_phenotyping_state_audit
Revises: 081_rotation_policy_advisor_thresholds
Create Date: 2026-05-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "082_digital_phenotyping_state_audit"
down_revision = "081_rotation_policy_advisor_thresholds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "digital_phenotyping_patient_state",
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("domains_enabled_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("ui_settings_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("consent_scope_version", sa.String(64), nullable=False, server_default="2026.04"),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_by", sa.String(64), nullable=True),
    )
    op.create_table(
        "digital_phenotyping_audit",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), nullable=False, index=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("detail_json", sa.Text(), nullable=True),
        sa.Column("actor_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("digital_phenotyping_audit")
    op.drop_table("digital_phenotyping_patient_state")
