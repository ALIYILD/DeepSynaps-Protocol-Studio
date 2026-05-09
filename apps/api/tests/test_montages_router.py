"""Tests for montages_router — /api/v1/montages + /api/v1/recordings/{id}/montage.

Covers:
- GET /api/v1/montages requires clinician role (403 for unauthenticated)
- GET /api/v1/montages returns builtins + custom lists
- POST /api/v1/montages creates a custom montage
- POST /api/v1/montages validates required name field (422)
- POST /api/v1/recordings/{id}/montage sets montage preference
- Custom montage appears in subsequent GET list
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_list_montages_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/montages")
    assert resp.status_code in (401, 403)


def test_list_montages_returns_structure(client: TestClient, auth_headers: dict) -> None:
    resp = client.get("/api/v1/montages", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert "builtins" in body
    assert "custom" in body
    assert isinstance(body["builtins"], list)
    assert isinstance(body["custom"], list)


def test_create_montage_happy_path(client: TestClient, auth_headers: dict) -> None:
    payload = {
        "name": "Test Linked Ears",
        "family": "custom",
        "spec": {"reference": "linked_ears", "channels": ["Fp1", "Fp2", "Fz"]},
    }
    resp = client.post("/api/v1/montages", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["montage"]["name"] == "Test Linked Ears"
    assert "id" in body["montage"]


def test_create_montage_missing_name_returns_422(client: TestClient, auth_headers: dict) -> None:
    payload = {"spec": {"reference": "average"}}
    resp = client.post("/api/v1/montages", json=payload, headers=auth_headers["clinician"])
    assert resp.status_code == 422


def test_create_montage_requires_auth(client: TestClient) -> None:
    payload = {"name": "Unauthorized Montage", "spec": {}}
    resp = client.post("/api/v1/montages", json=payload)
    assert resp.status_code in (401, 403)


def test_created_montage_appears_in_list(client: TestClient, auth_headers: dict) -> None:
    payload = {
        "name": "Bipolar Temporal",
        "family": "bipolar",
        "spec": {"pairs": [["T3", "T5"], ["T4", "T6"]]},
    }
    create_resp = client.post("/api/v1/montages", json=payload, headers=auth_headers["clinician"])
    assert create_resp.status_code == 200
    montage_id = create_resp.json()["montage"]["id"]

    list_resp = client.get("/api/v1/montages", headers=auth_headers["clinician"])
    assert list_resp.status_code == 200
    custom_ids = [m["id"] for m in list_resp.json()["custom"]]
    assert montage_id in custom_ids


def test_set_recording_montage_preference(client: TestClient, auth_headers: dict) -> None:
    # Create a montage to reference
    create_resp = client.post(
        "/api/v1/montages",
        json={"name": "Average Ref", "spec": {"reference": "average"}},
        headers=auth_headers["clinician"],
    )
    assert create_resp.status_code == 200
    montage_id = create_resp.json()["montage"]["id"]

    resp = client.post(
        "/api/v1/recordings/rec-001/montage",
        json={"montageId": montage_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["recordingId"] == "rec-001"
    assert body["montageId"] == montage_id


def test_set_recording_montage_requires_auth(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/recordings/rec-001/montage",
        json={"montageId": "some-id"},
    )
    assert resp.status_code in (401, 403)
