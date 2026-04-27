"""Tests for Stripe webhook outbox + retry queue (audit gap §6.A)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import get_db_session
from app.main import app
from app.persistence.models import StripeWebhookLog


# ── helpers ──────────────────────────────────────────────────────────────────

_FAKE_EVENT_ID = "evt_test_12345"
_FAKE_EVENT_TYPE = "checkout.session.completed"
_FAKE_CUSTOMER = "cus_test_67890"
_FAKE_SUBSCRIPTION = "sub_test_abcde"


def _fake_checkout_event(**overrides) -> dict:
    return {
        "id": overrides.get("id", _FAKE_EVENT_ID),
        "type": overrides.get("type", _FAKE_EVENT_TYPE),
        "data": {
            "object": {
                "customer": overrides.get("customer", _FAKE_CUSTOMER),
                "subscription": overrides.get("subscription", _FAKE_SUBSCRIPTION),
                "metadata": {"user_id": overrides.get("user_id", "user-test-001")},
            }
        },
    }


# Override get_db_session for direct DB assertions inside tests
def _db_override():
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db_session] = _db_override


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _clear_dependency_overrides():
    yield
    app.dependency_overrides.clear()


# ── tests ────────────────────────────────────────────────────────────────────

class TestWebhookOutbox:
    @patch("app.routers.payments_router.get_settings")
    @patch("app.routers.payments_router.construct_webhook_event")
    @patch("app.routers.payments_router._process_webhook_event")
    def test_event_is_logged_on_first_receipt(
        self,
        mock_process: MagicMock,
        mock_construct: MagicMock,
        mock_settings: MagicMock,
        client: TestClient,
    ) -> None:
        mock_settings.return_value.stripe_webhook_secret = "whsec_test"
        mock_settings.return_value.stripe_secret_key = "sk_test"
        mock_settings.return_value.stripe_price_resident = "price_resident"
        mock_settings.return_value.stripe_price_clinician_pro = "price_clinician_pro"
        mock_settings.return_value.stripe_price_clinic_team = "price_clinic_team"
        """A verified event should create a StripeWebhookLog row with status succeeded."""
        mock_construct.return_value = _fake_checkout_event()

        resp = client.post(
            "/api/v1/payments/webhook",
            content=b"fake-payload",
            headers={"stripe-signature": "fake-sig"},
        )
        assert resp.status_code == 200
        assert resp.json()["received"] is True

        # Direct DB assertion
        db = next(_db_override())
        log = db.query(StripeWebhookLog).filter_by(stripe_event_id=_FAKE_EVENT_ID).first()
        assert log is not None
        assert log.event_type == _FAKE_EVENT_TYPE
        assert log.status == "succeeded"
        assert log.attempt_count == 0
        assert log.last_error is None
        db.close()

    @patch("app.routers.payments_router.get_settings")
    @patch("app.routers.payments_router.construct_webhook_event")
    @patch("app.routers.payments_router._process_webhook_event")
    def test_failure_increments_attempt_and_sets_next_retry_at(
        self,
        mock_process: MagicMock,
        mock_construct: MagicMock,
        mock_settings: MagicMock,
        client: TestClient,
    ) -> None:
        mock_settings.return_value.stripe_webhook_secret = "whsec_test"
        mock_settings.return_value.stripe_secret_key = "sk_test"
        mock_settings.return_value.stripe_price_resident = "price_resident"
        mock_settings.return_value.stripe_price_clinician_pro = "price_clinician_pro"
        mock_settings.return_value.stripe_price_clinic_team = "price_clinic_team"
        """If business logic raises, the log should be failed with backoff scheduled."""
        mock_construct.return_value = _fake_checkout_event(id="evt_fail_001")
        mock_process.side_effect = RuntimeError("DB write timeout")

        resp = client.post(
            "/api/v1/payments/webhook",
            content=b"fake-payload",
            headers={"stripe-signature": "fake-sig"},
        )
        # We must return 200 so Stripe doesn't retry at their layer
        assert resp.status_code == 200
        assert resp.json()["received"] is True

        db = next(_db_override())
        log = db.query(StripeWebhookLog).filter_by(stripe_event_id="evt_fail_001").first()
        assert log is not None
        assert log.status == "failed"
        assert log.attempt_count == 1
        assert log.next_retry_at is not None
        assert log.last_error == "DB write timeout"
        # SQLite DateTime is naive; compare against naive now
        assert log.next_retry_at > datetime.now(timezone.utc).replace(tzinfo=None)
        db.close()

    @patch("app.routers.payments_router.get_settings")
    @patch("app.routers.payments_router.construct_webhook_event")
    @patch("app.routers.payments_router._process_webhook_event")
    def test_success_marks_succeeded_and_prevents_reprocessing(
        self,
        mock_process: MagicMock,
        mock_construct: MagicMock,
        mock_settings: MagicMock,
        client: TestClient,
    ) -> None:
        mock_settings.return_value.stripe_webhook_secret = "whsec_test"
        mock_settings.return_value.stripe_secret_key = "sk_test"
        mock_settings.return_value.stripe_price_resident = "price_resident"
        mock_settings.return_value.stripe_price_clinician_pro = "price_clinician_pro"
        mock_settings.return_value.stripe_price_clinic_team = "price_clinic_team"
        """Duplicate delivery of an already-succeeded event must not re-run logic."""
        mock_construct.return_value = _fake_checkout_event(id="evt_dup_001")

        # First delivery
        resp1 = client.post(
            "/api/v1/payments/webhook",
            content=b"fake-payload",
            headers={"stripe-signature": "fake-sig"},
        )
        assert resp1.status_code == 200

        # Second delivery (same event id)
        resp2 = client.post(
            "/api/v1/payments/webhook",
            content=b"fake-payload",
            headers={"stripe-signature": "fake-sig"},
        )
        assert resp2.status_code == 200

        # Business logic should only have been invoked once
        assert mock_process.call_count == 1

        db = next(_db_override())
        logs = db.query(StripeWebhookLog).filter_by(stripe_event_id="evt_dup_001").all()
        assert len(logs) == 1
        assert logs[0].status == "succeeded"
        db.close()
