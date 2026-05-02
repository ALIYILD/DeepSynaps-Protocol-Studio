"""Tests for the Patient On-Call Visibility launch-audit (2026-05-01).

Closes the patient-side gap on the on-call escalation chain:

    Care Team Coverage #357 → Auto-Page Worker #372
        → On-Call Delivery #373 → Escalation Policy #374
            → Patient On-Call Visibility (THIS PR)

The Escalation Policy editor (#374) made dispatch order editable for
admins. Until this PR patients had ZERO visibility into who they'll
reach + how + when. This suite asserts:

* surface whitelisted in ``audit_trail_router.KNOWN_SURFACES`` + the
  qeeg-analysis ``audit-events`` ingestion;
* role gate — patient OK, clinician on patient endpoint → 404;
* PHI redaction regression — the response payload NEVER contains
  clinician_name / phone / Slack / PagerDuty / Twilio fields;
* in-hours / after-hours toggle correct based on ShiftRoster + clock;
* empty-clinic state: no policy → honest "no coverage configured"
  (urgent_path='emergency_line', has_coverage_configured=False);
* audit ingestion at ``/api/v1/audit-trail?surface=patient_oncall_visibility``.

Cross-patient access cannot happen: the patient endpoint resolves the
patient via ``actor.actor_id``, not a path param, so there is no
patient_id to forge — but we still cover the cross-role 404 case.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    Clinic,
    EscalationChain,
    Patient,
    ShiftRoster,
    User,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def demo_patient() -> Patient:
    """Seed the Patient row that ``actor-patient-demo`` resolves to."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-oncall-demo",
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


def _seed_oncall_shifts(
    *,
    clinic_id: str,
    user_id: str,
    week_start: str,
    days: list[int],
    start_time: str | None = "08:00",
    end_time: str | None = "18:00",
) -> None:
    """Seed a set of on-call ShiftRoster rows for the given week."""
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc).isoformat()
        for dow in days:
            db.add(ShiftRoster(
                id=f"shift-{_uuid.uuid4().hex[:10]}",
                clinic_id=clinic_id,
                user_id=user_id,
                week_start=week_start,
                day_of_week=dow,
                start_time=start_time,
                end_time=end_time,
                role="primary",
                is_on_call=True,
                surface=None,
                contact_channel="slack",
                contact_handle="oncall-channel",
                created_at=now,
                updated_at=now,
            ))
        db.commit()
    finally:
        db.close()


def _seed_escalation_chain(*, clinic_id: str, user_id: str) -> None:
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc).isoformat()
        db.add(EscalationChain(
            id=f"chain-{_uuid.uuid4().hex[:10]}",
            clinic_id=clinic_id,
            surface="*",
            primary_user_id=user_id,
            backup_user_id=None,
            director_user_id=None,
            auto_page_enabled=False,
            note=None,
            updated_by="actor-admin-demo",
            created_at=now,
            updated_at=now,
        ))
        db.commit()
    finally:
        db.close()


def _monday_iso(d: _dt) -> str:
    monday = d - _td(days=d.weekday())
    return monday.date().isoformat()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_patient_oncall_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "patient_oncall_visibility" in KNOWN_SURFACES


def test_patient_oncall_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "surface": "patient_oncall_visibility",
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
    assert data.get("event_id", "").startswith("patient_oncall_visibility-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_can_get_status(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-oncall/status",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Schema-level keys present.
        assert "coverage_hours" in data
        assert "in_hours_now" in data
        assert "oncall_now" in data
        assert "urgent_path" in data
        assert "has_coverage_configured" in data
        assert "is_demo" in data

    def test_clinician_on_patient_status_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.get(
            "/api/v1/patient-oncall/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text

    def test_admin_on_patient_status_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.get(
            "/api/v1/patient-oncall/status",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 404, r.text

    def test_guest_denied(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.get(
            "/api/v1/patient-oncall/status",
            headers=auth_headers["guest"],
        )
        # Guest is not a patient → 404 (the patient-scope URL existence
        # is invisible to non-patients). Some auth configs may surface
        # 401/403 for guest tokens; we only assert it is NOT a 200 leak.
        assert r.status_code != 200

    def test_clinician_on_patient_audit_post_returns_403(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.post(
            "/api/v1/patient-oncall/audit-events",
            json={"event": "view"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403, r.text


# ── PHI redaction regression ────────────────────────────────────────────────


_BANNED_KEYS = {
    "clinician_name",
    "primary_user_name",
    "primary_user_id",
    "backup_user_name",
    "director_user_name",
    "user_name",
    "display_name",
    "phone",
    "slack_user_id",
    "slack_handle",
    "pagerduty_user_id",
    "pagerduty_routing_key",
    "twilio_phone",
    "contact_handle",
    "contact_channel",
}


def _walk_keys(obj) -> list[str]:
    keys: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            keys.append(str(k))
            keys.extend(_walk_keys(v))
    elif isinstance(obj, list):
        for v in obj:
            keys.extend(_walk_keys(v))
    return keys


class TestPHIRedaction:
    def test_status_payload_redacts_phi_when_no_coverage(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-oncall/status",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        keys = set(_walk_keys(r.json()))
        leaked = keys & _BANNED_KEYS
        assert not leaked, f"PHI leaked into payload: {leaked}"

    def test_status_payload_redacts_phi_with_coverage(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Seed an on-call shift with explicit contact_handle so a buggy
        # implementation that accidentally surfaces it would leak. The
        # response must still NOT contain it.
        ws = _monday_iso(_dt.now(_tz.utc))
        _seed_oncall_shifts(
            clinic_id="clinic-demo-default",
            user_id="actor-clinician-demo",
            week_start=ws,
            days=[0, 1, 2, 3, 4],
        )
        r = client.get(
            "/api/v1/patient-oncall/status",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        keys = set(_walk_keys(body))
        leaked = keys & _BANNED_KEYS
        assert not leaked, f"PHI leaked: {leaked}"
        # Defensive — the contact_handle string itself must not appear
        # anywhere in the serialised body.
        assert "oncall-channel" not in r.text


# ── In-hours / after-hours toggle ───────────────────────────────────────────


class TestInHoursToggle:
    def test_in_hours_now_when_current_time_inside_shift_window(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Seed a shift covering 00:00 to 23:59 today so the "now" check
        # is deterministic regardless of CI clock.
        now = _dt.now(_tz.utc)
        ws = _monday_iso(now)
        _seed_oncall_shifts(
            clinic_id="clinic-demo-default",
            user_id="actor-clinician-demo",
            week_start=ws,
            days=[now.weekday()],
            start_time="00:00",
            end_time="23:59",
        )
        r = client.get(
            "/api/v1/patient-oncall/status",
            headers=auth_headers["patient"],
        )
        data = r.json()
        assert r.status_code == 200, r.text
        assert data["has_coverage_configured"] is True
        assert data["in_hours_now"] is True
        assert data["oncall_now"] is True
        assert data["urgent_path"] == "patient-portal-message"
        # coverage_hours must be a non-empty string (don't pin exact
        # wording — it is a UI summary that may evolve).
        assert isinstance(data["coverage_hours"], str)
        assert data["coverage_hours"]

    def test_after_hours_when_current_weekday_not_in_roster(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Seed a shift only on a weekday that is NOT today. That gives
        # a clinic with coverage configured but currently OUT of hours.
        now = _dt.now(_tz.utc)
        ws = _monday_iso(now)
        not_today = (now.weekday() + 3) % 7
        _seed_oncall_shifts(
            clinic_id="clinic-demo-default",
            user_id="actor-clinician-demo",
            week_start=ws,
            days=[not_today],
            start_time="08:00",
            end_time="18:00",
        )
        r = client.get(
            "/api/v1/patient-oncall/status",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["has_coverage_configured"] is True
        assert data["in_hours_now"] is False
        assert data["oncall_now"] is False
        # Patient-portal-message is still the preferred path because
        # the clinic does have coverage configured (just not right now).
        assert data["urgent_path"] == "patient-portal-message"


# ── Empty-clinic honest state ───────────────────────────────────────────────


class TestEmptyClinicState:
    def test_no_policy_returns_honest_no_coverage(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-oncall/status",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["has_coverage_configured"] is False
        assert data["in_hours_now"] is False
        assert data["oncall_now"] is False
        assert data["coverage_hours"] is None
        # Honest fallback: patient is told to call the emergency line.
        assert data["urgent_path"] == "emergency_line"

    def test_chain_only_still_marks_coverage_configured(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # An admin can configure an EscalationChain (primary/backup/
        # director) without writing a roster row yet — that still
        # counts as "coverage configured" so the patient gets the
        # patient-portal urgent path. coverage_hours stays None
        # because we don't have a roster to summarise from.
        _seed_escalation_chain(
            clinic_id="clinic-demo-default",
            user_id="actor-clinician-demo",
        )
        r = client.get(
            "/api/v1/patient-oncall/status",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["has_coverage_configured"] is True
        assert data["coverage_hours"] is None
        assert data["urgent_path"] == "patient-portal-message"


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_persists(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.post(
            "/api/v1/patient-oncall/audit-events",
            json={"event": "view", "note": "page mount"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("patient_oncall_visibility-")

        # Audit row landed in the umbrella audit_events table — read it
        # back via the audit-trail surface filter to prove the wiring.
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.event_id == body["event_id"])
                .first()
            )
            assert row is not None
            assert row.target_type == "patient_oncall_visibility"
            assert row.action == "patient_oncall_visibility.view"
            # Demo patient → DEMO marker in note
            assert "DEMO" in (row.note or "")
        finally:
            db.close()

    def test_audit_trail_filter_returns_patient_oncall_rows(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        # Drop a row first.
        client.post(
            "/api/v1/patient-oncall/audit-events",
            json={"event": "urgent_message_started"},
            headers=auth_headers["patient"],
        )
        # Audit-trail listing is admin/clinician-scoped — patients can't
        # read the regulatory feed. Use the admin token.
        r = client.get(
            "/api/v1/audit-trail",
            params={"surface": "patient_oncall_visibility", "limit": 50},
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        # At least one row, all matching the surface filter.
        assert len(items) >= 1
        for it in items:
            assert it.get("surface") == "patient_oncall_visibility"

    def test_oncall_status_get_emits_oncall_status_seen_audit(
        self,
        client: TestClient,
        auth_headers: dict,
        demo_patient: Patient,
    ) -> None:
        r = client.get(
            "/api/v1/patient-oncall/status",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        # Confirm an audit row with action=oncall_status_seen landed.
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.target_type == "patient_oncall_visibility",
                    AuditEventRecord.action == "patient_oncall_visibility.oncall_status_seen",
                )
                .order_by(AuditEventRecord.id.desc())
                .first()
            )
            assert row is not None
            assert row.actor_id == "actor-patient-demo"
            assert row.role == "patient"
        finally:
            db.close()
