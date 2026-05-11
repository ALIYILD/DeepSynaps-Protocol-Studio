"""Regression tests: P1 cross-clinic IDOR gates on reminders router.

Covered routes:
  POST /api/v1/reminders/send
    fix: apps/api/app/routers/reminders_router.py:311 — _gate_patient_access called
         after require_minimum_role.
  GET  /api/v1/reminders/adherence/{patient_id}
    fix: apps/api/app/routers/reminders_router.py:352 — _gate_patient_access called
         after require_minimum_role, replacing silent empty-200 enumeration vector.

Two demo clinicians used as "different clinics":
  - clinician-demo-token  → actor-clinician-demo  (clinic-demo-default, owns the patient)
  - resident-demo-token   → actor-resident-demo   (no clinic, cross-clinic attacker)

The patient's clinic_id resolves via users.clinic_id JOIN in
resolve_patient_clinic_id; actor-clinician-demo is seeded with
clinic_id="clinic-demo-default" by the conftest isolated_database fixture,
while actor-resident-demo has no User row → clinic_id=None → 403 from
require_patient_owner.
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
            "last_name": "TestReminders",
            "dob": "1985-06-15",
            "gender": "M",
            "primary_condition": "MDD",
            "status": "active",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


class TestRemindersSendIDOR:
    """POST /api/v1/reminders/send — cross-clinic patient_id must return 403."""

    def test_send_same_clinic_succeeds(self, client: TestClient) -> None:
        """Clinician A can send a reminder to their own patient → 201."""
        patient_id = _create_patient(client, _CLINICIAN_A)
        resp = client.post(
            "/api/v1/reminders/send",
            json={
                "patient_id": patient_id,
                "channel": "email",
                "message_body": "Your appointment is tomorrow.",
            },
            headers=_CLINICIAN_A,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["patient_id"] == patient_id

    def test_send_cross_clinic_returns_403(self, client: TestClient) -> None:
        """Clinician B must receive 403 when targeting Clinician A's patient.

        Pre-fix behaviour was 201 — a reminder was silently enqueued for a
        patient the attacker does not own.
        """
        patient_id = _create_patient(client, _CLINICIAN_A)
        resp = client.post(
            "/api/v1/reminders/send",
            json={
                "patient_id": patient_id,
                "channel": "email",
                "message_body": "Unauthorized reminder attempt.",
            },
            headers=_CLINICIAN_B,
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404 for cross-clinic send, got {resp.status_code}: {resp.text}"
        )

    def test_send_nonexistent_patient_returns_404(self, client: TestClient) -> None:
        """Gate does not confirm existence of unknown patient_id — returns 404."""
        resp = client.post(
            "/api/v1/reminders/send",
            json={
                "patient_id": "00000000-0000-0000-0000-000000000000",
                "channel": "email",
                "message_body": "Probe for non-existent patient.",
            },
            headers=_CLINICIAN_A,
        )
        assert resp.status_code == 404, resp.text


class TestRemindersAdherenceIDOR:
    """GET /api/v1/reminders/adherence/{patient_id} — cross-clinic must return 403.

    Pre-fix: this endpoint returned an empty AdherenceScore for cross-clinic
    UUIDs, confirming the patient existed in the system (enumeration vector).
    """

    def test_adherence_same_clinic_succeeds(self, client: TestClient) -> None:
        """Clinician A can fetch adherence for their own patient → 200."""
        patient_id = _create_patient(client, _CLINICIAN_A)
        resp = client.get(
            f"/api/v1/reminders/adherence/{patient_id}",
            headers=_CLINICIAN_A,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["patient_id"] == patient_id

    def test_adherence_cross_clinic_returns_403(self, client: TestClient) -> None:
        """Clinician B must receive 403 for Clinician A's patient — not empty 200."""
        patient_id = _create_patient(client, _CLINICIAN_A)
        resp = client.get(
            f"/api/v1/reminders/adherence/{patient_id}",
            headers=_CLINICIAN_B,
        )
        assert resp.status_code in (403, 404), (
            f"Expected 403/404 for cross-clinic adherence, got {resp.status_code}: {resp.text}"
        )

    def test_adherence_nonexistent_patient_returns_404(self, client: TestClient) -> None:
        """Non-existent patient must return 404 (not an empty adherence record)."""
        resp = client.get(
            "/api/v1/reminders/adherence/00000000-0000-0000-0000-000000000001",
            headers=_CLINICIAN_A,
        )
        assert resp.status_code == 404, resp.text
