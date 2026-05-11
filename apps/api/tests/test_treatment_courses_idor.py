"""Regression tests: P1 cross-clinic IDOR gates on treatment-courses router.

Covered routes:
  POST /api/v1/treatment-courses
    fix: apps/api/app/routers/treatment_courses_router.py:285 —
         _gate_patient_access(actor, body.patient_id, db) called after
         require_minimum_role.
  GET  /api/v1/treatment-courses?patient_id=...
    fix: apps/api/app/routers/treatment_courses_router.py:397 —
         _gate_patient_access called when patient_id filter is supplied,
         replacing silent empty-200 enumeration vector.

Two demo clinicians used as "different clinics":
  - clinician-demo-token  → actor-clinician-demo  (clinic-demo-default, owns the patient)
  - resident-demo-token   → actor-resident-demo   (no clinic, cross-clinic attacker)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

_CLINICIAN_A = {"Authorization": "Bearer clinician-demo-token"}
_CLINICIAN_B = {"Authorization": "Bearer resident-demo-token"}  # different clinic


def _create_patient(client: TestClient, headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={
            "first_name": "Idor",
            "last_name": "TestCourse",
            "dob": "1980-03-10",
            "gender": "F",
            "primary_condition": "MDD",
            "status": "active",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


class TestTreatmentCourseCreateIDOR:
    """POST /api/v1/treatment-courses — cross-clinic patient_id must return 403."""

    def test_create_cross_clinic_returns_403(self, client: TestClient) -> None:
        """Clinician B must receive 403 when attempting to create a course for
        Clinician A's patient.

        Pre-fix behaviour: the course was silently created and attributed to
        Clinician B even though the patient belongs to Clinician A's clinic.
        """
        patient_id = _create_patient(client, _CLINICIAN_A)
        resp = client.post(
            "/api/v1/treatment-courses",
            json={
                "patient_id": patient_id,
                "protocol_id": "P001",
            },
            headers=_CLINICIAN_B,
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404 for cross-clinic course create, got {resp.status_code}: {resp.text}"
        )

    def test_create_nonexistent_patient_returns_404(self, client: TestClient) -> None:
        """Gate returns 404 for a patient_id that does not exist."""
        resp = client.post(
            "/api/v1/treatment-courses",
            json={
                "patient_id": "00000000-0000-0000-0000-000000000099",
                "protocol_id": "P001",
            },
            headers=_CLINICIAN_A,
        )
        assert resp.status_code == 404, resp.text


class TestTreatmentCourseListIDOR:
    """GET /api/v1/treatment-courses?patient_id=... — cross-clinic filter must 403.

    Pre-fix: the endpoint silently returned [] for cross-clinic patient_ids,
    confirming that the patient_id exists without returning data (enumeration).
    """

    def test_list_with_own_patient_id_succeeds(self, client: TestClient) -> None:
        """Clinician A can filter their own patient_id and get a 200 list."""
        patient_id = _create_patient(client, _CLINICIAN_A)
        resp = client.get(
            f"/api/v1/treatment-courses?patient_id={patient_id}",
            headers=_CLINICIAN_A,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "items" in data or "total" in data

    def test_list_cross_clinic_patient_id_returns_403(self, client: TestClient) -> None:
        """Clinician B filtering by Clinician A's patient_id must receive 403,
        not a silent empty list."""
        patient_id = _create_patient(client, _CLINICIAN_A)
        resp = client.get(
            f"/api/v1/treatment-courses?patient_id={patient_id}",
            headers=_CLINICIAN_B,
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404 for cross-clinic patient filter, got {resp.status_code}: {resp.text}"
        )

    def test_list_without_patient_id_filter_succeeds(self, client: TestClient) -> None:
        """Unfiltered list still works for both clinicians (200 with their own data)."""
        resp_a = client.get("/api/v1/treatment-courses", headers=_CLINICIAN_A)
        assert resp_a.status_code == 200, resp_a.text

        resp_b = client.get("/api/v1/treatment-courses", headers=_CLINICIAN_B)
        assert resp_b.status_code == 200, resp_b.text
