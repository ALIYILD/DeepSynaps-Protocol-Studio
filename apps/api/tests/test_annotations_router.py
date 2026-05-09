"""Tests for annotations_router — /api/v1/annotations.

Pins:
  - unauthenticated requests are rejected (403)
  - list requires analysis_id + analysis_type query params (422 without them)
  - create with missing analysis returns 404
  - create with invalid analysis_type returns 422
  - patient role cannot create annotations (403)
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}
PATIENT = {"Authorization": "Bearer patient-demo-token"}


def test_list_annotations_requires_auth():
    r = client.get("/api/v1/annotations?analysis_id=x&analysis_type=qeeg")
    assert r.status_code == 403


def test_list_annotations_missing_params_returns_422():
    """list endpoint needs analysis_id + analysis_type; omitting both → 422."""
    r = client.get("/api/v1/annotations", headers=CLINICIAN)
    assert r.status_code == 422


def test_list_annotations_unknown_analysis_returns_404():
    r = client.get(
        "/api/v1/annotations?analysis_id=does-not-exist&analysis_type=qeeg",
        headers=CLINICIAN,
    )
    assert r.status_code == 404


def test_create_annotation_requires_auth():
    r = client.post(
        "/api/v1/annotations",
        json={
            "analysis_id": "x",
            "analysis_type": "qeeg",
            "target_kind": "finding",
            "text": "hello",
        },
    )
    assert r.status_code == 403


def test_create_annotation_invalid_analysis_type_returns_422():
    r = client.post(
        "/api/v1/annotations",
        headers=CLINICIAN,
        json={
            "analysis_id": "x",
            "analysis_type": "INVALID",
            "target_kind": "finding",
            "text": "hello",
        },
    )
    # Pydantic pattern validator rejects invalid analysis_type
    assert r.status_code == 422


def test_create_annotation_nonexistent_analysis_returns_404():
    r = client.post(
        "/api/v1/annotations",
        headers=CLINICIAN,
        json={
            "analysis_id": "no-such-analysis",
            "analysis_type": "qeeg",
            "target_kind": "finding",
            "text": "hello",
        },
    )
    assert r.status_code == 404


def test_patient_role_cannot_create_annotation():
    r = client.post(
        "/api/v1/annotations",
        headers=PATIENT,
        json={
            "analysis_id": "x",
            "analysis_type": "qeeg",
            "target_kind": "finding",
            "text": "patient note",
        },
    )
    assert r.status_code == 403


def test_patch_annotation_not_found():
    r = client.patch(
        "/api/v1/annotations/no-such-id",
        headers=CLINICIAN,
        json={"text": "updated text"},
    )
    assert r.status_code == 404


def test_delete_annotation_not_found():
    r = client.delete("/api/v1/annotations/no-such-id", headers=CLINICIAN)
    assert r.status_code == 404
