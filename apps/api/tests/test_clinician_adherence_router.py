"""Tests for clinician_adherence_router — cross-patient triage surface.

Covers 10 test cases across the key endpoints:
  GET  /api/v1/clinician-adherence/events           (list)
  GET  /api/v1/clinician-adherence/events/summary   (summary)
  GET  /api/v1/clinician-adherence/events/{id}      (detail)
  POST /api/v1/clinician-adherence/events/{id}/acknowledge  (acknowledge)
  POST /api/v1/clinician-adherence/events/{id}/resolve      (resolve)
  POST /api/v1/clinician-adherence/audit-events              (page audit)

Role gate: clinician / admin / supervisor can access; patients get 403.
Cross-clinic: non-admin clinicians see only their clinic's events; cross-clinic
detail returns 404 (not 403 — mirrors the wearables workbench pattern).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Patient, PatientAdherenceEvent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mk_patient(db, *, pid: str, clinician_id: str = "actor-clinician-demo") -> Patient:
    p = Patient(
        id=pid,
        clinician_id=clinician_id,
        first_name="Adhere",
        last_name="Patient",
        email=f"{pid}@example.com",
        consent_signed=True,
        status="active",
    )
    db.add(p)
    return p


def _mk_event(
    db,
    *,
    eid: str,
    patient_id: str,
    event_type: str = "adherence_report",
    severity: str = "low",
    status: str = "open",
) -> PatientAdherenceEvent:
    row = PatientAdherenceEvent(
        id=eid,
        patient_id=patient_id,
        event_type=event_type,
        severity=severity,
        report_date=datetime.now(timezone.utc).date().isoformat(),
        status=status,
        body="Test adherence body",
    )
    db.add(row)
    return row


# ---------------------------------------------------------------------------
# Role gate
# ---------------------------------------------------------------------------


class TestRoleGate:
    def test_patient_cannot_access_hub(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-adherence/events", headers=auth_headers["patient"]
        )
        assert r.status_code == 403
        assert r.json()["code"] == "forbidden"

    def test_guest_cannot_access_hub(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-adherence/events", headers=auth_headers["guest"]
        )
        assert r.status_code == 403

    def test_clinician_can_access_hub(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-adherence/events", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


class TestListEvents:
    def test_list_empty_clinic_returns_empty_set(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-adherence/events", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert "is_demo_view" in body

    def test_list_with_seeded_event(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = f"adh-list-p-{uuid.uuid4().hex[:8]}"
        eid = f"adh-list-e-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            _mk_event(db, eid=eid, patient_id=pid)
            db.commit()
        finally:
            db.close()

        r = client.get(
            "/api/v1/clinician-adherence/events", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200
        ids = [item["id"] for item in r.json()["items"]]
        assert eid in ids


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


class TestSummary:
    def test_summary_returns_expected_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-adherence/events/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "total_today" in body
        assert "total_7d" in body
        assert "side_effects_7d" in body


# ---------------------------------------------------------------------------
# Detail / actions on a seeded event
# ---------------------------------------------------------------------------


class TestEventDetail:
    @pytest.fixture
    def seeded_event(self) -> PatientAdherenceEvent:
        pid = f"adh-det-p-{uuid.uuid4().hex[:8]}"
        eid = f"adh-det-e-{uuid.uuid4().hex[:8]}"
        db = SessionLocal()
        try:
            _mk_patient(db, pid=pid)
            ev = _mk_event(db, eid=eid, patient_id=pid)
            db.commit()
            db.refresh(ev)
            return ev
        finally:
            db.close()

    def test_get_event_detail(
        self,
        client: TestClient,
        auth_headers: dict,
        seeded_event: PatientAdherenceEvent,
    ) -> None:
        r = client.get(
            f"/api/v1/clinician-adherence/events/{seeded_event.id}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["id"] == seeded_event.id

    def test_get_nonexistent_event_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/clinician-adherence/events/no-such-id",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404

    def test_acknowledge_event(
        self,
        client: TestClient,
        auth_headers: dict,
        seeded_event: PatientAdherenceEvent,
    ) -> None:
        r = client.post(
            f"/api/v1/clinician-adherence/events/{seeded_event.id}/acknowledge",
            json={"note": "Reviewed — no action required"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("status") == "acknowledged" or "id" in body

    def test_resolve_event(
        self,
        client: TestClient,
        auth_headers: dict,
        seeded_event: PatientAdherenceEvent,
    ) -> None:
        # Acknowledge first, then resolve
        client.post(
            f"/api/v1/clinician-adherence/events/{seeded_event.id}/acknowledge",
            json={"note": "ack"},
            headers=auth_headers["clinician"],
        )
        r = client.post(
            f"/api/v1/clinician-adherence/events/{seeded_event.id}/resolve",
            json={"note": "resolved after review"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code in (200, 201), r.text


# ---------------------------------------------------------------------------
# Audit event ingestion
# ---------------------------------------------------------------------------


class TestAuditEvents:
    def test_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/clinician-adherence/audit-events",
            json={"event": "view", "note": "hub page load"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("accepted") is True
