"""add irb_protocols + irb_protocol_amendments + irb_protocol_revisions

Phase 0 of the IRB Manager launch-audit (PR following #321 QA hardening):
register IRB-approved protocols with append-only revision history, real-User
PI validation, amendment + closure + reopen audit hooks, and DEMO-prefixed
exports. Distinct from the legacy ``irb_studies`` table (kept intact for
back-compat with the older ``apps/api/app/routers/irb_router.py`` surface).

Revision ID: 065_irb_manager_protocols
Revises: 43055a261739
Create Date: 2026-04-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "065_irb_manager_protocols"
down_revision = "43055a261739"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    inspector = sa.inspect(bind)
    return table in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "irb_protocols"):
        op.create_table(
            "irb_protocols",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("clinic_id", sa.String(length=64), nullable=True, index=True),
            sa.Column("protocol_code", sa.String(length=64), nullable=True, index=True),
            sa.Column("title", sa.String(length=512), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=sa.text("''")),
            sa.Column("irb_board", sa.String(length=255), nullable=True),
            sa.Column("irb_number", sa.String(length=120), nullable=True, index=True),
            sa.Column("sponsor", sa.String(length=255), nullable=True),
            sa.Column("pi_user_id", sa.String(length=64), nullable=False, index=True),
            sa.Column("phase", sa.String(length=40), nullable=True, index=True),
            sa.Column(
                "status",
                sa.String(length=24),
                nullable=False,
                server_default=sa.text("'pending'"),
                index=True,
            ),
            sa.Column("risk_level", sa.String(length=40), nullable=True, index=True),
            sa.Column("approval_date", sa.String(length=20), nullable=True),
            sa.Column("expiry_date", sa.String(length=20), nullable=True, index=True),
            sa.Column("enrollment_target", sa.Integer(), nullable=True),
            sa.Column("enrolled_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("consent_version", sa.String(length=40), nullable=True),
            sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
            sa.Column("closed_by", sa.String(length=64), nullable=True),
            sa.Column("closure_note", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(length=64), nullable=False, index=True),
        )

    if not _has_table(bind, "irb_protocol_amendments"):
        op.create_table(
            "irb_protocol_amendments",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "protocol_id",
                sa.String(length=36),
                sa.ForeignKey("irb_protocols.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("amendment_type", sa.String(length=60), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("submitted_by", sa.String(length=64), nullable=False, index=True),
            sa.Column("submitted_at", sa.DateTime(), nullable=True),
            sa.Column(
                "status",
                sa.String(length=24),
                nullable=False,
                server_default=sa.text("'submitted'"),
            ),
            sa.Column("consent_version_after", sa.String(length=40), nullable=True),
        )

    if not _has_table(bind, "irb_protocol_revisions"):
        op.create_table(
            "irb_protocol_revisions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "protocol_id",
                sa.String(length=36),
                sa.ForeignKey("irb_protocols.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("revision_idx", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("action", sa.String(length=32), nullable=False, index=True),
            sa.Column("snapshot_json", sa.Text(), nullable=False),
            sa.Column("actor_id", sa.String(length=64), nullable=False, index=True),
            sa.Column("actor_role", sa.String(length=32), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "irb_protocol_revisions"):
        op.drop_table("irb_protocol_revisions")
    if _has_table(bind, "irb_protocol_amendments"):
        op.drop_table("irb_protocol_amendments")
    if _has_table(bind, "irb_protocols"):
        op.drop_table("irb_protocols")
