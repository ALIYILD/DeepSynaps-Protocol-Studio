"""Tests for the Channel-Specific Auth Health Probe launch-audit
(CSAHP1, 2026-05-02).

Closes section I rec from the Coaching Digest Delivery Failure
Drilldown launch audit (DCRO5, #406). The drilldown's
``has_matching_misconfig_flag`` join only fires AFTER a delivery has
failed — by the time DCRO5 lights up the resolver has missed at
least one digest. THIS suite asserts that the new background worker:

* probes each configured adapter's credentials with a mock-injected
  httpx client,
* classifies probe outcomes correctly (auth/rate_limit/unreachable/other),
* emits ``channel_auth_health_probe.auth_drift_detected`` BEFORE the
  next digest dispatch fails,
* honours a 24h cooldown per (clinic, channel) for both healthy AND
  unhealthy emissions,
* respects the role gate (clinician read OK / admin tick OK / patient
  + guest 403),
* hides cross-clinic data from clinicians,
* surfaces honest status counts on ``GET /status``,
* surface whitelisted in audit_trail_router KNOWN_SURFACES + qeeg-analysis
  audit-events ingestion,
* tick still runs even when the auto-loop is suppressed via env var
  (admin can manually invoke).
"""
from __future__ import annotations

import os
from datetime import datetime as _dt, timedelta as _td, timezone as _tz
from typing import Any, Optional
from unittest import mock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, User


# Make sure the env-var-gated start path stays disabled in tests so we
# don't accidentally fire a real BackgroundScheduler thread inside
# pytest. Tests that exercise the worker call ``tick()`` synchronously.
os.environ.pop("CHANNEL_AUTH_HEALTH_PROBE_ENABLED", None)


# ── Fixtures / helpers ──────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_worker_singleton() -> None:
    from app.workers.channel_auth_health_probe_worker import _reset_for_tests

    _reset_for_tests()
    yield
    _reset_for_tests()


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type == "channel_auth_health_probe"
        ).delete(synchronize_session=False)
        db.query(User).filter(
            User.id.in_(
                [
                    "actor-csahp-other-clinic",
                ]
            )
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


@pytest.fixture
def slack_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-test-token")


@pytest.fixture
def sendgrid_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENDGRID_API_KEY", "SG.test")
    monkeypatch.setenv("SENDGRID_FROM_ADDRESS", "noreply@example.com")


@pytest.fixture
def twilio_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "ACtestsid")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "testtoken")
    monkeypatch.setenv("TWILIO_FROM_NUMBER", "+15555550100")


@pytest.fixture
def pagerduty_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PAGERDUTY_API_KEY", "pd-test-key")
    monkeypatch.setenv("PAGERDUTY_ROUTING_KEY", "pd-test-route")


@pytest.fixture
def all_creds(
    slack_creds, sendgrid_creds, twilio_creds, pagerduty_creds
) -> None:
    return None


# ── Mock client factory ─────────────────────────────────────────────────────


def _mock_response(
    *,
    status_code: int = 200,
    json_payload: Optional[dict] = None,
) -> mock.Mock:
    resp = mock.Mock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json = mock.Mock(return_value=json_payload or {})
    resp.headers = {}
    resp.text = ""
    return resp


class _StubClient:
    """Stand-in for httpx.Client supporting `with` + `.get()`."""

    def __init__(self, response_or_exc: Any) -> None:
        self._payload = response_or_exc
        self.calls: list[dict[str, Any]] = []

    def __enter__(self) -> "_StubClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def get(self, *args: Any, **kwargs: Any) -> mock.Mock:
        self.calls.append({"args": args, "kwargs": kwargs})
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def _factory_for(payload: Any):
    """Return a ``httpx_client`` callable that always yields a stub
    pre-loaded with ``payload`` (response mock or exception)."""

    def _factory(*args: Any, **kwargs: Any) -> _StubClient:
        return _StubClient(payload)

    return _factory


# ── 1. Surface whitelist sanity ─────────────────────────────────────────────


def test_worker_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "channel_auth_health_probe" in KNOWN_SURFACES


def test_worker_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "surface": "channel_auth_health_probe",
        "note": "whitelist sanity",
    }
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("channel_auth_health_probe-")


# ── 2. Role gate ────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_status_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/channel-auth-health-probe/status",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_guest_status_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/channel-auth-health-probe/status",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_clinician_can_read_status(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/channel-auth-health-probe/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "enabled" in data
        assert "interval_hours" in data
        assert "cooldown_hours" in data
        assert "per_channel" in data
        assert isinstance(data["per_channel"], dict)
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]

    def test_clinician_tick_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/channel-auth-health-probe/tick",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_admin_can_tick(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/channel-auth-health-probe/tick",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["accepted"] is True
        assert data["clinic_id"] == "clinic-demo-default"
        assert data["audit_event_id"].startswith("channel_auth_health_probe-")


# ── 3. Cross-clinic isolation ───────────────────────────────────────────────


class TestCrossClinic:
    def test_tick_only_scopes_to_actor_clinic(
        self,
        client: TestClient,
        auth_headers: dict,
        slack_creds,
    ) -> None:
        # Even with creds set, the tick is bounded to actor's clinic.
        r = client.post(
            "/api/v1/channel-auth-health-probe/tick",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["clinic_id"] == "clinic-demo-default"

    def test_audit_events_scoped_to_actor_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed an other-clinic audit row that should NOT surface.
        db = SessionLocal()
        try:
            from app.repositories.audit import create_audit_event

            now = _dt.now(_tz.utc).isoformat()
            create_audit_event(
                db,
                event_id="csahp-test-other-clinic",
                target_id="clinic-csahp-other",
                target_type="channel_auth_health_probe",
                action="channel_auth_health_probe.auth_drift_detected",
                role="admin",
                actor_id="other-clinic-actor",
                note="priority=high; clinic_id=clinic-csahp-other; channel=slack; error_class=auth",
                created_at=now,
            )
        finally:
            db.close()

        r = client.get(
            "/api/v1/channel-auth-health-probe/audit-events",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for it in data["items"]:
            assert "clinic_id=clinic-csahp-other" not in (it.get("note") or "")


# ── 4. Probe outcomes (httpx-mock-injected) ────────────────────────────────


class TestProbeOutcomes:
    def test_mocked_success_emits_no_auth_drift(
        self,
        client: TestClient,
        auth_headers: dict,
        slack_creds,
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        # Slack returns 200 + {ok: true} — healthy.
        resp = _mock_response(status_code=200, json_payload={"ok": True})
        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(resp),
            )
        finally:
            db.close()

        assert result.auth_drift_detected == 0, (
            f"unexpected drift: probes_run={result.probes_run} "
            f"healthy={result.healthy} errors={result.errors} "
            f"last_error={result.last_error}"
        )
        assert result.healthy >= 1
        assert result.per_channel_status.get("slack") == "healthy"

    def test_mocked_401_emits_auth_drift_with_error_class_auth(
        self,
        client: TestClient,
        auth_headers: dict,
        sendgrid_creds,
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        resp = _mock_response(status_code=401, json_payload={})
        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="sendgrid",
                httpx_client=_factory_for(resp),
            )
        finally:
            db.close()

        assert result.auth_drift_detected == 1
        assert result.healthy == 0
        # Lookup the emitted audit row + check error_class.
        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.target_type == "channel_auth_health_probe",
                    AuditEventRecord.action
                    == "channel_auth_health_probe.auth_drift_detected",
                )
                .all()
            )
            assert len(rows) == 1
            note = (rows[0].note or "").lower()
            assert "error_class=auth" in note
            assert "channel=sendgrid" in note
            assert "priority=high" in note
        finally:
            db.close()

    def test_mocked_429_emits_auth_drift_with_error_class_rate_limit(
        self,
        client: TestClient,
        auth_headers: dict,
        twilio_creds,
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        resp = _mock_response(status_code=429)
        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="twilio",
                httpx_client=_factory_for(resp),
            )
        finally:
            db.close()

        assert result.auth_drift_detected == 1
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "channel_auth_health_probe.auth_drift_detected"
                )
                .first()
            )
            assert row is not None
            assert "error_class=rate_limit" in (row.note or "")
        finally:
            db.close()

    def test_mocked_503_emits_auth_drift_with_error_class_unreachable(
        self,
        client: TestClient,
        auth_headers: dict,
        pagerduty_creds,
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        resp = _mock_response(status_code=503)
        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="pagerduty",
                httpx_client=_factory_for(resp),
            )
        finally:
            db.close()

        assert result.auth_drift_detected == 1
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "channel_auth_health_probe.auth_drift_detected"
                )
                .first()
            )
            assert row is not None
            assert "error_class=unreachable" in (row.note or "")
        finally:
            db.close()

    def test_mocked_timeout_emits_auth_drift_with_error_class_unreachable(
        self,
        client: TestClient,
        auth_headers: dict,
        slack_creds,
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(
                    httpx.TimeoutException("simulated 10s timeout")
                ),
            )
        finally:
            db.close()

        assert result.auth_drift_detected == 1
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "channel_auth_health_probe.auth_drift_detected"
                )
                .first()
            )
            assert row is not None
            assert "error_class=unreachable" in (row.note or "")
        finally:
            db.close()


# ── 5. Healthy emission ─────────────────────────────────────────────────────


class TestHealthyEmission:
    def test_healthy_probe_emits_priority_info_row(
        self,
        client: TestClient,
        auth_headers: dict,
        sendgrid_creds,
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        resp = _mock_response(status_code=200, json_payload={"scopes": []})
        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="sendgrid",
                httpx_client=_factory_for(resp),
            )
        finally:
            db.close()

        assert result.healthy == 1
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "channel_auth_health_probe.healthy"
                )
                .first()
            )
            assert row is not None
            note = (row.note or "")
            assert "priority=info" in note
            assert "channel=sendgrid" in note
        finally:
            db.close()


# ── 6. Cooldown ─────────────────────────────────────────────────────────────


class TestCooldown:
    def test_cooldown_skips_re_emission_within_24h(
        self,
        client: TestClient,
        auth_headers: dict,
        slack_creds,
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        resp = _mock_response(status_code=401)
        worker = get_worker()
        db = SessionLocal()
        try:
            r1 = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(resp),
            )
            r2 = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(resp),
            )
        finally:
            db.close()

        assert r1.auth_drift_detected == 1
        assert r2.auth_drift_detected == 0
        assert r2.skipped_cooldown >= 1

    def test_cooldown_lifts_after_24h(
        self,
        client: TestClient,
        auth_headers: dict,
        slack_creds,
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        # Seed a stale row > 24h ago.
        db = SessionLocal()
        try:
            from app.repositories.audit import create_audit_event

            stale = (_dt.now(_tz.utc) - _td(hours=48)).isoformat()
            create_audit_event(
                db,
                event_id="csahp-test-stale",
                target_id="clinic-demo-default",
                target_type="channel_auth_health_probe",
                action="channel_auth_health_probe.auth_drift_detected",
                role="admin",
                actor_id="channel-auth-health-probe-worker",
                note="priority=high; clinic_id=clinic-demo-default; channel=slack; error_class=auth",
                created_at=stale,
            )
        finally:
            db.close()

        resp = _mock_response(status_code=401)
        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(resp),
            )
        finally:
            db.close()

        # Stale row is older than cooldown — new emission goes through.
        assert result.auth_drift_detected == 1
        assert result.skipped_cooldown == 0


# ── 7. Scoping ──────────────────────────────────────────────────────────────


class TestScoping:
    def test_only_channel_bounds_to_one_channel(
        self,
        client: TestClient,
        auth_headers: dict,
        all_creds,
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        resp = _mock_response(status_code=200, json_payload={"ok": True})
        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(resp),
            )
        finally:
            db.close()

        # Only one channel probed even though all 4 have creds.
        assert result.probes_run == 1
        assert result.per_channel_status.get("slack") == "healthy"
        assert "sendgrid" not in result.per_channel_status

    def test_missing_creds_means_status_never(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # No creds set anywhere — all 4 channels skip with "never".
        from app.workers.channel_auth_health_probe_worker import get_worker

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db, only_clinic_id="clinic-demo-default"
            )
        finally:
            db.close()

        assert result.probes_run == 0
        assert result.skipped_no_creds >= 4  # 4 channels
        assert result.auth_drift_detected == 0
        assert result.healthy == 0
        for ch in ("slack", "sendgrid", "twilio", "pagerduty"):
            assert result.per_channel_status.get(ch) == "never"


# ── 8. Status endpoint ──────────────────────────────────────────────────────


class TestStatusEndpoint:
    def test_status_returns_per_channel_grid(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/channel-auth-health-probe/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        per = data["per_channel"]
        assert set(per.keys()) == {"slack", "sendgrid", "twilio", "pagerduty"}
        for ch, snap in per.items():
            assert "status" in snap
            assert "last_probed_at" in snap

    def test_status_enabled_flag_reflects_env_var(
        self,
        client: TestClient,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("CHANNEL_AUTH_HEALTH_PROBE_ENABLED", "true")
        r = client.get(
            "/api/v1/channel-auth-health-probe/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["enabled"] is True

        monkeypatch.delenv("CHANNEL_AUTH_HEALTH_PROBE_ENABLED", raising=False)
        r = client.get(
            "/api/v1/channel-auth-health-probe/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["enabled"] is False

    def test_status_reflects_last_probed_at_after_tick(
        self,
        client: TestClient,
        auth_headers: dict,
        slack_creds,
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        resp = _mock_response(status_code=200, json_payload={"ok": True})
        worker = get_worker()
        db = SessionLocal()
        try:
            worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(resp),
            )
        finally:
            db.close()

        r = client.get(
            "/api/v1/channel-auth-health-probe/status",
            headers=auth_headers["clinician"],
        )
        data = r.json()
        slack = data["per_channel"]["slack"]
        assert slack["status"] == "healthy"
        assert slack["last_probed_at"] is not None


# ── 9. Audit-events pagination ──────────────────────────────────────────────


class TestAuditEvents:
    def test_audit_events_paginates(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/channel-auth-health-probe/audit-events?limit=5&offset=0",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        assert data["limit"] == 5
        assert data["offset"] == 0
        assert data["surface"] == "channel_auth_health_probe"


# ── 10. DCRO5 join-back compatibility ───────────────────────────────────────


class TestDCRO5Join:
    def test_emitted_row_carries_channel_for_dcro5_join(
        self,
        client: TestClient,
        auth_headers: dict,
        slack_creds,
    ) -> None:
        """DCRO5's ``has_matching_misconfig_flag`` join uses ``channel``
        and the ISO week of ``created_at``. Make sure both are present
        in the emitted note + row so the join-back works."""
        from app.workers.channel_auth_health_probe_worker import get_worker

        resp = _mock_response(status_code=401)
        worker = get_worker()
        db = SessionLocal()
        try:
            worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(resp),
            )
        finally:
            db.close()

        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "channel_auth_health_probe.auth_drift_detected"
                )
                .first()
            )
            assert row is not None
            note = row.note or ""
            assert "channel=slack" in note
            assert row.created_at  # ISO timestamp present for week-of join
        finally:
            db.close()


# ── 11. Worker disabled but admin can still tick ────────────────────────────


class TestWorkerDisabled:
    def test_admin_can_tick_when_env_disabled(
        self,
        client: TestClient,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Env explicitly off — no auto-loop spinning.
        monkeypatch.delenv("CHANNEL_AUTH_HEALTH_PROBE_ENABLED", raising=False)
        from app.workers.channel_auth_health_probe_worker import env_enabled

        assert env_enabled() is False

        r = client.post(
            "/api/v1/channel-auth-health-probe/tick",
            headers=auth_headers["admin"],
        )
        # Tick still accepted — admin can manually invoke at any time.
        assert r.status_code == 200, r.text
        assert r.json()["accepted"] is True


# ── 12. Tick body validation ────────────────────────────────────────────────


class TestTickBody:
    def test_tick_with_unknown_channel_400s(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/channel-auth-health-probe/tick",
            headers=auth_headers["admin"],
            json={"channel": "carrierpigeon"},
        )
        assert r.status_code in (400, 422), r.text

    def test_tick_with_known_channel_succeeds(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/channel-auth-health-probe/tick",
            headers=auth_headers["admin"],
            json={"channel": "slack"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["channel"] == "slack"
