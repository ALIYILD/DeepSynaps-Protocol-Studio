"""Unit + HTTP tests for Slack abuse-signal alerting (Phase 7).

Covers
======

* :func:`ops_alerting.post_alert` env-var gating, dedupe key, transport
  paths and Slack 4xx/5xx handling.
* :func:`ops_alerting.scan_and_alert_abuse_signals` — quiet pairs do not
  alert, a 10x-median pair does, and the dedupe table prevents repeated
  posts for the same hour bucket.
* HTTP gating for ``POST /api/v1/agent-admin/ops/scan-abuse``: super-admin
  only; clinic-scoped admins and clinicians get 403.
"""
from __future__ import annotations

import json as _json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import SessionLocal
from app.main import app
from app.persistence.models import AgentRunAudit, Clinic
from app.services import ops_alerting


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_dedupe():
    """Each test starts with an empty dedupe set."""
    ops_alerting._reset_dedupe_for_tests()
    yield
    ops_alerting._reset_dedupe_for_tests()


@pytest.fixture(autouse=True)
def _scrub_webhook_env(monkeypatch):
    """Tests opt in to a webhook URL explicitly via ``with_webhook``."""
    monkeypatch.delenv("SLACK_OPS_WEBHOOK_URL", raising=False)
    yield


@pytest.fixture
def with_webhook(monkeypatch):
    """Set the webhook env var to a sentinel URL for the test scope."""
    monkeypatch.setenv("SLACK_OPS_WEBHOOK_URL", "https://hooks.slack.test/T0/B0/X0")
    yield "https://hooks.slack.test/T0/B0/X0"


@pytest.fixture
def db_session():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def super_admin_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-super-admin",
        display_name="Super Admin",
        role="admin",  # type: ignore[arg-type]
        package_id="enterprise",
        clinic_id=None,
    )


@pytest.fixture
def super_admin_client(super_admin_actor: AuthenticatedActor):
    app.dependency_overrides[get_authenticated_actor] = lambda: super_admin_actor
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_authenticated_actor, None)


def _seed_audit_row(
    *,
    db,
    agent_id: str,
    clinic_id: str | None,
    created_at: datetime | None = None,
) -> AgentRunAudit:
    if clinic_id is not None and db.query(Clinic).filter_by(id=clinic_id).first() is None:
        db.add(Clinic(id=clinic_id, name=clinic_id))
        db.flush()
    row = AgentRunAudit(
        actor_id="actor-clinician-demo",
        clinic_id=clinic_id,
        agent_id=agent_id,
        message_preview="m",
        reply_preview="r",
        latency_ms=10,
        ok=True,
    )
    if created_at is not None:
        row.created_at = (
            created_at.replace(tzinfo=None)
            if created_at.tzinfo is not None
            else created_at
        )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# post_alert
# ---------------------------------------------------------------------------


def test_post_alert_no_webhook_is_silent_noop():
    result = ops_alerting.post_alert(
        severity="high", title="t", body="b"
    )
    assert result == {"ok": True, "reason": "no_webhook_configured", "status_code": None}


def test_post_alert_posts_structured_body_to_webhook(with_webhook):
    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 200
    with patch.object(httpx, "post", return_value=fake_resp) as p:
        result = ops_alerting.post_alert(
            severity="high",
            title="Pair noisy",
            body="clinic-x ran 50 turns",
        )
    assert result == {"ok": True, "reason": None, "status_code": 200}
    p.assert_called_once()
    kwargs = p.call_args.kwargs
    args = p.call_args.args
    # url is positional or keyword
    assert (args and args[0] == with_webhook) or kwargs.get("url") == with_webhook
    payload = kwargs["json"]
    assert payload["text"].startswith("[HIGH]")
    assert payload["attachments"][0]["color"] == "#d9534f"
    assert payload["attachments"][0]["title"] == "Pair noisy"
    assert payload["attachments"][0]["text"] == "clinic-x ran 50 turns"


def test_post_alert_color_per_severity(with_webhook):
    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 200
    seen: list[str] = []

    def _capture(url, json, timeout):
        seen.append(json["attachments"][0]["color"])
        return fake_resp

    with patch.object(httpx, "post", side_effect=_capture):
        ops_alerting.post_alert(severity="low", title="t", body="b")
        ops_alerting.post_alert(severity="med", title="t", body="b")
        ops_alerting.post_alert(severity="high", title="t", body="b")

    assert seen == ["#3a87ad", "#f0ad4e", "#d9534f"]


def test_post_alert_slack_4xx_returns_failure_without_raising(with_webhook):
    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 403
    with patch.object(httpx, "post", return_value=fake_resp):
        result = ops_alerting.post_alert(severity="high", title="t", body="b")
    assert result["ok"] is False
    assert result["reason"] == "slack_4xx"
    assert result["status_code"] == 403


def test_post_alert_slack_5xx_returns_failure_without_raising(with_webhook):
    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 503
    with patch.object(httpx, "post", return_value=fake_resp):
        result = ops_alerting.post_alert(severity="high", title="t", body="b")
    assert result["ok"] is False
    assert result["reason"] == "slack_5xx"
    assert result["status_code"] == 503


def test_post_alert_transport_error_returns_failure(with_webhook):
    with patch.object(
        httpx, "post", side_effect=httpx.ConnectError("dns failed")
    ):
        result = ops_alerting.post_alert(severity="high", title="t", body="b")
    assert result["ok"] is False
    assert result["reason"] == "transport_error"


def test_post_alert_dedupe_key_blocks_second_call(with_webhook):
    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 200
    with patch.object(httpx, "post", return_value=fake_resp) as p:
        first = ops_alerting.post_alert(
            severity="high", title="t", body="b", dedupe_key="k1"
        )
        second = ops_alerting.post_alert(
            severity="high", title="t", body="b", dedupe_key="k1"
        )
    assert first["ok"] is True and first["reason"] is None
    assert second == {"ok": True, "reason": "deduped", "status_code": None}
    assert p.call_count == 1


# ---------------------------------------------------------------------------
# scan_and_alert_abuse_signals
# ---------------------------------------------------------------------------


def test_scan_no_high_signals_posts_nothing(db_session, with_webhook):
    """Three quiet pairs at 1 run each — nothing exceeds 5x median."""
    for cid in ("clinic-a", "clinic-b", "clinic-c"):
        _seed_audit_row(db=db_session, clinic_id=cid, agent_id="clinic.reception")
    with patch.object(httpx, "post") as p:
        result = ops_alerting.scan_and_alert_abuse_signals(db_session)
    assert result == {"scanned": 0, "posted": 0, "dedupe_skipped": 0}
    p.assert_not_called()


def test_scan_one_high_signal_posts_once(db_session, with_webhook):
    """5 quiet pairs at 1 run each, one noisy pair at 10 runs → 10x median."""
    for i in range(5):
        _seed_audit_row(
            db=db_session,
            clinic_id=f"clinic-quiet-{i}",
            agent_id="clinic.reception",
        )
    for _ in range(10):
        _seed_audit_row(
            db=db_session, clinic_id="clinic-noisy", agent_id="clinic.reporting"
        )

    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 200
    with patch.object(httpx, "post", return_value=fake_resp) as p:
        result = ops_alerting.scan_and_alert_abuse_signals(db_session)

    assert result["scanned"] == 1
    assert result["posted"] == 1
    assert result["dedupe_skipped"] == 0
    assert p.call_count == 1
    payload = p.call_args.kwargs["json"]
    assert "clinic-noisy" in payload["attachments"][0]["text"]
    assert "clinic.reporting" in payload["attachments"][0]["text"]
    assert payload["attachments"][0]["color"] == "#d9534f"


def test_scan_dedupes_same_signal_within_hour(db_session, with_webhook):
    """Run the scanner twice in the same hour — the second call must skip."""
    for i in range(5):
        _seed_audit_row(
            db=db_session,
            clinic_id=f"clinic-quiet-{i}",
            agent_id="clinic.reception",
        )
    for _ in range(10):
        _seed_audit_row(
            db=db_session, clinic_id="clinic-noisy", agent_id="clinic.reporting"
        )

    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 200
    with patch.object(httpx, "post", return_value=fake_resp) as p:
        first = ops_alerting.scan_and_alert_abuse_signals(db_session)
        second = ops_alerting.scan_and_alert_abuse_signals(db_session)

    assert first == {"scanned": 1, "posted": 1, "dedupe_skipped": 0}
    assert second == {"scanned": 1, "posted": 0, "dedupe_skipped": 1}
    assert p.call_count == 1


def test_scan_with_no_audit_rows_returns_zero(db_session, with_webhook):
    result = ops_alerting.scan_and_alert_abuse_signals(db_session)
    assert result == {"scanned": 0, "posted": 0, "dedupe_skipped": 0}


def test_scan_severity_threshold_filters_low(db_session, with_webhook):
    """A 6x signal classifies as 'low'; default threshold 'high' suppresses it."""
    # 5 quiet pairs at 1 each.
    for i in range(5):
        _seed_audit_row(
            db=db_session,
            clinic_id=f"clinic-quiet-{i}",
            agent_id="clinic.reception",
        )
    # One pair at 6 runs → 6x the median (1) → 'low' severity.
    for _ in range(6):
        _seed_audit_row(
            db=db_session, clinic_id="clinic-warm", agent_id="clinic.reporting"
        )

    fake_resp = MagicMock(spec=httpx.Response)
    fake_resp.status_code = 200
    with patch.object(httpx, "post", return_value=fake_resp) as p:
        # Default threshold 'high' — must skip the 'low' signal.
        result = ops_alerting.scan_and_alert_abuse_signals(db_session)
        assert result == {"scanned": 0, "posted": 0, "dedupe_skipped": 0}
        p.assert_not_called()

        # Lowering the threshold to 'low' should fire the alert.
        ops_alerting._reset_dedupe_for_tests()
        result2 = ops_alerting.scan_and_alert_abuse_signals(
            db_session, severity_threshold="low"
        )
        assert result2["scanned"] == 1
        assert result2["posted"] == 1


# ---------------------------------------------------------------------------
# HTTP endpoint gating
# ---------------------------------------------------------------------------


def test_scan_abuse_endpoint_requires_super_admin_clinician_403(
    client: TestClient, auth_headers: dict
):
    resp = client.post(
        "/api/v1/agent-admin/ops/scan-abuse",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403, resp.text


def test_scan_abuse_endpoint_clinic_admin_403(
    client: TestClient, auth_headers: dict
):
    """Demo admin token resolves to a clinic-bound admin → 403 ops_admin_required."""
    resp = client.post(
        "/api/v1/agent-admin/ops/scan-abuse",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 403, resp.text
    body_txt = resp.text
    assert "ops_admin_required" in body_txt


def test_scan_abuse_endpoint_unauthenticated_rejected(client: TestClient):
    resp = client.post("/api/v1/agent-admin/ops/scan-abuse")
    assert resp.status_code in (401, 403)


def test_scan_abuse_endpoint_super_admin_ok(super_admin_client: TestClient):
    """No webhook configured → scanner returns 0/0/0 without erroring."""
    resp = super_admin_client.post("/api/v1/agent-admin/ops/scan-abuse")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"scanned": 0, "posted": 0, "dedupe_skipped": 0}


def test_scan_abuse_endpoint_rejects_invalid_severity(
    super_admin_client: TestClient,
):
    resp = super_admin_client.post(
        "/api/v1/agent-admin/ops/scan-abuse?severity_threshold=critical"
    )
    assert resp.status_code == 422
