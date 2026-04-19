"""Assessments go-live: completed_at, score_numeric, severity, subscales, items, interpretation, AI summary, escalation

Revision ID: 026_assessments_golive
Revises: 025_finance_hub_tables
Create Date: 2026-04-18

Adds the columns needed by the design-v2 Assessments Hub + Library form-filler:
  - assessment_records.completed_at      : DateTime nullable — set when a patient/clinician completes the instrument
  - assessment_records.score_numeric     : Float nullable — canonical numeric total (mirrors `score` string)
  - assessment_records.severity          : varchar(30) nullable — normalized band (minimal|mild|moderate|severe|critical)
  - assessment_records.subscales_json    : Text nullable — JSON, e.g. Y-BOCS {obsessions, compulsions}, PCL-5 cluster B/C/D/E
  - assessment_records.items_json        : Text nullable — JSON {item_id: response} for item-level analytics & AI context
  - assessment_records.interpretation    : Text nullable — clinician-authored interpretation text
  - assessment_records.ai_summary        : Text nullable — AI-generated 3-4 sentence clinical summary (Haiku)
  - assessment_records.ai_model          : varchar(64) nullable — e.g. 'claude-haiku-4-5-20251001' | 'deterministic_stub'
  - assessment_records.ai_confidence     : Float nullable — 0.0-1.0 confidence score
  - assessment_records.escalated         : Boolean default false — true when crisis escalation raised
  - assessment_records.escalated_at      : DateTime nullable
  - assessment_records.escalation_reason : Text nullable — human-readable reason (e.g. 'PHQ-9 item 9 > 0', 'C-SSRS >= 4')
  - assessment_records.escalated_by      : varchar(64) nullable — clinician_id who raised escalation

All columns are nullable or have server defaults so legacy rows and the legacy
frontend in pages-clinical-tools.js continue to work unchanged.
"""
from alembic import op
import sqlalchemy as sa


revision = "026_assessments_golive"
down_revision = "025_finance_hub_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("assessment_records") as batch_op:
        batch_op.add_column(sa.Column("completed_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("score_numeric", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("severity", sa.String(30), nullable=True))
        batch_op.add_column(sa.Column("subscales_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("items_json", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("interpretation", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("ai_summary", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("ai_model", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("ai_confidence", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("escalated", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("escalated_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("escalation_reason", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("escalated_by", sa.String(64), nullable=True))

    op.create_index("ix_assessment_records_completed_at", "assessment_records", ["completed_at"])
    op.create_index("ix_assessment_records_escalated", "assessment_records", ["escalated"])


def downgrade() -> None:
    op.drop_index("ix_assessment_records_escalated", table_name="assessment_records")
    op.drop_index("ix_assessment_records_completed_at", table_name="assessment_records")
    with op.batch_alter_table("assessment_records") as batch_op:
        batch_op.drop_column("escalated_by")
        batch_op.drop_column("escalation_reason")
        batch_op.drop_column("escalated_at")
        batch_op.drop_column("escalated")
        batch_op.drop_column("ai_confidence")
        batch_op.drop_column("ai_model")
        batch_op.drop_column("ai_summary")
        batch_op.drop_column("interpretation")
        batch_op.drop_column("items_json")
        batch_op.drop_column("subscales_json")
        batch_op.drop_column("severity")
        batch_op.drop_column("score_numeric")
        batch_op.drop_column("completed_at")
