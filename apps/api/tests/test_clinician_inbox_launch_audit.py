"""Tests for the Clinician Inbox / Notifications Hub launch-audit (2026-05-01).

This page sits at the top of the clinician's day. The Wearables Workbench
launch audit (#353) flagged this gap: every recent patient-facing launch
audit emits HIGH-priority clinician-visible mirror audit rows that land
in the audit table but had no workflow-friendly clinician inbox surfacing
them in priority order.

Surfaces aggregated:
* ``patient_messages.urgent_flag_to_clinician``
* ``adherence_events.side_effect_to_clinician`` /
  ``adherence_events.escalated_to_clinician_mirror``
* ``home_program_tasks.task_help_urgent_to_clinician``
* ``wearables.observation_anomaly_to_clinician``
* ``wearables_workbench.flag_escalated`` (uses ALWAYS_HIGH_ACTIONS path)

Asserts:
* role gate (clinician minimum),
* cross-clinic 404 (clinician) / 200 (admin),
* aggregation: seed 3 high-priority rows across 3 surfaces → list returns
  3 items grouped by patient,
* filters: surface / since-until / patient_id / status,
* summary returns honest counts,
* acknowledge requires note; second ack returns 200 idempotent (documented
  in PR section F),
* bulk acknowledge processes list, partial failures reported,
* export DEMO prefix when any patient is demo,
* audit ingestion at ``/api/v1/audit-trail?surface=clinician_inbox``,
* surface whitelisted in audit_trail_router KNOWN_SURFACES + qeeg-analysis.
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
    Patient,
    User,
)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def home_clinic_patient() -> Patient:
    """Patient owned by the demo clinician's clinic (clinic-demo-default)."""
    db = SessionLocal()
    try:
        patient = Patient(
            id="patient-inbox-home",
            clinician_id="actor-clinician-demo",
            first_name="Inbox",
            last_name="HomeTest",
            email="inbox-home@example.com",
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
def other_clinic_patient() -> Patient:
    """Patient owned by a clinician in a DIFFERENT clinic.

    Used as the cross-clinic isolation target.
    """
    db = SessionLocal()
    try:
        if db.query(Clinic).filter_by(id="clinic-other-inbox").first() is None:
            db.add(Clinic(id="clinic-other-inbox", name="Other Clinic Inbox"))
            db.flush()
        if db.query(User).filter_by(id="actor-clinician-other-inbox").first() is None:
            db.add(User(
                id="actor-clinician-other-inbox",
                email="other-clinician-inbox@example.com",
                display_name="Other Clinic Clinician (Inbox)",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id="clinic-other-inbox",
            ))
        patient = Patient(
            id="patient-inbox-other",
            clinician_id="actor-clinician-other-inbox",
            first_name="Inbox",
            last_name="OtherClinic",
            email="inbox-other@example.com",
            consent_signed=True,
            status="active",
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
    finally:
        db.close()


def _seed_high_priority_row(
    *,
    surface: str,
    event: str,
    target_id: str,
    actor_id: str = "actor-clinician-demo",
    role: str = "clinician",
    note: str = "priority=high; seeded",
    created_at: _dt | None = None,
) -> str:
    """Seed an audit row that the Inbox aggregates."""
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


def _seed_low_priority_row(
    *,
    surface: str = "patient_messages",
    actor_id: str = "actor-clinician-demo",
) -> str:
    """Seed a NON-high-priority audit row to prove the inbox filters them out."""
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc).isoformat()
        eid = (
            f"{surface}-view-{actor_id}-{int(_dt.now(_tz.utc).timestamp())}"
            f"-{_uuid.uuid4().hex[:6]}"
        )
        db.add(AuditEventRecord(
            event_id=eid,
            target_id="msg-irrelevant",
            target_type=surface,
            action=f"{surface}.view",
            role="clinician",
            actor_id=actor_id,
            note="patient mounted",
            created_at=ts,
        ))
        db.commit()
        return eid
    finally:
        db.close()


# ── Surface whitelist sanity ────────────────────────────────────────────────


def test_inbox_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES
    assert "clinician_inbox" in KNOWN_SURFACES


def test_inbox_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": "clinician_inbox", "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith("clinician_inbox-")


# ── Role gate ───────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_role_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-inbox/items",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_guest_is_unauthorized(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-inbox/items",
            headers=auth_headers["guest"],
        )
        assert r.status_code in (401, 403)

    def test_clinician_can_list(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-inbox/items",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]
        assert "items" in data
        assert "grouped" in data


# ── Aggregation ─────────────────────────────────────────────────────────────


class TestAggregation:
    def test_three_high_priority_rows_three_surfaces_grouped_by_patient(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        # Surface 1: Patient Messages — note has no priority=high but action
        # ends in _to_clinician, so the predicate catches it.
        _seed_high_priority_row(
            surface="patient_messages",
            event="urgent_flag_to_clinician",
            target_id="actor-clinician-demo",  # mirror rows target the recipient
            note=f"thread=msg-1; category=symptom; patient={home_clinic_patient.id}",
        )
        # Surface 2: Adherence Events — note has priority=high.
        _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-1; patient={home_clinic_patient.id}",
        )
        # Surface 3: Wearables Workbench — uses ALWAYS_HIGH_ACTIONS path.
        _seed_high_priority_row(
            surface="wearables_workbench",
            event="flag_escalated",
            target_id="flag-1",
            note=f"priority=high; patient={home_clinic_patient.id}; ae_id=ae-1",
        )

        r = client.get(
            "/api/v1/clinician-inbox/items",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 3
        # All three group under the same patient.
        groups = data["grouped"]
        # There should be exactly one patient group with 3 items.
        assert len(groups) == 1
        assert groups[0]["patient_id"] == home_clinic_patient.id
        assert groups[0]["item_count"] == 3
        assert groups[0]["unread_count"] == 3
        surfaces = {it["surface"] for it in data["items"]}
        assert surfaces == {"patient_messages", "adherence_events", "wearables_workbench"}

    def test_low_priority_rows_filtered_out(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_low_priority_row(surface="patient_messages")
        _seed_low_priority_row(surface="adherence_events")
        r = client.get(
            "/api/v1/clinician-inbox/items",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["total"] == 0


# ── Cross-clinic isolation ──────────────────────────────────────────────────


class TestCrossClinicIsolation:
    def test_clinician_cannot_see_other_clinic_rows(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        # Seed a HIGH-priority row authored by the other clinic's clinician.
        _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-other-inbox",
            actor_id="actor-clinician-other-inbox",
            note=f"priority=high; event=ev-other; patient={other_clinic_patient.id}",
        )
        r = client.get(
            "/api/v1/clinician-inbox/items",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        # Home-clinic clinician must see zero rows authored elsewhere.
        assert r.json()["total"] == 0

    def test_clinician_get_other_clinic_item_returns_404(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        eid = _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-other-inbox",
            actor_id="actor-clinician-other-inbox",
            note=f"priority=high; event=ev-other; patient={other_clinic_patient.id}",
        )
        r = client.get(
            f"/api/v1/clinician-inbox/items/{eid}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_admin_sees_all_clinics(
        self,
        client: TestClient,
        auth_headers: dict,
        other_clinic_patient: Patient,
    ) -> None:
        eid = _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-other-inbox",
            actor_id="actor-clinician-other-inbox",
            note=f"priority=high; event=ev-other; patient={other_clinic_patient.id}",
        )
        r = client.get(
            f"/api/v1/clinician-inbox/items/{eid}",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["event_id"] == eid


# ── Filters ─────────────────────────────────────────────────────────────────


class TestFilters:
    def test_surface_filter(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_high_priority_row(
            surface="patient_messages",
            event="urgent_flag_to_clinician",
            target_id="actor-clinician-demo",
            note=f"thread=msg-1; patient={home_clinic_patient.id}",
        )
        _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-1; patient={home_clinic_patient.id}",
        )
        r = client.get(
            "/api/v1/clinician-inbox/items?surface=patient_messages",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["surface"] == "patient_messages"

    def test_since_until_filter(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        old_ts = _dt.now(_tz.utc) - _td(days=30)
        _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; old; patient={home_clinic_patient.id}",
            created_at=old_ts,
        )
        _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; new; patient={home_clinic_patient.id}",
        )
        # Since 7 days ago — only the new row.
        since = (_dt.now(_tz.utc) - _td(days=7)).date().isoformat()
        r = client.get(
            f"/api/v1/clinician-inbox/items?since={since}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert "new" in items[0]["note"]

    def test_patient_id_filter(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-1; patient={home_clinic_patient.id}",
        )
        _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-x; patient=patient-other-fictional",
        )
        r = client.get(
            f"/api/v1/clinician-inbox/items?patient_id={home_clinic_patient.id}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["patient_id"] == home_clinic_patient.id

    def test_status_unread_filter(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid_a = _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-a; patient={home_clinic_patient.id}",
        )
        _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-b; patient={home_clinic_patient.id}",
        )
        # Acknowledge the first row.
        ack = client.post(
            f"/api/v1/clinician-inbox/items/{eid_a}/acknowledge",
            json={"note": "Looked at the side-effect; called patient."},
            headers=auth_headers["clinician"],
        )
        assert ack.status_code == 200, ack.text

        unread = client.get(
            "/api/v1/clinician-inbox/items?status=unread",
            headers=auth_headers["clinician"],
        )
        assert unread.status_code == 200
        unread_data = unread.json()
        assert unread_data["total"] == 1

        acknowledged = client.get(
            "/api/v1/clinician-inbox/items?status=acknowledged",
            headers=auth_headers["clinician"],
        )
        assert acknowledged.status_code == 200
        ack_data = acknowledged.json()
        assert ack_data["total"] == 1
        assert ack_data["items"][0]["is_acknowledged"] is True


# ── Summary ─────────────────────────────────────────────────────────────────


class TestSummary:
    def test_summary_counts(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        _seed_high_priority_row(
            surface="patient_messages",
            event="urgent_flag_to_clinician",
            target_id="actor-clinician-demo",
            note=f"thread=msg-1; patient={home_clinic_patient.id}",
        )
        _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-1; patient={home_clinic_patient.id}",
        )
        _seed_high_priority_row(
            surface="wearables",
            event="observation_anomaly_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; metric=hr; patient={home_clinic_patient.id}",
        )
        r = client.get(
            "/api/v1/clinician-inbox/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["high_priority_unread"] == 3
        assert s["last_24h"] == 3
        assert s["last_7d"] == 3
        assert s["by_surface"]["patient_messages"] == 1
        assert s["by_surface"]["adherence_events"] == 1
        assert s["by_surface"]["wearables"] == 1


# ── Acknowledge ─────────────────────────────────────────────────────────────


class TestAcknowledge:
    def test_acknowledge_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid = _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-1; patient={home_clinic_patient.id}",
        )
        r = client.post(
            f"/api/v1/clinician-inbox/items/{eid}/acknowledge",
            json={"note": "  "},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422

    def test_acknowledge_emits_audit_and_flips_status(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid = _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-1; patient={home_clinic_patient.id}",
        )
        r = client.post(
            f"/api/v1/clinician-inbox/items/{eid}/acknowledge",
            json={"note": "Triaged with patient via phone; advised continued monitoring."},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["is_first_ack"] is True
        assert body["ack_event_id"].startswith("clinician_inbox-item_acknowledged-")

        # The detail endpoint now reports is_acknowledged=True.
        detail = client.get(
            f"/api/v1/clinician-inbox/items/{eid}",
            headers=auth_headers["clinician"],
        )
        assert detail.status_code == 200
        assert detail.json()["is_acknowledged"] is True

        # Audit row appears under surface=clinician_inbox.
        audit = client.get(
            "/api/v1/audit-trail?surface=clinician_inbox",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "clinician_inbox.item_acknowledged" in actions

    def test_double_acknowledge_is_idempotent(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        # PR section F decision: idempotent 200 instead of 409. The second
        # ack still emits a fresh audit row so the second clinician's note
        # is regulator-visible.
        eid = _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-1; patient={home_clinic_patient.id}",
        )
        first = client.post(
            f"/api/v1/clinician-inbox/items/{eid}/acknowledge",
            json={"note": "first ack"},
            headers=auth_headers["clinician"],
        )
        assert first.status_code == 200
        assert first.json()["is_first_ack"] is True

        second = client.post(
            f"/api/v1/clinician-inbox/items/{eid}/acknowledge",
            json={"note": "second ack from different shift"},
            headers=auth_headers["clinician"],
        )
        assert second.status_code == 200
        assert second.json()["is_first_ack"] is False

    def test_acknowledge_404_on_unknown_id(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-inbox/items/no-such-event/acknowledge",
            json={"note": "n/a"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404


# ── Bulk acknowledge ────────────────────────────────────────────────────────


class TestBulkAcknowledge:
    def test_bulk_processes_list_with_partial_failures(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid_ok = _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-1; patient={home_clinic_patient.id}",
        )
        eid_unknown = "totally-fake-event-id"
        # Seed a low-priority row — the inbox refuses to ack it.
        eid_low = _seed_low_priority_row()

        r = client.post(
            "/api/v1/clinician-inbox/items/bulk-acknowledge",
            json={
                "event_ids": [eid_ok, eid_unknown, eid_low],
                "note": "Bulk acknowledged after morning huddle.",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["processed"] == 3
        assert body["succeeded"] == 1
        assert len(body["failures"]) == 2
        statuses_by_eid = {row["event_id"]: row["status"] for row in body["results"]}
        assert statuses_by_eid[eid_ok] == "ok"
        assert statuses_by_eid[eid_unknown] == "not_found"
        assert statuses_by_eid[eid_low] == "not_found"

    def test_bulk_requires_note(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        eid = _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-1; patient={home_clinic_patient.id}",
        )
        r = client.post(
            "/api/v1/clinician-inbox/items/bulk-acknowledge",
            json={"event_ids": [eid], "note": "  "},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422


# ── Export ──────────────────────────────────────────────────────────────────


class TestExport:
    def test_csv_export_demo_prefix_when_demo(
        self, client: TestClient, auth_headers: dict, home_clinic_patient: Patient
    ) -> None:
        # Stamp the patient as DEMO via notes.
        db = SessionLocal()
        try:
            p = db.query(Patient).filter_by(id=home_clinic_patient.id).first()
            assert p is not None
            p.notes = "[DEMO] launch-audit"
            db.commit()
        finally:
            db.close()

        _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-demo",
            note=f"priority=high; event=ev-1; patient={home_clinic_patient.id}",
        )
        r = client.get(
            "/api/v1/clinician-inbox/export.csv",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-clinician-inbox.csv" in cd
        assert r.headers.get("X-ClinicianInbox-Demo") == "1"
        assert "event_id" in r.text  # CSV header

    def test_csv_export_no_prefix_when_not_demo(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Re-point clinician to a non-demo clinic so the row isn't classified
        # as demo via the clinic-id heuristic.
        db = SessionLocal()
        try:
            if db.query(Clinic).filter_by(id="clinic-real-prod-inbox").first() is None:
                db.add(Clinic(id="clinic-real-prod-inbox", name="Real Prod Inbox"))
                db.flush()
            if db.query(User).filter_by(id="actor-clinician-real-inbox").first() is None:
                db.add(User(
                    id="actor-clinician-real-inbox",
                    email="real-inbox@example.com",
                    display_name="Real Inbox Clinician",
                    hashed_password="x",
                    role="clinician",
                    package_id="clinician_pro",
                    clinic_id="clinic-real-prod-inbox",
                ))
            db.add(Patient(
                id="patient-real-inbox",
                clinician_id="actor-clinician-real-inbox",
                first_name="Real",
                last_name="Patient",
                email="real-inbox-patient@example.com",
                consent_signed=True,
                status="active",
            ))
            db.commit()
        finally:
            db.close()

        _seed_high_priority_row(
            surface="adherence_events",
            event="side_effect_to_clinician",
            target_id="actor-clinician-real-inbox",
            actor_id="actor-clinician-real-inbox",
            note=f"priority=high; event=ev-real; patient=patient-real-inbox",
        )
        # Use admin so cross-clinic visibility is granted.
        r = client.get(
            "/api/v1/clinician-inbox/export.csv",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "DEMO-" not in cd
        assert r.headers.get("X-ClinicianInbox-Demo") == "0"


# ── Audit ingestion ─────────────────────────────────────────────────────────


class TestAuditIngestion:
    def test_view_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-inbox/audit-events",
            json={"event": "view", "note": "clinician mounted Inbox"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("clinician_inbox-")

    def test_audit_ingestion_patient_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-inbox/audit-events",
            json={"event": "view"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_audit_event_surfaces_in_audit_trail(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        r = client.post(
            "/api/v1/clinician-inbox/audit-events",
            json={"event": "filter_changed", "note": "surface=adherence_events"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200

        audit = client.get(
            "/api/v1/audit-trail?surface=clinician_inbox",
            headers=auth_headers["admin"],
        ).json()["items"]
        actions = {it.get("action") for it in audit}
        assert "clinician_inbox.filter_changed" in actions
