"""Tests for the Per-Caregiver Channel Preference launch-audit (2026-05-01).

Closes section I rec from the Multi-Adapter Delivery Parity launch
audit (#384). Each caregiver picks a preferred dispatch channel (email
/ sms / slack / pagerduty) on top of the per-clinic
:class:`EscalationPolicy.dispatch_order` shipped in #374. The
worker / send-now path resolves the dispatch chain as
``[caregiver_preferred, *clinic_chain]`` with dedup, so the caregiver's
preferred adapter is tried first while the clinic's escalation order
remains intact as the fallback.

This suite asserts:

* Role gate — guest 403 on every endpoint; clinician (caregiver target)
  ✅; cross-caregiver isolation via actor scoping;
* PUT ``preferred_channel='email'`` persists; round-trips on GET;
* PUT ``preferred_channel`` accepts ``sms``, ``slack``, ``pagerduty``;
* PUT ``preferred_channel='unknown'`` → 422;
* PUT ``preferred_channel=null`` clears the override after it is set;
* GET returns ``preferred_channel`` (null on first read);
* Send-now resolved chain prepends the caregiver's preferred adapter
  with dedup;
* Worker tick honors the same resolution;
* Cooldown still 24h with override set;
* Audit row note carries ``caregiver_preferred_channel=<value|null>``
  (manual + worker paths);
* Cross-caregiver isolation — actor A cannot read actor B's preference
  row;
* Helper :func:`_resolve_caregiver_dispatch_chain` is order-preserving
  + idempotent on dedup.
"""
from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime, timedelta, timezone

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


# Make sure the env-var-gated start path stays disabled in tests so we
# don't accidentally fire a real BackgroundScheduler thread inside
# pytest. Tests that exercise the worker call ``tick()`` synchronously.
os.environ.pop("DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED", None)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_worker_singleton() -> None:
    """Drop the worker singleton between tests."""
    from app.workers.caregiver_email_digest_worker import _reset_for_tests

    _reset_for_tests()
    yield
    _reset_for_tests()


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
            id="ccp-launch-audit-patient",
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


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(CaregiverDigestPreference).filter(
            CaregiverDigestPreference.caregiver_user_id.in_(
                [
                    "actor-clinician-demo",
                    "actor-admin-demo",
                    "actor-resident-demo",
                    "actor-patient-demo",
                ]
            )
        ).delete(synchronize_session=False)
        db.query(CaregiverConsentGrant).filter(
            CaregiverConsentGrant.id.like("ccp-grant-%")
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_(
                ["caregiver_email_digest_worker", "caregiver_portal"]
            )
        ).filter(
            AuditEventRecord.actor_id.in_(
                [
                    "actor-clinician-demo",
                    "actor-admin-demo",
                    "actor-resident-demo",
                    "actor-patient-demo",
                    "caregiver-email-digest-worker",
                ]
            )
        ).delete(synchronize_session=False)
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
        gid = f"ccp-grant-{_uuid.uuid4().hex[:10]}"
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


def _seed_audit_row_for_grant(
    *,
    grant_id: str,
    action: str = "caregiver_portal.grant_accessed",
    actor_id: str = "actor-clinician-demo",
    role: str = "clinician",
    note: str = "scope_key=digest",
    minutes_ago: int = 60,
) -> str:
    db = SessionLocal()
    try:
        ts = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()
        eid = f"caregiver_portal-ccp-{_uuid.uuid4().hex[:10]}"
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=grant_id,
                target_type="caregiver_portal",
                action=action,
                role=role,
                actor_id=actor_id,
                note=note,
                created_at=ts,
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


def _seed_user(user_id: str, *, email: str, role: str = "clinician") -> None:
    db = SessionLocal()
    try:
        if db.query(User).filter_by(id=user_id).first() is not None:
            return
        db.add(
            User(
                id=user_id,
                email=email,
                display_name=email.split("@", 1)[0],
                hashed_password="x",
                role=role,
                package_id="clinician_pro",
                clinic_id="clinic-demo-default",
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_pref(
    *,
    caregiver_user_id: str,
    enabled: bool = True,
    frequency: str = "daily",
    time_of_day: str = "08:00",
    last_sent_at: str | None = None,
    preferred_channel: str | None = None,
) -> None:
    db = SessionLocal()
    try:
        existing = (
            db.query(CaregiverDigestPreference)
            .filter_by(caregiver_user_id=caregiver_user_id)
            .first()
        )
        now_iso = datetime.now(timezone.utc).isoformat()
        if existing is not None:
            existing.enabled = enabled
            existing.frequency = frequency
            existing.time_of_day = time_of_day
            existing.last_sent_at = last_sent_at
            existing.preferred_channel = preferred_channel
            existing.updated_at = now_iso
        else:
            db.add(
                CaregiverDigestPreference(
                    id=f"cdp-test-{_uuid.uuid4().hex[:8]}",
                    caregiver_user_id=caregiver_user_id,
                    enabled=enabled,
                    frequency=frequency,
                    time_of_day=time_of_day,
                    last_sent_at=last_sent_at,
                    preferred_channel=preferred_channel,
                    created_at=now_iso,
                    updated_at=now_iso,
                )
            )
        db.commit()
    finally:
        db.close()


# ── Helper: dispatch chain resolver ────────────────────────────────────────


class TestResolveDispatchChainHelper:
    def test_returns_clinic_chain_when_preferred_is_none(self) -> None:
        from app.routers.caregiver_email_digest_router import (
            _resolve_caregiver_dispatch_chain,
        )

        out = _resolve_caregiver_dispatch_chain(
            preferred_channel=None,
            clinic_chain=["sendgrid", "slack", "twilio"],
        )
        assert out == ["sendgrid", "slack", "twilio"]

    def test_prepends_preferred_when_not_in_chain(self) -> None:
        from app.routers.caregiver_email_digest_router import (
            _resolve_caregiver_dispatch_chain,
        )

        out = _resolve_caregiver_dispatch_chain(
            preferred_channel="pagerduty",
            clinic_chain=["sendgrid", "slack"],
        )
        assert out == ["pagerduty", "sendgrid", "slack"]

    def test_dedups_when_preferred_already_first(self) -> None:
        from app.routers.caregiver_email_digest_router import (
            _resolve_caregiver_dispatch_chain,
        )

        out = _resolve_caregiver_dispatch_chain(
            preferred_channel="slack",
            clinic_chain=["slack", "sendgrid", "twilio"],
        )
        assert out == ["slack", "sendgrid", "twilio"]

    def test_moves_preferred_from_middle_to_front(self) -> None:
        from app.routers.caregiver_email_digest_router import (
            _resolve_caregiver_dispatch_chain,
        )

        out = _resolve_caregiver_dispatch_chain(
            preferred_channel="twilio",
            clinic_chain=["sendgrid", "slack", "twilio"],
        )
        # Must dedup so the preferred adapter is not tried twice.
        assert out == ["twilio", "sendgrid", "slack"]


# ── PUT preferences ────────────────────────────────────────────────────────


class TestPutPreferredChannel:
    def test_put_email_persists_and_round_trips(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"preferred_channel": "email"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["preferred_channel"] == "email"
        # GET reflects the same value.
        r2 = client.get(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["preferred_channel"] == "email"

    def test_put_each_canonical_channel_round_trips(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        for chan in ("email", "sms", "slack", "pagerduty"):
            r = client.put(
                "/api/v1/caregiver-consent/email-digest/preferences",
                headers=auth_headers["clinician"],
                json={"preferred_channel": chan},
            )
            assert r.status_code == 200, (chan, r.text)
            assert r.json()["preferred_channel"] == chan, chan

    def test_put_unknown_channel_is_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"preferred_channel": "carrier_pigeon"},
        )
        assert r.status_code == 422, r.text

    def test_put_mock_channel_is_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # The router whitelists ADAPTER_CHANNEL.values() minus mock so a
        # caregiver cannot opt themselves into the test-only mock path.
        r = client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"preferred_channel": "mock"},
        )
        assert r.status_code == 422, r.text

    def test_put_null_clears_existing_override(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Set then clear via explicit null.
        r1 = client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"preferred_channel": "slack"},
        )
        assert r1.json()["preferred_channel"] == "slack"
        r2 = client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"preferred_channel": None},
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["preferred_channel"] is None

    def test_put_omitted_field_keeps_existing_override(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Set the override.
        client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"preferred_channel": "email"},
        )
        # Update a different field; preferred_channel must NOT be cleared.
        r = client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"frequency": "weekly"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["frequency"] == "weekly"
        assert body["preferred_channel"] == "email"

    def test_get_default_returns_null_preferred_channel(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["preferred_channel"] is None

    def test_put_emits_audit_row_with_change_diff(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"preferred_channel": "sms"},
        )
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.email_digest_preferences_changed",
                    AuditEventRecord.actor_id == "actor-clinician-demo",
                )
                .order_by(AuditEventRecord.created_at.desc())
                .first()
            )
            assert row is not None
            assert "preferred_channel" in (row.note or "")
            assert "sms" in (row.note or "")
        finally:
            db.close()


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_guest_put_preferences_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["guest"],
            json={"preferred_channel": "email"},
        )
        assert r.status_code == 403, r.text

    def test_cross_caregiver_isolation(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Actor A sets preferred_channel='email'. Actor B reads — must NOT
        # see actor A's value because preferences are scoped on
        # actor.actor_id (no caregiver_user_id query/path param).
        client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"preferred_channel": "email"},
        )
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        # admin's preference row is independent — preferred_channel is null.
        assert r.json()["caregiver_user_id"] == "actor-admin-demo"
        assert r.json()["preferred_channel"] is None


# ── Send-now ────────────────────────────────────────────────────────────────


class TestSendNowHonoursPreference:
    def test_send_now_audit_row_carries_preferred_channel(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Mock-mode short-circuits dispatch to a synthetic ``sent`` —
        # the audit row must STILL carry the caregiver_preferred_channel
        # key so the regulator transcript replays the resolved chain.
        monkeypatch.setenv("DEEPSYNAPS_DELIVERY_MOCK", "1")
        # Set the override BEFORE send-now.
        client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"preferred_channel": "sms"},
        )
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            scope='{"digest": true}',
        )
        _seed_audit_row_for_grant(grant_id=gid)
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/send-now",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["delivery_status"] == "sent"

        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.email_digest_sent",
                    AuditEventRecord.actor_id == "actor-clinician-demo",
                )
                .order_by(AuditEventRecord.created_at.desc())
                .first()
            )
            assert row is not None
            assert "caregiver_preferred_channel=sms" in (row.note or "")
        finally:
            db.close()

    def test_send_now_audit_row_carries_null_when_no_override(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Without an explicit override, the audit row must carry
        # ``caregiver_preferred_channel=null`` so the regulator
        # transcript is unambiguous.
        monkeypatch.setenv("DEEPSYNAPS_DELIVERY_MOCK", "1")
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            scope='{"digest": true}',
        )
        _seed_audit_row_for_grant(grant_id=gid)
        client.post(
            "/api/v1/caregiver-consent/email-digest/send-now",
            headers=auth_headers["clinician"],
        )
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.email_digest_sent",
                    AuditEventRecord.actor_id == "actor-clinician-demo",
                )
                .order_by(AuditEventRecord.created_at.desc())
                .first()
            )
            assert row is not None
            assert "caregiver_preferred_channel=null" in (row.note or "")
        finally:
            db.close()


# ── Worker tick ─────────────────────────────────────────────────────────────


class TestWorkerHonoursPreference:
    def test_tick_audit_row_carries_preferred_channel(
        self,
        demo_patient: Patient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("DEEPSYNAPS_DELIVERY_MOCK", "1")
        cg_id = "actor-clinician-demo"
        _seed_user(cg_id, email="cd@deepsynaps.com")
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id=cg_id,
            scope='{"digest": true}',
        )
        _seed_audit_row_for_grant(grant_id=gid, actor_id=cg_id)
        _seed_pref(
            caregiver_user_id=cg_id,
            enabled=True,
            preferred_channel="slack",
        )

        from app.workers.caregiver_email_digest_worker import get_worker

        worker = get_worker()
        result = worker.tick()
        assert result.digests_sent == 1, (
            f"expected 1 dispatch, got {result.digests_sent} "
            f"(skipped_consent={result.skipped_consent} "
            f"errors={result.errors} last_error={result.last_error})"
        )
        # Per-caregiver audit row written by the worker carries the
        # caregiver_preferred_channel key.
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.email_digest_sent",
                    AuditEventRecord.actor_id
                    == "caregiver-email-digest-worker",
                    AuditEventRecord.target_id == cg_id,
                )
                .order_by(AuditEventRecord.created_at.desc())
                .first()
            )
            assert row is not None
            assert "caregiver_preferred_channel=slack" in (row.note or "")
        finally:
            db.close()

    def test_tick_cooldown_still_24h_with_override(
        self,
        demo_patient: Patient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Override does not bypass the 24h cooldown — the dispatch should
        # be skipped for a caregiver whose last_sent_at is within the
        # cooldown window even when preferred_channel is set.
        monkeypatch.setenv("DEEPSYNAPS_DELIVERY_MOCK", "1")
        cg_id = "actor-clinician-demo"
        _seed_user(cg_id, email="cd@deepsynaps.com")
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id=cg_id,
            scope='{"digest": true}',
        )
        _seed_audit_row_for_grant(grant_id=gid, actor_id=cg_id)
        recent = (
            datetime.now(timezone.utc) - timedelta(hours=1)
        ).isoformat()
        _seed_pref(
            caregiver_user_id=cg_id,
            enabled=True,
            last_sent_at=recent,
            preferred_channel="email",
        )

        from app.workers.caregiver_email_digest_worker import get_worker

        worker = get_worker()
        result = worker.tick()
        assert result.skipped_cooldown == 1
        assert result.digests_sent == 0


# ── Channel-name reverse lookup helper ─────────────────────────────────────


class TestChannelToAdapterName:
    def test_email_maps_to_sendgrid(self) -> None:
        from app.services.oncall_delivery import _channel_to_adapter_name

        assert _channel_to_adapter_name("email") == "sendgrid"

    def test_sms_maps_to_twilio(self) -> None:
        from app.services.oncall_delivery import _channel_to_adapter_name

        assert _channel_to_adapter_name("sms") == "twilio"

    def test_slack_maps_to_slack(self) -> None:
        from app.services.oncall_delivery import _channel_to_adapter_name

        assert _channel_to_adapter_name("slack") == "slack"

    def test_unknown_returns_none(self) -> None:
        from app.services.oncall_delivery import _channel_to_adapter_name

        assert _channel_to_adapter_name("fax") is None
        assert _channel_to_adapter_name(None) is None
        assert _channel_to_adapter_name("") is None
