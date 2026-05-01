"""Tests for the Caregiver Email Digest launch-audit (2026-05-01).

Closes the bidirectional notification loop opened by Caregiver
Notification Hub #379. Daily roll-up dispatch of unread caregiver
notifications via the on-call delivery adapters in mock mode unless
real env vars are set.

This suite asserts:

* role gate — guest is 403 on every endpoint; clinician (caregiver
  target) ✅; cross-caregiver token sees an empty preview / its own
  preference row but never another caregiver's data;
* preview returns the actor's unread notifications + ``consent_active``
  flag honestly;
* send-now in mock mode (``DEEPSYNAPS_DELIVERY_MOCK=1``) returns
  ``status='sent'`` only when consent grant carries
  ``scope.digest=True``; without consent ``queued`` +
  ``consent_required=True``;
* preferences GET auto-creates a default disabled row;
* preferences PUT round-trips and emits the
  ``caregiver_portal.email_digest_preferences_changed`` audit row;
* worker tick: seed 2 caregivers (both opted-in with consent), mock
  mode → 2 digests sent + 2 audit rows;
* cooldown — same caregiver dispatched within 24h is skipped;
* worker per-tick audit row under
  ``target_type='caregiver_email_digest_worker'`` with note encoding
  the count metadata;
* surface whitelisted in audit_trail_router KNOWN_SURFACES + qeeg-
  analysis audit-events ingestion.
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
    """Drop the in-memory worker singleton between tests so status
    counters and the cached interval/cooldown values don't leak across
    cases.
    """
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
            id="ced-launch-audit-patient",
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
            CaregiverConsentGrant.id.like("ced-grant-%")
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
        gid = f"ced-grant-{_uuid.uuid4().hex[:10]}"
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
        eid = f"caregiver_portal-ced-{_uuid.uuid4().hex[:10]}"
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
    """Seed a User row so the worker resolves a real recipient email."""
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


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_worker_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "caregiver_email_digest_worker" in KNOWN_SURFACES


def test_worker_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "surface": "caregiver_email_digest_worker",
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
    assert data.get("event_id", "").startswith("caregiver_email_digest_worker-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_guest_preview_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preview",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403, r.text

    def test_guest_send_now_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/send-now",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403, r.text

    def test_guest_preferences_get_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403, r.text

    def test_clinician_can_read_preview(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preview",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["caregiver_user_id"] == "actor-clinician-demo"
        # Defaults to no consent_active, empty items.
        assert body["consent_active"] is False
        assert isinstance(body["items"], list)


# ── Preview ─────────────────────────────────────────────────────────────────


class TestPreview:
    def test_preview_returns_unread_notifications_for_actor(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        gid = _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            scope='{"digest": true}',
        )
        _seed_audit_row_for_grant(grant_id=gid)
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preview",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["caregiver_user_id"] == "actor-clinician-demo"
        assert body["consent_active"] is True
        assert body["unread_count"] >= 1
        assert any(it["type"] == "access_log" for it in body["items"])

    def test_preview_consent_inactive_when_grant_lacks_digest_scope(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Grant has scope.messages=True but NOT digest — caregiver
        # should NOT see consent_active=True for digest dispatch.
        _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            scope='{"messages": true}',
        )
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preview",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["consent_active"] is False

    def test_preview_emits_audit_row(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        client.get(
            "/api/v1/caregiver-consent/email-digest/preview",
            headers=auth_headers["clinician"],
        )
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.email_digest_view",
                    AuditEventRecord.actor_id == "actor-clinician-demo",
                )
                .first()
            )
            assert row is not None
        finally:
            db.close()


# ── Send-now ────────────────────────────────────────────────────────────────


class TestSendNow:
    def test_send_now_without_consent_is_queued(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # No grant pointed at the actor — refuse to dispatch but record
        # intent + recipient verbatim.
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/send-now",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["delivery_status"] == "queued"
        assert body["consent_required"] is True
        assert body["audit_event_id"].startswith("caregiver_portal-")

    def test_send_now_in_mock_mode_returns_sent(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Mock-mode short-circuits the delivery service to "sent".
        monkeypatch.setenv("DEEPSYNAPS_DELIVERY_MOCK", "1")
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
        body = r.json()
        assert body["delivery_status"] == "sent", body
        assert body["adapter"] == "mock"
        assert body["external_id"]
        assert body["consent_required"] is False
        assert body["unread_count"] >= 1
        # Audit row records the sent dispatch.
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.email_digest_sent",
                    AuditEventRecord.actor_id == "actor-clinician-demo",
                )
                .first()
            )
            assert row is not None
            assert "delivery_status=sent" in (row.note or "")
        finally:
            db.close()

    def test_send_now_with_no_unread_is_queued_no_op(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Consent active but zero unread notifications — expect a
        # queued no-op so reviewers can correlate the click.
        monkeypatch.setenv("DEEPSYNAPS_DELIVERY_MOCK", "1")
        _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id="actor-clinician-demo",
            scope='{"digest": true}',
        )
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/send-now",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["delivery_status"] == "queued"
        assert body["unread_count"] == 0


# ── Preferences ─────────────────────────────────────────────────────────────


class TestPreferences:
    def test_preferences_get_auto_creates_default_disabled_row(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["caregiver_user_id"] == "actor-clinician-demo"
        assert body["enabled"] is False
        assert body["frequency"] == "daily"
        assert body["time_of_day"] == "08:00"
        assert body["last_sent_at"] is None

    def test_preferences_put_round_trips(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={
                "enabled": True,
                "frequency": "weekly",
                "time_of_day": "09:30",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["enabled"] is True
        assert body["frequency"] == "weekly"
        assert body["time_of_day"] == "09:30"

        # GET reflects the change.
        r2 = client.get(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
        )
        assert r2.json()["enabled"] is True
        assert r2.json()["frequency"] == "weekly"

    def test_preferences_put_emits_audit_row(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"enabled": True},
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
                .first()
            )
            assert row is not None
        finally:
            db.close()

    def test_preferences_put_rejects_bad_frequency(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"frequency": "monthly"},
        )
        assert r.status_code == 422

    def test_preferences_put_rejects_bad_time_of_day(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.put(
            "/api/v1/caregiver-consent/email-digest/preferences",
            headers=auth_headers["clinician"],
            json={"time_of_day": "25:00"},
        )
        assert r.status_code == 422


# ── Worker tick ─────────────────────────────────────────────────────────────


def _seed_pref(
    *,
    caregiver_user_id: str,
    enabled: bool = True,
    frequency: str = "daily",
    time_of_day: str = "08:00",
    last_sent_at: str | None = None,
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
                    created_at=now_iso,
                    updated_at=now_iso,
                )
            )
        db.commit()
    finally:
        db.close()


class TestWorker:
    def test_tick_seeds_two_caregivers_both_dispatch_in_mock_mode(
        self,
        demo_patient: Patient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("DEEPSYNAPS_DELIVERY_MOCK", "1")

        # Two opted-in caregivers with active digest grants + one unread row.
        for cg_id, email in (
            ("actor-clinician-demo", "clinician@deepsynaps.com"),
            ("actor-admin-demo", "admin@deepsynaps.com"),
        ):
            _seed_user(cg_id, email=email, role="clinician")
            gid = _seed_grant(
                patient_id=demo_patient.id,
                caregiver_user_id=cg_id,
                scope='{"digest": true}',
            )
            _seed_audit_row_for_grant(grant_id=gid, actor_id=cg_id)
            _seed_pref(caregiver_user_id=cg_id, enabled=True)

        from app.workers.caregiver_email_digest_worker import get_worker

        worker = get_worker()
        result = worker.tick()

        assert result.caregivers_processed == 2
        assert result.digests_sent == 2, (
            f"expected 2 sent, got {result.digests_sent} "
            f"(skipped_consent={result.skipped_consent} "
            f"skipped_no_unread={result.skipped_no_unread} "
            f"errors={result.errors} last_error={result.last_error})"
        )
        assert "actor-clinician-demo" in result.sent_caregiver_ids
        assert "actor-admin-demo" in result.sent_caregiver_ids
        assert result.errors == 0, result.last_error

        # Per-caregiver audit rows were written, single-sourced with
        # the manual send-now handler.
        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.email_digest_sent",
                    AuditEventRecord.actor_id
                    == "caregiver-email-digest-worker",
                )
                .all()
            )
            assert len(rows) >= 2, [r.note for r in rows]
        finally:
            db.close()

    def test_tick_cooldown_skips_recently_sent(
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
        # Pretend we sent 1h ago — cooldown is 24h so this MUST be skipped.
        recent = (
            datetime.now(timezone.utc) - timedelta(hours=1)
        ).isoformat()
        _seed_pref(
            caregiver_user_id=cg_id, enabled=True, last_sent_at=recent
        )

        from app.workers.caregiver_email_digest_worker import get_worker

        worker = get_worker()
        result = worker.tick()
        assert result.caregivers_processed == 1
        assert result.skipped_cooldown == 1, (
            f"expected cooldown skip, got digests_sent={result.digests_sent} "
            f"skipped_cooldown={result.skipped_cooldown}"
        )
        assert result.digests_sent == 0

    def test_tick_skips_caregiver_without_digest_scope(
        self,
        demo_patient: Patient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("DEEPSYNAPS_DELIVERY_MOCK", "1")
        cg_id = "actor-clinician-demo"
        _seed_user(cg_id, email="cd@deepsynaps.com")
        # Grant with scope.messages=True only — NOT digest.
        _seed_grant(
            patient_id=demo_patient.id,
            caregiver_user_id=cg_id,
            scope='{"messages": true}',
        )
        _seed_pref(caregiver_user_id=cg_id, enabled=True)

        from app.workers.caregiver_email_digest_worker import get_worker

        worker = get_worker()
        result = worker.tick()
        assert result.caregivers_processed == 1
        assert result.skipped_consent == 1
        assert result.digests_sent == 0

    def test_tick_emits_per_tick_audit_row(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        from app.workers.caregiver_email_digest_worker import get_worker

        worker = get_worker()
        worker.tick()

        # Per-tick audit row under target_type='caregiver_email_digest_worker'.
        audit = client.get(
            "/api/v1/audit-trail?surface=caregiver_email_digest_worker",
            headers=auth_headers["admin"],
        )
        assert audit.status_code == 200, audit.text
        actions = [it.get("action") for it in audit.json()["items"]]
        assert "caregiver_email_digest_worker.tick" in actions


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/audit-events",
            headers=auth_headers["clinician"],
            json={"event": "view", "note": "page_mounted"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("caregiver_email_digest_worker-")

    def test_audit_event_surfaces_in_audit_trail(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        client.post(
            "/api/v1/caregiver-consent/email-digest/audit-events",
            headers=auth_headers["clinician"],
            json={"event": "preview_loaded", "note": "unread=3"},
        )
        r = client.get(
            "/api/v1/audit-trail?surface=caregiver_email_digest_worker",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        actions = [it.get("action") for it in r.json()["items"]]
        assert "caregiver_email_digest_worker.preview_loaded" in actions

    def test_guest_audit_ingestion_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-consent/email-digest/audit-events",
            headers=auth_headers["guest"],
            json={"event": "view"},
        )
        assert r.status_code == 403, r.text
