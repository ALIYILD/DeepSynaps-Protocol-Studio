"""Tests for protocols_saved_router — /api/v1/protocols/saved.

Covers:
- POST requires clinician role (403 unauthenticated)
- POST creates a saved protocol and returns 201 + SavedProtocolOut
- GET lists saved protocols for the authenticated clinician
- PATCH updates governance_state and clinician_notes
- PATCH returns 404 for unknown protocol
- 422 on missing required fields
- Clinician isolation: protocols from another clinician not returned
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Patient


def _make_patient(clinician_id: str) -> str:
    """Seed a minimal Patient row and return its id."""
    pid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(Patient(
            id=pid,
            clinician_id=clinician_id,
            first_name="Saved",
            last_name="Proto Patient",
        ))
        db.commit()
    return pid


_CLINICIAN_ID = "actor-clinician-demo"


def test_create_saved_protocol_requires_auth(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/protocols/saved",
        json={"patient_id": "p-1", "condition": "MDD"},
    )
    assert resp.status_code in (401, 403)


def test_create_saved_protocol_happy_path(client: TestClient, auth_headers: dict) -> None:
    pid = _make_patient(_CLINICIAN_ID)
    payload = {
        "patient_id": pid,
        "condition": "MDD",
        "modality": "tms",
        "governance_state": "draft",
    }
    resp = client.post(
        "/api/v1/protocols/saved",
        json=payload,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["patient_id"] == pid
    assert body["condition"] == "MDD"
    assert body["governance_state"] == "draft"
    assert body["status"] == "active"
    assert "id" in body


def test_create_saved_protocol_missing_condition_returns_422(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.post(
        "/api/v1/protocols/saved",
        json={"patient_id": "p-x"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 422


def test_list_saved_protocols_returns_own_records(
    client: TestClient, auth_headers: dict
) -> None:
    pid = _make_patient(_CLINICIAN_ID)
    client.post(
        "/api/v1/protocols/saved",
        json={"patient_id": pid, "condition": "Anxiety", "modality": "tms"},
        headers=auth_headers["clinician"],
    )
    resp = client.get("/api/v1/protocols/saved", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert body["total"] >= 1
    assert all(item["clinician_id"] == _CLINICIAN_ID for item in body["items"])


def test_list_saved_protocols_filter_by_patient(
    client: TestClient, auth_headers: dict
) -> None:
    pid = _make_patient(_CLINICIAN_ID)
    client.post(
        "/api/v1/protocols/saved",
        json={"patient_id": pid, "condition": "PTSD", "modality": "tms"},
        headers=auth_headers["clinician"],
    )
    resp = client.get(
        f"/api/v1/protocols/saved?patient_id={pid}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert all(item["patient_id"] == pid for item in body["items"])


def test_patch_saved_protocol_updates_state(
    client: TestClient, auth_headers: dict
) -> None:
    pid = _make_patient(_CLINICIAN_ID)
    create_resp = client.post(
        "/api/v1/protocols/saved",
        json={"patient_id": pid, "condition": "OCD", "modality": "tms"},
        headers=auth_headers["clinician"],
    )
    protocol_id = create_resp.json()["id"]

    patch_resp = client.patch(
        f"/api/v1/protocols/saved/{protocol_id}",
        json={"governance_state": "submitted", "clinician_notes": "Ready for review."},
        headers=auth_headers["clinician"],
    )
    assert patch_resp.status_code == 200
    body = patch_resp.json()
    assert body["governance_state"] == "submitted"
    assert body["clinician_notes"] == "Ready for review."


def test_patch_saved_protocol_not_found(
    client: TestClient, auth_headers: dict
) -> None:
    resp = client.patch(
        "/api/v1/protocols/saved/nonexistent-protocol-id",
        json={"governance_state": "approved"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404
