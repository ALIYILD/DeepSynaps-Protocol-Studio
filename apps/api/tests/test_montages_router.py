"""Tests for /api/v1/montages — list builtins, upsert custom, set recording preference."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------

class TestMontagesAuth:
    def test_list_montages_requires_auth(self, client: TestClient) -> None:
        r = client.get("/api/v1/montages")
        assert r.status_code == 403

    def test_upsert_montage_requires_auth(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/montages",
            json={"name": "NoAuth", "spec": {"electrodes": []}},
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# List montages
# ---------------------------------------------------------------------------

class TestMontagesList:
    def test_list_returns_builtins_and_custom_keys(self, client: TestClient) -> None:
        r = client.get("/api/v1/montages", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        body = r.json()
        assert "builtins" in body
        assert "custom" in body
        assert isinstance(body["builtins"], list)
        assert isinstance(body["custom"], list)

    def test_builtins_are_non_empty(self, client: TestClient) -> None:
        r = client.get("/api/v1/montages", headers=CLINICIAN_HDR)
        assert len(r.json()["builtins"]) > 0


# ---------------------------------------------------------------------------
# Upsert (POST /montages)
# ---------------------------------------------------------------------------

class TestMontageUpsert:
    def test_create_new_montage_returns_ok_and_id(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/montages",
            json={"name": "TestMontage", "family": "custom", "spec": {"electrodes": ["Fp1", "Fp2"]}},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert "montage" in body
        assert body["montage"]["name"] == "TestMontage"
        assert "id" in body["montage"]

    def test_upsert_with_explicit_id_updates_existing(self, client: TestClient) -> None:
        # Create with explicit ID.
        mid = "fixed-montage-id-001"
        r1 = client.post(
            "/api/v1/montages",
            json={"id": mid, "name": "OriginalName", "spec": {"electrodes": ["Cz"]}},
            headers=CLINICIAN_HDR,
        )
        assert r1.status_code == 200

        # Upsert same ID with new name.
        r2 = client.post(
            "/api/v1/montages",
            json={"id": mid, "name": "UpdatedName", "spec": {"electrodes": ["Cz", "Pz"]}},
            headers=CLINICIAN_HDR,
        )
        assert r2.status_code == 200
        assert r2.json()["montage"]["name"] == "UpdatedName"

    def test_created_montage_appears_in_list(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/montages",
            json={"name": "ListableMonage", "spec": {"electrodes": ["O1"]}},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        new_id = r.json()["montage"]["id"]

        r2 = client.get("/api/v1/montages", headers=CLINICIAN_HDR)
        custom_ids = [m["id"] for m in r2.json()["custom"]]
        assert new_id in custom_ids

    def test_upsert_missing_name_returns_422(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/montages",
            json={"spec": {"electrodes": ["Fp1"]}},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# Set recording montage preference
# ---------------------------------------------------------------------------

class TestRecordingMontagePref:
    def test_set_recording_montage_returns_ok(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/recordings/rec-001/montage",
            json={"montageId": "builtin:standard_10_20"},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["recordingId"] == "rec-001"
        assert body["montageId"] == "builtin:standard_10_20"

    def test_set_recording_montage_requires_auth(self, client: TestClient) -> None:
        r = client.post(
            "/api/v1/recordings/rec-002/montage",
            json={"montageId": "builtin:standard_10_20"},
        )
        assert r.status_code == 403
