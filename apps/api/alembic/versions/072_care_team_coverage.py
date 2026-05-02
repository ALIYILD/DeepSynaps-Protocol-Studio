"""Care Team Coverage / Staff Scheduling launch-audit (2026-05-01).

Adds the four tables that back the Care Team Coverage page:

* ``shift_rosters``           — clinic-scoped weekly shift assignments per
  user, with role + on-call flag + contact channel
* ``sla_configs``             — per-clinic, per-surface SLA-minute setting
  (``surface = "*"`` is the clinic-wide default; specific surfaces
  override it). Ages-out the inbox HIGH-priority predicate from
  clinician_inbox_router into a configurable breach window.
* ``escalation_chains``       — per-clinic, per-surface
  ``primary → backup → director`` ladder. ``surface = "*"`` is the
  clinic-wide default. Each link points at a ``users.id`` (nullable so
  partial chains are allowed during onboarding).
* ``oncall_pages``            — soft mirror of every page-on-call event.
  The canonical record is the audit row
  ``inbox.item_paged_to_oncall``; this table just gives the UI an
  indexable history of who was paged for which audit_event without
  having to scan the audit_events full-text column for every UI repaint.

Why additive (no destructive changes)
-------------------------------------
None of these tables exist today. The current ``pgStaffScheduling`` page
uses localStorage-only data. PR section F documents the migration path
from the local roster cache to the new server-backed roster.

Cross-dialect safe — every column is nullable text/datetime; soft FKs
(``user_id`` / ``primary_user_id`` etc) so deleting a user doesn't
cascade-clear roster history. SQLite-friendly.

Revision ID: 072_care_team_coverage
Revises: 071_wearables_workbench_triage
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "072_care_team_coverage"
down_revision = "071_wearables_workbench_triage"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return name in set(insp.get_table_names())
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "shift_rosters"):
        op.create_table(
            "shift_rosters",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("clinic_id", sa.String(36), nullable=False, index=True),
            sa.Column("user_id", sa.String(64), nullable=False, index=True),
            sa.Column("week_start", sa.String(16), nullable=False, index=True),
            sa.Column("day_of_week", sa.Integer(), nullable=False),  # 0=Mon..6=Sun
            sa.Column("start_time", sa.String(8), nullable=True),    # HH:MM
            sa.Column("end_time", sa.String(8), nullable=True),
            sa.Column("role", sa.String(32), nullable=True),
            sa.Column("is_on_call", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("surface", sa.String(64), nullable=True),       # NULL = generic shift
            sa.Column("contact_channel", sa.String(32), nullable=True),  # phone|sms|slack|email|pager
            sa.Column("contact_handle", sa.String(255), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.String(64), nullable=False),
            sa.Column("updated_at", sa.String(64), nullable=False),
        )
        op.create_index(
            "ix_shift_rosters_clinic_week",
            "shift_rosters",
            ["clinic_id", "week_start"],
        )
        op.create_index(
            "ix_shift_rosters_oncall",
            "shift_rosters",
            ["clinic_id", "is_on_call"],
        )

    if not _has_table(bind, "sla_configs"):
        op.create_table(
            "sla_configs",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("clinic_id", sa.String(36), nullable=False, index=True),
            sa.Column("surface", sa.String(64), nullable=False, index=True),  # "*" = default
            sa.Column("severity", sa.String(16), nullable=False, server_default="HIGH"),
            sa.Column("sla_minutes", sa.Integer(), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("updated_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.String(64), nullable=False),
            sa.Column("updated_at", sa.String(64), nullable=False),
            sa.UniqueConstraint(
                "clinic_id", "surface", "severity",
                name="uq_sla_configs_clinic_surface_sev",
            ),
        )

    if not _has_table(bind, "escalation_chains"):
        op.create_table(
            "escalation_chains",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("clinic_id", sa.String(36), nullable=False, index=True),
            sa.Column("surface", sa.String(64), nullable=False, index=True),  # "*" = default
            sa.Column("primary_user_id", sa.String(64), nullable=True),
            sa.Column("backup_user_id", sa.String(64), nullable=True),
            sa.Column("director_user_id", sa.String(64), nullable=True),
            sa.Column("auto_page_enabled", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("updated_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.String(64), nullable=False),
            sa.Column("updated_at", sa.String(64), nullable=False),
            sa.UniqueConstraint(
                "clinic_id", "surface",
                name="uq_escalation_chains_clinic_surface",
            ),
        )

    if not _has_table(bind, "oncall_pages"):
        op.create_table(
            "oncall_pages",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("clinic_id", sa.String(36), nullable=False, index=True),
            sa.Column("audit_event_id", sa.String(64), nullable=False, index=True),
            sa.Column("surface", sa.String(64), nullable=True, index=True),
            sa.Column("paged_user_id", sa.String(64), nullable=True),
            sa.Column("paged_role", sa.String(32), nullable=True),  # primary|backup|director
            sa.Column("paged_by", sa.String(64), nullable=False),
            sa.Column("trigger", sa.String(16), nullable=False),    # manual|auto
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("delivery_status", sa.String(16), nullable=True),  # logged|sent|failed
            sa.Column("created_at", sa.String(64), nullable=False, index=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    for table in ("oncall_pages", "escalation_chains", "sla_configs", "shift_rosters"):
        if _has_table(bind, table):
            try:
                op.drop_table(table)
            except Exception:
                pass
