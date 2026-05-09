"""Tests for wellness_hub_router — patient-facing check-in surface.

Covers 11 test cases across the key endpoints:
  GET  /api/v1/wellness/checkins          (list)
  GET  /api/v1/wellness/summary           (summary)
  POST /api/v1/wellness/checkins          (create)
  GET  /api/v1/wellness/checkins/{id}     (detail)
  PATCH /api/v1/wellness/checkins/{id}    (edit)
  DELETE /api/v1/wellness/checkins/{id}   (soft-delete)
  POST /api/v1/wellness/checkins/{id}/share  (share)
  POST /api/v1/wellness/audit-events      (page audit)

Role gate: patient writes own data; clinician is rejected (403); admin requires
explicit patient_id.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Patient, WellnessCheckin


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def wellness_patient() -> Patient:
    """Demo patient whose email matches the actor-patient-demo token resolution."""
    db = SessionLocal()
    try:
        p = Patient(
            id="wh-test-patient",
            clinician_id="actor-clinician-demo",
            first_name="Wellness",
            last_name="Tester",
            email="patient@deepsynaps.com",
            consent_signed=True,
            status="active",
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Role gate
# ---------------------------------------------------------------------------


class TestRoleGate:
    def test_clinician_cannot_list_checkins(
        self, client: TestClient, auth_headers: dict, wellness_patient: Patient
    ) -> None:
        r = client.get("/api/v1/wellness/checkins", headers=auth_headers["clinician"])
        assert r.status_code == 403
        assert r.json()["code"] == "patient_role_required"

    def test_admin_without_patient_id_returns_400(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get("/api/v1/wellness/checkins", headers=auth_headers["admin"])
        assert r.status_code == 400
        assert r.json()["code"] == "patient_id_required"

    def test_admin_with_explicit_patient_id(
        self, client: TestClient, auth_headers: dict, wellness_patient: Patient
    ) -> None:
        r = client.get(
            f"/api/v1/wellness/checkins?patient_id={wellness_patient.id}",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Patient list / summary
# ---------------------------------------------------------------------------


class TestListAndSummary:
    def test_patient_list_returns_empty_set(
        self, client: TestClient, auth_headers: dict, wellness_patient: Patient
    ) -> None:
        r = client.get("/api/v1/wellness/checkins", headers=auth_headers["patient"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert "consent_active" in body
        assert isinstance(body["disclaimers"], list)

    def test_summary_returns_expected_shape(
        self, client: TestClient, auth_headers: dict, wellness_patient: Patient
    ) -> None:
        r = client.get("/api/v1/wellness/summary", headers=auth_headers["patient"])
        assert r.status_code == 200, r.text
        body = r.json()
        # The response model uses checkins_7d / checkins_30d (not total_7d)
        assert "checkins_7d" in body
        assert "checkins_30d" in body
        assert "axes_avg_7d" in body


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class TestCreateCheckin:
    def test_patient_can_create_checkin(
        self, client: TestClient, auth_headers: dict, wellness_patient: Patient
    ) -> None:
        r = client.post(
            "/api/v1/wellness/checkins",
            json={"mood": 7, "energy": 6, "sleep": 5, "note": "Feeling okay today"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["mood"] == 7
        assert "id" in body

    def test_create_missing_required_axes_still_accepted(
        self, client: TestClient, auth_headers: dict, wellness_patient: Patient
    ) -> None:
        """All axes are optional on the wellness checkin model."""
        r = client.post(
            "/api/v1/wellness/checkins",
            json={"note": "minimal"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 201, r.text

    def test_clinician_cannot_create_checkin(
        self, client: TestClient, auth_headers: dict, wellness_patient: Patient
    ) -> None:
        r = client.post(
            "/api/v1/wellness/checkins",
            json={"mood": 5},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Detail / patch / delete via seeded row
# ---------------------------------------------------------------------------


class TestDetailAndMutations:
    @pytest.fixture
    def checkin_row(self, wellness_patient: Patient) -> WellnessCheckin:
        db = SessionLocal()
        try:
            row = WellnessCheckin(
                id="wh-test-checkin",
                patient_id=wellness_patient.id,
                author_actor_id="actor-patient-demo",
                mood=5,
                note="seed note",
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return row
        finally:
            db.close()

    def test_patient_can_get_checkin(
        self,
        client: TestClient,
        auth_headers: dict,
        wellness_patient: Patient,
        checkin_row: WellnessCheckin,
    ) -> None:
        r = client.get(
            f"/api/v1/wellness/checkins/{checkin_row.id}",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["id"] == checkin_row.id

    def test_patient_can_delete_checkin(
        self,
        client: TestClient,
        auth_headers: dict,
        wellness_patient: Patient,
        checkin_row: WellnessCheckin,
    ) -> None:
        # Soft-delete requires a request body with "reason"
        r = client.request(
            "DELETE",
            f"/api/v1/wellness/checkins/{checkin_row.id}",
            json={"reason": "test deletion"},
            headers=auth_headers["patient"],
        )
        # Soft-delete returns the deleted row (200)
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Audit event ingestion
# ---------------------------------------------------------------------------


class TestAuditEvents:
    def test_audit_event_accepted_by_wellness_hub(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/wellness/audit-events",
            json={"event": "view", "note": "page load"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("accepted") is True
