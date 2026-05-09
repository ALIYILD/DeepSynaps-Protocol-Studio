"""Widen audit_events.event_id and audit_events.action to VARCHAR(255).

The original model declared VARCHAR(32)/(64) but real values reach 60+ and
82+ chars (e.g. ``qeeg-analyzer_loaded-<uuid>-<ts>-<rand>``). SQLite never
enforced the length, so the drift was invisible until the SQLite→Postgres
cutover (PR #641 era) hit StringDataRightTruncation on the audit_events
copy.

The columns were widened on the live MPG cluster directly during cutover
prep. This migration formalizes the change so any subsequent fresh
deploy lands at the same width.

Revision ID: 099_widen_audit_event_columns
Revises: 098_medical_image_assets
Create Date: 2026-05-08
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "099_widen_audit_event_columns"
down_revision = "098_medical_image_assets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite ignores VARCHAR length, so we only need the ALTER on Postgres.
    if op.get_bind().dialect.name != "postgresql":
        return
    op.alter_column(
        "audit_events", "event_id",
        existing_type=sa.String(64), type_=sa.String(255),
    )
    op.alter_column(
        "audit_events", "action",
        existing_type=sa.String(32), type_=sa.String(255),
    )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    # Narrowing could fail if rows already exceed the target width.
    # Use USING to truncate; best-effort.
    op.alter_column(
        "audit_events", "event_id",
        existing_type=sa.String(255), type_=sa.String(64),
        postgresql_using="LEFT(event_id, 64)",
    )
    op.alter_column(
        "audit_events", "action",
        existing_type=sa.String(255), type_=sa.String(32),
        postgresql_using="LEFT(action, 32)",
    )
