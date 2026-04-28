"""Tests for Phase 10 — admin Stripe webhook replay endpoint.

Covers:

* Non-admin callers (clinician, clinic-bound admin) → 403.
* Admin with a malformed event_id (no ``evt_`` prefix) → 400.
* Admin with a valid event_id whose Stripe.Event.retrieve returns a fake
  event and whose handler succeeds → 200, ``ok: true``.
* Admin with a valid event_id whose Stripe.Event.retrieve raises
  ``stripe.error.InvalidRequestError("No such event")`` → 404.
* Admin with a valid event_id whose handler raises mid-apply → 200 with
  ``ok: false, error: ...`` in the envelope (matches the existing
  envelope-style of :func:`handle_subscription_webhook`; the operator
  always wants to see the structured replay record).

The dedupe row is intentionally NOT touched by the replay path — the
service calls ``_apply_webhook`` directly to bypass the dedupe gate. We
assert that on the success path.
"""
from __future__ import annotations

import pytest
import stripe
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import SessionLocal
from app.main import app
from app.persistence.models import (
    AgentSubscription,
    StripeWebhookEvent,
)
from app.services import stripe_skus


# ---------------------------------------------------------------------------
# Fixtures
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
    """Mirror tests/test_stripe_skus.py — ensure the live-key guardrail
    sees a sk_test_* key and the client cache is fresh per test."""
    stripe_skus._reset_client_cache_for_tests()
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_dummy_replay")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_dummy")
    monkeypatch.delenv("STRIPE_LIVE_MODE_ACK", raising=False)
    yield
    stripe_skus._reset_client_cache_for_tests()


@pytest.fixture
def super_admin_actor() -> AuthenticatedActor:
    """Cross-clinic super-admin: role=admin AND clinic_id is None."""
    return AuthenticatedActor(
        actor_id="actor-super-admin",
        display_name="Super Admin",
        role="admin",  # type: ignore[arg-type]
        package_id="enterprise",
        clinic_id=None,
    )


@pytest.fixture
def clinic_admin_actor() -> AuthenticatedActor:
    """A clinic-bound admin — should be rejected by the super-admin gate."""
    return AuthenticatedActor(
        actor_id="actor-admin-demo",
        display_name="Clinic Admin",
        role="admin",  # type: ignore[arg-type]
        package_id="enterprise",
        clinic_id="clinic-demo-default",
    )


@pytest.fixture
def clinician_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-clinician-demo",
        display_name="Clinician",
        role="clinician",  # type: ignore[arg-type]
        package_id="clinician_pro",
        clinic_id="clinic-demo-default",
    )


def _client_with(actor: AuthenticatedActor) -> TestClient:
    """Build a TestClient that injects ``actor`` for auth dependency."""
    app.dependency_overrides[get_authenticated_actor] = lambda: actor
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_authenticated_actor, None)


# ---------------------------------------------------------------------------
# Auth gating
# ---------------------------------------------------------------------------


def test_replay_rejects_clinician(clinician_actor: AuthenticatedActor) -> None:
    client = _client_with(clinician_actor)
    resp = client.post(
        "/api/v1/agent-billing/admin/webhook-replay",
        json={"event_id": "evt_test_abc123"},
    )
    assert resp.status_code == 403


def test_replay_rejects_clinic_bound_admin(
    clinic_admin_actor: AuthenticatedActor,
) -> None:
    client = _client_with(clinic_admin_actor)
    resp = client.post(
        "/api/v1/agent-billing/admin/webhook-replay",
        json={"event_id": "evt_test_abc123"},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body.get("code") == "ops_admin_required"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def test_replay_rejects_malformed_event_id(
    super_admin_actor: AuthenticatedActor,
) -> None:
    client = _client_with(super_admin_actor)
    # ``min_length=5`` on the schema would 422 anything shorter; use a
    # value that passes schema validation but fails the prefix gate.
    resp = client.post(
        "/api/v1/agent-billing/admin/webhook-replay",
        json={"event_id": "not_an_evt_id"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body.get("code") == "invalid_event_id"


# ---------------------------------------------------------------------------
# Happy path — fake Stripe SDK + fake _apply_webhook
# ---------------------------------------------------------------------------


def test_replay_happy_path_applies(
    super_admin_actor: AuthenticatedActor,
    db,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Replay re-fetches via stripe.Event.retrieve, calls _apply_webhook
    directly, and returns ``ok=True`` with the apply result. The dedupe
    row (if present) is intentionally untouched — we assert that the
    pre-existing dedupe row survives the replay unchanged.
    """
    # Seed a subscription row + a pre-existing dedupe row simulating a
    # historic delivery whose apply we now want to replay.
    db.add(
        AgentSubscription(
            clinic_id="clinic-demo-default",
            agent_id="clinic.reception",
            status="test_pending",
            monthly_price_gbp=99,
        )
    )
    db.add(
        StripeWebhookEvent(
            id="evt_replay_happy_001",
            event_type="checkout.session.completed",
            processed=True,
        )
    )
    db.commit()

    fake_event = {
        "id": "evt_replay_happy_001",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "metadata": {
                    "clinic_id": "clinic-demo-default",
                    "agent_id": "clinic.reception",
                },
                "subscription": "sub_replay_001",
                "customer": "cus_replay_001",
            }
        },
    }

    captured: dict = {}

    def fake_retrieve(event_id, *args, **kwargs):
        captured["event_id"] = event_id
        return fake_event

    monkeypatch.setattr(stripe.Event, "retrieve", staticmethod(fake_retrieve))

    client = _client_with(super_admin_actor)
    resp = client.post(
        "/api/v1/agent-billing/admin/webhook-replay",
        json={"event_id": "evt_replay_happy_001"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["event_id"] == "evt_replay_happy_001"
    assert body["event_type"] == "checkout.session.completed"
    assert body["result"]["applied"] is True
    assert "replayed_at" in body
    assert captured["event_id"] == "evt_replay_happy_001"

    # The subscription row was actually mutated.
    db.expire_all()
    sub = (
        db.query(AgentSubscription)
        .filter_by(clinic_id="clinic-demo-default", agent_id="clinic.reception")
        .one()
    )
    assert sub.status == "active"
    assert sub.stripe_subscription_id == "sub_replay_001"

    # Pre-existing dedupe row was NOT removed or duplicated.
    rows = db.query(StripeWebhookEvent).all()
    assert len(rows) == 1
    assert rows[0].id == "evt_replay_happy_001"


def test_replay_happy_path_no_existing_dedupe_row(
    super_admin_actor: AuthenticatedActor,
    db,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Replay should not require a pre-existing dedupe row. Operator may
    replay an event id we never saw before (e.g. forwarded from Stripe
    dashboard manually)."""
    db.add(
        AgentSubscription(
            clinic_id="clinic-demo-default",
            agent_id="clinic.reception",
            status="test_pending",
            monthly_price_gbp=99,
        )
    )
    db.commit()

    fake_event = {
        "id": "evt_replay_new_002",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "metadata": {
                    "clinic_id": "clinic-demo-default",
                    "agent_id": "clinic.reception",
                },
                "subscription": "sub_replay_002",
                "customer": "cus_replay_002",
            }
        },
    }

    monkeypatch.setattr(
        stripe.Event,
        "retrieve",
        staticmethod(lambda eid, *a, **kw: fake_event),
    )

    client = _client_with(super_admin_actor)
    resp = client.post(
        "/api/v1/agent-billing/admin/webhook-replay",
        json={"event_id": "evt_replay_new_002"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["result"]["applied"] is True

    # No dedupe row was inserted by the replay path (it bypasses the
    # dedupe gate entirely).
    db.expire_all()
    assert db.query(StripeWebhookEvent).count() == 0


# ---------------------------------------------------------------------------
# Stripe says "no such event" → 404
# ---------------------------------------------------------------------------


def test_replay_returns_404_when_stripe_has_no_such_event(
    super_admin_actor: AuthenticatedActor,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def boom(event_id, *args, **kwargs):
        raise stripe.error.InvalidRequestError(
            "No such event: evt_replay_missing_999",
            param="id",
        )

    monkeypatch.setattr(stripe.Event, "retrieve", staticmethod(boom))

    client = _client_with(super_admin_actor)
    resp = client.post(
        "/api/v1/agent-billing/admin/webhook-replay",
        json={"event_id": "evt_replay_missing_999"},
    )
    assert resp.status_code == 404
    body = resp.json()
    assert body.get("code") == "event_not_found"
    assert body.get("details", {}).get("event_id") == "evt_replay_missing_999"


# ---------------------------------------------------------------------------
# Handler raises mid-apply → 200 + ok=False envelope
# ---------------------------------------------------------------------------


def test_replay_handler_raises_returns_envelope(
    super_admin_actor: AuthenticatedActor,
    db,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If ``_apply_webhook`` raises, the replay never crashes the caller —
    we return 200 with ``ok: false`` and a structured ``error`` field, so
    the operator can see the failure reason without crawling logs.
    """
    fake_event = {
        "id": "evt_replay_boom_003",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "metadata": {
                    "clinic_id": "clinic-demo-default",
                    "agent_id": "clinic.reception",
                },
            }
        },
    }
    monkeypatch.setattr(
        stripe.Event,
        "retrieve",
        staticmethod(lambda eid, *a, **kw: fake_event),
    )

    def boom_apply(*, db, event_type, data_obj):
        raise RuntimeError("apply blew up")

    monkeypatch.setattr(stripe_skus, "_apply_webhook", boom_apply)

    client = _client_with(super_admin_actor)
    resp = client.post(
        "/api/v1/agent-billing/admin/webhook-replay",
        json={"event_id": "evt_replay_boom_003"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert body["event_id"] == "evt_replay_boom_003"
    assert body["event_type"] == "checkout.session.completed"
    assert "apply blew up" in body["error"]
    assert "replayed_at" in body
