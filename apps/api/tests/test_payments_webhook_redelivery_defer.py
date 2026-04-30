"""Regression tests for the Stripe webhook redelivery -> worker hand-off.

Pre-fix the webhook handler bumped any redelivered event (status in
``pending`` / ``failed`` / ``dead``) back to ``pending`` and
synchronously re-ran ``_process_webhook_event``. That had three
problems:

1. Pending + concurrent redelivery double-ran business logic (no
   row-level lock; both calls upsert the same Subscription row).
2. Failed events bypassed the ``next_retry_at`` cool-off, so the
   inline path hammered transient downstream failures.
3. Failed events could overwrite NEWER state from a more recent
   webhook that already succeeded for the same subscription —
   undoing a ``customer.subscription.deleted`` when an earlier
   ``customer.subscription.updated`` got redelivered.

Post-fix every redelivery is handed to the offline retry worker
(``scripts/retry_stripe_webhooks.py``), which honours
``next_retry_at`` and processes events in ``created_at`` order.
Stripe still gets a 200 so it stops redelivering at their layer.
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_session
from app.main import app
from app.persistence.models import StripeWebhookLog


def _db_override():
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db_session] = _db_override


@pytest.fixture(autouse=True)
def _clear_dependency_overrides():
    yield
    app.dependency_overrides.clear()


def _fake_event(event_id: str, event_type: str = "checkout.session.completed") -> dict:
    return {
        "id": event_id,
        "type": event_type,
        "data": {
            "object": {
                "customer": "cus_test_redelivery",
                "subscription": "sub_test_redelivery",
                "metadata": {"user_id": "user-redelivery"},
            }
        },
    }


def _stripe_settings(mock_settings: MagicMock) -> None:
    mock_settings.return_value.stripe_webhook_secret = "whsec_test"
    mock_settings.return_value.stripe_secret_key = "sk_test"
    mock_settings.return_value.stripe_price_resident = "price_resident"
    mock_settings.return_value.stripe_price_clinician_pro = "price_clinician_pro"
    mock_settings.return_value.stripe_price_clinic_team = "price_clinic_team"


# ---------------------------------------------------------------------------
# Failed event redelivery — does NOT re-run inline.
# ---------------------------------------------------------------------------
@patch("app.routers.payments_router.get_settings")
@patch("app.routers.payments_router.construct_webhook_event")
@patch("app.routers.payments_router._process_webhook_event")
def test_failed_event_redelivery_does_not_synchronously_retry(
    mock_process: MagicMock,
    mock_construct: MagicMock,
    mock_settings: MagicMock,
    client: TestClient,
) -> None:
    """Pre-fix this test would fail: redelivery would re-run
    `_process_webhook_event` synchronously, calling it twice."""
    _stripe_settings(mock_settings)
    mock_construct.return_value = _fake_event("evt_redeliv_failed_001")

    # First delivery — fails.
    mock_process.side_effect = RuntimeError("transient")
    resp1 = client.post(
        "/api/v1/payments/webhook",
        content=b"x",
        headers={"stripe-signature": "sig"},
    )
    assert resp1.status_code == 200
    assert mock_process.call_count == 1

    # Stripe redelivers. Pre-fix this would re-run business logic
    # synchronously — call_count would jump to 2 and the inline
    # retry would hammer the same transient error.
    mock_process.reset_mock()
    mock_process.side_effect = None  # whatever — this branch must not be reached
    resp2 = client.post(
        "/api/v1/payments/webhook",
        content=b"x",
        headers={"stripe-signature": "sig"},
    )
    assert resp2.status_code == 200
    assert mock_process.call_count == 0, (
        "Redelivery of a failed event must NOT synchronously re-run "
        "_process_webhook_event — it must defer to the retry worker."
    )

    db = next(_db_override())
    log = db.query(StripeWebhookLog).filter_by(stripe_event_id="evt_redeliv_failed_001").first()
    assert log is not None
    assert log.status == "failed"
    # Attempt count incremented to reflect the redelivery.
    assert log.attempt_count == 2
    # next_retry_at still scheduled for the worker.
    assert log.next_retry_at is not None
    db.close()


# ---------------------------------------------------------------------------
# Pending event redelivery — does NOT double-run.
# ---------------------------------------------------------------------------
@patch("app.routers.payments_router.get_settings")
@patch("app.routers.payments_router.construct_webhook_event")
@patch("app.routers.payments_router._process_webhook_event")
def test_pending_event_redelivery_does_not_double_run(
    mock_process: MagicMock,
    mock_construct: MagicMock,
    mock_settings: MagicMock,
    client: TestClient,
) -> None:
    """A row stuck in ``pending`` (e.g., previous attempt crashed
    mid-flight before status update) must not have business logic
    re-run inline on Stripe redelivery — the offline worker owns
    retries from this point."""
    _stripe_settings(mock_settings)
    mock_construct.return_value = _fake_event("evt_redeliv_pending_001")

    # Manually create a stale pending row, simulating a crash mid-flight.
    db = next(_db_override())
    db.add(StripeWebhookLog(
        stripe_event_id="evt_redeliv_pending_001",
        event_type="checkout.session.completed",
        payload="{}",
        status="pending",
        attempt_count=0,
        next_retry_at=None,
    ))
    db.commit()
    db.close()

    resp = client.post(
        "/api/v1/payments/webhook",
        content=b"x",
        headers={"stripe-signature": "sig"},
    )
    assert resp.status_code == 200
    assert mock_process.call_count == 0, (
        "Stripe redelivery of a row already in `pending` must NOT "
        "race the in-flight worker by re-running business logic inline."
    )


# ---------------------------------------------------------------------------
# Dead event redelivery — does NOT auto-revive.
# ---------------------------------------------------------------------------
@patch("app.routers.payments_router.get_settings")
@patch("app.routers.payments_router.construct_webhook_event")
@patch("app.routers.payments_router._process_webhook_event")
def test_dead_event_redelivery_does_not_revive(
    mock_process: MagicMock,
    mock_construct: MagicMock,
    mock_settings: MagicMock,
    client: TestClient,
) -> None:
    """A row marked ``dead`` (retries exhausted, awaiting manual
    intervention) must NOT be auto-revived to ``pending`` on Stripe
    redelivery — that hides the alert."""
    _stripe_settings(mock_settings)
    mock_construct.return_value = _fake_event("evt_redeliv_dead_001")

    db = next(_db_override())
    db.add(StripeWebhookLog(
        stripe_event_id="evt_redeliv_dead_001",
        event_type="checkout.session.completed",
        payload="{}",
        status="dead",
        attempt_count=10,
        next_retry_at=None,
    ))
    db.commit()
    db.close()

    resp = client.post(
        "/api/v1/payments/webhook",
        content=b"x",
        headers={"stripe-signature": "sig"},
    )
    assert resp.status_code == 200
    assert mock_process.call_count == 0

    db = next(_db_override())
    log = db.query(StripeWebhookLog).filter_by(stripe_event_id="evt_redeliv_dead_001").first()
    assert log is not None
    assert log.status == "dead", "Dead row must stay dead on redelivery"
    db.close()
