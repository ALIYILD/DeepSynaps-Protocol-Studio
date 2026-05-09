"""Tests for the medications router (patient medications + interaction check)."""
from __future__ import annotations

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
PATIENT_ID = "pat-med-test-001"


def test_get_medications_requires_auth():
    """GET patient medications must reject unauthenticated requests."""
    r = client.get(f"/api/v1/medications/patient/{PATIENT_ID}")
    assert r.status_code == 403


def test_get_medications_empty():
    """Clinician gets an empty list for a patient with no medications."""
    r = client.get(f"/api/v1/medications/patient/{PATIENT_ID}", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_add_medication_and_retrieve():
    """Adding a medication creates it and it appears in the list."""
    r = client.post(f"/api/v1/medications/patient/{PATIENT_ID}", headers=CLINICIAN_HDR, json={
        "name": "Sertraline",
        "dose": "50mg",
        "frequency": "daily",
        "active": True,
    })
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Sertraline"
    assert body["patient_id"] == PATIENT_ID
    med_id = body["id"]

    # Now retrieve and verify it's in the list
    r2 = client.get(f"/api/v1/medications/patient/{PATIENT_ID}", headers=CLINICIAN_HDR)
    assert r2.status_code == 200
    ids = [m["id"] for m in r2.json()["items"]]
    assert med_id in ids


def test_delete_medication():
    """Deleting a medication removes it from the patient list."""
    # Add first
    r = client.post(f"/api/v1/medications/patient/{PATIENT_ID}", headers=CLINICIAN_HDR, json={
        "name": "Tramadol",
        "active": True,
    })
    assert r.status_code == 201
    med_id = r.json()["id"]

    # Delete it
    r_del = client.delete(f"/api/v1/medications/patient/{PATIENT_ID}/{med_id}", headers=CLINICIAN_HDR)
    assert r_del.status_code == 204

    # Verify gone
    r3 = client.get(f"/api/v1/medications/patient/{PATIENT_ID}", headers=CLINICIAN_HDR)
    ids = [m["id"] for m in r3.json()["items"]]
    assert med_id not in ids


def test_interaction_check_requires_auth():
    """POST /medications/check-interactions must require auth."""
    r = client.post("/api/v1/medications/check-interactions", json={"medications": ["sertraline"]})
    assert r.status_code == 403


def test_interaction_check_no_medications_rejected():
    """Empty medication list is rejected with 422."""
    r = client.post("/api/v1/medications/check-interactions", headers=CLINICIAN_HDR, json={
        "medications": []
    })
    assert r.status_code == 422


def test_interaction_check_known_severe():
    """Sertraline + tramadol triggers a severe interaction."""
    r = client.post("/api/v1/medications/check-interactions", headers=CLINICIAN_HDR, json={
        "medications": ["sertraline", "tramadol"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["severity_summary"] == "severe"
    assert len(body["interactions"]) >= 1
    assert body["requires_clinician_review"] is True


def test_interaction_check_no_match():
    """Unknown medications return no interactions and severity_summary=none."""
    r = client.post("/api/v1/medications/check-interactions", headers=CLINICIAN_HDR, json={
        "medications": ["vitamin_c", "zinc"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["severity_summary"] == "none"
    assert body["interactions"] == []


def test_interaction_log_requires_auth():
    """GET /medications/interaction-log must require auth."""
    r = client.get("/api/v1/medications/interaction-log")
    assert r.status_code == 403
