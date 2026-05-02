"""Escalation Policy Editor (2026-05-01) — escalation_policies + user_contact_mappings.

Closes the LAST operational gap flagged by the On-Call Delivery agent
(#373). Until this PR, ``OncallDeliveryService.DEFAULT_ADAPTER_ORDER``
was a hard-coded tuple in code, the ``ShiftRoster.contact_handle`` was
the only path from "user X is on call" to "send to phone +1...", and
there was no way for an admin to say "for adverse_events_hub use
PagerDuty only; for adherence breaches use Slack only".

Adds two tables:

* ``escalation_policies`` — one row per clinic. Carries
  ``dispatch_order`` (JSON array) + ``surface_overrides`` (JSON object)
  + ``version`` (monotonic counter). The on-call delivery service
  consults this row when present and falls back to the existing
  ``DEFAULT_ADAPTER_ORDER`` (PagerDuty → Slack → Twilio) when absent so
  every existing deploy keeps working without a migration step.
* ``user_contact_mappings`` — one row per user. Carries
  ``slack_user_id`` / ``pagerduty_user_id`` / ``twilio_phone``. The
  on-call delivery service prefers these values over the
  ``ShiftRoster.contact_handle`` when present, but the legacy path
  still works (no behaviour change for clinics that never visit the
  Escalation Policy editor).

Why additive (no destructive changes)
-------------------------------------
Both tables are net-new; nothing is renamed or dropped. The fallback
path through ``DEFAULT_ADAPTER_ORDER`` + ``contact_handle`` is
preserved verbatim.

Cross-dialect safe — every column is nullable text/JSON-as-TEXT or
integer/string with explicit ``nullable=False`` only on PK + clinic
scope. Soft FK to ``users.id`` (no ``ON DELETE`` cascade) so deleting a
user does NOT cascade-clear the mapping (audit history stays intact).
SQLite-friendly.

Revision ID: 075_escalation_policy
Revises: 074_oncall_delivery_fields
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "075_escalation_policy"
down_revision = "074_oncall_delivery_fields"
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

    if not _has_table(bind, "escalation_policies"):
        op.create_table(
            "escalation_policies",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("clinic_id", sa.String(36), nullable=False, index=True),
            sa.Column("dispatch_order", sa.Text(), nullable=True),       # JSON array
            sa.Column("surface_overrides", sa.Text(), nullable=True),    # JSON object
            sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("updated_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.String(64), nullable=False),
            sa.Column("updated_at", sa.String(64), nullable=False),
            sa.UniqueConstraint("clinic_id", name="uq_escalation_policies_clinic"),
        )

    if not _has_table(bind, "user_contact_mappings"):
        op.create_table(
            "user_contact_mappings",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("user_id", sa.String(64), nullable=False, index=True),
            sa.Column("clinic_id", sa.String(36), nullable=False, index=True),
            sa.Column("slack_user_id", sa.String(64), nullable=True),
            sa.Column("pagerduty_user_id", sa.String(64), nullable=True),
            sa.Column("twilio_phone", sa.String(32), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("updated_by", sa.String(64), nullable=True),
            sa.Column("created_at", sa.String(64), nullable=False),
            sa.Column("updated_at", sa.String(64), nullable=False),
            sa.UniqueConstraint("user_id", name="uq_user_contact_mappings_user"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    for table in ("user_contact_mappings", "escalation_policies"):
        if _has_table(bind, table):
            try:
                op.drop_table(table)
            except Exception:
                pass
