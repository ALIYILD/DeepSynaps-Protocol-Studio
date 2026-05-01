"""Tests for the Auto-Page Worker launch-audit (2026-05-01).

Closes the real-time half of the Care Team Coverage launch loop opened by
#357. Care Team Coverage shipped the data model + manual page-on-call;
this test suite asserts that the new background worker:

* respects the role gate (clinician read OK / clinician write 403 /
  admin both OK),
* hides cross-clinic data from clinicians (404),
* runs ONE tick that converts breaches into ``oncall_pages`` rows tagged
  ``trigger='auto'`` and ``delivery_status='queued'``,
* emits ONE per-tick audit row under ``target_type='auto_page_worker'``
  with note encoding the count metadata,
* does NOT re-page a breach inside the cooldown window (default 15 min),
* does NOT page breaches from a clinic with ``auto_page_enabled=False``,
* surfaces honest counts on ``GET /status``,
* surface whitelisted in audit_trail_router KNOWN_SURFACES + qeeg-analysis
  audit-events ingestion.
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
    Clinic,
    EscalationChain,
    OncallPage,
    Patient,
    User,
)


# Make sure the env-var-gated start path stays disabled in tests so we
# don't accidentally fire a real BackgroundScheduler thread inside
# pytest. Tests that exercise the worker call ``tick()`` synchronously.
os.environ.pop("DEEPSYNAPS_AUTO_PAGE_ENABLED", None)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_worker_singleton() -> None:
    """Drop the in-memory singleton between tests so status counters and
    the cached interval/cooldown values don't leak across cases.
    """
    from app.workers.auto_page_worker import _reset_for_tests

    _reset_for_tests()
    yield
    _reset_for_tests()


@pytest.fixture
def home_clinic_patient() -> Patient:
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-auto-page-home",
            clinician_id="actor-clinician-demo",
            first_name="AutoPage",
            last_name="HomeTest",
            email="auto-page-home@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


@pytest.fixture
def other_clinic() -> str:
    db = SessionLocal()
    try:
        if db.query(Clinic).filter_by(id="clinic-other-auto-page").first() is None:
            db.add(Clinic(id="clinic-other-auto-page", name="Other Auto-Page Clinic"))
            db.flush()
        if db.query(User).filter_by(id="actor-clinician-other-auto-page").first() is None:
            db.add(User(
                id="actor-clinician-other-auto-page",
                email="other-auto-page@example.com",
                display_name="Other Auto-Page Clinician",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id="clinic-other-auto-page",
            ))
        if db.query(User).filter_by(id="actor-admin-other-auto-page").first() is None:
            db.add(User(
                id="actor-admin-other-auto-page",
                email="other-admin-auto-page@example.com",
                display_name="Other Auto-Page Admin",
                hashed_password="x",
                role="admin",
                package_id="enterprise",
                clinic_id="clinic-other-auto-page",
            ))
        db.commit()
        return "clinic-other-auto-page"
    finally:
        db.close()


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
    """Seed an escalation chain with auto_page_enabled."""
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
            contact_channel="sms",
            contact_handle="+15555555555",
            note=None,
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
        ))
        db.commit()
        return sid
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_worker_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "auto_page_worker" in KNOWN_SURFACES


def test_worker_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": "auto_page_worker", "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("auto_page_worker-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_status_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/auto-page-worker/status",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_clinician_can_read_status(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/auto-page-worker/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "running" in data
        assert "breaches_pending_now" in data
        assert "paged_last_hour" in data
        assert "errors_last_hour" in data
        assert "interval_sec" in data
        assert "cooldown_min" in data
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]

    def test_clinician_start_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/auto-page-worker/start",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_clinician_stop_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/auto-page-worker/stop",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_clinician_tick_once_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/auto-page-worker/tick-once",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_admin_can_start_and_stop(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # No chains exist for the demo clinic — start should synthesise one.
        r_start = client.post(
            "/api/v1/auto-page-worker/start",
            headers=auth_headers["admin"],
        )
        assert r_start.status_code == 200, r_start.text
        body = r_start.json()
        assert body["accepted"] is True
        assert body["enabled_in_clinic"] is True
        assert body["surfaces_changed"] >= 1

        # Verify the chain row was actually written with auto_page_enabled=True.
        db = SessionLocal()
        try:
            rows = (
                db.query(EscalationChain)
                .filter(EscalationChain.clinic_id == "clinic-demo-default")
                .all()
            )
            assert any(r.auto_page_enabled for r in rows), [
                (r.surface, r.auto_page_enabled) for r in rows
            ]
        finally:
            db.close()

        r_stop = client.post(
            "/api/v1/auto-page-worker/stop",
            headers=auth_headers["admin"],
        )
        assert r_stop.status_code == 200, r_stop.text
        body = r_stop.json()
        assert body["enabled_in_clinic"] is False

        # Verify chain rows in the demo clinic now all have auto_page_enabled=False.
        db = SessionLocal()
        try:
            rows = (
                db.query(EscalationChain)
                .filter(EscalationChain.clinic_id == "clinic-demo-default")
                .all()
            )
            assert all(not r.auto_page_enabled for r in rows)
        finally:
            db.close()


# ── Cross-clinic isolation ──────────────────────────────────────────────────


class TestCrossClinic:
    def test_clinician_status_scoped_to_own_clinic(
        self, client: TestClient, auth_headers: dict, other_clinic: str
    ) -> None:
        # Enable auto-page in the OTHER clinic — clinician at clinic-demo-default
        # must not see THAT clinic's breaches in their pending count.
        _enable_chain(clinic_id=other_clinic, surface="*", primary_user_id=None)
        # Seed a HIGH-priority row in the OTHER clinic.
        _seed_audit_row(
            surface="adverse_events",
            event="create_to_clinician",
            target_id="ae-cross-clinic",
            actor_id="actor-clinician-other-auto-page",
            note="priority=high; cross-clinic test",
            created_at=_dt.now(_tz.utc) - _td(minutes=30),
        )
        r = client.get(
            "/api/v1/auto-page-worker/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["clinic_id"] == "clinic-demo-default"
        # Clinician sees only their clinic's pending count, not the other.
        # (Their own clinic has no breaches yet.)
        assert data["breaches_pending_now"] == 0
        # Worker not enabled in this clinic.
        assert data["enabled_in_clinic"] is False


# ── Tick: real work, audit row, oncall_pages row ────────────────────────────


class TestTick:
    def test_tick_pages_breach_and_writes_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        from app.workers.auto_page_worker import get_worker

        # Enable auto-page wildcard for the demo clinic.
        _enable_chain(
            clinic_id="clinic-demo-default",
            surface="*",
            primary_user_id="actor-clinician-demo",
            auto_page_enabled=True,
        )
        _seed_oncall_shift(surface=None)

        # Seed two HIGH-priority rows past their default SLAs.
        wb_eid = _seed_audit_row(
            surface="wearables_workbench",
            event="flag_escalated",
            target_id="flag-auto-1",
            note=f"priority=high; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=45),
        )
        ae_eid = _seed_audit_row(
            surface="adverse_events",
            event="create_to_clinician",
            target_id="ae-auto-1",
            note=f"priority=high; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=10),
        )

        # Run one tick synchronously.
        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        assert result.clinics_scanned == 1
        assert result.breaches_found >= 2
        assert result.paged >= 2, (
            f"expected to page wb_eid + ae_eid, got "
            f"breaches_found={result.breaches_found} paged={result.paged}"
        )
        assert result.errors == 0, result.last_error
        assert wb_eid in result.paged_audit_event_ids
        assert ae_eid in result.paged_audit_event_ids

        # Two oncall_pages rows tagged trigger='auto', delivery_status='queued'.
        db = SessionLocal()
        try:
            page_rows = (
                db.query(OncallPage)
                .filter(
                    OncallPage.clinic_id == "clinic-demo-default",
                    OncallPage.trigger == "auto",
                )
                .all()
            )
            event_ids = {r.audit_event_id for r in page_rows}
            assert wb_eid in event_ids
            assert ae_eid in event_ids
            for r in page_rows:
                if r.audit_event_id in (wb_eid, ae_eid):
                    # Honest delivery status — no Slack/Twilio/PagerDuty wired.
                    assert r.delivery_status == "queued", r.delivery_status
                    assert r.paged_user_id == "actor-clinician-demo"
                    assert r.paged_role == "primary"
        finally:
            db.close()

        # Per-tick audit row under target_type='auto_page_worker'.
        audit = client.get(
            "/api/v1/audit-trail?surface=auto_page_worker",
            headers=auth_headers["admin"],
        )
        assert audit.status_code == 200, audit.text
        actions = [it.get("action") for it in audit.json()["items"]]
        assert "auto_page_worker.tick" in actions

        # Each auto-paged breach also surfaces under the canonical
        # ``inbox.item_paged_to_oncall`` action so the regulator
        # transcript stays single-sourced with the manual page handler.
        audit_inbox = client.get(
            "/api/v1/audit-trail?surface=clinician_inbox",
            headers=auth_headers["admin"],
        )
        assert audit_inbox.status_code == 200
        inbox_actions = [it.get("action") for it in audit_inbox.json()["items"]]
        assert "inbox.item_paged_to_oncall" in inbox_actions


class TestIdempotency:
    def test_breach_paged_only_once_within_cooldown(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        from app.workers.auto_page_worker import get_worker

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
            target_id="flag-cooldown-1",
            note=f"priority=high; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=45),
        )

        worker = get_worker()
        db = SessionLocal()
        try:
            r1 = worker.tick(db, only_clinic_id="clinic-demo-default")
            r2 = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        # First tick paged; second tick saw same breach, skipped via cooldown.
        assert r1.paged >= 1
        assert eid in r1.paged_audit_event_ids
        assert r2.paged == 0, r2.paged_audit_event_ids
        assert r2.skipped_cooldown >= 1

        # Only ONE oncall_pages row exists for that audit_event_id.
        db = SessionLocal()
        try:
            rows = (
                db.query(OncallPage)
                .filter(OncallPage.audit_event_id == eid, OncallPage.trigger == "auto")
                .all()
            )
            assert len(rows) == 1, [(r.id, r.delivery_status) for r in rows]
        finally:
            db.close()


class TestDisabledClinic:
    def test_tick_skips_clinic_with_auto_page_disabled(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        from app.workers.auto_page_worker import get_worker

        # Explicitly disable auto-paging — chain row exists but flag is OFF.
        _enable_chain(
            clinic_id="clinic-demo-default",
            surface="*",
            primary_user_id="actor-clinician-demo",
            auto_page_enabled=False,
        )
        _seed_oncall_shift(surface=None)

        eid = _seed_audit_row(
            surface="wearables_workbench",
            event="flag_escalated",
            target_id="flag-disabled-1",
            note=f"priority=high; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=45),
        )

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(db)
        finally:
            db.close()

        # No chain rows have auto_page_enabled=True — clinics_scanned=0.
        assert result.clinics_scanned == 0
        assert result.paged == 0
        # And no oncall_pages row exists for the breach.
        db = SessionLocal()
        try:
            rows = (
                db.query(OncallPage)
                .filter(OncallPage.audit_event_id == eid)
                .all()
            )
            assert len(rows) == 0
        finally:
            db.close()


# ── Status endpoint honesty ─────────────────────────────────────────────────


class TestStatusEndpoint:
    def test_status_reports_pending_count_honestly(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        # Seed 1 aged breach.
        _seed_audit_row(
            surface="wearables_workbench",
            event="flag_escalated",
            target_id="flag-status-1",
            note=f"priority=high; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=45),
        )
        r = client.get(
            "/api/v1/auto-page-worker/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["clinic_id"] == "clinic-demo-default"
        assert data["breaches_pending_now"] >= 1
        # Worker not enabled — paged_last_hour stays 0.
        assert data["paged_last_hour"] == 0
        assert data["enabled_in_clinic"] is False
        # Per-tick numbers default to 0 before any tick has run.
        assert data["last_tick_paged"] == 0


# ── Tick-once endpoint ──────────────────────────────────────────────────────


class TestTickOnceEndpoint:
    def test_admin_tick_once_returns_synchronous_counts(
        self,
        client: TestClient,
        auth_headers: dict,
        home_clinic_patient: Patient,
    ) -> None:
        _enable_chain(
            clinic_id="clinic-demo-default",
            surface="*",
            primary_user_id="actor-clinician-demo",
            auto_page_enabled=True,
        )
        _seed_oncall_shift(surface=None)
        _seed_audit_row(
            surface="adverse_events",
            event="create_to_clinician",
            target_id="ae-tick-once",
            note=f"priority=high; patient={home_clinic_patient.id}",
            created_at=_dt.now(_tz.utc) - _td(minutes=30),
        )

        r = client.post(
            "/api/v1/auto-page-worker/tick-once",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["accepted"] is True
        assert data["clinic_id"] == "clinic-demo-default"
        assert data["clinics_scanned"] == 1
        assert data["breaches_found"] >= 1
        assert data["paged"] >= 1
        assert data["errors"] == 0
        assert data["audit_event_id"].startswith("auto_page_worker-")


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/auto-page-worker/audit-events",
            json={"event": "view", "note": "clinician mounted Auto-page worker view"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("auto_page_worker-")

    def test_audit_ingestion_patient_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/auto-page-worker/audit-events",
            json={"event": "view"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_audit_event_surfaces_in_audit_trail(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/auto-page-worker/audit-events",
            json={"event": "polling_tick", "note": "client poll cycle"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        audit = client.get(
            "/api/v1/audit-trail?surface=auto_page_worker",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = [it.get("action") for it in audit]
        assert "auto_page_worker.polling_tick" in actions
