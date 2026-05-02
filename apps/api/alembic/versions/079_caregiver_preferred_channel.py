"""Per-Caregiver Channel Preference launch-audit (2026-05-01).

Adds an optional ``preferred_channel`` column to
``caregiver_digest_preferences`` so each caregiver can override the
clinic's per-surface dispatch chain shipped in #374
(EscalationPolicy.dispatch_order / surface_overrides).

Today the dispatch order is per-clinic only — every caregiver in a
given clinic gets the same chain. THIS migration adds the per-caregiver
override knob: the worker resolves the chain as
``[caregiver.preferred_channel, *clinic_chain]`` with dedup, so the
caregiver's preferred adapter is tried first while the clinic's
escalation order remains intact as the fallback.

Why additive (no destructive changes)
-------------------------------------
The new column is nullable with no default, so existing rows continue
to behave identically (NULL means "no caregiver-level override; use the
clinic chain as-is"). The validator in the router rejects unknown
values against
:data:`app.services.oncall_delivery.ADAPTER_CHANNEL.values()` so a
malformed PUT can never end up in the column. Cross-dialect safe — the
column is plain TEXT/VARCHAR.

Revision ID: 079_caregiver_preferred_channel
Revises: 078_merge_cleaning_decisions_and_caregiver_digest
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "079_caregiver_preferred_channel"
down_revision = "078_merge_cleaning_decisions_and_caregiver_digest"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, name: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return name in set(insp.get_table_names())
    except Exception:
        return False


def _has_column(bind: sa.engine.Engine, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    try:
        return column in {c["name"] for c in insp.get_columns(table)}
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    # Defensive: only add the column when the table exists AND the column
    # is not already present. Concurrent sessions may have run the merge
    # branch (#078) ahead of us; this guard keeps the migration idempotent
    # so re-runs after `alembic upgrade head` are safe.
    if not _has_table(bind, "caregiver_digest_preferences"):
        return
    if _has_column(bind, "caregiver_digest_preferences", "preferred_channel"):
        return

    with op.batch_alter_table("caregiver_digest_preferences") as batch:
        batch.add_column(
            sa.Column(
                "preferred_channel", sa.String(16), nullable=True
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "caregiver_digest_preferences"):
        return
    if not _has_column(bind, "caregiver_digest_preferences", "preferred_channel"):
        return
    try:
        with op.batch_alter_table("caregiver_digest_preferences") as batch:
            batch.drop_column("preferred_channel")
    except Exception:
        pass
