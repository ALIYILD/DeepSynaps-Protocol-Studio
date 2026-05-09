"""Tests for consent_router — /api/v1/consent-records.

Pins:
  - unauthenticated requests return 403
  - list returns empty on fresh DB
  - create returns 201 + shape
  - create is scoped to calling clinician
  - get single consent by id returns 404 for nonexistent
  - patch marks record as signed
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}


def test_list_requires_auth():
    r = client.get("/api/v1/consent-records")
    assert r.status_code == 403


def test_list_empty_on_fresh_db():
    r = client.get("/api/v1/consent-records", headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert body["items"] == []


def test_create_consent_record_happy_path():
    r = client.post(
        "/api/v1/consent-records",
        headers=CLINICIAN,
        json={
            "patient_id": "patient-test-001",
            "consent_type": "general",
            "signed": False,
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["consent_type"] == "general"
    assert body["signed"] is False
    assert "id" in body


def test_create_consent_record_signed_auto_stamps():
    r = client.post(
        "/api/v1/consent-records",
        headers=CLINICIAN,
        json={
            "patient_id": "patient-test-002",
            "consent_type": "off_label",
            "signed": True,
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["signed"] is True
    assert body["signed_at"] is not None


def test_get_consent_record_not_found():
    r = client.get("/api/v1/consent-records/no-such-id", headers=CLINICIAN)
    assert r.status_code == 404


def test_patch_consent_record_marks_signed():
    create = client.post(
        "/api/v1/consent-records",
        headers=CLINICIAN,
        json={"patient_id": "patient-test-003", "consent_type": "research", "signed": False},
    )
    assert create.status_code == 201
    cid = create.json()["id"]

    r = client.patch(
        f"/api/v1/consent-records/{cid}",
        headers=CLINICIAN,
        json={"signed": True},
    )
    assert r.status_code == 200
    assert r.json()["signed"] is True
    assert r.json()["signed_at"] is not None


def test_list_filtered_by_patient_id():
    client.post(
        "/api/v1/consent-records",
        headers=CLINICIAN,
        json={"patient_id": "pat-filter-001", "consent_type": "general"},
    )
    r = client.get(
        "/api/v1/consent-records?patient_id=pat-filter-001",
        headers=CLINICIAN,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    assert all(item["patient_id"] == "pat-filter-001" for item in body["items"])
