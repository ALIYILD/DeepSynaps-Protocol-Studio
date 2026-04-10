"""Tests for consent records router."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "Consent", "last_name": "Patient", "dob": "1988-03-12", "gender": "F"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    return resp.json()["id"]


class TestCreateConsentRecord:
    def test_create_unsigned(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/consent-records",
            json={"patient_id": patient_id, "consent_type": "general", "signed": False},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["consent_type"] == "general"
        assert data["signed"] is False
        assert data["signed_at"] is None
        assert "id" in data

    def test_create_pre_signed(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/consent-records",
            json={"patient_id": patient_id, "consent_type": "off_label", "signed": True},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["signed"] is True
        # signed_at auto-stamped
        assert data["signed_at"] is not None

    def test_create_with_modality(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/consent-records",
            json={
                "patient_id": patient_id,
                "consent_type": "general",
                "modality_slug": "tms",
                "notes": "Patient reviewed TMS risks",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["modality_slug"] == "tms"
        assert data["notes"] == "Patient reviewed TMS risks"

    def test_guest_cannot_create(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/consent-records",
            json={"patient_id": patient_id, "consent_type": "general"},
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403


class TestListConsentRecords:
    def _create(self, client: TestClient, auth_headers: dict, patient_id: str, consent_type: str = "general") -> dict:
        return client.post(
            "/api/v1/consent-records",
            json={"patient_id": patient_id, "consent_type": consent_type},
            headers=auth_headers["clinician"],
        ).json()

    def test_list_own_records(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        self._create(client, auth_headers, patient_id)
        self._create(client, auth_headers, patient_id, "research")
        resp = client.get("/api/v1/consent-records", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2

    def test_filter_by_patient(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        p2 = client.post(
            "/api/v1/patients",
            json={"first_name": "Other", "last_name": "Patient", "dob": "1990-01-01", "gender": "M"},
            headers=auth_headers["clinician"],
        ).json()["id"]
        self._create(client, auth_headers, patient_id)
        self._create(client, auth_headers, p2)

        resp = client.get(f"/api/v1/consent-records?patient_id={patient_id}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_empty_list(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/consent-records", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestGetConsentRecord:
    def test_get_own_record(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        created = client.post(
            "/api/v1/consent-records",
            json={"patient_id": patient_id, "consent_type": "general"},
            headers=auth_headers["clinician"],
        ).json()
        resp = client.get(f"/api/v1/consent-records/{created['id']}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["id"] == created["id"]

    def test_get_nonexistent_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/consent-records/not-a-real-id", headers=auth_headers["clinician"])
        assert resp.status_code == 404


class TestUpdateConsentRecord:
    def test_mark_as_signed(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        created = client.post(
            "/api/v1/consent-records",
            json={"patient_id": patient_id, "consent_type": "general", "signed": False},
            headers=auth_headers["clinician"],
        ).json()
        assert created["signed"] is False

        resp = client.patch(
            f"/api/v1/consent-records/{created['id']}",
            json={"signed": True},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["signed"] is True
        assert data["signed_at"] is not None

    def test_update_notes_and_document_ref(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        created = client.post(
            "/api/v1/consent-records",
            json={"patient_id": patient_id, "consent_type": "general"},
            headers=auth_headers["clinician"],
        ).json()

        resp = client.patch(
            f"/api/v1/consent-records/{created['id']}",
            json={"notes": "Updated notes", "document_ref": "s3://bucket/consent.pdf"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["notes"] == "Updated notes"
        assert data["document_ref"] == "s3://bucket/consent.pdf"

    def test_update_nonexistent_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.patch(
            "/api/v1/consent-records/not-real",
            json={"signed": True},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404
