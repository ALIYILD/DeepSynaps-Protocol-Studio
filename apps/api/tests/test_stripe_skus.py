"""Tests for the Agent SKU Stripe wiring.

Every Stripe SDK call is mocked via ``monkeypatch.setattr`` — these tests
never hit the network. The live-mode guardrail is exercised explicitly
because forgetting it would let a careless ``sk_live_*`` rotation start
charging clinics with no further confirmation.
"""
from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import AgentSubscription, Clinic, User
from app.services import stripe_skus
from app.services.agents.registry import AGENT_REGISTRY


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db() -> Session:
    """Plain SessionLocal handle — the global ``isolated_database`` fixture
    in conftest already wipes + reseeds between tests."""
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture(autouse=True)
def _reset_skus_state(monkeypatch: pytest.MonkeyPatch) -> None:
    """Clear the memoised Stripe client + dedupe cache between tests, and
    set a default test secret key so the guardrail doesn't refuse."""
    stripe_skus._reset_client_cache_for_tests()
    stripe_skus._reset_dedupe_for_tests()
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_dummy_default")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_dummy")
    monkeypatch.delenv("STRIPE_LIVE_MODE_ACK", raising=False)
    yield
    stripe_skus._reset_client_cache_for_tests()
    stripe_skus._reset_dedupe_for_tests()


def _stub_stripe_sdk(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Patch the Stripe SDK methods used by stripe_skus and return a dict
    of the captured call kwargs for assertions."""
    captured: dict[str, Any] = {
        "customer_create": [],
        "customer_search": [],
        "price_create": [],
        "price_list": [],
        "session_create": [],
    }

    def fake_customer_search(**kwargs):
        captured["customer_search"].append(kwargs)
        return SimpleNamespace(data=[])

    def fake_customer_create(**kwargs):
        captured["customer_create"].append(kwargs)
        return {"id": "cus_test_123"}

    def fake_price_list(**kwargs):
        captured["price_list"].append(kwargs)
        return SimpleNamespace(data=[])

    def fake_price_create(**kwargs):
        captured["price_create"].append(kwargs)
        return {"id": "price_test_abc"}

    def fake_session_create(**kwargs):
        captured["session_create"].append(kwargs)
        return {
            "id": "cs_test_session_xyz",
            "url": "https://checkout.stripe.com/test/cs_test_session_xyz",
        }

    import stripe as _stripe

    monkeypatch.setattr(_stripe.Customer, "search", staticmethod(fake_customer_search))
    monkeypatch.setattr(_stripe.Customer, "create", staticmethod(fake_customer_create))
    monkeypatch.setattr(_stripe.Price, "list", staticmethod(fake_price_list))
    monkeypatch.setattr(_stripe.Price, "create", staticmethod(fake_price_create))
    monkeypatch.setattr(
        _stripe.checkout.Session, "create", staticmethod(fake_session_create)
    )
    return captured


def _make_admin_actor(clinic_id: str = "clinic-demo-default"):
    from app.auth import AuthenticatedActor

    return AuthenticatedActor(
        actor_id="actor-admin-demo",
        display_name="Admin Demo User",
        role="admin",
        package_id="enterprise",
        clinic_id=clinic_id,
    )


# ---------------------------------------------------------------------------
# _get_client guardrails
# ---------------------------------------------------------------------------


def test_get_client_refuses_live_key_without_ack(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_live_super_secret")
    monkeypatch.delenv("STRIPE_LIVE_MODE_ACK", raising=False)
    stripe_skus._reset_client_cache_for_tests()

    with pytest.raises(RuntimeError, match="live key without explicit ack"):
        stripe_skus._get_client()


def test_get_client_accepts_live_key_with_ack(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_live_super_secret")
    monkeypatch.setenv("STRIPE_LIVE_MODE_ACK", "1")
    stripe_skus._reset_client_cache_for_tests()

    sdk = stripe_skus._get_client()
    assert sdk.api_key == "sk_live_super_secret"


def test_get_client_accepts_test_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_abc123")
    monkeypatch.delenv("STRIPE_LIVE_MODE_ACK", raising=False)
    stripe_skus._reset_client_cache_for_tests()

    sdk = stripe_skus._get_client()
    assert sdk.api_key == "sk_test_abc123"


def test_get_client_refuses_missing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    stripe_skus._reset_client_cache_for_tests()

    with pytest.raises(RuntimeError, match="STRIPE_SECRET_KEY is not configured"):
        stripe_skus._get_client()


# ---------------------------------------------------------------------------
# create_checkout_session — happy path
# ---------------------------------------------------------------------------


def test_create_checkout_session_happy_path(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured = _stub_stripe_sdk(monkeypatch)

    actor = _make_admin_actor()
    out = stripe_skus.create_checkout_session(
        db=db,
        actor=actor,
        agent_id="clinic.reception",
        success_url="https://app.example.com/agents?success=1",
        cancel_url="https://app.example.com/agents?canceled=1",
    )

    assert out["ok"] is True
    assert out["agent_id"] == "clinic.reception"
    assert out["monthly_price_gbp"] == AGENT_REGISTRY["clinic.reception"].monthly_price_gbp
    assert out["session_id"] == "cs_test_session_xyz"
    assert out["checkout_url"].startswith("https://checkout.stripe.com/")

    # Stripe SDK called with the right shape
    assert len(captured["session_create"]) == 1
    sess_kwargs = captured["session_create"][0]
    assert sess_kwargs["mode"] == "subscription"
    assert sess_kwargs["line_items"] == [{"price": "price_test_abc", "quantity": 1}]
    assert sess_kwargs["customer"] == "cus_test_123"
    assert sess_kwargs["metadata"]["clinic_id"] == "clinic-demo-default"
    assert sess_kwargs["metadata"]["agent_id"] == "clinic.reception"
    assert sess_kwargs["metadata"]["schema"] == "deepsynaps.checkout/v1"

    price_kwargs = captured["price_create"][0]
    assert price_kwargs["currency"] == "gbp"
    assert (
        price_kwargs["unit_amount"]
        == AGENT_REGISTRY["clinic.reception"].monthly_price_gbp * 100
    )
    assert price_kwargs["recurring"] == {"interval": "month"}
    assert price_kwargs["lookup_key"] == "agent_sku:clinic.reception"

    # DB row inserted as test_pending
    rows = db.query(AgentSubscription).all()
    assert len(rows) == 1
    row = rows[0]
    assert row.clinic_id == "clinic-demo-default"
    assert row.agent_id == "clinic.reception"
    assert row.status == "test_pending"
    assert row.monthly_price_gbp == AGENT_REGISTRY["clinic.reception"].monthly_price_gbp
    assert row.stripe_customer_id == "cus_test_123"
    assert row.stripe_price_id == "price_test_abc"


# ---------------------------------------------------------------------------
# create_checkout_session — refusal paths
# ---------------------------------------------------------------------------


def test_create_checkout_refuses_patient_agent(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_stripe_sdk(monkeypatch)

    actor = _make_admin_actor()
    out = stripe_skus.create_checkout_session(
        db=db,
        actor=actor,
        agent_id="patient.care_companion",
        success_url="https://app.example.com/ok",
        cancel_url="https://app.example.com/cancel",
    )
    assert out["ok"] is False
    assert out["reason"] == "patient_agents_not_yet_activated"
    assert db.query(AgentSubscription).count() == 0


def test_create_checkout_refuses_free_agent(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_stripe_sdk(monkeypatch)

    # Re-register a temp free clinic agent — patient.crisis is free but is
    # also patient-side, which short-circuits earlier. Easiest path: assert
    # that the existing free agent is rejected for whichever reason fires
    # first; then add a synthetic clinic-side free agent for the explicit
    # free check.
    from app.services.agents.registry import AGENT_REGISTRY as REG, AgentDefinition

    free_agent_id = "clinic.testing_free_sku"
    REG[free_agent_id] = AgentDefinition(
        id=free_agent_id,
        name="Free Test Agent",
        tagline="zero price clinic-side agent for tests",
        audience="clinic",
        role_required="admin",
        package_required=[],
        tool_allowlist=[],
        system_prompt="test only",
        monthly_price_gbp=0,
    )
    try:
        actor = _make_admin_actor()
        out = stripe_skus.create_checkout_session(
            db=db,
            actor=actor,
            agent_id=free_agent_id,
            success_url="https://app.example.com/ok",
            cancel_url="https://app.example.com/cancel",
        )
        assert out["ok"] is False
        assert out["reason"] == "free_agent"
        assert db.query(AgentSubscription).count() == 0
    finally:
        REG.pop(free_agent_id, None)


def test_create_checkout_refuses_unknown_agent(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.errors import ApiServiceError

    _stub_stripe_sdk(monkeypatch)
    actor = _make_admin_actor()
    with pytest.raises(ApiServiceError) as exc:
        stripe_skus.create_checkout_session(
            db=db,
            actor=actor,
            agent_id="nope.does_not_exist",
            success_url="https://app.example.com/ok",
            cancel_url="https://app.example.com/cancel",
        )
    assert exc.value.status_code == 404


def test_create_checkout_refuses_already_subscribed(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_stripe_sdk(monkeypatch)

    # Pre-seed an active subscription
    db.add(
        AgentSubscription(
            clinic_id="clinic-demo-default",
            agent_id="clinic.reception",
            status="active",
            monthly_price_gbp=99,
            stripe_subscription_id="sub_existing_abc",
        )
    )
    db.commit()

    actor = _make_admin_actor()
    out = stripe_skus.create_checkout_session(
        db=db,
        actor=actor,
        agent_id="clinic.reception",
        success_url="https://app.example.com/ok",
        cancel_url="https://app.example.com/cancel",
    )
    assert out["ok"] is False
    assert out["reason"] == "already_subscribed"
    assert out["subscription_id"] == "sub_existing_abc"


def test_create_checkout_refuses_actor_without_clinic(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_stripe_sdk(monkeypatch)
    actor = _make_admin_actor(clinic_id=None)  # type: ignore[arg-type]
    out = stripe_skus.create_checkout_session(
        db=db,
        actor=actor,
        agent_id="clinic.reception",
        success_url="https://app.example.com/ok",
        cancel_url="https://app.example.com/cancel",
    )
    assert out["ok"] is False
    assert out["reason"] == "no_clinic"


# ---------------------------------------------------------------------------
# Webhook handling
# ---------------------------------------------------------------------------


def _make_event(event_type: str, data_obj: dict, event_id: str = "evt_test_1") -> dict:
    return {
        "id": event_id,
        "type": event_type,
        "data": {"object": data_obj},
    }


def test_webhook_checkout_session_completed_marks_active(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Pre-seed a test_pending row
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
            "subscription": "sub_test_123",
            "customer": "cus_test_123",
        },
    )

    out = stripe_skus.handle_subscription_webhook(event, signature="sig-ignored")
    assert out["ok"] is True
    assert out["event_type"] == "checkout.session.completed"
    assert out["applied"] is True

    # Re-query
    db.expire_all()
    row = (
        db.query(AgentSubscription)
        .filter_by(clinic_id="clinic-demo-default", agent_id="clinic.reception")
        .one()
    )
    assert row.status == "active"
    assert row.started_at is not None
    assert row.stripe_subscription_id == "sub_test_123"


def test_webhook_subscription_deleted_marks_canceled(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    db.add(
        AgentSubscription(
            clinic_id="clinic-demo-default",
            agent_id="clinic.reception",
            status="active",
            monthly_price_gbp=99,
            stripe_subscription_id="sub_test_456",
        )
    )
    db.commit()

    event = _make_event(
        "customer.subscription.deleted",
        {"id": "sub_test_456"},
    )
    out = stripe_skus.handle_subscription_webhook(event, signature="sig-ignored")
    assert out["ok"] is True
    assert out["applied"] is True

    db.expire_all()
    row = (
        db.query(AgentSubscription)
        .filter_by(stripe_subscription_id="sub_test_456")
        .one()
    )
    assert row.status == "canceled"
    assert row.canceled_at is not None


def test_webhook_subscription_updated_past_due(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    db.add(
        AgentSubscription(
            clinic_id="clinic-demo-default",
            agent_id="clinic.reception",
            status="active",
            monthly_price_gbp=99,
            stripe_subscription_id="sub_test_789",
        )
    )
    db.commit()

    event = _make_event(
        "customer.subscription.updated",
        {"id": "sub_test_789", "status": "past_due"},
    )
    out = stripe_skus.handle_subscription_webhook(event, signature="sig-ignored")
    assert out["ok"] is True
    assert out["applied"] is True

    db.expire_all()
    row = (
        db.query(AgentSubscription)
        .filter_by(stripe_subscription_id="sub_test_789")
        .one()
    )
    assert row.status == "past_due"


def test_webhook_invalid_signature_returns_ok_false(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Pre-seed a row that should NOT be touched.
    db.add(
        AgentSubscription(
            clinic_id="clinic-demo-default",
            agent_id="clinic.reception",
            status="test_pending",
            monthly_price_gbp=99,
        )
    )
    db.commit()

    import stripe as _stripe

    def boom(*args, **kwargs):
        raise _stripe.error.SignatureVerificationError("bad sig", "hdr")

    monkeypatch.setattr(_stripe.Webhook, "construct_event", staticmethod(boom))

    payload_bytes = json.dumps(
        _make_event(
            "checkout.session.completed",
            {
                "metadata": {
                    "clinic_id": "clinic-demo-default",
                    "agent_id": "clinic.reception",
                },
            },
        )
    ).encode("utf-8")
    out = stripe_skus.handle_subscription_webhook(payload_bytes, signature="bad")
    assert out["ok"] is False
    assert out.get("reason") == "invalid_signature"

    # Row unchanged
    db.expire_all()
    row = (
        db.query(AgentSubscription)
        .filter_by(clinic_id="clinic-demo-default", agent_id="clinic.reception")
        .one()
    )
    assert row.status == "test_pending"


def test_webhook_duplicate_event_id_returns_applied_false(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
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
            "subscription": "sub_dup_001",
        },
        event_id="evt_dup_001",
    )

    first = stripe_skus.handle_subscription_webhook(event, signature="sig-ignored")
    assert first["ok"] is True
    assert first["applied"] is True

    second = stripe_skus.handle_subscription_webhook(event, signature="sig-ignored")
    assert second["ok"] is True
    assert second["applied"] is False
    assert second.get("reason") == "duplicate"


# ---------------------------------------------------------------------------
# list_clinic_subscriptions — tenant scoping
# ---------------------------------------------------------------------------


def test_list_clinic_subscriptions_only_returns_actors_clinic(db: Session) -> None:
    # Add a second clinic + a row in each
    other_clinic = Clinic(id="clinic-other", name="Other Clinic")
    db.add(other_clinic)
    db.flush()

    db.add_all(
        [
            AgentSubscription(
                clinic_id="clinic-demo-default",
                agent_id="clinic.reception",
                status="active",
                monthly_price_gbp=99,
            ),
            AgentSubscription(
                clinic_id="clinic-other",
                agent_id="clinic.reception",
                status="active",
                monthly_price_gbp=99,
            ),
        ]
    )
    db.commit()

    rows = stripe_skus.list_clinic_subscriptions(
        db=db, clinic_id="clinic-demo-default"
    )
    assert len(rows) == 1
    assert rows[0]["clinic_id"] == "clinic-demo-default"
    assert rows[0]["agent_id"] == "clinic.reception"
    assert rows[0]["status"] == "active"


# ---------------------------------------------------------------------------
# HTTP integration
# ---------------------------------------------------------------------------


def test_http_checkout_requires_admin_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_stripe_sdk(monkeypatch)

    resp = client.post(
        "/api/v1/agent-billing/checkout/clinic.reception",
        headers=auth_headers["clinician"],
        json={
            "success_url": "https://app.example.com/ok",
            "cancel_url": "https://app.example.com/cancel",
        },
    )
    assert resp.status_code == 403, resp.text


def test_http_checkout_admin_happy_path(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_stripe_sdk(monkeypatch)

    resp = client.post(
        "/api/v1/agent-billing/checkout/clinic.reception",
        headers=auth_headers["admin"],
        json={
            "success_url": "https://app.example.com/ok",
            "cancel_url": "https://app.example.com/cancel",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["session_id"] == "cs_test_session_xyz"
    assert body["agent_id"] == "clinic.reception"
    assert body["monthly_price_gbp"] == 99


def test_http_list_subscriptions_clinician_ok(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(
        "/api/v1/agent-billing/subscriptions",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    assert resp.json() == {"subscriptions": []}
