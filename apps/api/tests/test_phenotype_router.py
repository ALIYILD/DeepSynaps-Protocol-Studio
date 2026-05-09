"""Tests for /api/v1/phenotype-assignments.

Covers:
- POST / — happy path create (201), confidence validation (422)
- GET / — auth gate, empty list, patient_id filter
- DELETE /{id} — removes assignment (204), not-found (404)
- GET /audit-events — auth gate, empty list
- POST /audit-events — page-level audit create + round-trip
- POST /audit-events — blank event returns 422
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_BASE = "/api/v1/phenotype-assignments"

_VALID_CREATE = {
    "patient_id": "pt-pheno-001",
    "phenotype_id": "alpha-peak-deficit",
    "phenotype_name": "Alpha Peak Deficit",
    "domain": "EEG",
    "confidence": "high",
    "qeeg_supported": True,
}


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


# ── POST / ───────────────────────────────────────────────────────────────────

def test_create_phenotype_assignment_happy_path(client: TestClient) -> None:
    r = client.post(f"{_BASE}", json=_VALID_CREATE, headers=_CLINICIAN)
    assert r.status_code == 201
    body = r.json()
    assert body["phenotype_id"] == "alpha-peak-deficit"
    assert body["phenotype_name"] == "Alpha Peak Deficit"
    assert body["confidence"] == "high"
    assert body["qeeg_supported"] is True
    assert "id" in body


def test_create_phenotype_requires_auth(client: TestClient) -> None:
    r = client.post(f"{_BASE}", json=_VALID_CREATE)
    assert r.status_code == 403


def test_create_phenotype_invalid_confidence_returns_422(
    client: TestClient,
) -> None:
    payload = {**_VALID_CREATE, "confidence": "definitely_wrong"}
    r = client.post(f"{_BASE}", json=payload, headers=_CLINICIAN)
    assert r.status_code == 422


def test_create_phenotype_blank_phenotype_id_returns_422(
    client: TestClient,
) -> None:
    payload = {**_VALID_CREATE, "phenotype_id": ""}
    r = client.post(f"{_BASE}", json=payload, headers=_CLINICIAN)
    assert r.status_code == 422


def test_create_phenotype_blank_phenotype_name_returns_422(
    client: TestClient,
) -> None:
    payload = {**_VALID_CREATE, "phenotype_name": ""}
    r = client.post(f"{_BASE}", json=payload, headers=_CLINICIAN)
    assert r.status_code == 422


# ── GET / ────────────────────────────────────────────────────────────────────

def test_list_phenotype_assignments_requires_auth(client: TestClient) -> None:
    r = client.get(f"{_BASE}")
    assert r.status_code == 403


def test_list_phenotype_assignments_empty(client: TestClient) -> None:
    r = client.get(f"{_BASE}", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_list_phenotype_assignments_after_create(client: TestClient) -> None:
    client.post(f"{_BASE}", json=_VALID_CREATE, headers=_CLINICIAN)
    r = client.get(f"{_BASE}", headers=_CLINICIAN)
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_list_phenotype_assignments_patient_id_filter(
    client: TestClient,
) -> None:
    # Create for two different patients
    p1_payload = {**_VALID_CREATE, "patient_id": "pt-filter-a"}
    p2_payload = {
        "patient_id": "pt-filter-b",
        "phenotype_id": "theta-excess",
        "phenotype_name": "Theta Excess",
    }
    client.post(f"{_BASE}", json=p1_payload, headers=_CLINICIAN)
    client.post(f"{_BASE}", json=p2_payload, headers=_CLINICIAN)

    r = client.get(f"{_BASE}?patient_id=pt-filter-a", headers=_CLINICIAN)
    assert r.status_code == 200
    pids = [item["patient_id"] for item in r.json()["items"]]
    assert all(pid == "pt-filter-a" for pid in pids)


# ── DELETE /{id} ──────────────────────────────────────────────────────────────

def test_delete_phenotype_assignment_returns_204(client: TestClient) -> None:
    cr = client.post(f"{_BASE}", json=_VALID_CREATE, headers=_CLINICIAN)
    assert cr.status_code == 201
    aid = cr.json()["id"]
    dr = client.delete(f"{_BASE}/{aid}", headers=_CLINICIAN)
    assert dr.status_code == 204


def test_delete_nonexistent_assignment_returns_404(client: TestClient) -> None:
    r = client.delete(f"{_BASE}/ghost-assignment-id", headers=_CLINICIAN)
    assert r.status_code == 404


# ── Audit events ─────────────────────────────────────────────────────────────

def test_list_audit_events_requires_auth(client: TestClient) -> None:
    r = client.get(f"{_BASE}/audit-events")
    assert r.status_code == 403


def test_list_audit_events_empty(client: TestClient) -> None:
    r = client.get(f"{_BASE}/audit-events", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_post_audit_event_returns_accepted(client: TestClient) -> None:
    payload = {"event": "workspace_view", "patient_id": "pt-pheno-001"}
    r = client.post(f"{_BASE}/audit-events", json=payload, headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert isinstance(body["event_id"], str)


def test_post_audit_event_blank_event_returns_422(client: TestClient) -> None:
    r = client.post(
        f"{_BASE}/audit-events",
        json={"event": ""},
        headers=_CLINICIAN,
    )
    assert r.status_code == 422
