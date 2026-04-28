"""Agent Marketplace — per-clinic Stripe SKU subscription table.

Creates ``agent_subscriptions`` so the marketplace can wire each
``AgentDefinition`` (in-process, code-shipped) to a real Stripe Subscription
once a clinic admin completes Checkout. Rows are created in ``test_pending``
state by the checkout endpoint and flipped to ``active`` by the
``checkout.session.completed`` webhook handler.

Live billing is gated by a separate operator action — see
``app.services.stripe_skus._get_client()`` for the ``sk_live_*`` refusal.
This migration is intentionally schema-only; nothing in here mints prices
or talks to Stripe.

Design contract
---------------
* Additive only — one new table, nothing else touched.
* SQLite-safe — uses ``op.create_table`` (no raw SQL), all column types
  are stdlib SQLAlchemy types.
* Indexes on the four query dimensions: ``clinic_id`` (per-tenant filter),
  ``agent_id`` (per-agent filter), ``status`` (active vs canceled lookups),
  ``stripe_subscription_id`` (webhook reverse-lookup).
* Composite unique on ``(clinic_id, agent_id)`` mirrors the application
  invariant: at most one subscription row per clinic per SKU.

Revision ID: 050_agent_subscriptions
Revises: 049_merge_048_heads
Create Date: 2026-04-28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "050_agent_subscriptions"
down_revision = "049_merge_048_heads"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


# ── Upgrade ──────────────────────────────────────────────────────────────────

def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "agent_subscriptions"):
        return

    op.create_table(
        "agent_subscriptions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "clinic_id",
            sa.String(36),
            sa.ForeignKey("clinics.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("agent_id", sa.String(64), nullable=False, index=True),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
        sa.Column("stripe_price_id", sa.String(255), nullable=True),
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
        sa.Column(
            "status",
            sa.String(32),
            nullable=False,
            server_default="test_pending",
            index=True,
        ),
        sa.Column("monthly_price_gbp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("canceled_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "clinic_id", "agent_id", name="uq_agent_subscription_clinic_agent"
        ),
    )

    # Alembic only emits indexes when explicitly created; mirror what
    # SQLAlchemy's create_all() would emit so Postgres deployments line up
    # with the SQLite reset_database() path used by the test suite.
    op.create_index(
        "ix_agent_subscriptions_clinic_id", "agent_subscriptions", ["clinic_id"]
    )
    op.create_index(
        "ix_agent_subscriptions_agent_id", "agent_subscriptions", ["agent_id"]
    )
    op.create_index(
        "ix_agent_subscriptions_status", "agent_subscriptions", ["status"]
    )
    op.create_index(
        "ix_agent_subscriptions_stripe_sub_id",
        "agent_subscriptions",
        ["stripe_subscription_id"],
    )


# ── Downgrade ────────────────────────────────────────────────────────────────

def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "agent_subscriptions"):
        return
    for ix in (
        "ix_agent_subscriptions_stripe_sub_id",
        "ix_agent_subscriptions_status",
        "ix_agent_subscriptions_agent_id",
        "ix_agent_subscriptions_clinic_id",
    ):
        try:
            op.drop_index(ix, table_name="agent_subscriptions")
        except Exception:
            pass
    op.drop_table("agent_subscriptions")
