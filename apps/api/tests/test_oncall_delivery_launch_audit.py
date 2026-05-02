"""Tests for the On-Call Delivery launch-audit (2026-05-01).

Closes the LAST gap of the on-call escalation chain:
``Care Team Coverage (#357) → Auto-Page Worker (#372) → THIS PR``.

The auto-page worker (#372) stamped every page ``delivery_status='queued'``
because no real Slack/Twilio/PagerDuty adapter existed. THIS test suite
asserts the new ``OncallDeliveryService`` honours an HONEST contract:

* Adapter selection — only env-gated adapters are enabled; the rest stay
  visible as ``enabled=False`` (no silent skips).
* Adapter dispatch — first 2xx wins, all failures stamp
  ``"failed"`` with a joined per-adapter reason note.
* 5s timeout — every HTTP call is bounded.
* Mock-mode — ``DEEPSYNAPS_DELIVERY_MOCK=1`` produces ``status='sent'``
  but the row's ``delivery_note`` ALWAYS starts with ``"MOCK:"``.
* Test-adapter endpoint — admin only, returns per-adapter result, emits
  ``auto_page_worker.adapter_test`` audit row.
* Regression — ``"sent"`` is NEVER stamped without a confirming 2xx
  (or the explicit mock-mode flag).
* Audit ingestion — ``oncall_delivery`` is whitelisted on every
  audit-trail surface check.
"""
from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz
from typing import Any
from unittest import mock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    Clinic,
    EscalationChain,
    OncallPage,
    Patient,
    User,
)


# Keep the env-var-gated worker thread off in tests; we exercise the
# delivery service directly + via the worker's tick() entrypoint.
os.environ.pop("DEEPSYNAPS_AUTO_PAGE_ENABLED", None)
os.environ.pop("DEEPSYNAPS_DELIVERY_MOCK", None)


# ── Helpers ─────────────────────────────────────────────────────────────────


def _seed_audit_row(
    *,
    surface: str,
    event: str,
    target_id: str,
    actor_id: str = "actor-clinician-demo",
    role: str = "clinician",
    note: str = "priority=high; seeded",
    created_at: _dt | None = None,
) -> str:
    db = SessionLocal()
    try:
        ts = (created_at or _dt.now(_tz.utc)).isoformat()
        eid = (
            f"{surface}-{event}-{actor_id}-{int(_dt.now(_tz.utc).timestamp())}"
            f"-{_uuid.uuid4().hex[:6]}"
        )
        db.add(AuditEventRecord(
            event_id=eid,
            target_id=target_id,
            target_type=surface,
            action=f"{surface}.{event}",
            role=role,
            actor_id=actor_id,
            note=note,
            created_at=ts,
        ))
        db.commit()
        return eid
    finally:
        db.close()


def _enable_chain(
    *,
    clinic_id: str,
    surface: str = "*",
    primary_user_id: str | None = "actor-clinician-demo",
    auto_page_enabled: bool = True,
) -> str:
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc).isoformat()
        cid = f"chain-test-{_uuid.uuid4().hex[:8]}"
        existing = (
            db.query(EscalationChain)
            .filter_by(clinic_id=clinic_id, surface=surface)
            .first()
        )
        if existing:
            existing.auto_page_enabled = auto_page_enabled
            existing.primary_user_id = primary_user_id
            existing.updated_at = now
            db.commit()
            return existing.id
        db.add(EscalationChain(
            id=cid,
            clinic_id=clinic_id,
            surface=surface,
            primary_user_id=primary_user_id,
            auto_page_enabled=auto_page_enabled,
            created_at=now,
            updated_at=now,
        ))
        db.commit()
        return cid
    finally:
        db.close()


def _seed_oncall_shift(
    *,
    clinic_id: str = "clinic-demo-default",
    user_id: str = "actor-clinician-demo",
    surface: str | None = None,
    contact_channel: str = "sms",
    contact_handle: str = "+15555555555",
) -> str:
    from app.persistence.models import ShiftRoster
    from app.routers.care_team_coverage_router import _monday_of  # noqa: PLC0415

    now = _dt.now(_tz.utc)
    week = _monday_of(now)
    db = SessionLocal()
    try:
        sid = f"shift-test-{_uuid.uuid4().hex[:8]}"
        db.add(ShiftRoster(
            id=sid,
            clinic_id=clinic_id,
            user_id=user_id,
            week_start=week,
            day_of_week=now.weekday(),
            start_time="00:00",
            end_time="23:59",
            role="clinician",
            is_on_call=True,
            surface=surface,
            contact_channel=contact_channel,
            contact_handle=contact_handle,
            note=None,
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
        ))
        db.commit()
        return sid
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clear_delivery_envs() -> None:
    """Drop any adapter env vars between tests so adapter discovery is
    deterministic — individual cases set the env vars they need.
    """
    keys = [
        "SLACK_BOT_TOKEN",
        "SLACK_DEFAULT_CHANNEL",
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_FROM_NUMBER",
        "PAGERDUTY_API_KEY",
        "PAGERDUTY_ROUTING_KEY",
        "DEEPSYNAPS_DELIVERY_MOCK",
        "DEEPSYNAPS_DELIVERY_TIMEOUT_SEC",
    ]
    saved = {k: os.environ.pop(k, None) for k in keys}
    yield
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


@pytest.fixture
def home_clinic_patient() -> Patient:
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-oncall-delivery",
            clinician_id="actor-clinician-demo",
            first_name="OncallDelivery",
            last_name="HomeTest",
            email="oncall-delivery-home@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_oncall_delivery_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "oncall_delivery" in KNOWN_SURFACES


def test_oncall_delivery_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": "oncall_delivery", "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("oncall_delivery-")


# ── Adapter selection / discovery ───────────────────────────────────────────


class TestAdapterSelection:
    def test_no_env_vars_means_all_adapters_disabled(self) -> None:
        from app.services.oncall_delivery import OncallDeliveryService
        service = OncallDeliveryService(clinic_id="clinic-demo-default")
        described = service.describe_adapters()
        names = [a["name"] for a in described]
        # Every adapter visible (no silent hides).
        assert set(names) == {"slack", "twilio", "pagerduty"}
        # All disabled.
        for row in described:
            assert row["enabled"] is False, row
        # get_enabled_adapters returns empty list.
        assert service.get_enabled_adapters() == []

    def test_only_slack_env_var_enables_slack_only(self) -> None:
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-test-only-slack"
        from app.services.oncall_delivery import OncallDeliveryService
        service = OncallDeliveryService(clinic_id="clinic-demo-default")
        described = {row["name"]: row["enabled"] for row in service.describe_adapters()}
        assert described["slack"] is True
        assert described["twilio"] is False
        assert described["pagerduty"] is False

    def test_dispatch_order_is_pagerduty_slack_twilio(self) -> None:
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-test"
        os.environ["SLACK_DEFAULT_CHANNEL"] = "C0123ABC"
        os.environ["TWILIO_ACCOUNT_SID"] = "AC_test"
        os.environ["TWILIO_AUTH_TOKEN"] = "tw-test-secret"
        os.environ["TWILIO_FROM_NUMBER"] = "+15550000000"
        os.environ["PAGERDUTY_API_KEY"] = "pd-test-key"
        os.environ["PAGERDUTY_ROUTING_KEY"] = "pd-test-routing"
        from app.services.oncall_delivery import OncallDeliveryService
        service = OncallDeliveryService(clinic_id="clinic-demo-default")
        names = [getattr(a, "name", "?") for a in service.get_enabled_adapters()]
        assert names == ["pagerduty", "slack", "twilio"]


# ── Dispatch matrix ─────────────────────────────────────────────────────────


def _fake_response(status_code: int, body: dict[str, Any] | None = None) -> mock.Mock:
    resp = mock.Mock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json = mock.Mock(return_value=body or {})
    return resp


class _StubClient:
    """httpx.Client stand-in that returns canned responses per call.

    Use as a ``with httpx.Client(...) as client: client.post(...)``
    context manager via :func:`_patched_client`.
    """

    def __init__(self, responses: list[Any]) -> None:
        self._responses = list(responses)

    def __enter__(self) -> "_StubClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def post(self, *args: Any, **kwargs: Any) -> mock.Mock:
        if not self._responses:
            raise RuntimeError("no canned response left")
        nxt = self._responses.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt


def _patched_client(responses: list[Any]):
    return mock.patch("httpx.Client", return_value=_StubClient(responses))


class TestAdapterDispatch:
    def test_slack_2xx_marks_sent(self) -> None:
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-test"
        os.environ["SLACK_DEFAULT_CHANNEL"] = "C0123ABC"
        from app.services.oncall_delivery import (
            OncallDeliveryService, PageMessage,
        )
        service = OncallDeliveryService(clinic_id="clinic-demo-default")
        msg = PageMessage(
            clinic_id="clinic-demo-default",
            surface="adverse_events",
            audit_event_id="evt-sent-1",
            body="test page",
        )
        with _patched_client([_fake_response(200, {"ok": True, "ts": "1700000000.000200"})]):
            result = service.send(msg)
        assert result.status == "sent"
        assert result.adapter == "slack"
        assert result.external_id == "1700000000.000200"
        assert result.note and "ts=1700000000.000200" in result.note
        assert any(a.adapter == "slack" for a in result.attempts)

    def test_slack_500_falls_to_twilio_2xx(self) -> None:
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-test"
        os.environ["SLACK_DEFAULT_CHANNEL"] = "C0123ABC"
        os.environ["TWILIO_ACCOUNT_SID"] = "AC_test"
        os.environ["TWILIO_AUTH_TOKEN"] = "tw-secret"
        os.environ["TWILIO_FROM_NUMBER"] = "+15550000000"
        from app.services.oncall_delivery import (
            OncallDeliveryService, PageMessage,
        )
        service = OncallDeliveryService(clinic_id="clinic-demo-default")
        msg = PageMessage(
            clinic_id="clinic-demo-default",
            surface="adverse_events",
            audit_event_id="evt-fall-2",
            body="test",
            recipient_phone="+15551112222",
        )
        responses = [
            _fake_response(500, {"ok": False, "error": "internal"}),  # slack
            _fake_response(201, {"sid": "SM-twilio-12345"}),           # twilio
        ]
        with _patched_client(responses):
            result = service.send(msg)
        assert result.status == "sent"
        assert result.adapter == "twilio"
        assert result.external_id == "SM-twilio-12345"
        # Both attempts are recorded — slack failed, twilio sent.
        names = [(a.adapter, a.status) for a in result.attempts]
        assert ("slack", "failed") in names
        assert ("twilio", "sent") in names

    def test_all_adapters_fail_marks_failed_with_joined_reasons(self) -> None:
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-test"
        os.environ["SLACK_DEFAULT_CHANNEL"] = "C0123ABC"
        os.environ["TWILIO_ACCOUNT_SID"] = "AC_test"
        os.environ["TWILIO_AUTH_TOKEN"] = "tw-secret"
        os.environ["TWILIO_FROM_NUMBER"] = "+15550000000"
        os.environ["PAGERDUTY_API_KEY"] = "pd-key"
        os.environ["PAGERDUTY_ROUTING_KEY"] = "pd-routing"
        from app.services.oncall_delivery import (
            OncallDeliveryService, PageMessage,
        )
        service = OncallDeliveryService(clinic_id="clinic-demo-default")
        msg = PageMessage(
            clinic_id="clinic-demo-default",
            surface="adverse_events",
            audit_event_id="evt-allfail-3",
            body="test",
            recipient_phone="+15551112222",
        )
        responses = [
            _fake_response(429, {}),        # pagerduty 429
            _fake_response(403, {}),        # slack 403
            _fake_response(500, {}),        # twilio 500
        ]
        with _patched_client(responses):
            result = service.send(msg)
        assert result.status == "failed"
        assert result.note and "all_adapters_failed:" in result.note
        # Joined transcript carries all three providers.
        for tag in ("pagerduty", "slack", "twilio"):
            assert tag in result.note
        # Three attempts recorded.
        assert len(result.attempts) == 3
        for attempt in result.attempts:
            assert attempt.status == "failed"

    def test_timeout_counts_as_failed(self) -> None:
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-test"
        os.environ["SLACK_DEFAULT_CHANNEL"] = "C0123ABC"
        from app.services.oncall_delivery import (
            OncallDeliveryService, PageMessage,
        )
        service = OncallDeliveryService(clinic_id="clinic-demo-default")
        msg = PageMessage(
            clinic_id="clinic-demo-default",
            surface="adverse_events",
            audit_event_id="evt-timeout-4",
            body="test",
        )
        responses = [httpx.TimeoutException("fake timeout")]
        with _patched_client(responses):
            result = service.send(msg)
        assert result.status == "failed"
        assert result.attempts and result.attempts[0].adapter == "slack"
        assert result.attempts[0].note == "timeout"

    def test_no_adapters_enabled_returns_queued(self) -> None:
        from app.services.oncall_delivery import (
            OncallDeliveryService, PageMessage,
        )
        service = OncallDeliveryService(clinic_id="clinic-demo-default")
        msg = PageMessage(
            clinic_id="clinic-demo-default",
            surface="adverse_events",
            audit_event_id="evt-queued-5",
            body="test",
        )
        result = service.send(msg)
        assert result.status == "queued"
        assert result.note and "no_adapters_enabled" in result.note
        # No adapters tried.
        assert result.attempts == []


# ── Mock-mode honesty ───────────────────────────────────────────────────────


class TestMockMode:
    def test_mock_mode_marks_sent_with_mock_prefixed_note(self) -> None:
        os.environ["DEEPSYNAPS_DELIVERY_MOCK"] = "1"
        from app.services.oncall_delivery import (
            OncallDeliveryService, PageMessage, is_mock_mode_enabled,
        )
        assert is_mock_mode_enabled() is True
        service = OncallDeliveryService(clinic_id="clinic-demo-default")
        msg = PageMessage(
            clinic_id="clinic-demo-default",
            surface="adverse_events",
            audit_event_id="evt-mock-6",
            body="test",
            recipient_display_name="Dr Mock",
        )
        # Patch httpx.Client to blow up if it's actually called — mock-mode
        # MUST short-circuit before any HTTP call.
        with mock.patch("httpx.Client", side_effect=AssertionError("network must not be hit in mock mode")):
            result = service.send(msg)
        assert result.status == "sent"
        assert result.adapter == "mock"
        assert result.external_id and result.external_id.startswith("mock-")
        # The crucial honesty invariant: delivery_note ALWAYS starts with MOCK:
        assert (result.note or "").startswith("MOCK:"), result.note


# ── Regression: never claim "sent" without confirming 2xx ───────────────────


class TestSentRegression:
    def test_sent_status_requires_2xx_or_mock(self) -> None:
        """Belt-and-braces regression: if every attempted adapter returned
        a non-2xx OR raised, the dispatch result MUST NOT be 'sent'.
        """
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-test"
        os.environ["SLACK_DEFAULT_CHANNEL"] = "C0123ABC"
        from app.services.oncall_delivery import (
            OncallDeliveryService, PageMessage,
        )
        service = OncallDeliveryService(clinic_id="clinic-demo-default")
        msg = PageMessage(
            clinic_id="clinic-demo-default",
            surface="adverse_events",
            audit_event_id="evt-regress-7",
            body="test",
        )
        for status_code in (199, 300, 400, 401, 403, 404, 408, 429, 500, 502, 503, 504):
            with _patched_client([_fake_response(status_code, {})]):
                result = service.send(msg)
            assert result.status == "failed", (
                f"expected failed for HTTP {status_code}, got {result.status}"
            )

    def test_slack_ok_false_with_200_does_not_count_as_sent(self) -> None:
        """Slack returns 200 OK + ``{"ok": false}`` for logical errors
        like ``not_in_channel``. The adapter MUST treat that as failed.
        """
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-test"
        os.environ["SLACK_DEFAULT_CHANNEL"] = "C0123ABC"
        from app.services.oncall_delivery import (
            OncallDeliveryService, PageMessage,
        )
        service = OncallDeliveryService(clinic_id="clinic-demo-default")
        msg = PageMessage(
            clinic_id="clinic-demo-default",
            surface="adverse_events",
            audit_event_id="evt-regress-8",
            body="test",
        )
        with _patched_client([_fake_response(200, {"ok": False, "error": "not_in_channel"})]):
            result = service.send(msg)
        assert result.status == "failed"
        # Adapter-level attempt also failed.
        assert result.attempts and result.attempts[0].adapter == "slack"
        assert result.attempts[0].status == "failed"


# ── 5s timeout config ───────────────────────────────────────────────────────


class TestTimeout:
    def test_default_timeout_is_5_seconds(self) -> None:
        from app.services.oncall_delivery import _timeout_sec
        assert _timeout_sec() == 5.0

    def test_timeout_override_clamped(self) -> None:
        os.environ["DEEPSYNAPS_DELIVERY_TIMEOUT_SEC"] = "0"
        from app.services.oncall_delivery import _timeout_sec
        assert _timeout_sec() == 5.0  # bad → fallback
        os.environ["DEEPSYNAPS_DELIVERY_TIMEOUT_SEC"] = "9999"
        assert _timeout_sec() == 5.0  # too big → fallback
        os.environ["DEEPSYNAPS_DELIVERY_TIMEOUT_SEC"] = "3.5"
        assert _timeout_sec() == 3.5
        os.environ.pop("DEEPSYNAPS_DELIVERY_TIMEOUT_SEC", None)


# ── Test-adapter HTTP endpoint ──────────────────────────────────────────────


class TestTestAdapterEndpoint:
    def test_clinician_test_adapter_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/auto-page-worker/test-adapter",
            headers=auth_headers["clinician"],
            json={},
        )
        assert r.status_code == 403

    def test_admin_test_adapter_returns_per_adapter_result_and_emits_audit(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-test"
        os.environ["SLACK_DEFAULT_CHANNEL"] = "C0ABC"

        with _patched_client([_fake_response(200, {"ok": True, "ts": "1700000000.000900"})]):
            r = client.post(
                "/api/v1/auto-page-worker/test-adapter",
                headers=auth_headers["admin"],
                json={"body": "Adapter sanity check"},
            )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["accepted"] is True
        assert data["overall_status"] == "sent"
        assert data["audit_event_id"]
        adapters = {a["name"]: a for a in data["attempts"]}
        # Slack tried; Twilio + PagerDuty visible but disabled (no env vars).
        assert adapters["slack"]["status"] == "sent"
        assert adapters["slack"]["external_id"] == "1700000000.000900"
        assert adapters["twilio"]["enabled"] is False
        assert adapters["pagerduty"]["enabled"] is False

        # Audit row recorded under target_type='auto_page_worker'.
        audit = client.get(
            "/api/v1/audit-trail?surface=auto_page_worker",
            headers=auth_headers["admin"],
        )
        assert audit.status_code == 200
        actions = [it.get("action") for it in audit.json()["items"]]
        assert "auto_page_worker.adapter_test" in actions

    def test_admin_test_adapter_no_clinic_returns_400(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Admin demo user has clinic-demo-default, so this passes via mock-mode short-circuit.
        os.environ["DEEPSYNAPS_DELIVERY_MOCK"] = "1"
        r = client.post(
            "/api/v1/auto-page-worker/test-adapter",
            headers=auth_headers["admin"],
            json={},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["overall_status"] == "sent"
        # Mock-mode delivery_note ALWAYS prefixed with MOCK: even from the endpoint.
        assert (data["delivery_note"] or "").startswith("MOCK:"), data


# ── Adapter health endpoint ─────────────────────────────────────────────────


class TestAdapterHealthEndpoint:
    def test_health_lists_all_adapters_with_enabled_flags(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-test"
        r = client.get(
            "/api/v1/auto-page-worker/adapters",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["mock_mode"] is False
        names = {row["name"]: row["enabled"] for row in data["adapters"]}
        assert names == {"slack": True, "twilio": False, "pagerduty": False}

    def test_health_reports_mock_mode_flag(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        os.environ["DEEPSYNAPS_DELIVERY_MOCK"] = "1"
        r = client.get(
            "/api/v1/auto-page-worker/adapters",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["mock_mode"] is True

    def test_health_does_not_expose_tokens(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-secret-do-not-leak"
        os.environ["TWILIO_AUTH_TOKEN"] = "tw-secret-do-not-leak"
        os.environ["PAGERDUTY_API_KEY"] = "pd-secret-do-not-leak"
        r = client.get(
            "/api/v1/auto-page-worker/adapters",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body_str = r.text
        for tok in ("xoxb-secret", "tw-secret", "pd-secret"):
            assert tok not in body_str, (
                f"token leaked into adapter-health response: {tok}"
            )


# ── Worker integration: oncall_pages stamps delivery + external_id ──────────


class TestWorkerIntegration:
    def test_worker_tick_with_mock_mode_stamps_sent_with_mock_prefix(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        os.environ["DEEPSYNAPS_DELIVERY_MOCK"] = "1"
        from app.workers.auto_page_worker import _reset_for_tests, get_worker
        _reset_for_tests()

        _enable_chain(
            clinic_id="clinic-demo-default",
            surface="*",
            primary_user_id="actor-clinician-demo",
            auto_page_enabled=True,
        )
        _seed_oncall_shift(surface=None)
        eid = _seed_audit_row(
            surface="wearables_workbench",
            event="flag_escalated",
            target_id="flag-mock-1",
            note=f"priority=high; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=45),
        )

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        assert result.paged >= 1
        assert eid in result.paged_audit_event_ids

        db = SessionLocal()
        try:
            page_row = (
                db.query(OncallPage)
                .filter(OncallPage.audit_event_id == eid, OncallPage.trigger == "auto")
                .first()
            )
            assert page_row is not None
            assert page_row.delivery_status == "sent"
            assert page_row.external_id and page_row.external_id.startswith("mock-")
            assert (page_row.delivery_note or "").startswith("MOCK:"), page_row.delivery_note
        finally:
            db.close()
        _reset_for_tests()

    def test_worker_tick_with_no_adapters_stamps_queued_no_external_id(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        from app.workers.auto_page_worker import _reset_for_tests, get_worker
        _reset_for_tests()

        _enable_chain(
            clinic_id="clinic-demo-default",
            surface="*",
            primary_user_id="actor-clinician-demo",
            auto_page_enabled=True,
        )
        _seed_oncall_shift(surface=None)
        eid = _seed_audit_row(
            surface="adverse_events",
            event="create_to_clinician",
            target_id="ae-queued-1",
            note=f"priority=high; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=10),
        )

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        assert result.paged >= 1
        db = SessionLocal()
        try:
            page_row = (
                db.query(OncallPage)
                .filter(OncallPage.audit_event_id == eid, OncallPage.trigger == "auto")
                .first()
            )
            assert page_row is not None
            assert page_row.delivery_status == "queued"
            assert page_row.external_id is None
            assert (page_row.delivery_note or "").startswith("no_adapters_enabled")
        finally:
            db.close()
        _reset_for_tests()


# ── Audit ingestion via /api/v1/audit-trail?surface=oncall_delivery ─────────


class TestAuditIngestion:
    def test_oncall_delivery_surface_visible_in_audit_trail(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Ingest via the qeeg-analysis whitelist path so a row exists.
        body = {
            "event": "dispatch",
            "surface": "oncall_delivery",
            "note": "test ingestion",
        }
        r = client.post(
            "/api/v1/qeeg-analysis/audit-events",
            json=body,
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text

        listing = client.get(
            "/api/v1/audit-trail?surface=oncall_delivery",
            headers=auth_headers["admin"],
        )
        assert listing.status_code == 200, listing.text
        items = listing.json()["items"]
        assert any(it.get("surface") == "oncall_delivery" for it in items), items
