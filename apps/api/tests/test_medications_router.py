"""Tests for /api/v1/medications (Medication Safety).

Covers:
- GET /patient/{id} — auth gate, empty list, active_only filter
- POST /patient/{id} — add medication, 201
- DELETE /patient/{id}/{med_id} — remove, 204; not-found 404
- POST /check-interactions — no-interaction clean list, known interaction hit
- POST /check-interactions — empty list returns 422
- GET /interaction-log — auth gate, empty list
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_BASE = "/api/v1/medications"
_PATIENT = "pt-med-test-001"


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


# ── GET /patient/{id} ────────────────────────────────────────────────────────

def test_get_patient_medications_requires_auth(client: TestClient) -> None:
    r = client.get(f"{_BASE}/patient/{_PATIENT}")
    assert r.status_code == 403


def test_get_patient_medications_empty(client: TestClient) -> None:
    r = client.get(f"{_BASE}/patient/{_PATIENT}", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


# ── POST /patient/{id} ───────────────────────────────────────────────────────

def test_add_medication_happy_path(client: TestClient) -> None:
    payload = {
        "name": "Sertraline",
        "generic_name": "sertraline HCl",
        "drug_class": "SSRI",
        "dose": "50mg",
        "frequency": "once daily",
        "active": True,
    }
    r = client.post(f"{_BASE}/patient/{_PATIENT}", json=payload, headers=_CLINICIAN)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Sertraline"
    assert body["active"] is True
    assert body["patient_id"] == _PATIENT
    assert "id" in body


def test_add_medication_appears_in_list(client: TestClient) -> None:
    client.post(
        f"{_BASE}/patient/{_PATIENT}",
        json={"name": "Lithium", "active": True},
        headers=_CLINICIAN,
    )
    r = client.get(f"{_BASE}/patient/{_PATIENT}", headers=_CLINICIAN)
    names = [m["name"] for m in r.json()["items"]]
    assert "Lithium" in names


def test_active_only_filter(client: TestClient) -> None:
    client.post(
        f"{_BASE}/patient/{_PATIENT}",
        json={"name": "ActiveMed", "active": True},
        headers=_CLINICIAN,
    )
    client.post(
        f"{_BASE}/patient/{_PATIENT}",
        json={"name": "StoppedMed", "active": False},
        headers=_CLINICIAN,
    )
    r = client.get(
        f"{_BASE}/patient/{_PATIENT}?active_only=true", headers=_CLINICIAN
    )
    assert r.status_code == 200
    names = [m["name"] for m in r.json()["items"]]
    assert "ActiveMed" in names
    assert "StoppedMed" not in names


# ── DELETE /patient/{id}/{med_id} ────────────────────────────────────────────

def test_remove_medication_returns_204(client: TestClient) -> None:
    cr = client.post(
        f"{_BASE}/patient/{_PATIENT}",
        json={"name": "ToDelete"},
        headers=_CLINICIAN,
    )
    med_id = cr.json()["id"]
    dr = client.delete(f"{_BASE}/patient/{_PATIENT}/{med_id}", headers=_CLINICIAN)
    assert dr.status_code == 204


def test_remove_nonexistent_medication_returns_404(client: TestClient) -> None:
    r = client.delete(
        f"{_BASE}/patient/{_PATIENT}/ghost-med-id", headers=_CLINICIAN
    )
    assert r.status_code == 404


# ── POST /check-interactions ─────────────────────────────────────────────────

def test_check_interactions_no_interaction(client: TestClient) -> None:
    r = client.post(
        f"{_BASE}/check-interactions",
        json={"medications": ["acetaminophen", "vitamin_c"]},
        headers=_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["interactions"] == []
    assert body["severity_summary"] == "none"
    assert body["requires_clinician_review"] is True


def test_check_interactions_known_hit_sertraline_tramadol(client: TestClient) -> None:
    r = client.post(
        f"{_BASE}/check-interactions",
        json={"medications": ["sertraline", "tramadol"]},
        headers=_CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["interactions"]) >= 1
    sevs = [i["severity"] for i in body["interactions"]]
    assert "severe" in sevs


def test_check_interactions_empty_list_returns_422(client: TestClient) -> None:
    r = client.post(
        f"{_BASE}/check-interactions",
        json={"medications": []},
        headers=_CLINICIAN,
    )
    assert r.status_code == 422


def test_check_interactions_requires_auth(client: TestClient) -> None:
    r = client.post(
        f"{_BASE}/check-interactions",
        json={"medications": ["aspirin"]},
    )
    assert r.status_code == 403


# ── GET /interaction-log ─────────────────────────────────────────────────────

def test_get_interaction_log_requires_auth(client: TestClient) -> None:
    r = client.get(f"{_BASE}/interaction-log")
    assert r.status_code == 403


def test_get_interaction_log_empty(client: TestClient) -> None:
    r = client.get(f"{_BASE}/interaction-log", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0
