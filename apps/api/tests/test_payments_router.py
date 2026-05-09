"""Tests for the payments router (config, checkout, portal, webhook)."""
from __future__ import annotations

from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}


def test_payments_config_no_auth_required():
    """GET /payments/config is public — no auth needed."""
    r = client.get("/api/v1/payments/config")
    assert r.status_code == 200
    body = r.json()
    assert "packages" in body
    assert isinstance(body["packages"], list)
    assert len(body["packages"]) > 0


def test_payments_config_package_shape():
    """Each package in /payments/config has required fields."""
    r = client.get("/api/v1/payments/config")
    for pkg in r.json()["packages"]:
        assert "id" in pkg
        assert "name" in pkg
        assert "features" in pkg


def test_create_checkout_invalid_token_rejected():
    """POST /payments/create-checkout with an invalid token is rejected with 401."""
    r = client.post(
        "/api/v1/payments/create-checkout",
        headers={"Authorization": "Bearer invalid-bad-token-xyz"},
        json={"package_id": "clinician_pro"},
    )
    assert r.status_code == 401


def test_create_portal_invalid_token_rejected():
    """POST /payments/create-portal with an invalid token is rejected with 401."""
    r = client.post(
        "/api/v1/payments/create-portal",
        headers={"Authorization": "Bearer invalid-bad-token-xyz"},
    )
    assert r.status_code == 401


def test_create_checkout_no_stripe_configured_returns_400():
    """POST /payments/create-checkout without Stripe configured returns 400."""
    # No auth header → the endpoint checks stripe config first and returns 400
    r = client.post("/api/v1/payments/create-checkout", json={"package_id": "clinician_pro"})
    assert r.status_code == 400


def test_webhook_no_stripe_secret_returns_400():
    """Stripe webhook with no stripe_webhook_secret configured returns 400."""
    with patch("app.settings.get_settings") as mock_settings:
        settings = MagicMock()
        settings.stripe_webhook_secret = None
        mock_settings.return_value = settings

        r = client.post(
            "/api/v1/payments/webhook",
            content=b'{"type": "test"}',
            headers={"stripe-signature": "t=1234,v1=abc"},
        )
    assert r.status_code == 400


def test_webhook_invalid_signature_returns_400():
    """Stripe webhook with invalid signature returns 400."""
    import stripe

    with patch("app.settings.get_settings") as mock_settings:
        settings = MagicMock()
        settings.stripe_webhook_secret = "whsec_test"
        mock_settings.return_value = settings

        with patch("app.routers.payments_router.construct_webhook_event") as mock_construct:
            mock_construct.side_effect = stripe.error.SignatureVerificationError(
                "Invalid sig", sig_header="bad"
            )
            r = client.post(
                "/api/v1/payments/webhook",
                content=b'{"type": "test"}',
                headers={"stripe-signature": "bad-sig"},
            )
    assert r.status_code == 400
