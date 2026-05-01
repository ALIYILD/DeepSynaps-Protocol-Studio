"""Patient Symptom Journal launch-audit (2026-05-01) — server-side persistence.

Adds ``symptom_journal_entries`` so the pgSymptomJournal patient page can
persist entries on the server with a patient-scoped audit breadcrumb instead
of relying on browser localStorage alone. One row per logged entry, keyed
on a UUID primary key. ``is_demo`` is stamped on create from the patient
record (sticky), ``shared_at`` records explicit care-team shares, and
``deleted_at`` carries the soft-delete timestamp so the audit trail remains
complete.

Design contract
---------------
* Additive only — single new table, no edits to existing rows.
* Cross-dialect — stdlib SQLAlchemy types only so this runs against the
  SQLite test harness and the Postgres production engine identically.
* Defensive — ``upgrade`` / ``downgrade`` both no-op when the table is in
  the unexpected state (mirrors 067_onboarding_state).

Revision ID: 068_symptom_journal_entries
Revises: 067_onboarding_state
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "068_symptom_journal_entries"
down_revision = "067_onboarding_state"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


# ── Upgrade ──────────────────────────────────────────────────────────────────


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "symptom_journal_entries"):
        return

    op.create_table(
        "symptom_journal_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "patient_id",
            sa.String(36),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("author_actor_id", sa.String(64), nullable=False),
        sa.Column("severity", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("tags", sa.String(255), nullable=True),
        sa.Column(
            "is_demo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("shared_at", sa.DateTime(), nullable=True),
        sa.Column("shared_with", sa.String(255), nullable=True),
        sa.Column(
            "revision_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("delete_reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_index(
        "ix_symptom_journal_entries_patient_id",
        "symptom_journal_entries",
        ["patient_id"],
    )
    op.create_index(
        "ix_symptom_journal_entries_author_actor_id",
        "symptom_journal_entries",
        ["author_actor_id"],
    )
    op.create_index(
        "ix_symptom_journal_entries_is_demo",
        "symptom_journal_entries",
        ["is_demo"],
    )
    op.create_index(
        "ix_symptom_journal_entries_deleted_at",
        "symptom_journal_entries",
        ["deleted_at"],
    )
    op.create_index(
        "ix_symptom_journal_entries_created_at",
        "symptom_journal_entries",
        ["created_at"],
    )


# ── Downgrade ────────────────────────────────────────────────────────────────


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "symptom_journal_entries"):
        return
    for ix in (
        "ix_symptom_journal_entries_patient_id",
        "ix_symptom_journal_entries_author_actor_id",
        "ix_symptom_journal_entries_is_demo",
        "ix_symptom_journal_entries_deleted_at",
        "ix_symptom_journal_entries_created_at",
    ):
        try:
            op.drop_index(ix, table_name="symptom_journal_entries")
        except Exception:
            pass
    op.drop_table("symptom_journal_entries")
