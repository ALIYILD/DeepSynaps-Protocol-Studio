"""Phase 7 — agent infrastructure: budgets, webhook dedupe, prompt overrides.

Three Phase-7 features ship in this single migration so they roll forward
(and back) atomically:

1. **Per-package token / cost budgets**
   * Adds ``tokens_in_used``, ``tokens_out_used``, ``cost_pence`` columns
     to ``agent_run_audit`` (defaulting to 0 — legacy rows are unaffected).
   * Adds ``package_token_budget`` table with one row per logical package.
   * Seeds the three default tiers we ship at GA: ``free``,
     ``clinician_pro``, ``enterprise``.

2. **DB-backed Stripe webhook dedupe**
   * Adds ``stripe_webhook_event`` keyed on Stripe event id. Replaces the
     prior in-memory dedupe set in ``app.services.stripe_skus`` so a
     multi-process / blue-green deploy can no longer double-apply a
     redelivered event.

3. **Per-clinic agent prompt overrides**
   * Adds ``agent_prompt_override`` table. Resolution: clinic-scoped
     override > global override (clinic_id NULL) > registry default.
   * Indexed on ``(agent_id, clinic_id, enabled)`` to make the runner's
     hot lookup constant-time.

Design contract
---------------
* Additive only — three new tables + three nullable columns on the
  existing ``agent_run_audit``. No destructive change.
* SQLite-safe — every column type is stdlib SQLAlchemy; ``op.add_column``
  with a server_default keeps the SQLite ALTER from rejecting the
  back-fill on existing rows.
* Seed defaults via ``op.bulk_insert`` (NOT raw SQL) so the migration
  travels cleanly across SQLite (test) and Postgres (prod).

Revision ID: 051_phase7_agent_infra
Revises: 050_agent_subscriptions
Create Date: 2026-04-28
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "051_phase7_agent_infra"
down_revision = "050_agent_subscriptions"
branch_labels = None
depends_on = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


def _has_column(bind: sa.engine.Engine, table_name: str, column_name: str) -> bool:
    insp = sa.inspect(bind)
    if table_name not in insp.get_table_names():
        return False
    return any(c["name"] == column_name for c in insp.get_columns(table_name))


def _now() -> datetime:
    """UTC ``datetime`` — written into the seed rows below so the audit
    columns line up with what the SQLAlchemy ``default=`` lambdas would
    produce on ORM-driven inserts."""
    return datetime.now(timezone.utc)


# ── Default budget seed data ─────────────────────────────────────────────────
#
# Three packages we ship at GA. The numbers below are decision-support
# guard-rails, not a real bill — operators can tune the rows at runtime
# without a code release.
#
# input price = 0.001 pence / token
# output price = 0.003 pence / token
# (See ``app.services.agents.audit._compute_cost_pence``.)


_DEFAULT_BUDGETS = [
    {
        "id": "pkg_budget_free",
        "package_id": "free",
        "monthly_tokens_in_cap": 50_000,
        "monthly_tokens_out_cap": 10_000,
        "monthly_cost_pence_cap": 500,  # £5
    },
    {
        "id": "pkg_budget_clinician_pro",
        "package_id": "clinician_pro",
        "monthly_tokens_in_cap": 1_000_000,
        "monthly_tokens_out_cap": 200_000,
        "monthly_cost_pence_cap": 5_000,  # £50
    },
    {
        "id": "pkg_budget_enterprise",
        "package_id": "enterprise",
        "monthly_tokens_in_cap": 5_000_000,
        "monthly_tokens_out_cap": 1_000_000,
        "monthly_cost_pence_cap": 20_000,  # £200
    },
]


# ── Upgrade ──────────────────────────────────────────────────────────────────


def upgrade() -> None:
    bind = op.get_bind()

    # 1) ALTER agent_run_audit — add token + cost columns ------------------
    # Each column is added independently with a fall-through guard so a
    # partial-applied state from a previous failed run can heal.
    if _has_table(bind, "agent_run_audit"):
        if not _has_column(bind, "agent_run_audit", "tokens_in_used"):
            op.add_column(
                "agent_run_audit",
                sa.Column(
                    "tokens_in_used",
                    sa.Integer(),
                    nullable=True,
                    server_default="0",
                ),
            )
        if not _has_column(bind, "agent_run_audit", "tokens_out_used"):
            op.add_column(
                "agent_run_audit",
                sa.Column(
                    "tokens_out_used",
                    sa.Integer(),
                    nullable=True,
                    server_default="0",
                ),
            )
        if not _has_column(bind, "agent_run_audit", "cost_pence"):
            op.add_column(
                "agent_run_audit",
                sa.Column(
                    "cost_pence",
                    sa.Integer(),
                    nullable=True,
                    server_default="0",
                ),
            )

    # 2) CREATE package_token_budget + seed --------------------------------
    if not _has_table(bind, "package_token_budget"):
        budget_table = op.create_table(
            "package_token_budget",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("package_id", sa.String(64), nullable=False, index=True),
            sa.Column(
                "monthly_tokens_in_cap",
                sa.Integer(),
                nullable=False,
                server_default="1000000",
            ),
            sa.Column(
                "monthly_tokens_out_cap",
                sa.Integer(),
                nullable=False,
                server_default="200000",
            ),
            sa.Column(
                "monthly_cost_pence_cap",
                sa.Integer(),
                nullable=False,
                server_default="5000",
            ),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint(
                "package_id", name="uq_package_token_budget_package_id"
            ),
        )
        op.create_index(
            "ix_package_token_budget_package_id",
            "package_token_budget",
            ["package_id"],
        )

        now = _now()
        op.bulk_insert(
            budget_table,
            [{**row, "created_at": now, "updated_at": now} for row in _DEFAULT_BUDGETS],
        )

    # 3) CREATE stripe_webhook_event ---------------------------------------
    if not _has_table(bind, "stripe_webhook_event"):
        op.create_table(
            "stripe_webhook_event",
            sa.Column("id", sa.String(255), primary_key=True),
            sa.Column("event_type", sa.String(128), nullable=False, index=True),
            sa.Column("received_at", sa.DateTime(), nullable=False),
            sa.Column(
                "processed",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("1"),
            ),
        )
        op.create_index(
            "ix_stripe_webhook_event_event_type",
            "stripe_webhook_event",
            ["event_type"],
        )

    # 4) CREATE agent_prompt_override --------------------------------------
    if not _has_table(bind, "agent_prompt_override"):
        op.create_table(
            "agent_prompt_override",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("agent_id", sa.String(64), nullable=False, index=True),
            sa.Column("clinic_id", sa.String(64), nullable=True, index=True),
            sa.Column("system_prompt", sa.Text(), nullable=False),
            sa.Column(
                "version", sa.Integer(), nullable=False, server_default="1"
            ),
            sa.Column(
                "enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("1"),
                index=True,
            ),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column(
                "created_by",
                sa.String(36),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index(
            "ix_agent_prompt_override_agent_id",
            "agent_prompt_override",
            ["agent_id"],
        )
        op.create_index(
            "ix_agent_prompt_override_clinic_id",
            "agent_prompt_override",
            ["clinic_id"],
        )
        op.create_index(
            "ix_agent_prompt_override_enabled",
            "agent_prompt_override",
            ["enabled"],
        )
        op.create_index(
            "ix_agent_prompt_override_resolver",
            "agent_prompt_override",
            ["agent_id", "clinic_id", "enabled"],
        )


# ── Downgrade ────────────────────────────────────────────────────────────────


def downgrade() -> None:
    bind = op.get_bind()

    if _has_table(bind, "agent_prompt_override"):
        for ix in (
            "ix_agent_prompt_override_resolver",
            "ix_agent_prompt_override_enabled",
            "ix_agent_prompt_override_clinic_id",
            "ix_agent_prompt_override_agent_id",
        ):
            try:
                op.drop_index(ix, table_name="agent_prompt_override")
            except Exception:
                pass
        op.drop_table("agent_prompt_override")

    if _has_table(bind, "stripe_webhook_event"):
        try:
            op.drop_index(
                "ix_stripe_webhook_event_event_type",
                table_name="stripe_webhook_event",
            )
        except Exception:
            pass
        op.drop_table("stripe_webhook_event")

    if _has_table(bind, "package_token_budget"):
        try:
            op.drop_index(
                "ix_package_token_budget_package_id",
                table_name="package_token_budget",
            )
        except Exception:
            pass
        op.drop_table("package_token_budget")

    # ALTER columns are dropped last so the audit table stays consistent
    # under partial-rollback. SQLite doesn't support DROP COLUMN before
    # 3.35 so we wrap each in a try/except — the test harness's SQLite
    # is modern enough but production Postgres is the contract.
    if _has_table(bind, "agent_run_audit"):
        for col in ("cost_pence", "tokens_out_used", "tokens_in_used"):
            try:
                op.drop_column("agent_run_audit", col)
            except Exception:
                pass
