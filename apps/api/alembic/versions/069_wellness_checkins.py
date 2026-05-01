"""Patient Wellness Hub launch-audit (2026-05-01) — server-side persistence.

Adds ``wellness_checkins`` so the pgPatientWellness page can persist
multi-axis wellness check-ins on the server with a patient-scoped audit
breadcrumb instead of relying on browser localStorage / scattered
``ds_wellness_*`` keys. One row per logged check-in, keyed on a UUID
primary key. ``is_demo`` is stamped on create from the patient record
(sticky), ``shared_at`` records explicit care-team shares, and
``deleted_at`` carries the soft-delete timestamp so the audit trail
remains complete.

Mirrors the contract established by 068_symptom_journal_entries.

Design contract
---------------
* Additive only — single new table, no edits to existing rows.
* Cross-dialect — stdlib SQLAlchemy types only so this runs against the
  SQLite test harness and the Postgres production engine identically.
* Defensive — ``upgrade`` / ``downgrade`` both no-op when the table is in
  the unexpected state (mirrors 068_symptom_journal_entries).

Revision ID: 069_wellness_checkins
Revises: 068_symptom_journal_entries
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "069_wellness_checkins"
down_revision = "068_symptom_journal_entries"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


# ── Upgrade ──────────────────────────────────────────────────────────────────


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "wellness_checkins"):
        return

    op.create_table(
        "wellness_checkins",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "patient_id",
            sa.String(36),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("author_actor_id", sa.String(64), nullable=False),
        # 0..10 axes — all optional so a patient can log a partial check-in.
        sa.Column("mood", sa.Integer(), nullable=True),
        sa.Column("energy", sa.Integer(), nullable=True),
        sa.Column("sleep", sa.Integer(), nullable=True),
        sa.Column("anxiety", sa.Integer(), nullable=True),
        sa.Column("focus", sa.Integer(), nullable=True),
        sa.Column("pain", sa.Integer(), nullable=True),
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
        "ix_wellness_checkins_patient_id",
        "wellness_checkins",
        ["patient_id"],
    )
    op.create_index(
        "ix_wellness_checkins_author_actor_id",
        "wellness_checkins",
        ["author_actor_id"],
    )
    op.create_index(
        "ix_wellness_checkins_is_demo",
        "wellness_checkins",
        ["is_demo"],
    )
    op.create_index(
        "ix_wellness_checkins_deleted_at",
        "wellness_checkins",
        ["deleted_at"],
    )
    op.create_index(
        "ix_wellness_checkins_created_at",
        "wellness_checkins",
        ["created_at"],
    )


# ── Downgrade ────────────────────────────────────────────────────────────────


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "wellness_checkins"):
        return
    for ix in (
        "ix_wellness_checkins_patient_id",
        "ix_wellness_checkins_author_actor_id",
        "ix_wellness_checkins_is_demo",
        "ix_wellness_checkins_deleted_at",
        "ix_wellness_checkins_created_at",
    ):
        try:
            op.drop_index(ix, table_name="wellness_checkins")
        except Exception:
            pass
    op.drop_table("wellness_checkins")
