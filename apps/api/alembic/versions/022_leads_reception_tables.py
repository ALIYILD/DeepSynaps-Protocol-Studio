"""Add clinic_leads, reception_calls, reception_tasks tables for Leads & Reception feature.

Revision ID: 022_leads_reception_tables
Revises: 021_scheduling_fields
Create Date: 2026-04-16

Changes:
  - clinic_leads        : lead pipeline (new/contacted/qualified/booked/lost)
  - reception_calls     : phone call log (inbound/outbound)
  - reception_tasks     : receptionist task list with priority and due date
"""
from alembic import op
import sqlalchemy as sa


revision = "022_leads_reception_tables"
down_revision = "021_scheduling_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clinic_leads",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("clinician_id", sa.String(100), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(200), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("source", sa.String(50), nullable=False, server_default="phone"),
        sa.Column("condition", sa.String(200), nullable=True),
        sa.Column("stage", sa.String(50), nullable=False, server_default="new", index=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("follow_up", sa.String(50), nullable=True),
        sa.Column("converted_appointment_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.String(50), nullable=False),
        sa.Column("updated_at", sa.String(50), nullable=False),
    )

    op.create_table(
        "reception_calls",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("clinician_id", sa.String(100), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("direction", sa.String(20), nullable=False, server_default="inbound"),
        sa.Column("duration", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("outcome", sa.String(50), nullable=False, server_default="info-given"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("call_time", sa.String(10), nullable=True),
        sa.Column("call_date", sa.String(20), nullable=False, index=True),
        sa.Column("created_at", sa.String(50), nullable=False),
    )

    op.create_table(
        "reception_tasks",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("clinician_id", sa.String(100), nullable=False, index=True),
        sa.Column("text", sa.String(500), nullable=False),
        sa.Column("due", sa.String(20), nullable=True),
        sa.Column("done", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("priority", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("created_at", sa.String(50), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("reception_tasks")
    op.drop_table("reception_calls")
    op.drop_table("clinic_leads")
