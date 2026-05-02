"""Add cleaning_decisions and auto_clean_runs tables.

Adds the audit trail and AI auto-clean run history needed for the clinical
raw-data workstation. Every AI suggestion + clinician accept/edit/reject is
logged to cleaning_decisions for medico-legal traceability. auto_clean_runs
captures full proposal/accept/reject snapshots from one-click auto-clean.

Revision ID: 047_cleaning_decisions
Revises: 046_cleaning_config
"""
from alembic import op
import sqlalchemy as sa


revision = "047_cleaning_decisions"
down_revision = "046_cleaning_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auto_clean_runs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("analysis_id", sa.String(length=36), nullable=False),
        sa.Column("proposal_json", sa.Text(), nullable=False),
        sa.Column("accepted_items_json", sa.Text(), nullable=True),
        sa.Column("rejected_items_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_auto_clean_runs_analysis_id",
        "auto_clean_runs",
        ["analysis_id"],
    )

    op.create_table(
        "cleaning_decisions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("analysis_id", sa.String(length=36), nullable=False),
        sa.Column("auto_clean_run_id", sa.String(length=36), nullable=True),
        sa.Column("actor", sa.String(length=8), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target", sa.String(length=255), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("accepted_by_user", sa.Boolean(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["auto_clean_run_id"],
            ["auto_clean_runs.id"],
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_cleaning_decisions_analysis_id",
        "cleaning_decisions",
        ["analysis_id"],
    )
    op.create_index(
        "ix_cleaning_decisions_auto_clean_run_id",
        "cleaning_decisions",
        ["auto_clean_run_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_cleaning_decisions_auto_clean_run_id", table_name="cleaning_decisions")
    op.drop_index("ix_cleaning_decisions_analysis_id", table_name="cleaning_decisions")
    op.drop_table("cleaning_decisions")
    op.drop_index("ix_auto_clean_runs_analysis_id", table_name="auto_clean_runs")
    op.drop_table("auto_clean_runs")
