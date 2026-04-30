"""add clinical_trials + clinical_trial_enrollments + clinical_trial_revisions

Phase 0 of the Clinical Trials launch-audit (PR following #334 IRB Manager
hardening): register multi-site clinical trials FK'd to a real
:class:`IRBProtocol`, with append-only revision history, real-Patient
enrolment validation, withdrawal audit hooks, and DEMO-prefixed exports.

Distinct from the legacy localStorage-backed Clinical Trials page (kept
intact behind the regulator-credible Registry tab as clearly-labelled demo
fixtures). Trials cannot exist against fabricated IRB protocols — the
``irb_protocol_id`` FK with ``ondelete='RESTRICT'`` enforces it.

Revision ID: 066_clinical_trials
Revises: 065_irb_manager_protocols
Create Date: 2026-04-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "066_clinical_trials"
down_revision = "065_irb_manager_protocols"
branch_labels = None
depends_on = None


def _has_table(bind, table: str) -> bool:
    inspector = sa.inspect(bind)
    return table in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "clinical_trials"):
        op.create_table(
            "clinical_trials",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("clinic_id", sa.String(length=64), nullable=True, index=True),
            sa.Column(
                "irb_protocol_id",
                sa.String(length=36),
                sa.ForeignKey("irb_protocols.id", ondelete="RESTRICT"),
                nullable=False,
                index=True,
            ),
            sa.Column("nct_number", sa.String(length=40), nullable=True, index=True),
            sa.Column("title", sa.String(length=512), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=sa.text("''")),
            sa.Column("sponsor", sa.String(length=255), nullable=True),
            sa.Column("pi_user_id", sa.String(length=64), nullable=False, index=True),
            sa.Column("phase", sa.String(length=40), nullable=True, index=True),
            sa.Column(
                "status",
                sa.String(length=24),
                nullable=False,
                server_default=sa.text("'planning'"),
                index=True,
            ),
            sa.Column("sites_json", sa.Text(), nullable=True),
            sa.Column("enrollment_target", sa.Integer(), nullable=True),
            sa.Column(
                "enrollment_actual",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("paused_at", sa.DateTime(), nullable=True),
            sa.Column("pause_reason", sa.Text(), nullable=True),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
            sa.Column("closed_by", sa.String(length=64), nullable=True),
            sa.Column("closure_note", sa.Text(), nullable=True),
            sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.String(length=64), nullable=False, index=True),
        )

    if not _has_table(bind, "clinical_trial_enrollments"):
        op.create_table(
            "clinical_trial_enrollments",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "trial_id",
                sa.String(length=36),
                sa.ForeignKey("clinical_trials.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "patient_id",
                sa.String(length=36),
                sa.ForeignKey("patients.id", ondelete="RESTRICT"),
                nullable=False,
                index=True,
            ),
            sa.Column("arm", sa.String(length=120), nullable=True),
            sa.Column(
                "status",
                sa.String(length=24),
                nullable=False,
                server_default=sa.text("'active'"),
                index=True,
            ),
            sa.Column("enrolled_at", sa.DateTime(), nullable=True),
            sa.Column("withdrawn_at", sa.DateTime(), nullable=True),
            sa.Column("withdrawal_reason", sa.Text(), nullable=True),
            sa.Column("enrolled_by", sa.String(length=64), nullable=False, index=True),
            sa.Column("consent_doc_id", sa.String(length=64), nullable=True),
            sa.UniqueConstraint(
                "trial_id",
                "patient_id",
                name="uq_clinical_trial_enrollment_trial_patient",
            ),
        )

    if not _has_table(bind, "clinical_trial_revisions"):
        op.create_table(
            "clinical_trial_revisions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "trial_id",
                sa.String(length=36),
                sa.ForeignKey("clinical_trials.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "revision_idx",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column("action", sa.String(length=32), nullable=False, index=True),
            sa.Column("snapshot_json", sa.Text(), nullable=False),
            sa.Column("actor_id", sa.String(length=64), nullable=False, index=True),
            sa.Column("actor_role", sa.String(length=32), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "clinical_trial_revisions"):
        op.drop_table("clinical_trial_revisions")
    if _has_table(bind, "clinical_trial_enrollments"):
        op.drop_table("clinical_trial_enrollments")
    if _has_table(bind, "clinical_trials"):
        op.drop_table("clinical_trials")
