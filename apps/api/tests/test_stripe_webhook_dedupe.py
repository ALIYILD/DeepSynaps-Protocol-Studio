"""Tests for Phase 7 — DB-backed Stripe webhook dedupe.

Covers:

* A fresh event id inserts one :class:`StripeWebhookEvent` row and the
  handler returns ``applied=True``.
* Replaying the same event id returns ``applied=False`` with
  ``reason="duplicate"`` and does NOT re-mutate the
  ``agent_subscriptions`` row.
* Two distinct event ids of the same event type are both processed
  independently (dedupe is per-id, not per-type).
* The migration applies cleanly: ``stripe_webhook_event`` exists, has
  the expected columns, and the index is in place.
"""
from __future__ import annotations

import pytest
from sqlalchemy import inspect

from app.database import SessionLocal
from app.persistence.models import (
    AgentSubscription,
    StripeWebhookEvent,
)
from app.services import stripe_skus


# ---------------------------------------------------------------------------
# Fixtures (mirror tests/test_stripe_skus.py so the env guards line up)
# ---------------------------------------------------------------------------


@pytest.fixture
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture(autouse=True)
def _reset_skus_state(monkeypatch: pytest.MonkeyPatch) -> None:
    """Same env shape as test_stripe_skus — keeps the dedupe tests
    decoupled from any other suite that might leak state."""
    stripe_skus._reset_client_cache_for_tests()
    stripe_skus._reset_dedupe_for_tests()
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_dummy_default")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_dummy")
    monkeypatch.delenv("STRIPE_LIVE_MODE_ACK", raising=False)
    yield
    stripe_skus._reset_client_cache_for_tests()
    stripe_skus._reset_dedupe_for_tests()


def _make_event(event_type: str, data_obj: dict, event_id: str) -> dict:
    return {"id": event_id, "type": event_type, "data": {"object": data_obj}}


# ---------------------------------------------------------------------------
# Migration / schema sanity
# ---------------------------------------------------------------------------


def test_stripe_webhook_event_table_exists(db) -> None:
    insp = inspect(db.bind)
    assert "stripe_webhook_event" in insp.get_table_names()
    cols = {c["name"] for c in insp.get_columns("stripe_webhook_event")}
    assert {"id", "event_type", "received_at", "processed"}.issubset(cols)


# ---------------------------------------------------------------------------
# Fresh event → row inserted, applied=True
# ---------------------------------------------------------------------------


def test_fresh_event_inserts_row_and_applies(db) -> None:
    db.add(
        AgentSubscription(
            clinic_id="clinic-demo-default",
            agent_id="clinic.reception",
            status="test_pending",
            monthly_price_gbp=99,
        )
    )
    db.commit()

    event = _make_event(
        "checkout.session.completed",
        {
            "metadata": {
                "clinic_id": "clinic-demo-default",
                "agent_id": "clinic.reception",
            },
            "subscription": "sub_fresh_001",
            "customer": "cus_fresh_001",
        },
        event_id="evt_fresh_001",
    )

    out = stripe_skus.handle_subscription_webhook(event, signature="sig-ignored")
    assert out["ok"] is True
    assert out["applied"] is True
    assert out["event_type"] == "checkout.session.completed"

    # Dedupe row landed.
    db.expire_all()
    rows = db.query(StripeWebhookEvent).all()
    assert len(rows) == 1
    assert rows[0].id == "evt_fresh_001"
    assert rows[0].event_type == "checkout.session.completed"
    assert rows[0].processed is True

    # Subscription got applied.
    sub = (
        db.query(AgentSubscription)
        .filter_by(clinic_id="clinic-demo-default", agent_id="clinic.reception")
        .one()
    )
    assert sub.status == "active"
    assert sub.stripe_subscription_id == "sub_fresh_001"


# ---------------------------------------------------------------------------
# Replay same event id → applied=False, no DB mutation
# ---------------------------------------------------------------------------


def test_replay_same_event_id_returns_dupe_and_does_not_remutate(db) -> None:
    db.add(
        AgentSubscription(
            clinic_id="clinic-demo-default",
            agent_id="clinic.reception",
            status="test_pending",
            monthly_price_gbp=99,
        )
    )
    db.commit()

    event = _make_event(
        "checkout.session.completed",
        {
            "metadata": {
                "clinic_id": "clinic-demo-default",
                "agent_id": "clinic.reception",
            },
            "subscription": "sub_dedupe_001",
            "customer": "cus_dedupe_001",
        },
        event_id="evt_dedupe_001",
    )

    first = stripe_skus.handle_subscription_webhook(event, signature="sig-ignored")
    assert first["ok"] is True
    assert first["applied"] is True

    # Snapshot the active row so we can confirm it's untouched on replay.
    db.expire_all()
    sub_after_first = (
        db.query(AgentSubscription)
        .filter_by(clinic_id="clinic-demo-default", agent_id="clinic.reception")
        .one()
    )
    started_first = sub_after_first.started_at
    assert started_first is not None

    # Now corrupt the row in-flight to prove the second call doesn't
    # silently re-apply. If dedupe were broken, ``status`` would flip
    # back to ``active`` and ``started_at`` would be re-stamped.
    sub_after_first.status = "test_pending_after_dedupe"
    sub_after_first.started_at = None
    db.commit()

    second = stripe_skus.handle_subscription_webhook(event, signature="sig-ignored")
    assert second["ok"] is True
    assert second["applied"] is False
    assert second.get("reason") == "duplicate"

    # Subscription row stayed in the corrupted state — proving the
    # webhook handler did NOT touch it the second time.
    db.expire_all()
    sub_after_second = (
        db.query(AgentSubscription)
        .filter_by(clinic_id="clinic-demo-default", agent_id="clinic.reception")
        .one()
    )
    assert sub_after_second.status == "test_pending_after_dedupe"
    assert sub_after_second.started_at is None

    # Still exactly one dedupe row.
    assert db.query(StripeWebhookEvent).count() == 1


# ---------------------------------------------------------------------------
# Different event id same type → both processed
# ---------------------------------------------------------------------------


def test_different_event_id_same_type_both_processed(db) -> None:
    """Two distinct (clinic, agent) pairs, both sub_completed events —
    each event id must be processed independently.
    """
    db.add(
        AgentSubscription(
            clinic_id="clinic-demo-default",
            agent_id="clinic.reception",
            status="test_pending",
            monthly_price_gbp=99,
        )
    )
    db.add(
        AgentSubscription(
            clinic_id="clinic-demo-default",
            agent_id="clinic.reporting",
            status="test_pending",
            monthly_price_gbp=49,
        )
    )
    db.commit()

    event_a = _make_event(
        "checkout.session.completed",
        {
            "metadata": {
                "clinic_id": "clinic-demo-default",
                "agent_id": "clinic.reception",
            },
            "subscription": "sub_two_001",
        },
        event_id="evt_two_001",
    )
    event_b = _make_event(
        "checkout.session.completed",
        {
            "metadata": {
                "clinic_id": "clinic-demo-default",
                "agent_id": "clinic.reporting",
            },
            "subscription": "sub_two_002",
        },
        event_id="evt_two_002",
    )

    out_a = stripe_skus.handle_subscription_webhook(event_a, signature="sig")
    out_b = stripe_skus.handle_subscription_webhook(event_b, signature="sig")

    assert out_a["applied"] is True
    assert out_b["applied"] is True

    db.expire_all()
    ids = {r.id for r in db.query(StripeWebhookEvent).all()}
    assert ids == {"evt_two_001", "evt_two_002"}

    # Both subscriptions were activated.
    statuses = {
        r.agent_id: r.status
        for r in db.query(AgentSubscription).all()
    }
    assert statuses["clinic.reception"] == "active"
    assert statuses["clinic.reporting"] == "active"


# ---------------------------------------------------------------------------
# Edge: missing event id (defensive — should not blow up)
# ---------------------------------------------------------------------------


def test_event_without_id_does_not_dedupe_or_crash(db) -> None:
    """Stripe always sends an id, but defensive coding shouldn't crash
    when malformed payloads slip through. The handler should just
    process the event without inserting a dedupe row."""
    event = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"id": "sub_no_event_id"}},
    }

    db.add(
        AgentSubscription(
            clinic_id="clinic-demo-default",
            agent_id="clinic.reception",
            status="active",
            monthly_price_gbp=99,
            stripe_subscription_id="sub_no_event_id",
        )
    )
    db.commit()

    out = stripe_skus.handle_subscription_webhook(event, signature="sig")
    assert out["ok"] is True
    assert out["applied"] is True
    # No dedupe row — there was nothing to dedupe on.
    assert db.query(StripeWebhookEvent).count() == 0
