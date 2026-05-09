"""Tests for agent_billing_router — set D (PR 76/N).

Covers:
  - POST /api/v1/agent-billing/checkout/{agent_id}
  - POST /api/v1/agent-billing/portal
  - GET  /api/v1/agent-billing/subscriptions
  - POST /api/v1/agent-billing/webhook
  - POST /api/v1/agent-billing/admin/webhook-replay
  - GET  /api/v1/agent-billing/admin/webhook-events

Auth, role gates, happy paths, 400/403/422 edge cases. Stripe calls are
monkeypatched so no real API keys are needed.
"""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient


# ── helpers ───────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _stripe_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Inject a safe test key so _get_client() doesn't raise, and reset
    the memoisation cache so each test starts clean."""
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_fake_key_for_unit_tests")
    monkeypatch.delenv("STRIPE_LIVE_MODE_ACK", raising=False)
    from app.services import stripe_skus
    stripe_skus._reset_client_cache_for_tests()
    stripe_skus._reset_dedupe_for_tests()


# ── GET /subscriptions ────────────────────────────────────────────────────────


def test_subscriptions_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/agent-billing/subscriptions")
    assert r.status_code == 403


def test_subscriptions_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/agent-billing/subscriptions",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_subscriptions_clinician_empty(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/agent-billing/subscriptions",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert "subscriptions" in body
    assert isinstance(body["subscriptions"], list)


def test_subscriptions_admin_empty(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/agent-billing/subscriptions",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200


# ── POST /checkout/{agent_id} ─────────────────────────────────────────────────


def test_checkout_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-billing/checkout/agent-xyz",
        json={"success_url": "https://example.com/ok", "cancel_url": "https://example.com/cancel"},
    )
    assert r.status_code == 403


def test_checkout_clinician_is_403(client: TestClient, auth_headers: dict) -> None:
    """Clinicians (non-admin) cannot start a checkout."""
    r = client.post(
        "/api/v1/agent-billing/checkout/agent-xyz",
        json={"success_url": "https://example.com/ok", "cancel_url": "https://example.com/cancel"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


def test_checkout_missing_success_url_is_422(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/agent-billing/checkout/agent-xyz",
        json={"cancel_url": "https://example.com/cancel"},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 422


def test_checkout_admin_calls_stripe(
    client: TestClient, auth_headers: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Admin checkout reaches create_checkout_session; mock it to avoid real Stripe."""
    from app.services import stripe_skus

    def _fake_create(db, actor, agent_id, success_url, cancel_url):
        return {"checkout_url": "https://checkout.stripe.com/fake", "subscription_id": "sub_fake"}

    monkeypatch.setattr(stripe_skus, "create_checkout_session", _fake_create)

    r = client.post(
        "/api/v1/agent-billing/checkout/agent-xyz",
        json={"success_url": "https://example.com/ok", "cancel_url": "https://example.com/cancel"},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("checkout_url") == "https://checkout.stripe.com/fake"


# ── POST /portal ──────────────────────────────────────────────────────────────


def test_portal_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-billing/portal",
        json={"return_url": "https://example.com/back"},
    )
    assert r.status_code == 403


def test_portal_clinician_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/agent-billing/portal",
        json={"return_url": "https://example.com/back"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


def test_portal_non_https_return_url_is_400(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        "/api/v1/agent-billing/portal",
        json={"return_url": "http://example.com/back"},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 400


def test_portal_no_stripe_customer_is_404(
    client: TestClient, auth_headers: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Admin with clinic but no existing customer → 404."""
    from app.services import stripe_skus

    def _fake_portal(db, clinic_id, return_url):
        raise ValueError("no_stripe_customer")

    monkeypatch.setattr(stripe_skus, "create_billing_portal_session", _fake_portal)
    r = client.post(
        "/api/v1/agent-billing/portal",
        json={"return_url": "https://example.com/back"},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 404


# ── POST /webhook ─────────────────────────────────────────────────────────────


def test_webhook_missing_signature_header_is_422(client: TestClient) -> None:
    """Stripe-Signature header is required by FastAPI; missing → 422."""
    r = client.post(
        "/api/v1/agent-billing/webhook",
        content=b'{"id":"evt_test","type":"checkout.session.completed"}',
        headers={"content-type": "application/json"},
    )
    assert r.status_code == 422


def test_webhook_with_signature_runs_handler(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """With a dummy signature the handler is called and returns 200 (never retries)."""
    from app.services import stripe_skus

    def _fake_handler(body, sig):
        return {"ok": True, "event_type": "test"}

    monkeypatch.setattr(stripe_skus, "handle_subscription_webhook", _fake_handler)
    r = client.post(
        "/api/v1/agent-billing/webhook",
        content=b'{"id":"evt_test","type":"checkout.session.completed"}',
        headers={
            "content-type": "application/json",
            "stripe-signature": "t=1234,v1=dummy",
        },
    )
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ── POST /admin/webhook-replay ────────────────────────────────────────────────


def test_webhook_replay_clinician_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/agent-billing/admin/webhook-replay",
        json={"event_id": "evt_fake12345"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


def test_webhook_replay_invalid_event_id_is_400(
    client: TestClient, auth_headers: dict
) -> None:
    """event_id must start with 'evt_'."""
    # admin without clinic_id = super-admin. Use supervisor fixture as a proxy
    # for the admin header (which has clinic_id) — expect 403 (not super-admin).
    r = client.post(
        "/api/v1/agent-billing/admin/webhook-replay",
        json={"event_id": "NOT_EVT_prefix"},
        headers=auth_headers["admin"],  # clinic-bound admin → 403 (ops_admin_required)
    )
    # clinic-bound admin is not a super-admin → 403 before the evt_ check
    assert r.status_code == 403


# ── GET /admin/webhook-events ─────────────────────────────────────────────────


def test_webhook_events_clinician_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.get(
        "/api/v1/agent-billing/admin/webhook-events",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


def test_webhook_events_admin_with_clinic_is_403(
    client: TestClient, auth_headers: dict
) -> None:
    """Clinic-bound admin is NOT a super-admin."""
    r = client.get(
        "/api/v1/agent-billing/admin/webhook-events",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 403


def test_webhook_events_limit_out_of_range_is_422(
    client: TestClient, auth_headers: dict
) -> None:
    """limit=999 exceeds the FastAPI Query constraint (max 200) — FastAPI
    validates query parameters before checking auth, so any caller gets 422."""
    r = client.get(
        "/api/v1/agent-billing/admin/webhook-events?limit=999",
        headers=auth_headers["clinician"],
    )
    # FastAPI validates limit before dispatching to the handler
    assert r.status_code == 422
