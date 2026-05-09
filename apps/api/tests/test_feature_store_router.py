"""Tests for /api/v1/feature-store — patient feature fetch endpoint."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
GUEST_HDR = {"Authorization": "Bearer guest-demo-token"}

_PATIENT_ID = "patient-feature-test-001"


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------

class TestFeatureStoreAuth:
    def test_unauthenticated_returns_403(self, client: TestClient) -> None:
        r = client.get(f"/api/v1/feature-store/patients/{_PATIENT_ID}/features")
        assert r.status_code == 403

    def test_guest_role_returns_403(self, client: TestClient) -> None:
        """Guest role is below clinician — must be rejected."""
        r = client.get(
            f"/api/v1/feature-store/patients/{_PATIENT_ID}/features",
            headers=GUEST_HDR,
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

class TestFeatureStoreFetch:
    def test_fetch_returns_expected_shape(self, client: TestClient) -> None:
        r = client.get(
            f"/api/v1/feature-store/patients/{_PATIENT_ID}/features",
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["patient_id"] == _PATIENT_ID
        assert "tenant_id" in body
        assert "feature_set" in body
        assert "features" in body
        assert isinstance(body["features"], dict)
        assert "metadata" in body
        assert isinstance(body["metadata"], dict)

    def test_fetch_default_feature_set_is_full(self, client: TestClient) -> None:
        r = client.get(
            f"/api/v1/feature-store/patients/{_PATIENT_ID}/features",
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        assert r.json()["feature_set"] == "full"

    def test_fetch_custom_feature_set(self, client: TestClient) -> None:
        r = client.get(
            f"/api/v1/feature-store/patients/{_PATIENT_ID}/features?feature_set=summary",
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        assert r.json()["feature_set"] == "summary"

    def test_fetch_explicit_tenant_id(self, client: TestClient) -> None:
        r = client.get(
            f"/api/v1/feature-store/patients/{_PATIENT_ID}/features?tenant_id=tenant-XYZ",
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        assert r.json()["tenant_id"] == "tenant-XYZ"

    def test_fetch_empty_feature_set_param_returns_422(self, client: TestClient) -> None:
        """Min-length 1 validation — empty string must be rejected."""
        r = client.get(
            f"/api/v1/feature-store/patients/{_PATIENT_ID}/features?feature_set=",
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 422

    def test_metadata_contains_provider_key(self, client: TestClient) -> None:
        r = client.get(
            f"/api/v1/feature-store/patients/{_PATIENT_ID}/features",
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        assert "provider" in r.json()["metadata"]
