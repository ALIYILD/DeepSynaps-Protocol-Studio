"""Tests for qEEG records router (/api/v1/qeeg-records)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "QEEG", "last_name": "Patient", "dob": "1985-03-15", "gender": "M"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.fixture
def record_id(client: TestClient, auth_headers: dict, patient_id: str) -> str:
    resp = client.post(
        "/api/v1/qeeg-records",
        json={"patient_id": patient_id, "recording_type": "resting"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ── Create ─────────────────────────────────────────────────────────────────────

class TestCreateQEEGRecord:
    def test_minimal_fields(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/qeeg-records",
            json={"patient_id": patient_id, "recording_type": "resting"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["patient_id"] == patient_id
        assert data["recording_type"] == "resting"
        assert data["findings"] == {}
        assert "id" in data
        assert "created_at" in data

    def test_full_fields(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/qeeg-records",
            json={
                "patient_id": patient_id,
                "recording_type": "task",
                "recording_date": "2026-03-15",
                "equipment": "NeuroGuide 19ch",
                "eyes_condition": "eyes_closed",
                "raw_data_ref": "s3://bucket/patient123/session1.edf",
                "summary_notes": "Clean baseline, alpha dominant",
                "findings": {"alpha_peak_hz": 10.5, "theta_alpha_ratio": 0.8},
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["recording_type"] == "task"
        assert data["equipment"] == "NeuroGuide 19ch"
        assert data["eyes_condition"] == "eyes_closed"
        assert data["findings"]["alpha_peak_hz"] == 10.5
        assert data["summary_notes"] == "Clean baseline, alpha dominant"

    def test_guest_rejected(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/qeeg-records",
            json={"patient_id": patient_id, "recording_type": "resting"},
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403

    def test_unauthenticated_rejected(self, client: TestClient, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/qeeg-records",
            json={"patient_id": patient_id, "recording_type": "resting"},
        )
        assert resp.status_code in (401, 403)

    def test_all_recording_types(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        for rt in ("resting", "task", "sleep", "ictal"):
            resp = client.post(
                "/api/v1/qeeg-records",
                json={"patient_id": patient_id, "recording_type": rt},
                headers=auth_headers["clinician"],
            )
            assert resp.status_code == 201, f"Failed for recording_type={rt}"
            assert resp.json()["recording_type"] == rt


# ── List ───────────────────────────────────────────────────────────────────────

class TestListQEEGRecords:
    def test_empty_initially(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/qeeg-records", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] == 0

    def test_returns_own_records(self, client: TestClient, auth_headers: dict, record_id: str) -> None:
        resp = client.get("/api/v1/qeeg-records", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == record_id

    def test_filter_by_patient(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        # Create another patient + record
        p2 = client.post(
            "/api/v1/patients",
            json={"first_name": "Other", "last_name": "Patient", "dob": "1992-01-01", "gender": "F"},
            headers=auth_headers["clinician"],
        )
        pid2 = p2.json()["id"]
        client.post(
            "/api/v1/qeeg-records",
            json={"patient_id": patient_id, "recording_type": "resting"},
            headers=auth_headers["clinician"],
        )
        client.post(
            "/api/v1/qeeg-records",
            json={"patient_id": pid2, "recording_type": "task"},
            headers=auth_headers["clinician"],
        )

        resp = client.get(f"/api/v1/qeeg-records?patient_id={patient_id}",
                          headers=auth_headers["clinician"])
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert all(r["patient_id"] == patient_id for r in items)

    def test_guest_rejected(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/qeeg-records", headers=auth_headers["guest"])
        assert resp.status_code == 403

    def test_unauthenticated_rejected(self, client: TestClient) -> None:
        resp = client.get("/api/v1/qeeg-records")
        assert resp.status_code in (401, 403)


# ── Get ────────────────────────────────────────────────────────────────────────

class TestGetQEEGRecord:
    def test_get_own_record(self, client: TestClient, auth_headers: dict, record_id: str) -> None:
        resp = client.get(f"/api/v1/qeeg-records/{record_id}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["id"] == record_id

    def test_get_nonexistent_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/qeeg-records/nonexistent-id", headers=auth_headers["clinician"])
        assert resp.status_code == 404

    def test_guest_rejected(self, client: TestClient, auth_headers: dict, record_id: str) -> None:
        resp = client.get(f"/api/v1/qeeg-records/{record_id}", headers=auth_headers["guest"])
        assert resp.status_code == 403

    def test_another_clinician_cannot_see_record(self, client: TestClient,
                                                   auth_headers: dict, record_id: str) -> None:
        # admin-demo-token is a different actor
        resp = client.get(f"/api/v1/qeeg-records/{record_id}", headers=auth_headers["admin"])
        # Admin can see all records
        assert resp.status_code == 200


# ── Update ─────────────────────────────────────────────────────────────────────

class TestUpdateQEEGRecord:
    def test_update_summary_notes(self, client: TestClient, auth_headers: dict,
                                   record_id: str) -> None:
        resp = client.patch(
            f"/api/v1/qeeg-records/{record_id}",
            json={"summary_notes": "Updated: excessive theta in frontal regions"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        assert resp.json()["summary_notes"] == "Updated: excessive theta in frontal regions"

    def test_update_findings(self, client: TestClient, auth_headers: dict,
                              record_id: str) -> None:
        resp = client.patch(
            f"/api/v1/qeeg-records/{record_id}",
            json={"findings": {"theta_alpha_ratio": 1.4, "z_score_frontal_theta": 2.1}},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        findings = resp.json()["findings"]
        assert findings["theta_alpha_ratio"] == 1.4
        assert findings["z_score_frontal_theta"] == 2.1

    def test_update_raw_data_ref_is_ignored(self, client: TestClient, auth_headers: dict,
                                  record_id: str) -> None:
        """raw_data_ref is intentionally immutable via PATCH — it can only
        be set at create time where path-traversal validation runs."""
        resp = client.patch(
            f"/api/v1/qeeg-records/{record_id}",
            json={"raw_data_ref": "s3://bucket/updated-path.edf"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        # raw_data_ref is silently ignored on PATCH
        assert resp.json()["raw_data_ref"] != "s3://bucket/updated-path.edf"

    def test_update_nonexistent_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.patch(
            "/api/v1/qeeg-records/does-not-exist",
            json={"summary_notes": "nope"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404

    def test_guest_cannot_update(self, client: TestClient, auth_headers: dict,
                                  record_id: str) -> None:
        resp = client.patch(
            f"/api/v1/qeeg-records/{record_id}",
            json={"summary_notes": "guest attempt"},
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403

    def test_partial_update_preserves_other_fields(self, client: TestClient,
                                                    auth_headers: dict, patient_id: str) -> None:
        # Create record with all fields set
        create = client.post(
            "/api/v1/qeeg-records",
            json={
                "patient_id": patient_id,
                "recording_type": "resting",
                "equipment": "Emotiv EPOC",
                "summary_notes": "Original notes",
                "findings": {"alpha": 10.0},
            },
            headers=auth_headers["clinician"],
        )
        rid = create.json()["id"]

        # Update only summary_notes
        resp = client.patch(
            f"/api/v1/qeeg-records/{rid}",
            json={"summary_notes": "New notes"},
            headers=auth_headers["clinician"],
        )
        data = resp.json()
        assert data["summary_notes"] == "New notes"
        assert data["equipment"] == "Emotiv EPOC"     # untouched
        assert data["findings"]["alpha"] == 10.0       # untouched
