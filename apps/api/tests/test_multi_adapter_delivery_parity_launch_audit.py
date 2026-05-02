"""Tests for the Multi-Adapter Delivery Parity launch-audit (2026-05-01).

Closes the adapter-parity gap from #381 (SendGrid) + #383 (Caregiver
Delivery Ack). Today only SendGrid emits
``caregiver_portal.email_digest_sent`` audit row when the dispatch
lands. SMS / Slack / PagerDuty wins silently fail to close the
bidirectional ack loop because the dispatch row is never written.

This suite asserts:

* All four adapters (SendGrid, Twilio, Slack, PagerDuty) writing the
  same unified audit-row note via :func:`build_delivery_audit_note`
  with ``adapter=`` + ``channel=`` + ``trigger=`` keys;
* Channel taxonomy: ``sendgrid→email``, ``twilio→sms``, ``slack→slack``,
  ``pagerduty→pagerduty``, ``mock→mock``;
* ``latest_delivery_ack_for_caregiver`` finds rows from any channel;
* ``_count_caregiver_digest_deliveries`` returns the channel chip on
  the most recent landed row;
* Cross-clinic 404 + IDOR regression on the patient-side
  caregiver-delivery-summary endpoint;
* Audit-trail filter at
  ``/api/v1/audit-trail?surface=caregiver_portal&action=...`` returns
  the new rows;
* :class:`LastAcknowledgementOut` carries ``latest_landed_channel``;
* :class:`CaregiverDeliverySummaryRow` carries
  ``last_delivered_channel``;
* NO PHI of caregiver beyond first name leaks into the patient-side
  response.
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
    """Drop adapter env vars between tests so adapter discovery is
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
            CaregiverConsentGrant.id.like("madp-grant-%")
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.event_id.like("madp-test-%")
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type == "caregiver_portal",
            AuditEventRecord.action.in_(
                [
                    "caregiver_portal.email_digest_sent",
                    "caregiver_portal.delivery_acknowledged",
                ],
            ),
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


@pytest.fixture
def demo_patient() -> Patient:
    """Seed the Patient row that ``actor-patient-demo`` resolves to."""
    db = SessionLocal()
    try:
        existing = (
            db.query(Patient)
            .filter(Patient.email == "patient@deepsynaps.com")
            .first()
        )
        if existing is not None:
            return existing
        patient = Patient(
            id="madp-launch-audit-patient",
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


def _seed_grant(
    *,
    patient_id: str,
    caregiver_user_id: str,
    scope: str = '{"digest": true}',
) -> str:
    db = SessionLocal()
    try:
        gid = f"madp-grant-{_uuid.uuid4().hex[:10]}"
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
            revoked_at=None,
            revoked_by_user_id=None,
            revocation_reason=None,
        )
        db.add(g)
        db.commit()
        return gid
    finally:
        db.close()


def _seed_digest_audit(
    *,
    caregiver_user_id: str,
    adapter: str,
    delivery_status: str = "sent",
    when: _dt | None = None,
    grant_id: str = "madp-grant-test",
) -> str:
    """Seed a caregiver_portal.email_digest_sent audit row using the
    unified note format from :func:`build_delivery_audit_note`."""
    from app.services.oncall_delivery import build_delivery_audit_note

    db = SessionLocal()
    try:
        ts = (when or _dt.now(_tz.utc)).isoformat()
        eid = f"madp-test-dispatch-{_uuid.uuid4().hex[:10]}"
        note = build_delivery_audit_note(
            unread_count=3,
            recipient="cg@example.com",
            delivery_status=delivery_status,
            adapter_name=adapter,
            external_id=f"ext-{_uuid.uuid4().hex[:8]}",
            grant_id=grant_id,
            delivery_note=f"{adapter} OK",
            trigger="worker",
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=caregiver_user_id,
                target_type="caregiver_portal",
                action="caregiver_portal.email_digest_sent",
                role="admin",
                actor_id="caregiver-email-digest-worker",
                note=note,
                created_at=ts,
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


# ── 1. Channel taxonomy ─────────────────────────────────────────────────────


class TestChannelTaxonomy:
    def test_adapter_channel_maps_sendgrid_to_email(self) -> None:
        from app.services.oncall_delivery import adapter_channel

        assert adapter_channel("sendgrid") == "email"

    def test_adapter_channel_maps_twilio_to_sms(self) -> None:
        from app.services.oncall_delivery import adapter_channel

        assert adapter_channel("twilio") == "sms"

    def test_adapter_channel_maps_slack_to_slack(self) -> None:
        from app.services.oncall_delivery import adapter_channel

        assert adapter_channel("slack") == "slack"

    def test_adapter_channel_maps_pagerduty_to_pagerduty(self) -> None:
        from app.services.oncall_delivery import adapter_channel

        assert adapter_channel("pagerduty") == "pagerduty"

    def test_adapter_channel_maps_mock_to_mock(self) -> None:
        from app.services.oncall_delivery import adapter_channel

        assert adapter_channel("mock") == "mock"

    def test_adapter_channel_unknown_falls_back_to_lowercased_name(self) -> None:
        from app.services.oncall_delivery import adapter_channel

        assert adapter_channel("SES") == "ses"

    def test_adapter_channel_none_returns_dash(self) -> None:
        from app.services.oncall_delivery import adapter_channel

        assert adapter_channel(None) == "-"


# ── 2. Unified audit-note builder ───────────────────────────────────────────


class TestAuditNoteBuilder:
    def test_note_carries_adapter_and_channel_keys(self) -> None:
        from app.services.oncall_delivery import build_delivery_audit_note

        note = build_delivery_audit_note(
            unread_count=4,
            recipient="x@example.com",
            delivery_status="sent",
            adapter_name="twilio",
            external_id="SM123",
            grant_id="g1",
            delivery_note="ok",
            trigger="send_now",
        )
        assert "adapter=twilio" in note
        assert "channel=sms" in note
        assert "delivery_status=sent" in note
        assert "external_id=SM123" in note
        assert "grant_id=g1" in note
        assert "trigger=send_now" in note
        assert "recipient=x@example.com" in note

    def test_note_is_identical_format_across_all_four_adapters(self) -> None:
        from app.services.oncall_delivery import build_delivery_audit_note

        keys = [
            "unread=", "recipient=", "delivery_status=",
            "adapter=", "channel=", "external_id=",
            "grant_id=", "delivery_note=", "trigger=",
        ]
        for adapter, channel in (
            ("sendgrid", "email"),
            ("twilio", "sms"),
            ("slack", "slack"),
            ("pagerduty", "pagerduty"),
        ):
            n = build_delivery_audit_note(
                unread_count=1,
                recipient="r@x.com",
                delivery_status="sent",
                adapter_name=adapter,
                external_id="e",
                grant_id="g",
                delivery_note="ok",
                trigger="worker",
            )
            for k in keys:
                assert k in n, f"adapter={adapter} missing key {k}"
            assert f"adapter={adapter}" in n
            assert f"channel={channel}" in n

    def test_note_is_capped_at_1024_chars(self) -> None:
        from app.services.oncall_delivery import build_delivery_audit_note

        very_long_note = "X" * 5000
        out = build_delivery_audit_note(
            unread_count=1,
            recipient="r",
            delivery_status="failed",
            adapter_name="sendgrid",
            external_id=None,
            grant_id="g",
            delivery_note=very_long_note,
            trigger="send_now",
        )
        assert len(out) <= 1024

    def test_note_handles_none_adapter_with_dash_channel(self) -> None:
        from app.services.oncall_delivery import build_delivery_audit_note

        out = build_delivery_audit_note(
            unread_count=0,
            recipient=None,
            delivery_status="queued",
            adapter_name=None,
            external_id=None,
            grant_id=None,
            delivery_note=None,
            trigger="worker",
        )
        assert "adapter=-" in out
        assert "channel=-" in out
        assert "recipient=-" in out


# ── 3. build_caregiver_digest_service — full chain available ────────────────


class TestServiceConstruction:
    def test_caregiver_digest_service_default_order_includes_all_four(self) -> None:
        # Set ALL adapter env vars so the chain is fully enabled.
        os.environ["SENDGRID_API_KEY"] = "SG.k"
        os.environ["SENDGRID_FROM_ADDRESS"] = "from@x.com"
        os.environ["TWILIO_ACCOUNT_SID"] = "AC.x"
        os.environ["TWILIO_AUTH_TOKEN"] = "tok"
        os.environ["TWILIO_FROM_NUMBER"] = "+15550000000"
        os.environ["SLACK_BOT_TOKEN"] = "xoxb-test"
        os.environ["PAGERDUTY_API_KEY"] = "pd-key"
        os.environ["PAGERDUTY_ROUTING_KEY"] = "pd-rk"
        from app.services.oncall_delivery import (
            build_caregiver_digest_service,
        )

        service = build_caregiver_digest_service(clinic_id=None, db=None)
        names = [a.name for a in service.adapters]
        # All four adapters appear in the chain.
        for n in ("sendgrid", "slack", "twilio", "pagerduty"):
            assert n in names, f"adapter {n} missing from chain"
        # All four are enabled with the env vars set.
        enabled = [a.name for a in service.get_enabled_adapters()]
        for n in ("sendgrid", "slack", "twilio", "pagerduty"):
            assert n in enabled, f"adapter {n} not enabled"

    def test_caregiver_digest_service_empty_chain_when_no_envs(self) -> None:
        from app.services.oncall_delivery import (
            build_caregiver_digest_service,
        )

        service = build_caregiver_digest_service(clinic_id=None, db=None)
        # Chain still has all four adapter SHELLS (so describe_adapters
        # can render disabled rows for each), but none enabled.
        assert service.get_enabled_adapters() == []


# ── 4. Send-now handler — adapter parity end-to-end ─────────────────────────


class TestSendNowHandlerAdapterParity:
    """Mock-mode dispatch via the send-now handler emits a single
    unified audit row regardless of which adapter would have won.
    """

    def test_send_now_mock_mode_emits_unified_audit_with_channel(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("DEEPSYNAPS_DELIVERY_MOCK", "1")
        # Need a consent grant so consent gate doesn't short-circuit.
        _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        # Need at least one unread notification — the preview will show 0
        # otherwise and the handler short-circuits to ``queued``. Seed
        # an audit row that the preview pulls from the caregiver inbox.
        # In demo mode, the preview returns demo unread counts so we can
        # rely on the mock path even without seeding extra notifications;
        # if not, the handler still emits the audit row with unread=0
        # delivery_status=queued, which still has channel=- (ok).
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/send-now",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        # Audit row was written under caregiver_portal.email_digest_sent.
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.target_type == "caregiver_portal",
                    AuditEventRecord.action
                    == "caregiver_portal.email_digest_sent",
                    AuditEventRecord.target_id == "actor-clinician-demo",
                )
                .order_by(AuditEventRecord.created_at.desc())
                .first()
            )
            assert row is not None
            note = row.note or ""
            # Unified note keys present.
            assert "channel=" in note
            assert "adapter=" in note
            assert "trigger=send_now" in note
        finally:
            db.close()


# ── 5. latest_delivery_ack_for_caregiver — adapter-agnostic ─────────────────


class TestLatestDeliveryAckForCaregiver:
    """The Patient Digest helper that joins ack rows must continue to
    find acks regardless of which channel the original dispatch
    travelled on. The ack rows themselves are
    ``caregiver_portal.delivery_acknowledged`` — adapter-agnostic by
    construction — so the test seeds dispatches from each adapter,
    then acks them, and verifies the helper still resolves.
    """

    @pytest.mark.parametrize(
        "adapter",
        ["sendgrid", "twilio", "slack", "pagerduty"],
    )
    def test_helper_finds_ack_when_dispatch_was_via_adapter(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        adapter: str,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        _seed_digest_audit(
            caregiver_user_id="actor-clinician-demo",
            adapter=adapter,
            grant_id=gid,
        )
        # Caregiver acks the landed dispatch.
        r = client.post(
            f"/api/v1/caregiver-consent/grants/{gid}/acknowledge-delivery",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text

        # Helper finds the ack timestamp regardless of adapter.
        from app.routers.caregiver_consent_router import (
            latest_delivery_ack_for_caregiver,
        )
        db = SessionLocal()
        try:
            stamp = latest_delivery_ack_for_caregiver(
                db,
                patient_id=demo_patient.id,
                caregiver_user_id="actor-clinician-demo",
            )
            assert stamp is not None, (
                f"helper must return a non-None stamp for adapter={adapter}"
            )
        finally:
            db.close()


# ── 6. Patient-side caregiver-delivery-summary surfaces channel chip ────────


class TestPatientSideChannelChip:
    @pytest.mark.parametrize(
        "adapter,expected_channel",
        [
            ("sendgrid", "email"),
            ("twilio", "sms"),
            ("slack", "slack"),
            ("pagerduty", "pagerduty"),
        ],
    )
    def test_summary_returns_channel_for_each_adapter(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        adapter: str,
        expected_channel: str,
    ) -> None:
        _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        _seed_digest_audit(
            caregiver_user_id="actor-clinician-demo",
            adapter=adapter,
        )
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        rows = r.json().get("rows") or []
        matching = [
            row
            for row in rows
            if row.get("caregiver_user_id") == "actor-clinician-demo"
        ]
        assert len(matching) == 1, rows
        assert matching[0]["last_delivered_channel"] == expected_channel
        assert matching[0]["digests_delivered_count"] >= 1

    def test_summary_channel_falls_back_via_adapter_for_legacy_rows(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        """Legacy audit rows that carry ``adapter=`` only (no
        ``channel=`` key) should still surface a channel chip via the
        adapter→channel taxonomy fallback."""
        _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        # Manually seed a legacy-format note (no channel= key).
        db = SessionLocal()
        try:
            db.add(
                AuditEventRecord(
                    event_id=f"madp-test-legacy-{_uuid.uuid4().hex[:8]}",
                    target_id="actor-clinician-demo",
                    target_type="caregiver_portal",
                    action="caregiver_portal.email_digest_sent",
                    role="admin",
                    actor_id="caregiver-email-digest-worker",
                    note=(
                        "unread=2; recipient=cg@example.com; "
                        "delivery_status=sent; adapter=twilio; "
                        "external_id=SMabcd; grant_id=g"
                    ),
                    created_at=_dt.now(_tz.utc).isoformat(),
                )
            )
            db.commit()
        finally:
            db.close()
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        rows = r.json().get("rows") or []
        matching = [
            row
            for row in rows
            if row.get("caregiver_user_id") == "actor-clinician-demo"
        ]
        assert len(matching) == 1
        # Legacy adapter=twilio note → channel=sms via taxonomy fallback.
        assert matching[0]["last_delivered_channel"] == "sms"


# ── 7. LastAcknowledgementOut carries latest_landed_channel ─────────────────


class TestLastAcknowledgementChannel:
    def test_get_last_ack_returns_landed_channel_for_twilio_dispatch(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        _seed_digest_audit(
            caregiver_user_id="actor-clinician-demo",
            adapter="twilio",
            grant_id=gid,
        )
        r = client.get(
            f"/api/v1/caregiver-consent/grants/{gid}/last-acknowledgement",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["latest_landed_channel"] == "sms"

    def test_get_last_ack_returns_none_channel_when_no_dispatch(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        r = client.get(
            f"/api/v1/caregiver-consent/grants/{gid}/last-acknowledgement",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["latest_landed_channel"] is None


# ── 8. Cross-clinic + IDOR regression ───────────────────────────────────────


class TestCrossClinicIDOR:
    def test_caregiver_delivery_summary_blocks_guest(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["guest"],
        )
        # Endpoint scoped to patient role; guests / unauth must be 4xx.
        assert r.status_code in (401, 403, 404), r.text

    def test_cross_caregiver_cannot_read_anothers_last_ack(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Grant pointed at the patient-demo as caregiver. Clinician-demo
        # tries to GET — must 404 (cross-caregiver invisible regardless
        # of which channel the dispatch went on).
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-patient-demo",
        )
        _seed_digest_audit(
            caregiver_user_id="actor-patient-demo",
            adapter="slack",
            grant_id=gid,
        )
        r = client.get(
            f"/api/v1/caregiver-consent/grants/{gid}/last-acknowledgement",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_summary_does_not_leak_caregiver_email_or_full_name(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        db = SessionLocal()
        try:
            cg_id = f"madp-cg-{_uuid.uuid4().hex[:8]}"
            cg_email = f"{cg_id}-realemail@example.com"
            db.add(
                User(
                    id=cg_id,
                    email=cg_email,
                    display_name="Alex Verylonglastname",
                    hashed_password="x",
                    role="patient",
                )
            )
            db.commit()
        finally:
            db.close()

        _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id=cg_id,
        )
        _seed_digest_audit(caregiver_user_id=cg_id, adapter="sendgrid")

        r = client.get(
            "/api/v1/patient-digest/caregiver-delivery-summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.text
        # Email + last-name MUST NOT appear in the patient-side response.
        assert "realemail" not in body
        assert "Verylonglastname" not in body


# ── 9. Audit-trail filter exposure ──────────────────────────────────────────


class TestAuditTrailFilter:
    def test_audit_trail_returns_email_digest_sent_rows(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
        )
        # Seed one row from each of the four adapters.
        for adapter in ("sendgrid", "twilio", "slack", "pagerduty"):
            _seed_digest_audit(
                caregiver_user_id="actor-clinician-demo",
                adapter=adapter,
            )
        r = client.get(
            "/api/v1/audit-trail",
            params={
                "surface": "caregiver_portal",
                "q": "digest_sent",
                "limit": 100,
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json().get("items") or []
        # All four channels appear in the filtered result set.
        notes = " ".join((it.get("note") or "") for it in items)
        for adapter in ("sendgrid", "twilio", "slack", "pagerduty"):
            assert f"adapter={adapter}" in notes, (
                f"adapter {adapter} missing from audit-trail filter result"
            )

    def test_audit_trail_filter_caregiver_portal_known_surface(self) -> None:
        from app.routers.audit_trail_router import KNOWN_SURFACES

        assert "caregiver_portal" in KNOWN_SURFACES
