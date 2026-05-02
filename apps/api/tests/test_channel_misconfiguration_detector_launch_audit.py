"""Tests for the Channel Misconfiguration Detector launch-audit (2026-05-01).

Closes section I rec from the Clinic Caregiver Channel Override launch
audit (#387). The override admin tab shipped the ``is_misconfigured``
flag and a one-click "Override → clinic chain" CTA, but the admin
still has to discover the misconfig manually. THIS suite asserts that
the new background worker:

* respects the role gate (clinician read OK / clinician write 403 /
  admin both OK / patient + guest 403),
* hides cross-clinic data from clinicians,
* runs ONE tick that converts misconfigured caregivers into HIGH-priority
  ``caregiver_portal.channel_misconfigured_detected`` audit rows,
* emits ONE per-tick audit row under
  ``target_type='channel_misconfiguration_detector'`` with note encoding
  the count metadata,
* honours the cooldown window (default 24h per (caregiver, clinic)),
* does NOT flag properly-configured caregivers,
* does NOT flag caregivers whose last successful delivery is recent (<24h),
* surfaces honest counts on ``GET /status``,
* surface whitelisted in audit_trail_router KNOWN_SURFACES + qeeg-analysis
  audit-events ingestion,
* HIGH-priority row is visible to the Clinician Inbox aggregator.
"""
from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    CaregiverDigestPreference,
    User,
)


# Make sure the env-var-gated start path stays disabled in tests so we
# don't accidentally fire a real BackgroundScheduler thread inside
# pytest. Tests that exercise the worker call ``tick()`` synchronously.
os.environ.pop("DEEPSYNAPS_CHANNEL_DETECTOR_ENABLED", None)
# Tests assert honest misconfig detection so default off mock-mode.
os.environ.pop("DEEPSYNAPS_DELIVERY_MOCK", None)


# ── Fixtures / helpers ──────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_worker_singleton() -> None:
    """Drop the in-memory singleton between tests so status counters and
    the cached interval/cooldown values don't leak across cases.
    """
    from app.workers.channel_misconfiguration_detector_worker import (
        _reset_for_tests,
    )

    _reset_for_tests()
    yield
    _reset_for_tests()


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(CaregiverDigestPreference).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_(
                [
                    "caregiver_portal",
                    "channel_misconfiguration_detector",
                ]
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(
            User.id.in_(
                [
                    "actor-cmd-cg-misconfigured-1",
                    "actor-cmd-cg-misconfigured-2",
                    "actor-cmd-cg-properly-configured",
                    "actor-cmd-cg-recently-delivered",
                    "actor-cmd-cg-no-pref",
                    "actor-cmd-cg-other-clinic",
                ]
            )
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _seed_user(
    user_id: str,
    *,
    email: str,
    role: str = "clinician",
    clinic_id: str = "clinic-demo-default",
) -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id=user_id).first()
        if existing is not None:
            existing.clinic_id = clinic_id
            db.commit()
            return
        db.add(
            User(
                id=user_id,
                email=email,
                display_name=email.split("@", 1)[0],
                hashed_password="x",
                role=role,
                package_id="clinician_pro",
                clinic_id=clinic_id,
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
        now_iso = _dt.now(_tz.utc).isoformat()
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
                    id=f"cdp-cmd-{_uuid.uuid4().hex[:8]}",
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


def _drop_twilio_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure Twilio adapter is disabled so SMS preference is misconfigured."""
    monkeypatch.delenv("DEEPSYNAPS_DELIVERY_MOCK", raising=False)
    for v in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"):
        monkeypatch.delenv(v, raising=False)


# ── 1. Surface whitelist sanity ─────────────────────────────────────────────


def test_worker_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "channel_misconfiguration_detector" in KNOWN_SURFACES


def test_worker_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "surface": "channel_misconfiguration_detector",
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
    assert data.get("event_id", "").startswith("channel_misconfiguration_detector-")


# ── 2. Role gate ────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_status_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/channel-misconfiguration-detector/status",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_guest_status_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/channel-misconfiguration-detector/status",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_clinician_can_read_status(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/channel-misconfiguration-detector/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "running" in data
        assert "caregivers_in_clinic" in data
        assert "misconfigs_flagged_last_24h" in data
        assert "interval_sec" in data
        assert "cooldown_hours" in data
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]

    def test_clinician_tick_once_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/channel-misconfiguration-detector/tick-once",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_admin_can_tick_once(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/channel-misconfiguration-detector/tick-once",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["accepted"] is True
        assert data["clinic_id"] == "clinic-demo-default"
        assert "caregivers_scanned" in data
        assert "misconfigs_flagged" in data
        assert data["audit_event_id"].startswith(
            "channel_misconfiguration_detector-"
        )


# ── 3. Cross-clinic isolation ───────────────────────────────────────────────


class TestCrossClinic:
    def test_clinician_status_scoped_to_own_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed an other-clinic misconfigured caregiver.
        _seed_user(
            "actor-cmd-cg-other-clinic",
            email="cg-other@example.com",
            role="clinician",
            clinic_id="clinic-cmd-other",
        )
        _seed_pref(
            caregiver_user_id="actor-cmd-cg-other-clinic",
            preferred_channel="sms",
        )
        r = client.get(
            "/api/v1/channel-misconfiguration-detector/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["clinic_id"] == "clinic-demo-default"
        # Caregiver is in another clinic — must not show up in the count.
        assert data["caregivers_in_clinic"] == 0

    def test_tick_once_only_scans_actor_clinic(
        self,
        client: TestClient,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _drop_twilio_env(monkeypatch)
        # Seed two misconfigs: one in actor's clinic, one in another.
        _seed_user(
            "actor-cmd-cg-misconfigured-1",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-cmd-cg-misconfigured-1",
            preferred_channel="sms",
        )
        _seed_user(
            "actor-cmd-cg-other-clinic",
            email="cg-other@example.com",
            role="clinician",
            clinic_id="clinic-cmd-other",
        )
        _seed_pref(
            caregiver_user_id="actor-cmd-cg-other-clinic",
            preferred_channel="sms",
        )
        r = client.post(
            "/api/v1/channel-misconfiguration-detector/tick-once",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Bounded by only_clinic_id=clinic-demo-default → other-clinic
        # caregiver must not appear in flagged ids.
        assert "actor-cmd-cg-other-clinic" not in data["flagged_caregiver_ids"]
        assert "actor-cmd-cg-misconfigured-1" in data["flagged_caregiver_ids"]


# ── 4. Tick: real flagging + audit + HIGH-priority ──────────────────────────


class TestTick:
    def test_tick_flags_misconfigured_caregivers(
        self,
        client: TestClient,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.workers.channel_misconfiguration_detector_worker import (
            get_worker,
        )

        _drop_twilio_env(monkeypatch)
        # Two misconfigured caregivers (sms preferred, no Twilio creds, no
        # last_sent_at — never delivered).
        _seed_user(
            "actor-cmd-cg-misconfigured-1",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-cmd-cg-misconfigured-1",
            preferred_channel="sms",
        )
        _seed_user(
            "actor-cmd-cg-misconfigured-2",
            email="cg2@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-cmd-cg-misconfigured-2",
            preferred_channel="sms",
        )

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        assert result.misconfigs_flagged == 2, (
            f"expected to flag both caregivers; got "
            f"flagged={result.misconfigs_flagged} "
            f"errors={result.errors} last_error={result.last_error}"
        )
        assert "actor-cmd-cg-misconfigured-1" in result.flagged_caregiver_ids
        assert "actor-cmd-cg-misconfigured-2" in result.flagged_caregiver_ids

        # Each flagged row carries priority=high and the canonical action.
        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.channel_misconfigured_detected",
                    AuditEventRecord.target_id.in_(
                        [
                            "actor-cmd-cg-misconfigured-1",
                            "actor-cmd-cg-misconfigured-2",
                        ]
                    ),
                )
                .all()
            )
            assert len(rows) == 2
            for r in rows:
                note = (r.note or "").lower()
                assert "priority=high" in note
                assert "adapter=twilio" in note
                assert "caregiver_id=" in note
                assert "clinic_id=clinic-demo-default" in note
        finally:
            db.close()

        # Per-tick audit row.
        audit = client.get(
            "/api/v1/audit-trail?surface=channel_misconfiguration_detector",
            headers=auth_headers["admin"],
        )
        assert audit.status_code == 200, audit.text
        actions = [it.get("action") for it in audit.json()["items"]]
        assert "channel_misconfiguration_detector.tick" in actions

    def test_high_priority_row_visible_in_clinician_inbox(
        self,
        client: TestClient,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.workers.channel_misconfiguration_detector_worker import (
            get_worker,
        )

        _drop_twilio_env(monkeypatch)
        _seed_user(
            "actor-cmd-cg-misconfigured-1",
            email="cg1@example.com",
            role="admin",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-cmd-cg-misconfigured-1",
            preferred_channel="sms",
        )
        worker = get_worker()
        db = SessionLocal()
        try:
            worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        # Inbox aggregator should pick up the priority=high row.
        r = client.get(
            "/api/v1/clinician-inbox/items?limit=100",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        actions = [it.get("action") for it in r.json().get("items", [])]
        assert (
            "caregiver_portal.channel_misconfigured_detected" in actions
        ), actions


class TestCooldown:
    def test_same_caregiver_not_re_flagged_within_cooldown(
        self,
        client: TestClient,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.workers.channel_misconfiguration_detector_worker import (
            get_worker,
        )

        _drop_twilio_env(monkeypatch)
        _seed_user(
            "actor-cmd-cg-misconfigured-1",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-cmd-cg-misconfigured-1",
            preferred_channel="sms",
        )

        worker = get_worker()
        db = SessionLocal()
        try:
            r1 = worker.tick(db, only_clinic_id="clinic-demo-default")
            r2 = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        # First tick flagged once; second tick saw same misconfig, skipped.
        assert r1.misconfigs_flagged == 1
        assert "actor-cmd-cg-misconfigured-1" in r1.flagged_caregiver_ids
        assert r2.misconfigs_flagged == 0
        assert r2.skipped_cooldown >= 1

        # Only ONE caregiver_portal.channel_misconfigured_detected row exists.
        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action
                    == "caregiver_portal.channel_misconfigured_detected",
                    AuditEventRecord.target_id == "actor-cmd-cg-misconfigured-1",
                )
                .all()
            )
            assert len(rows) == 1
        finally:
            db.close()


class TestNonFlagging:
    def test_properly_configured_caregiver_not_flagged(
        self,
        client: TestClient,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.workers.channel_misconfiguration_detector_worker import (
            get_worker,
        )

        # Mock-mode flips every adapter to enabled — caregiver's SMS
        # preference is honoured, so no misconfig should fire.
        monkeypatch.setenv("DEEPSYNAPS_DELIVERY_MOCK", "1")
        _seed_user(
            "actor-cmd-cg-properly-configured",
            email="ok@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-cmd-cg-properly-configured",
            preferred_channel="sms",
        )
        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        assert result.misconfigs_flagged == 0
        assert result.skipped_adapter_ok >= 1
        assert (
            "actor-cmd-cg-properly-configured" not in result.flagged_caregiver_ids
        )

    def test_recently_delivered_caregiver_not_flagged(
        self,
        client: TestClient,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.workers.channel_misconfiguration_detector_worker import (
            get_worker,
        )

        _drop_twilio_env(monkeypatch)
        # Caregiver picked SMS but received a successful digest 2h ago via
        # the SendGrid fallback. Cooldown predicate keeps the misconfig
        # quiet because dispatch is still landing.
        last_sent = (_dt.now(_tz.utc) - _td(hours=2)).isoformat()
        _seed_user(
            "actor-cmd-cg-recently-delivered",
            email="rec@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-cmd-cg-recently-delivered",
            preferred_channel="sms",
            last_sent_at=last_sent,
        )
        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        assert result.misconfigs_flagged == 0
        assert result.skipped_recent_delivery >= 1

    def test_caregiver_with_no_preferred_channel_not_flagged(
        self,
        client: TestClient,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.workers.channel_misconfiguration_detector_worker import (
            get_worker,
        )

        _drop_twilio_env(monkeypatch)
        _seed_user(
            "actor-cmd-cg-no-pref",
            email="nopref@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-cmd-cg-no-pref",
            preferred_channel=None,
        )
        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        # No-preference caregiver isn't even loaded (we filter to
        # preferred_channel IS NOT NULL at the SQL layer) — and certainly
        # not flagged.
        assert result.misconfigs_flagged == 0
        assert "actor-cmd-cg-no-pref" not in result.flagged_caregiver_ids


# ── 5. Status endpoint honesty ──────────────────────────────────────────────


class TestStatusEndpoint:
    def test_status_reports_caregivers_in_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed 1 caregiver in actor's clinic.
        _seed_user(
            "actor-cmd-cg-misconfigured-1",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-cmd-cg-misconfigured-1",
            preferred_channel="sms",
        )
        r = client.get(
            "/api/v1/channel-misconfiguration-detector/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["clinic_id"] == "clinic-demo-default"
        assert data["caregivers_in_clinic"] >= 1
        # No tick has run — last_tick_misconfigs_flagged stays 0.
        assert data["last_tick_misconfigs_flagged"] == 0
        assert data["interval_sec"] >= 60
        assert data["cooldown_hours"] >= 1
        assert data["staleness_hours"] >= 1


# ── 6. Tick-once endpoint ───────────────────────────────────────────────────


class TestTickOnceEndpoint:
    def test_admin_tick_once_returns_synchronous_counts(
        self,
        client: TestClient,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _drop_twilio_env(monkeypatch)
        _seed_user(
            "actor-cmd-cg-misconfigured-1",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        _seed_pref(
            caregiver_user_id="actor-cmd-cg-misconfigured-1",
            preferred_channel="sms",
        )
        r = client.post(
            "/api/v1/channel-misconfiguration-detector/tick-once",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["accepted"] is True
        assert data["clinic_id"] == "clinic-demo-default"
        assert data["caregivers_scanned"] >= 1
        assert data["misconfigs_flagged"] >= 1
        assert "actor-cmd-cg-misconfigured-1" in data["flagged_caregiver_ids"]
        assert data["errors"] == 0
        assert data["audit_event_id"].startswith(
            "channel_misconfiguration_detector-"
        )


# ── 7. Audit ingestion ──────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/channel-misconfiguration-detector/audit-events",
            json={
                "event": "view",
                "note": "clinician mounted misconfig detector view",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith(
            "channel_misconfiguration_detector-"
        )

    def test_audit_ingestion_patient_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/channel-misconfiguration-detector/audit-events",
            json={"event": "view"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_audit_event_surfaces_in_audit_trail(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/channel-misconfiguration-detector/audit-events",
            json={
                "event": "polling_tick",
                "note": "client poll cycle",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        audit = client.get(
            "/api/v1/audit-trail?surface=channel_misconfiguration_detector",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = [it.get("action") for it in audit]
        assert "channel_misconfiguration_detector.polling_tick" in actions
