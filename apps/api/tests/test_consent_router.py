"""Tests for /api/v1/consent-records — create, list, get, update."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}

_PATIENT_ID = "test-patient-consent-001"


def _create_consent(client: TestClient, **overrides) -> dict:
    payload = {
        "patient_id": _PATIENT_ID,
        "consent_type": "general",
        "signed": False,
    }
    payload.update(overrides)
    r = client.post("/api/v1/consent-records", json=payload, headers=CLINICIAN_HDR)
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------

class TestConsentAuth:
    def test_create_requires_auth(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/consent-records",
            json={"patient_id": "p1", "consent_type": "general"},
        )
        assert r.status_code == 403

    def test_list_requires_auth(self, client: TestClient) -> None:
        r = client.get("/api/v1/consent-records")
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

class TestConsentCreate:
    def test_create_returns_201_with_required_fields(self, client: TestClient) -> None:
        body = _create_consent(client)
        assert body["patient_id"] == _PATIENT_ID
        assert body["consent_type"] == "general"
        assert body["signed"] is False
        assert "id" in body
        assert "created_at" in body
        assert "clinician_id" in body

    def test_create_signed_consent_stamps_signed_at(self, client: TestClient) -> None:
        body = _create_consent(client, signed=True)
        assert body["signed"] is True
        assert body["signed_at"] is not None

    def test_create_off_label_consent(self, client: TestClient) -> None:
        body = _create_consent(client, consent_type="off_label", modality_slug="tDCS")
        assert body["consent_type"] == "off_label"
        assert body["modality_slug"] == "tDCS"


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

class TestConsentList:
    def test_list_returns_items_and_total(self, client: TestClient) -> None:
        _create_consent(client)
        _create_consent(client)
        r = client.get("/api/v1/consent-records", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert body["total"] == len(body["items"])
        assert body["total"] >= 2

    def test_list_filter_by_patient_id(self, client: TestClient) -> None:
        _create_consent(client, patient_id="filter-patient-A")
        _create_consent(client, patient_id="filter-patient-B")
        r = client.get(
            "/api/v1/consent-records?patient_id=filter-patient-A", headers=CLINICIAN_HDR
        )
        assert r.status_code == 200
        body = r.json()
        for item in body["items"]:
            assert item["patient_id"] == "filter-patient-A"

    def test_empty_list_on_fresh_db(self, client: TestClient) -> None:
        r = client.get("/api/v1/consent-records", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        assert r.json()["total"] == 0


# ---------------------------------------------------------------------------
# Get single
# ---------------------------------------------------------------------------

class TestConsentGet:
    def test_get_returns_consent(self, client: TestClient) -> None:
        created = _create_consent(client)
        r = client.get(f"/api/v1/consent-records/{created['id']}", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        assert r.json()["id"] == created["id"]

    def test_get_not_found_returns_404(self, client: TestClient) -> None:
        r = client.get("/api/v1/consent-records/nonexistent-id-xyz", headers=CLINICIAN_HDR)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Update (PATCH)
# ---------------------------------------------------------------------------

class TestConsentUpdate:
    def test_patch_marks_as_signed(self, client: TestClient) -> None:
        created = _create_consent(client, signed=False)
        r = client.patch(
            f"/api/v1/consent-records/{created['id']}",
            json={"signed": True},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["signed"] is True
        assert body["signed_at"] is not None

    def test_patch_status_update(self, client: TestClient) -> None:
        created = _create_consent(client)
        r = client.patch(
            f"/api/v1/consent-records/{created['id']}",
            json={"status": "withdrawn"},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "withdrawn"

    def test_patch_not_found_returns_404(self, client: TestClient) -> None:
        r = client.patch(
            "/api/v1/consent-records/no-such-record",
            json={"signed": True},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 404
