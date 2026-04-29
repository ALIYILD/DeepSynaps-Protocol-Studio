"""Tests for Phase 12 — Stripe Customer Portal endpoint.

Covers the helper :func:`stripe_skus.create_billing_portal_session` and the
``POST /api/v1/agent-billing/portal`` endpoint. Every Stripe SDK call is
patched via ``monkeypatch.setattr`` — these tests never hit the network.
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import AgentSubscription
from app.services import stripe_skus


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture(autouse=True)
def _reset_skus_state(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reset the memoised Stripe client + dedupe between tests, and seed a
    test secret key so :func:`_get_client` doesn't refuse."""
    stripe_skus._reset_client_cache_for_tests()
    stripe_skus._reset_dedupe_for_tests()
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_billing_portal_dummy")
    monkeypatch.delenv("STRIPE_LIVE_MODE_ACK", raising=False)
    yield
    stripe_skus._reset_client_cache_for_tests()
    stripe_skus._reset_dedupe_for_tests()


def _stub_billing_portal(
    monkeypatch: pytest.MonkeyPatch,
    *,
    fake_url: str = "https://billing.stripe.com/p/session/test_abc",
) -> dict[str, Any]:
    """Patch :class:`stripe.billing_portal.Session.create` and capture call
    kwargs. Returns ``{"calls": [...]}`` for assertions."""
    import stripe as _stripe

    captured: dict[str, Any] = {"calls": []}

    def fake_create(**kwargs):
        captured["calls"].append(kwargs)
        # Stripe SDK returns objects with attribute access; mimic that shape.
        return SimpleNamespace(url=fake_url, id="bps_test_xyz")

    # ``billing_portal`` is a sub-module of the Stripe SDK. Reach in via attr
    # access so the monkeypatch lifts cleanly between tests.
    monkeypatch.setattr(
        _stripe.billing_portal.Session,
        "create",
        staticmethod(fake_create),
    )
    return captured


def _seed_subscription_with_customer(
    db: Session,
    *,
    clinic_id: str = "clinic-demo-default",
    customer_id: str = "cus_test_portal_123",
) -> None:
    """Seed an AgentSubscription row carrying a Stripe Customer id so the
    portal helper has something to look up."""
    db.add(
        AgentSubscription(
            clinic_id=clinic_id,
            agent_id="clinic.reception",
            status="active",
            monthly_price_gbp=99,
            stripe_customer_id=customer_id,
            stripe_subscription_id="sub_test_portal_001",
        )
    )
    db.commit()


# ---------------------------------------------------------------------------
# Service helper — direct unit tests
# ---------------------------------------------------------------------------


def test_create_billing_portal_session_happy_path(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured = _stub_billing_portal(monkeypatch)
    _seed_subscription_with_customer(db)

    out = stripe_skus.create_billing_portal_session(
        db=db,
        clinic_id="clinic-demo-default",
        return_url="https://app.example.com/billing",
    )

    assert out == {"url": "https://billing.stripe.com/p/session/test_abc"}
    assert len(captured["calls"]) == 1
    kwargs = captured["calls"][0]
    assert kwargs["customer"] == "cus_test_portal_123"
    assert kwargs["return_url"] == "https://app.example.com/billing"


def test_create_billing_portal_session_raises_when_no_customer(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _stub_billing_portal(monkeypatch)
    # No subscription seeded — clinic has no Stripe customer.

    with pytest.raises(ValueError, match="no_stripe_customer"):
        stripe_skus.create_billing_portal_session(
            db=db,
            clinic_id="clinic-demo-default",
            return_url="https://app.example.com/billing",
        )


def test_create_billing_portal_session_ignores_subscription_with_null_customer(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A test_pending row with NULL stripe_customer_id is not a usable
    portal target — we still raise ``no_stripe_customer``."""
    _stub_billing_portal(monkeypatch)
    db.add(
        AgentSubscription(
            clinic_id="clinic-demo-default",
            agent_id="clinic.reception",
            status="test_pending",
            monthly_price_gbp=99,
            # stripe_customer_id intentionally omitted
        )
    )
    db.commit()

    with pytest.raises(ValueError, match="no_stripe_customer"):
        stripe_skus.create_billing_portal_session(
            db=db,
            clinic_id="clinic-demo-default",
            return_url="https://app.example.com/billing",
        )


# ---------------------------------------------------------------------------
# HTTP integration
# ---------------------------------------------------------------------------


def test_http_portal_clinician_forbidden(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_billing_portal(monkeypatch)

    resp = client.post(
        "/api/v1/agent-billing/portal",
        headers=auth_headers["clinician"],
        json={"return_url": "https://app.example.com/billing"},
    )
    assert resp.status_code == 403, resp.text


def test_http_portal_admin_rejects_non_https_return_url(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_billing_portal(monkeypatch)

    resp = client.post(
        "/api/v1/agent-billing/portal",
        headers=auth_headers["admin"],
        json={"return_url": "http://insecure.example.com/billing"},
    )
    assert resp.status_code == 400, resp.text
    assert resp.json()["code"] == "invalid_return_url"


def test_http_portal_admin_no_stripe_customer_returns_404(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_billing_portal(monkeypatch)
    # No AgentSubscription seeded → helper raises ValueError("no_stripe_customer").

    resp = client.post(
        "/api/v1/agent-billing/portal",
        headers=auth_headers["admin"],
        json={"return_url": "https://app.example.com/billing"},
    )
    assert resp.status_code == 404, resp.text
    body = resp.json()
    assert body["code"] == "no_stripe_customer"
    assert "subscription" in body["message"].lower()


def test_http_portal_admin_happy_path_returns_url(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
    db: Session,
) -> None:
    captured = _stub_billing_portal(
        monkeypatch,
        fake_url="https://billing.stripe.com/p/session/cs_admin_happy",
    )
    _seed_subscription_with_customer(db)

    resp = client.post(
        "/api/v1/agent-billing/portal",
        headers=auth_headers["admin"],
        json={"return_url": "https://app.example.com/billing"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"url": "https://billing.stripe.com/p/session/cs_admin_happy"}

    # Stripe was called with the seeded customer id and the requested return_url.
    assert len(captured["calls"]) == 1
    kwargs = captured["calls"][0]
    assert kwargs["customer"] == "cus_test_portal_123"
    assert kwargs["return_url"] == "https://app.example.com/billing"


def test_http_portal_admin_sdk_failure_returns_503(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
    db: Session,
) -> None:
    """When Stripe raises a non-validation error (e.g. transient API outage),
    the endpoint must return a 503 with a safe envelope rather than leaking
    a 500 with stack details."""
    import stripe as _stripe

    _seed_subscription_with_customer(db)

    def boom(**kwargs):
        # Simulate a Stripe API outage. ``APIConnectionError`` is the canonical
        # transient error class; falling back to a generic ``Exception`` would
        # also be caught by our except: clause.
        raise _stripe.error.APIConnectionError("stripe API timed out")

    monkeypatch.setattr(
        _stripe.billing_portal.Session,
        "create",
        staticmethod(boom),
    )

    resp = client.post(
        "/api/v1/agent-billing/portal",
        headers=auth_headers["admin"],
        json={"return_url": "https://app.example.com/billing"},
    )
    assert resp.status_code == 503, resp.text
    assert resp.json()["code"] == "billing_portal_unavailable"
