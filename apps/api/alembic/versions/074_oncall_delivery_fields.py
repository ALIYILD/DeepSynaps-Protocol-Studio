"""On-call delivery adapter wire-up (2026-05-01) — oncall_pages provider columns.

Closes the LAST gap of the on-call escalation chain:
``Care Team Coverage (#357) → Auto-Page Worker (#372) → THIS PR``.

The auto-page worker (#372) stamps every page ``delivery_status='queued'``
because no real Slack/Twilio/PagerDuty adapter exists. THIS migration
extends the ``oncall_pages`` mirror table with the two columns the new
adapter dispatch service writes:

* ``external_id``  — provider-side message id returned by the adapter on
  a confirming 2xx (Slack ``ts``, Twilio message SID, PagerDuty
  ``dedup_key``). NULL until a real adapter has confirmed delivery.
* ``delivery_note`` — free-form per-row delivery transcript (e.g.
  ``"slack=403, twilio=timeout, pagerduty=429"`` for an all-failed row,
  or ``"MOCK: simulated send via mock-mode flag"`` for the demo path).
  TEXT so failed-adapter chains can be inspected without truncation.

Design contract
---------------
* Additive only — both columns are NULL-able with no server defaults so
  existing rows stay valid (``delivery_status='queued'`` carries forward).
* Cross-dialect — stdlib SQLAlchemy types only; runs against SQLite test
  harness and Postgres production identically.
* Defensive — ``upgrade`` checks for column existence before adding
  (idempotent across rerun / partial migrations); ``downgrade`` drops in
  reverse order.

Revision ID: 074_oncall_delivery_fields
Revises: 073_clinician_wellness_triage
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "074_oncall_delivery_fields"
down_revision = "073_clinician_wellness_triage"
branch_labels = None
depends_on = None


_TABLE = "oncall_pages"

_COLUMNS_TO_ADD: list[tuple[str, sa.Column]] = [
    (
        "external_id",
        sa.Column("external_id", sa.String(128), nullable=True),
    ),
    (
        "delivery_note",
        sa.Column("delivery_note", sa.Text(), nullable=True),
    ),
]


def _existing_columns(bind: sa.engine.Engine, table_name: str) -> set[str]:
    insp = sa.inspect(bind)
    if table_name not in insp.get_table_names():
        return set()
    return {col["name"] for col in insp.get_columns(table_name)}


# ── Upgrade ──────────────────────────────────────────────────────────────────


def upgrade() -> None:
    bind = op.get_bind()
    existing = _existing_columns(bind, _TABLE)
    if not existing:
        # oncall_pages missing entirely — 072_care_team_coverage must run
        # first. No-op so a fresh database run-through stays consistent.
        return

    for name, column in _COLUMNS_TO_ADD:
        if name in existing:
            continue
        op.add_column(_TABLE, column)


# ── Downgrade ────────────────────────────────────────────────────────────────


def downgrade() -> None:
    bind = op.get_bind()
    existing = _existing_columns(bind, _TABLE)
    if not existing:
        return

    for name, _column in reversed(_COLUMNS_TO_ADD):
        if name in existing:
            op.drop_column(_TABLE, name)
