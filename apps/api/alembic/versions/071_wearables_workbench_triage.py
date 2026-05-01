"""Wearables Workbench launch-audit (2026-05-01) — triage columns.

Adds the canonical clinician triage lifecycle columns to
``wearable_alert_flags`` so the new
``/api/v1/wearables/workbench/flags/...`` router can record the
ack → escalate (optional) → resolve transcript per row without
overloading the legacy ``dismissed`` / ``reviewed_at`` / ``reviewed_by``
fields used by the existing ``/api/v1/wearables/alerts/{id}/dismiss``
endpoint.

Why additive
------------
The existing ``dismissed`` flag is a binary "off / on" suppression and
``reviewed_at`` / ``reviewed_by`` tell us who pressed it. That model
collapsed the regulator-credible four-state workflow (``open`` →
``acknowledged`` → ``escalated`` → ``resolved``) into a single boolean.
The Workbench surface needs the full transcript so the audit trail can
prove that:

* a clinician acknowledged the alert with a note,
* (optionally) escalated it to the AE Hub with a draft AdverseEvent
  reference,
* and finally resolved it with a note — at which point the row becomes
  immutable.

Adding columns is the cheapest way to deliver that without breaking the
legacy dismiss endpoint which still flips the binary flag.

Cross-dialect safe — every column is nullable text/datetime; no FK
constraints (the AdverseEvent linkage is intentionally a soft FK so the
audit row survives a future AE deletion). SQLite-friendly.

Revision ID: 071_wearables_workbench_triage
Revises: 070_patient_home_device_registrations
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "071_wearables_workbench_triage"
down_revision = "070_patient_home_device_registrations"
branch_labels = None
depends_on = None


_NEW_COLUMNS: tuple[tuple[str, sa.types.TypeEngine, bool], ...] = (
    # status: open | acknowledged | escalated | resolved
    ("workbench_status", sa.String(20), True),
    ("acknowledged_at", sa.DateTime(), True),
    ("acknowledged_by", sa.String(64), True),
    ("acknowledge_note", sa.Text(), True),
    ("escalated_at", sa.DateTime(), True),
    ("escalated_by", sa.String(64), True),
    ("escalation_note", sa.Text(), True),
    ("escalation_ae_id", sa.String(36), True),
    ("resolved_at", sa.DateTime(), True),
    ("resolved_by", sa.String(64), True),
    ("resolve_note", sa.Text(), True),
)


def _has_column(bind: sa.engine.Engine, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    try:
        cols = {c["name"] for c in insp.get_columns(table)}
    except sa.exc.NoSuchTableError:
        return False
    return column in cols


def upgrade() -> None:
    bind = op.get_bind()

    # Defensive: the table is created by an earlier migration. If it does not
    # exist (e.g. a stripped test harness), do nothing — the model definition
    # alone is enough for the SQLAlchemy DDL fallback path used by the
    # in-memory SQLite test fixture, and a no-op is safer than failing the
    # full migration chain on a partial schema.
    insp = sa.inspect(bind)
    try:
        existing = {c["name"] for c in insp.get_columns("wearable_alert_flags")}
    except sa.exc.NoSuchTableError:
        return

    for col_name, col_type, nullable in _NEW_COLUMNS:
        if col_name in existing:
            continue
        op.add_column(
            "wearable_alert_flags",
            sa.Column(col_name, col_type, nullable=nullable),
        )

    # Index workbench_status so the triage-queue list query (which always
    # filters by status) hits an index instead of a full table scan.
    if _has_column(bind, "wearable_alert_flags", "workbench_status"):
        try:
            insp = sa.inspect(bind)
            idx_names = {ix["name"] for ix in insp.get_indexes("wearable_alert_flags")}
            if "ix_waf_workbench_status" not in idx_names:
                op.create_index(
                    "ix_waf_workbench_status",
                    "wearable_alert_flags",
                    ["workbench_status"],
                )
        except sa.exc.NoSuchTableError:
            return


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    try:
        existing_indexes = {ix["name"] for ix in insp.get_indexes("wearable_alert_flags")}
    except sa.exc.NoSuchTableError:
        return

    if "ix_waf_workbench_status" in existing_indexes:
        op.drop_index("ix_waf_workbench_status", table_name="wearable_alert_flags")

    try:
        existing = {c["name"] for c in insp.get_columns("wearable_alert_flags")}
    except sa.exc.NoSuchTableError:
        return

    for col_name, _t, _n in _NEW_COLUMNS:
        if col_name in existing:
            try:
                op.drop_column("wearable_alert_flags", col_name)
            except Exception:
                # SQLite < 3.25 cannot drop columns. The migration is
                # forward-only in that case; tests recreate the schema from
                # the model so downgrade is rarely exercised.
                pass
