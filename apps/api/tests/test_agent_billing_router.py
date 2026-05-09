"""Tests for agent_billing_router.py.

Covers:
- GET /subscriptions: requires auth (403)
- GET /subscriptions: clinician with clinic_id gets list (empty OK)
- POST /checkout/{agent_id}: requires admin role (clinician rejected 403)
- POST /checkout/{agent_id}: unknown agent_id → 404
- POST /portal: requires admin role
- POST /portal: non-https return_url → 400
- POST /admin/webhook-events: super-admin gets list
- POST /admin/webhook-events: clinic-bound admin rejected (403)
- POST /admin/webhook-replay: event_id not starting with evt_ → 400
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


_CLINICIAN_HEADERS = {"Authorization": "Bearer clinician-demo-token"}
_ADMIN_CLINIC_HEADERS = {"Authorization": "Bearer admin-demo-token"}


def _super_admin_headers() -> dict[str, str]:
    from app.services.auth_service import create_access_token
    token = create_access_token(
        user_id="billing-sa-001",
        email="billing_sa@example.com",
        role="admin",
        package_id="enterprise",
        clinic_id=None,  # no clinic_id = super-admin
    )
    return {"Authorization": f"Bearer {token}"}


# ── /subscriptions ────────────────────────────────────────────────────────────

def test_subscriptions_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/agent-billing/subscriptions")
    assert r.status_code == 403


def test_subscriptions_clinician_returns_list(client: TestClient) -> None:
    r = client.get("/api/v1/agent-billing/subscriptions", headers=_CLINICIAN_HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert "subscriptions" in body
    assert isinstance(body["subscriptions"], list)


# ── /checkout/{agent_id} ──────────────────────────────────────────────────────

def test_checkout_clinician_rejected(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-billing/checkout/some-agent",
        json={
            "success_url": "https://example.com/success",
            "cancel_url": "https://example.com/cancel",
        },
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 403


def test_checkout_unknown_agent_404(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-billing/checkout/totally-nonexistent-agent-xyz",
        json={
            "success_url": "https://example.com/success",
            "cancel_url": "https://example.com/cancel",
        },
        headers=_ADMIN_CLINIC_HEADERS,
    )
    assert r.status_code == 404


def test_checkout_missing_payload_422(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-billing/checkout/some-agent",
        json={},
        headers=_ADMIN_CLINIC_HEADERS,
    )
    assert r.status_code == 422


# ── /portal ───────────────────────────────────────────────────────────────────

def test_portal_clinician_rejected(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-billing/portal",
        json={"return_url": "https://example.com/billing"},
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 403


def test_portal_non_https_return_url_400(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-billing/portal",
        json={"return_url": "http://example.com/billing"},
        headers=_ADMIN_CLINIC_HEADERS,
    )
    assert r.status_code == 400
    assert r.json().get("code") == "invalid_return_url"


# ── /admin/webhook-events ─────────────────────────────────────────────────────

def test_webhook_events_clinic_admin_rejected(client: TestClient) -> None:
    r = client.get("/api/v1/agent-billing/admin/webhook-events", headers=_ADMIN_CLINIC_HEADERS)
    # clinic-bound admin has clinic_id → ops_admin_required gate
    assert r.status_code == 403


def test_webhook_events_super_admin_ok(client: TestClient) -> None:
    r = client.get(
        "/api/v1/agent-billing/admin/webhook-events",
        headers=_super_admin_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert "rows" in body
    assert "since_days" in body
    assert isinstance(body["rows"], list)


def test_webhook_events_limit_422(client: TestClient) -> None:
    r = client.get(
        "/api/v1/agent-billing/admin/webhook-events?limit=999",
        headers=_super_admin_headers(),
    )
    assert r.status_code == 422


# ── /admin/webhook-replay ─────────────────────────────────────────────────────

def test_webhook_replay_bad_event_id_400(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-billing/admin/webhook-replay",
        json={"event_id": "not-starting-with-evt"},
        headers=_super_admin_headers(),
    )
    assert r.status_code == 400
    assert r.json().get("code") == "invalid_event_id"


def test_webhook_replay_clinician_rejected(client: TestClient) -> None:
    r = client.post(
        "/api/v1/agent-billing/admin/webhook-replay",
        json={"event_id": "evt_1234567890"},
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 403
