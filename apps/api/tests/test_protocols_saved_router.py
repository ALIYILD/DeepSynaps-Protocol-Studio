"""Tests for protocols_saved_router — /api/v1/protocols/saved endpoints.

Covers: create, list, patch (update), auth rejection, validation, and
not-found shapes. Uses the shared conftest SQLite DB via the `client` and
`auth_headers` fixtures.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Patient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_patient(clinician_id: str) -> str:
    """Create a minimal patient owned by clinician_id, return patient id."""
    db = SessionLocal()
    try:
        pid = str(uuid.uuid4())
        db.add(Patient(
            id=pid,
            clinician_id=clinician_id,
            first_name="Proto",
            last_name="Patient",
        ))
        db.commit()
        return pid
    finally:
        db.close()


_CLINICIAN_ACTOR_ID = "actor-clinician-demo"


def _create_body(patient_id: str, **overrides) -> dict:
    base = {
        "patient_id": patient_id,
        "condition": "MDD",
        "modality": "tms",
        "governance_state": "draft",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Tests: POST /api/v1/protocols/saved
# ---------------------------------------------------------------------------

def test_create_saved_protocol_happy_path(client: TestClient, auth_headers) -> None:
    pid = _seed_patient(_CLINICIAN_ACTOR_ID)
    r = client.post(
        "/api/v1/protocols/saved",
        headers=auth_headers["clinician"],
        json=_create_body(pid, name="TMS for MDD", protocol_id="p-mdd-001"),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["patient_id"] == pid
    assert body["condition"] == "MDD"
    assert body["governance_state"] == "draft"
    assert body["modality"] == "tms"
    assert "id" in body
    assert "created_at" in body


def test_create_saved_protocol_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/api/v1/protocols/saved",
        json=_create_body(str(uuid.uuid4())),
    )
    assert r.status_code in (401, 403)


def test_create_saved_protocol_validation_missing_condition(
    client: TestClient, auth_headers
) -> None:
    pid = _seed_patient(_CLINICIAN_ACTOR_ID)
    r = client.post(
        "/api/v1/protocols/saved",
        headers=auth_headers["clinician"],
        json={"patient_id": pid},  # missing required `condition`
    )
    assert r.status_code == 422


def test_create_saved_protocol_stores_evidence_refs(
    client: TestClient, auth_headers
) -> None:
    pid = _seed_patient(_CLINICIAN_ACTOR_ID)
    r = client.post(
        "/api/v1/protocols/saved",
        headers=auth_headers["clinician"],
        json=_create_body(pid, evidence_refs=["pmid:12345", "pmid:67890"]),
    )
    assert r.status_code == 201
    body = r.json()
    assert "pmid:12345" in body["evidence_refs"]


# ---------------------------------------------------------------------------
# Tests: GET /api/v1/protocols/saved
# ---------------------------------------------------------------------------

def test_list_saved_protocols_empty(client: TestClient, auth_headers) -> None:
    r = client.get("/api/v1/protocols/saved", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    assert isinstance(body["items"], list)


def test_list_saved_protocols_returns_created(
    client: TestClient, auth_headers
) -> None:
    pid = _seed_patient(_CLINICIAN_ACTOR_ID)
    client.post(
        "/api/v1/protocols/saved",
        headers=auth_headers["clinician"],
        json=_create_body(pid, condition="Anxiety"),
    )
    r = client.get("/api/v1/protocols/saved", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    conditions = [i["condition"] for i in body["items"]]
    assert "Anxiety" in conditions


def test_list_saved_protocols_filter_by_patient(
    client: TestClient, auth_headers
) -> None:
    pid = _seed_patient(_CLINICIAN_ACTOR_ID)
    client.post(
        "/api/v1/protocols/saved",
        headers=auth_headers["clinician"],
        json=_create_body(pid, condition="OCD"),
    )
    r = client.get(
        f"/api/v1/protocols/saved?patient_id={pid}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert all(i["patient_id"] == pid for i in body["items"])


def test_list_saved_protocols_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/protocols/saved")
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Tests: PATCH /api/v1/protocols/saved/{protocol_id}
# ---------------------------------------------------------------------------

def test_patch_saved_protocol_governance_state(
    client: TestClient, auth_headers
) -> None:
    pid = _seed_patient(_CLINICIAN_ACTOR_ID)
    cr = client.post(
        "/api/v1/protocols/saved",
        headers=auth_headers["clinician"],
        json=_create_body(pid),
    )
    proto_id = cr.json()["id"]

    r = client.patch(
        f"/api/v1/protocols/saved/{proto_id}",
        headers=auth_headers["clinician"],
        json={"governance_state": "submitted"},
    )
    assert r.status_code == 200
    assert r.json()["governance_state"] == "submitted"


def test_patch_saved_protocol_notes(client: TestClient, auth_headers) -> None:
    pid = _seed_patient(_CLINICIAN_ACTOR_ID)
    cr = client.post(
        "/api/v1/protocols/saved",
        headers=auth_headers["clinician"],
        json=_create_body(pid),
    )
    proto_id = cr.json()["id"]

    r = client.patch(
        f"/api/v1/protocols/saved/{proto_id}",
        headers=auth_headers["clinician"],
        json={"clinician_notes": "Good candidate"},
    )
    assert r.status_code == 200
    assert r.json()["clinician_notes"] == "Good candidate"


def test_patch_saved_protocol_not_found(client: TestClient, auth_headers) -> None:
    r = client.patch(
        "/api/v1/protocols/saved/no-such-id",
        headers=auth_headers["clinician"],
        json={"governance_state": "approved"},
    )
    assert r.status_code == 404


def test_patch_saved_protocol_requires_auth(client: TestClient) -> None:
    r = client.patch(
        "/api/v1/protocols/saved/some-id",
        json={"governance_state": "draft"},
    )
    assert r.status_code in (401, 403)
