"""Tests for adverse events router."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "AE", "last_name": "Patient", "dob": "1990-01-01", "gender": "F"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    return resp.json()["id"]


class TestReportAdverseEvent:
    def test_report_minimal(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "headache", "severity": "mild"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["event_type"] == "headache"
        assert data["severity"] == "mild"
        assert data["patient_id"] == patient_id
        assert "id" in data
        assert "reported_at" in data

    def test_report_full_fields(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/adverse-events",
            json={
                "patient_id": patient_id,
                "event_type": "seizure",
                "severity": "serious",
                "description": "Brief tonic-clonic episode",
                "onset_timing": "during",
                "resolution": "resolved",
                "action_taken": "session_stopped",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["severity"] == "serious"
        assert data["description"] == "Brief tonic-clonic episode"
        assert data["action_taken"] == "session_stopped"

    def test_invalid_severity_rejected(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "headache", "severity": "catastrophic"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422

    def test_guest_cannot_report(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "headache", "severity": "mild"},
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403

    def test_unauthenticated_rejected(self, client: TestClient, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "headache", "severity": "mild"},
        )
        assert resp.status_code in (401, 403)

    def test_severity_normalized_lowercase(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "dizziness", "severity": "MODERATE"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        assert resp.json()["severity"] == "moderate"


class TestListAdverseEvents:
    def _create(self, client: TestClient, auth_headers: dict, patient_id: str, severity: str = "mild") -> dict:
        return client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "headache", "severity": severity},
            headers=auth_headers["clinician"],
        ).json()

    def test_list_returns_own_events(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        self._create(client, auth_headers, patient_id)
        self._create(client, auth_headers, patient_id)
        resp = client.get("/api/v1/adverse-events", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

    def test_filter_by_patient_id(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        # Create second patient
        resp2 = client.post(
            "/api/v1/patients",
            json={"first_name": "Other", "last_name": "Patient", "dob": "1985-06-15", "gender": "M"},
            headers=auth_headers["clinician"],
        )
        patient2_id = resp2.json()["id"]
        self._create(client, auth_headers, patient_id)
        self._create(client, auth_headers, patient2_id)

        resp = client.get(f"/api/v1/adverse-events?patient_id={patient_id}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["patient_id"] == patient_id

    def test_filter_by_severity(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        self._create(client, auth_headers, patient_id, "mild")
        self._create(client, auth_headers, patient_id, "serious")
        resp = client.get("/api/v1/adverse-events?severity=serious", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["total"] == 1
        assert resp.json()["items"][0]["severity"] == "serious"

    def test_empty_list(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/adverse-events", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestGetAdverseEvent:
    def test_get_own_event(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        created = client.post(
            "/api/v1/adverse-events",
            json={"patient_id": patient_id, "event_type": "fatigue", "severity": "mild"},
            headers=auth_headers["clinician"],
        ).json()
        resp = client.get(f"/api/v1/adverse-events/{created['id']}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["id"] == created["id"]

    def test_get_nonexistent_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/adverse-events/does-not-exist", headers=auth_headers["clinician"])
        assert resp.status_code == 404
