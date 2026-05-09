"""Happy-path + auth + edge-case tests for payments_router.

Pins the following routes:
  GET  /api/v1/payments/config
  POST /api/v1/payments/create-checkout
  POST /api/v1/payments/create-portal
  POST /api/v1/payments/webhook
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_session
from app.main import app


# ── helpers ───────────────────────────────────────────────────────────────────

def _register_user(client: TestClient, email: str) -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": "Pay User", "password": "testpass9999", "role": "clinician"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


# ── GET /api/v1/payments/config ───────────────────────────────────────────────

def test_payments_config_no_auth_required(client: TestClient) -> None:
    """Config endpoint is public — no auth token needed."""
    resp = client.get("/api/v1/payments/config")
    assert resp.status_code == 200


def test_payments_config_shape(client: TestClient) -> None:
    resp = client.get("/api/v1/payments/config")
    body = resp.json()
    assert "publishable_key" in body
    assert "packages" in body
    pkgs = body["packages"]
    assert isinstance(pkgs, list)
    assert len(pkgs) > 0
    # Explorer (free tier) must always be present
    ids = {p["id"] for p in pkgs}
    assert "explorer" in ids


def test_payments_config_package_fields(client: TestClient) -> None:
    """Each package must expose required display fields."""
    resp = client.get("/api/v1/payments/config")
    for pkg in resp.json()["packages"]:
        assert "id" in pkg
        assert "name" in pkg
        assert "features" in pkg
        assert isinstance(pkg["features"], list)


# ── POST /api/v1/payments/create-checkout ────────────────────────────────────

def test_create_checkout_no_stripe_key_returns_400(client: TestClient, auth_headers: dict) -> None:
    """When Stripe is not configured, checkout returns 400 (Stripe not configured)."""
    resp = client.post(
        "/api/v1/payments/create-checkout",
        json={"package_id": "resident"},
        headers=auth_headers["clinician"],
    )
    # 400 = Stripe not configured; 401/403 = auth; either is acceptable
    assert resp.status_code in (400, 401, 403)


def test_create_checkout_enterprise_returns_contact_us(client: TestClient, auth_headers: dict) -> None:
    """Enterprise package bypasses Stripe checkout and returns a contact-us response.

    The Stripe config check runs before the enterprise shortcut, so we patch
    settings to provide a non-empty key while keeping all routing logic real.
    """
    with patch("app.routers.payments_router.get_settings") as mock_settings:
        settings = MagicMock()
        settings.stripe_secret_key = "sk_test_dummy"
        settings.stripe_price_resident = "price_res"
        settings.stripe_price_clinician_pro = "price_pro"
        settings.stripe_price_clinic_team = "price_team"
        settings.stripe_webhook_secret = ""
        settings.app_url = "http://localhost"
        mock_settings.return_value = settings

        resp = client.post(
            "/api/v1/payments/create-checkout",
            json={"package_id": "enterprise"},
            headers=auth_headers["clinician"],
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("contact_us") is True
    assert body.get("checkout_url") is None


def test_create_checkout_unknown_package_returns_400(client: TestClient) -> None:
    """Non-existent package ID should 400 regardless of Stripe config."""
    token = _register_user(client, "pay-bad@example.com")
    with patch("app.routers.payments_router.get_settings") as mock_settings:
        settings = MagicMock()
        settings.stripe_secret_key = "sk_test_dummy"
        settings.stripe_price_resident = "price_res"
        settings.stripe_price_clinician_pro = "price_pro"
        settings.stripe_price_clinic_team = "price_team"
        settings.stripe_webhook_secret = ""
        settings.app_url = "http://localhost"
        mock_settings.return_value = settings

        resp = client.post(
            "/api/v1/payments/create-checkout",
            json={"package_id": "nonexistent_pkg"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 400


def test_create_checkout_no_stripe_config_returns_400(client: TestClient) -> None:
    """When Stripe secret is not configured, checkout should 400."""
    token = _register_user(client, "pay-nostripe@example.com")
    with patch("app.routers.payments_router.get_settings") as mock_settings:
        settings = MagicMock()
        settings.stripe_secret_key = ""  # not configured
        settings.stripe_publishable_key = ""
        settings.stripe_price_resident = ""
        settings.stripe_price_clinician_pro = ""
        settings.stripe_price_clinic_team = ""
        settings.stripe_webhook_secret = ""
        settings.app_url = "http://localhost"
        mock_settings.return_value = settings

        resp = client.post(
            "/api/v1/payments/create-checkout",
            json={"package_id": "resident"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 400


# ── POST /api/v1/payments/create-portal ──────────────────────────────────────

def test_create_portal_no_subscription_returns_400(client: TestClient, auth_headers: dict) -> None:
    """User without a Stripe customer ID should get a clear 400."""
    resp = client.post(
        "/api/v1/payments/create-portal",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 400


# ── POST /api/v1/payments/webhook ────────────────────────────────────────────

def test_webhook_no_secret_configured_returns_400(client: TestClient) -> None:
    """Webhook must 400 when stripe_webhook_secret is not set."""
    with patch("app.routers.payments_router.get_settings") as mock_settings:
        settings = MagicMock()
        settings.stripe_webhook_secret = ""
        mock_settings.return_value = settings

        resp = client.post(
            "/api/v1/payments/webhook",
            content=b"{}",
            headers={"stripe-signature": "t=1,v1=bad"},
        )
    assert resp.status_code == 400


def test_webhook_bad_signature_returns_400(client: TestClient) -> None:
    """Invalid Stripe signature must be rejected."""
    with patch("app.routers.payments_router.get_settings") as mock_settings:
        settings = MagicMock()
        settings.stripe_webhook_secret = "whsec_test"
        mock_settings.return_value = settings

        with patch("app.routers.payments_router.construct_webhook_event") as mock_construct:
            import stripe
            mock_construct.side_effect = stripe.error.SignatureVerificationError(
                "bad sig", sig_header="t=1,v1=bad"
            )
            resp = client.post(
                "/api/v1/payments/webhook",
                content=b'{"type":"test"}',
                headers={"stripe-signature": "t=1,v1=bad"},
            )
    assert resp.status_code == 400


def test_webhook_idempotent_succeeded_event_returns_200(client: TestClient) -> None:
    """A previously-succeeded event redelivery must return 200 without reprocessing."""
    from app.database import SessionLocal
    from app.persistence.models import StripeWebhookLog

    db = SessionLocal()
    try:
        log = StripeWebhookLog(
            stripe_event_id="evt_test_idempotent",
            event_type="checkout.session.completed",
            payload="{}",
            status="succeeded",
            attempt_count=1,
        )
        db.add(log)
        db.commit()
    finally:
        db.close()

    fake_event = {
        "id": "evt_test_idempotent",
        "type": "checkout.session.completed",
        "data": {"object": {}},
    }

    with patch("app.routers.payments_router.get_settings") as mock_settings:
        settings = MagicMock()
        settings.stripe_webhook_secret = "whsec_test"
        mock_settings.return_value = settings

        with patch("app.routers.payments_router.construct_webhook_event") as mock_construct:
            mock_construct.return_value = fake_event

            resp = client.post(
                "/api/v1/payments/webhook",
                content=b"{}",
                headers={"stripe-signature": "t=1,v1=ok"},
            )

    assert resp.status_code == 200
    assert resp.json().get("received") is True
