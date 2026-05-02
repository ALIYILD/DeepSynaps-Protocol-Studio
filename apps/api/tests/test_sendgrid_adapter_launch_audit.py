"""Tests for the SendGrid Adapter launch-audit (2026-05-01).

Wires a real SendGrid SMTP adapter under the on-call delivery Adapter
protocol so the Caregiver Email Digest worker (#380) can turn its
mock-mode dispatch into a real outbound email when
``SENDGRID_API_KEY`` + ``SENDGRID_FROM_ADDRESS`` are set. Surfaces the
audit transcript back to the patient as a "Caregiver delivery
confirmations" section on the Patient Digest page (#376).

This suite asserts:

* SendGridEmailAdapter sends 202 → ``status='sent'``; 4xx/5xx →
  ``status='failed'`` with reason; timeout → ``status='failed'``;
* ``X-Message-Id`` from the SendGrid response header is captured into
  ``external_id``;
* Adapter selection — without env vars, ``enabled=False`` and visible
  in describe-adapters; with both vars, ``enabled=True`` and SendGrid
  is the only adapter the email-digest service hands out;
* Mock-mode override — ``DEEPSYNAPS_DELIVERY_MOCK=1`` short-circuits
  even when SendGrid is configured, with ``MOCK:`` prefix;
* Caregiver Email Digest worker integration — when SendGrid is
  configured the dispatch goes through SendGrid (no MOCK prefix);
* Patient-side ``/api/v1/patient-digest/caregiver-delivery-summary``
  returns correct counts; cross-patient blocked at router (404);
  clinician role 404 (patient-only);
* NO PHI of caregivers leaks — response carries first name only,
  never email or full name; failed/queued dispatches deliberately
  excluded so the patient view reflects confirmed deliveries.
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
    CaregiverConsentGrant,
    CaregiverDigestPreference,
    Patient,
    User,
)


# Make sure the env-var-gated worker thread stays disabled in tests.
os.environ.pop("DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED", None)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clear_delivery_envs() -> None:
    """Drop any adapter env vars between tests so adapter discovery is
    deterministic — individual cases set what they need.
    """
    keys = [
        "SLACK_BOT_TOKEN",
        "SLACK_DEFAULT_CHANNEL",
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_FROM_NUMBER",
        "PAGERDUTY_API_KEY",
        "PAGERDUTY_ROUTING_KEY",
        "SENDGRID_API_KEY",
        "SENDGRID_FROM_ADDRESS",
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


@pytest.fixture(autouse=True)
def _reset_worker_singleton() -> None:
    from app.workers.caregiver_email_digest_worker import _reset_for_tests

    _reset_for_tests()
    yield
    _reset_for_tests()


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(CaregiverDigestPreference).delete(synchronize_session=False)
        db.query(CaregiverConsentGrant).filter(
            CaregiverConsentGrant.id.like("sga-grant-%")
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_(
                ["caregiver_email_digest_worker", "caregiver_portal"]
            )
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type == "patient_digest"
        ).filter(
            AuditEventRecord.actor_id == "actor-patient-demo"
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


@pytest.fixture
def demo_patient() -> Patient:
    """Seed the Patient row that ``actor-patient-demo`` resolves to."""
    db = SessionLocal()
    try:
        db.query(Patient).filter(
            Patient.email == "patient@deepsynaps.com"
        ).delete()
        db.commit()
        patient = Patient(
            id="sga-launch-audit-patient",
            clinician_id="actor-clinician-demo",
            first_name="Jane",
            last_name="Patient",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


def _seed_caregiver_user(
    user_id: str,
    *,
    display_name: str = "Bob Smith",
    email: str = "bob.smith@example.com",
) -> None:
    db = SessionLocal()
    try:
        if db.query(User).filter_by(id=user_id).first() is not None:
            return
        db.add(
            User(
                id=user_id,
                email=email,
                display_name=display_name,
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id="clinic-demo-default",
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_grant(
    *,
    patient_id: str,
    caregiver_user_id: str,
    scope: str = '{"digest": true}',
    revoked: bool = False,
) -> str:
    db = SessionLocal()
    try:
        gid = f"sga-grant-{_uuid.uuid4().hex[:10]}"
        g = CaregiverConsentGrant(
            id=gid,
            patient_id=patient_id,
            caregiver_user_id=caregiver_user_id,
            granted_at="2026-05-01T00:00:00+00:00",
            granted_by_user_id="actor-patient-demo",
            scope=scope,
            note=None,
            created_at="2026-05-01T00:00:00+00:00",
            updated_at="2026-05-01T00:00:00+00:00",
            revoked_at=("2026-05-01T01:00:00+00:00" if revoked else None),
            revoked_by_user_id=("actor-patient-demo" if revoked else None),
            revocation_reason="test" if revoked else None,
        )
        db.add(g)
        db.commit()
        return gid
    finally:
        db.close()


def _seed_email_digest_audit_row(
    *,
    caregiver_user_id: str,
    delivery_status: str = "sent",
    actor_id: str = "caregiver-email-digest-worker",
    when: _dt | None = None,
    note_extra: str = "",
) -> str:
    """Seed a ``caregiver_portal.email_digest_sent`` audit row.

    These are the rows the patient-side caregiver-delivery-summary
    aggregates over.
    """
    db = SessionLocal()
    try:
        ts = (when or _dt.now(_tz.utc)).isoformat()
        eid = f"caregiver_portal-email_digest_sent-{_uuid.uuid4().hex[:12]}"
        note = (
            f"unread=3; recipient=cg@example.com; "
            f"delivery_status={delivery_status}; "
            f"adapter=sendgrid; external_id=msg-{_uuid.uuid4().hex[:8]}; "
            f"grant_id=sga-grant-test"
        )
        if note_extra:
            note = f"{note}; {note_extra}"
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=caregiver_user_id,
                target_type="caregiver_portal",
                action="caregiver_portal.email_digest_sent",
                role="admin",
                actor_id=actor_id,
                note=note,
                created_at=ts,
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


# ── Httpx stub helpers (mirrors test_oncall_delivery_launch_audit.py) ───────


def _fake_response(
    status_code: int,
    body: dict[str, Any] | None = None,
    *,
    headers: dict[str, str] | None = None,
    text_body: str = "",
) -> mock.Mock:
    resp = mock.Mock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json = mock.Mock(return_value=body or {})
    resp.headers = headers or {}
    resp.text = text_body or ""
    return resp


class _StubClient:
    def __init__(self, responses: list[Any]) -> None:
        self._responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    def __enter__(self) -> "_StubClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def post(self, *args: Any, **kwargs: Any) -> mock.Mock:
        self.calls.append({"args": args, "kwargs": kwargs})
        if not self._responses:
            raise RuntimeError("no canned response left")
        nxt = self._responses.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt


def _patched_client(responses: list[Any]):
    stub = _StubClient(responses)
    return mock.patch("httpx.Client", return_value=stub), stub


# ── 1. Adapter contract — selection / discovery ─────────────────────────────


class TestAdapterSelection:
    def test_no_env_vars_means_sendgrid_disabled_and_visible(self) -> None:
        """No env → adapter visible in describe but ``enabled=False``."""
        from app.services.oncall_delivery import (
            SendGridEmailAdapter,
            build_email_digest_service,
        )

        adapter = SendGridEmailAdapter()
        assert adapter.enabled is False

        service = build_email_digest_service()
        described = service.describe_adapters()
        names = [a["name"] for a in described]
        assert "sendgrid" in names
        for row in described:
            if row["name"] == "sendgrid":
                assert row["enabled"] is False

    def test_only_api_key_set_keeps_sendgrid_disabled(self) -> None:
        """One env var alone is not enough — both API_KEY and FROM are required."""
        os.environ["SENDGRID_API_KEY"] = "SG.test-key-only"
        from app.services.oncall_delivery import SendGridEmailAdapter

        adapter = SendGridEmailAdapter()
        assert adapter.enabled is False

    def test_both_env_vars_enables_sendgrid(self) -> None:
        os.environ["SENDGRID_API_KEY"] = "SG.test-key"
        os.environ["SENDGRID_FROM_ADDRESS"] = "noreply@deepsynaps.com"
        from app.services.oncall_delivery import (
            SendGridEmailAdapter,
            build_email_digest_service,
        )

        adapter = SendGridEmailAdapter()
        assert adapter.enabled is True

        service = build_email_digest_service()
        enabled = [a.name for a in service.get_enabled_adapters()]
        assert enabled == ["sendgrid"]

    def test_sendgrid_listed_in_known_adapter_names(self) -> None:
        from app.services.oncall_delivery import KNOWN_ADAPTER_NAMES

        assert "sendgrid" in KNOWN_ADAPTER_NAMES


# ── 2. Adapter dispatch — 2xx / 4xx / 5xx / timeout ─────────────────────────


def _make_message(**kw: Any):
    from app.services.oncall_delivery import PageMessage

    defaults = dict(
        clinic_id="caregiver-digest",
        surface="caregiver_email_digest",
        audit_event_id="evt-sendgrid-test",
        body="hello caregiver",
        severity="low",
        recipient_display_name="Bob Smith",
        recipient_email="bob.smith@example.com",
    )
    defaults.update(kw)
    return PageMessage(**defaults)


class TestAdapterDispatch:
    def test_202_marks_sent_and_captures_x_message_id(self) -> None:
        os.environ["SENDGRID_API_KEY"] = "SG.test-key"
        os.environ["SENDGRID_FROM_ADDRESS"] = "noreply@deepsynaps.com"
        from app.services.oncall_delivery import SendGridEmailAdapter

        adapter = SendGridEmailAdapter()
        patcher, _stub = _patched_client(
            [_fake_response(202, headers={"X-Message-Id": "sg-msg-abc-123"})]
        )
        with patcher:
            result = adapter.send(_make_message())
        assert result.status == "sent"
        assert result.adapter == "sendgrid"
        assert result.external_id == "sg-msg-abc-123"
        assert result.note and "sg-msg-abc-123" in result.note
        assert result.raw_response.get("status_code") == 202

    def test_400_marks_failed_with_status_code(self) -> None:
        os.environ["SENDGRID_API_KEY"] = "SG.test-key"
        os.environ["SENDGRID_FROM_ADDRESS"] = "noreply@deepsynaps.com"
        from app.services.oncall_delivery import SendGridEmailAdapter

        adapter = SendGridEmailAdapter()
        patcher, _stub = _patched_client(
            [_fake_response(400, text_body='{"errors":[{"message":"bad email"}]}')]
        )
        with patcher:
            result = adapter.send(_make_message())
        assert result.status == "failed"
        assert result.note and "400" in result.note
        assert result.raw_response.get("status_code") == 400

    def test_500_marks_failed(self) -> None:
        os.environ["SENDGRID_API_KEY"] = "SG.test-key"
        os.environ["SENDGRID_FROM_ADDRESS"] = "noreply@deepsynaps.com"
        from app.services.oncall_delivery import SendGridEmailAdapter

        adapter = SendGridEmailAdapter()
        patcher, _stub = _patched_client([_fake_response(500)])
        with patcher:
            result = adapter.send(_make_message())
        assert result.status == "failed"
        assert result.note and "500" in result.note

    def test_timeout_marks_failed_with_timeout_reason(self) -> None:
        os.environ["SENDGRID_API_KEY"] = "SG.test-key"
        os.environ["SENDGRID_FROM_ADDRESS"] = "noreply@deepsynaps.com"
        from app.services.oncall_delivery import SendGridEmailAdapter

        adapter = SendGridEmailAdapter()
        patcher, _stub = _patched_client(
            [httpx.TimeoutException("simulated 5s timeout")]
        )
        with patcher:
            result = adapter.send(_make_message())
        assert result.status == "failed"
        assert result.note == "timeout"

    def test_missing_recipient_email_marks_failed_without_http_call(self) -> None:
        os.environ["SENDGRID_API_KEY"] = "SG.test-key"
        os.environ["SENDGRID_FROM_ADDRESS"] = "noreply@deepsynaps.com"
        from app.services.oncall_delivery import SendGridEmailAdapter

        adapter = SendGridEmailAdapter()
        # Even though we patch httpx, the adapter should NOT call it.
        patcher, stub = _patched_client([_fake_response(202)])
        with patcher:
            result = adapter.send(_make_message(recipient_email=None))
        assert result.status == "failed"
        assert "no recipient_email" in (result.note or "")
        assert stub.calls == []

    def test_disabled_adapter_returns_failed_without_http_call(self) -> None:
        # No env vars set — adapter is disabled.
        from app.services.oncall_delivery import SendGridEmailAdapter

        adapter = SendGridEmailAdapter()
        assert adapter.enabled is False
        patcher, stub = _patched_client([_fake_response(202)])
        with patcher:
            result = adapter.send(_make_message())
        assert result.status == "failed"
        assert "disabled" in (result.note or "").lower()
        assert stub.calls == []

    def test_5s_timeout_value_is_default_when_env_unset(self) -> None:
        """Adapter HTTP call inherits the module-level 5.0s default."""
        os.environ["SENDGRID_API_KEY"] = "SG.test-key"
        os.environ["SENDGRID_FROM_ADDRESS"] = "noreply@deepsynaps.com"
        from app.services.oncall_delivery import (  # noqa: F401
            SendGridEmailAdapter,
            _timeout_sec,
        )

        assert _timeout_sec() == 5.0

    def test_subject_for_caregiver_digest_surface(self) -> None:
        from app.services.oncall_delivery import (
            PageMessage,
            _sendgrid_subject,
        )

        msg = PageMessage(
            clinic_id="caregiver-digest",
            surface="caregiver_email_digest",
            audit_event_id="x",
            body="b",
        )
        assert "caregiver digest" in _sendgrid_subject(msg).lower()


# ── 3. Mock-mode override ───────────────────────────────────────────────────


class TestMockModeOverride:
    def test_mock_mode_short_circuits_even_with_sendgrid_configured(self) -> None:
        os.environ["DEEPSYNAPS_DELIVERY_MOCK"] = "1"
        os.environ["SENDGRID_API_KEY"] = "SG.test-key"
        os.environ["SENDGRID_FROM_ADDRESS"] = "noreply@deepsynaps.com"
        from app.services.oncall_delivery import build_email_digest_service

        service = build_email_digest_service()
        # Even though SendGrid is enabled, mock-mode wins.
        patcher, stub = _patched_client(
            [_fake_response(202, headers={"X-Message-Id": "should-not-fire"})]
        )
        with patcher:
            result = service.send(_make_message())
        assert result.status == "sent"
        assert result.adapter == "mock"
        assert (result.note or "").startswith("MOCK:")
        # No HTTP call was made.
        assert stub.calls == []


# ── 4. Caregiver Email Digest worker integration ────────────────────────────


def _seed_pref(
    *,
    caregiver_user_id: str,
    enabled: bool = True,
    last_sent_at: str | None = None,
) -> None:
    db = SessionLocal()
    try:
        existing = (
            db.query(CaregiverDigestPreference)
            .filter_by(caregiver_user_id=caregiver_user_id)
            .first()
        )
        if existing is not None:
            existing.enabled = enabled
            existing.last_sent_at = last_sent_at
            db.commit()
            return
        db.add(
            CaregiverDigestPreference(
                id=f"sga-cdp-{_uuid.uuid4().hex[:10]}",
                caregiver_user_id=caregiver_user_id,
                enabled=enabled,
                frequency="daily",
                time_of_day="08:00",
                last_sent_at=last_sent_at,
                created_at="2026-04-15T00:00:00+00:00",
                updated_at="2026-04-15T00:00:00+00:00",
            )
        )
        db.commit()
    finally:
        db.close()


class TestWorkerIntegration:
    def test_worker_uses_sendgrid_when_configured_no_mock_prefix(
        self, demo_patient: Patient
    ) -> None:
        """With SendGrid configured the dispatch should NOT be mock-prefixed."""
        os.environ["SENDGRID_API_KEY"] = "SG.test-key"
        os.environ["SENDGRID_FROM_ADDRESS"] = "noreply@deepsynaps.com"
        os.environ.pop("DEEPSYNAPS_DELIVERY_MOCK", None)

        cg_id = "actor-clinician-demo"
        _seed_pref(caregiver_user_id=cg_id)
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id=cg_id,
            scope='{"digest": true}',
        )
        # Seed an audit row pointing at the grant so the notification-hub
        # feed surfaces at least one unread item — single-source of the
        # _build_preview_for_actor helper used by the worker.
        db = SessionLocal()
        try:
            db.add(
                AuditEventRecord(
                    event_id=f"caregiver_portal-grant_accessed-{_uuid.uuid4().hex[:8]}",
                    target_id=gid,
                    target_type="caregiver_portal",
                    action="caregiver_portal.grant_accessed",
                    role="clinician",
                    actor_id="actor-clinician-demo",
                    note="scope_key=digest; seeded for sendgrid worker test",
                    created_at=(_dt.now(_tz.utc) - _td(minutes=30)).isoformat(),
                )
            )
            db.commit()
        finally:
            db.close()

        from app.workers.caregiver_email_digest_worker import (
            CaregiverEmailDigestWorker,
        )

        worker = CaregiverEmailDigestWorker()
        patcher, _stub = _patched_client(
            [_fake_response(202, headers={"X-Message-Id": "sg-worker-1"})]
        )
        with patcher:
            result = worker.tick()

        # Confirm the worker actually fired SendGrid (1 dispatch sent).
        assert result.digests_sent >= 1, result

        # Confirm the per-caregiver audit row recorded delivery_status=sent
        # WITHOUT the MOCK prefix.
        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.target_type == "caregiver_portal",
                    AuditEventRecord.action == "caregiver_portal.email_digest_sent",
                )
                .all()
            )
            assert len(rows) >= 1
            sent_row = next(
                (
                    r for r in rows
                    if "delivery_status=sent" in (r.note or "")
                ),
                None,
            )
            assert sent_row is not None, [r.note for r in rows]
            assert "MOCK:" not in (sent_row.note or "")
            assert "adapter=sendgrid" in (sent_row.note or "")
        finally:
            db.close()


# ── 5. Patient-side caregiver-delivery-summary ──────────────────────────────


class TestPatientDeliverySummary:
    def test_patient_sees_correct_count_for_active_caregiver(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        cg_id = f"caregiver-{_uuid.uuid4().hex[:8]}"
        _seed_caregiver_user(cg_id, display_name="Alice Carer")
        _seed_grant(patient_id=demo_patient.id, caregiver_user_id=cg_id)
        # Two confirmed deliveries in the window.
        _seed_email_digest_audit_row(
            caregiver_user_id=cg_id,
            delivery_status="sent",
            when=_dt.now(_tz.utc) - _td(days=1),
        )
        _seed_email_digest_audit_row(
            caregiver_user_id=cg_id,
            delivery_status="sent",
            when=_dt.now(_tz.utc) - _td(hours=2),
        )
        # One failed delivery — must NOT count.
        _seed_email_digest_audit_row(
            caregiver_user_id=cg_id,
            delivery_status="failed",
            when=_dt.now(_tz.utc) - _td(hours=3),
        )

        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["patient_id"] == demo_patient.id
        rows = data["rows"]
        assert len(rows) == 1
        row = rows[0]
        assert row["caregiver_user_id"] == cg_id
        assert row["digests_delivered_count"] == 2
        assert row["last_delivered_at"] is not None
        # Total delivered also reflects the count.
        assert data["total_delivered_count"] == 2
        # Anonymisation: first name only.
        assert row["caregiver_first_name"] == "Alice"

    def test_no_phi_of_caregiver_in_response(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        cg_id = f"caregiver-{_uuid.uuid4().hex[:8]}"
        _seed_caregiver_user(
            cg_id,
            display_name="Charlie Sensitive",
            email="charlie.sensitive.full@example.com",
        )
        _seed_grant(patient_id=demo_patient.id, caregiver_user_id=cg_id)
        _seed_email_digest_audit_row(
            caregiver_user_id=cg_id,
            delivery_status="sent",
            when=_dt.now(_tz.utc) - _td(hours=1),
        )

        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body_text = r.text.lower()
        # Email never returned.
        assert "charlie.sensitive.full@example.com" not in body_text
        # Last name never returned.
        assert "sensitive" not in body_text
        # First name OK (whitelisted anonymisation).
        assert "charlie" in body_text

    def test_clinician_token_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_admin_token_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 404, r.text

    def test_cross_patient_query_param_ignored_no_other_patient_data(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Seed an OTHER patient with a confirmed caregiver delivery.
        db = SessionLocal()
        try:
            other = Patient(
                id="sga-other-patient",
                clinician_id="actor-clinician-demo",
                first_name="Other",
                last_name="Patient",
                email=f"other-{_uuid.uuid4().hex[:6]}@example.com",
                consent_signed=True,
                status="active",
            )
            db.add(other)
            db.commit()
            db.refresh(other)
            other_id = other.id
        finally:
            db.close()

        other_cg = f"other-cg-{_uuid.uuid4().hex[:8]}"
        _seed_caregiver_user(other_cg, display_name="Other Caregiver")
        _seed_grant(patient_id=other_id, caregiver_user_id=other_cg)
        _seed_email_digest_audit_row(
            caregiver_user_id=other_cg,
            delivery_status="sent",
            when=_dt.now(_tz.utc) - _td(hours=1),
        )

        # Patient hits the summary with a forged ?patient_id — should be
        # ignored (resolver uses actor.actor_id only).
        r = client.get(
            f"/api/v1/patient-digest/caregiver-delivery-summary?patient_id={other_id}",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Demo patient has no grants → 0 rows. The other patient's
        # caregiver MUST NOT appear.
        for row in data["rows"]:
            assert row["caregiver_user_id"] != other_cg
        # Demo patient never granted to ``other_cg`` so total is 0.
        assert data["total_delivered_count"] == 0

    def test_revoked_grant_does_not_appear(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        cg_id = f"caregiver-revoked-{_uuid.uuid4().hex[:8]}"
        _seed_caregiver_user(cg_id, display_name="Revoked Carer")
        _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id=cg_id,
            revoked=True,
        )
        _seed_email_digest_audit_row(
            caregiver_user_id=cg_id,
            delivery_status="sent",
            when=_dt.now(_tz.utc) - _td(hours=1),
        )

        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_delivered_count"] == 0
        for row in data["rows"]:
            assert row["caregiver_user_id"] != cg_id

    def test_window_filter_excludes_old_deliveries(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        cg_id = f"caregiver-window-{_uuid.uuid4().hex[:8]}"
        _seed_caregiver_user(cg_id, display_name="Window Carer")
        _seed_grant(patient_id=demo_patient.id, caregiver_user_id=cg_id)
        # 1 inside 7-day window.
        _seed_email_digest_audit_row(
            caregiver_user_id=cg_id,
            delivery_status="sent",
            when=_dt.now(_tz.utc) - _td(days=2),
        )
        # 1 outside 7-day window (30 days ago).
        _seed_email_digest_audit_row(
            caregiver_user_id=cg_id,
            delivery_status="sent",
            when=_dt.now(_tz.utc) - _td(days=30),
        )

        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Default 7-day window → only the recent one counts.
        assert data["total_delivered_count"] == 1

    def test_summary_audit_row_emitted_on_view(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        # Confirm the patient_digest audit surface received an audit row
        # for the view event.
        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.target_type == "patient_digest",
                    AuditEventRecord.action
                    == "patient_digest.caregiver_delivery_summary_viewed",
                )
                .all()
            )
            assert len(rows) >= 1
        finally:
            db.close()
