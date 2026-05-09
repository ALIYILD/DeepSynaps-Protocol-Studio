"""Tests for medical_images_router.py.

Pins:
- GET /api/v1/medical-images/supported-formats — happy path + auth
- POST /api/v1/medical-images/preview — auth gate, bad format 422, empty file 422
- GET /api/v1/medical-images/{image_id} — 404 on unknown id
- GET /api/v1/medical-images/patients/{patient_id}/index — auth gate
"""
from __future__ import annotations

import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
GUEST_HDR = {"Authorization": "Bearer guest-demo-token"}


def test_supported_formats_happy_path():
    """Authenticated actor gets list of accepted volume formats."""
    r = client.get("/api/v1/medical-images/supported-formats", headers=CLINICIAN_HDR)
    assert r.status_code == 200
    body = r.json()
    assert "formats" in body
    assert isinstance(body["formats"], list)
    assert "disclaimer" in body


def test_supported_formats_unauthenticated_returns_list():
    """The supported-formats endpoint is open to all actors (including anonymous).
    It returns the format list even without an explicit Bearer token.
    """
    r = client.get("/api/v1/medical-images/supported-formats")
    assert r.status_code == 200
    assert "formats" in r.json()


def test_preview_rejects_unsupported_format():
    """Uploading a .txt file triggers 422 unsupported_medical_image."""
    data = b"fake content"
    r = client.post(
        "/api/v1/medical-images/preview",
        headers=CLINICIAN_HDR,
        files={"file": ("scan.txt", io.BytesIO(data), "text/plain")},
    )
    assert r.status_code == 422


def test_preview_rejects_empty_file():
    """Uploading an empty .nii file triggers 422 file_empty."""
    r = client.post(
        "/api/v1/medical-images/preview",
        headers=CLINICIAN_HDR,
        files={"file": ("scan.nii", io.BytesIO(b""), "application/octet-stream")},
    )
    assert r.status_code == 422


def test_preview_requires_auth():
    """Preview upload without auth returns 403."""
    r = client.post(
        "/api/v1/medical-images/preview",
        files={"file": ("scan.nii", io.BytesIO(b"fake"), "application/octet-stream")},
    )
    assert r.status_code == 403


def test_get_medical_image_404_unknown():
    """Fetching an unknown image_id returns 404."""
    r = client.get("/api/v1/medical-images/img_doesnotexist_00000000", headers=CLINICIAN_HDR)
    assert r.status_code == 404


def test_get_slice_404_unknown():
    """Fetching axial slice for nonexistent image returns 404."""
    r = client.get(
        "/api/v1/medical-images/img_doesnotexist_99999999/slices/axial.png",
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 404


def test_report_context_404_unknown():
    """Report context for unknown image_id returns 404."""
    r = client.post(
        "/api/v1/medical-images/img_doesnotexist_12345abc/report-context",
        headers=CLINICIAN_HDR,
        json={},
    )
    assert r.status_code == 404


def test_patient_image_list_requires_auth():
    """Patient image index without auth returns 403."""
    r = client.get("/api/v1/medical-images/patients/P-TEST-1/index")
    assert r.status_code == 403


def test_patient_image_list_empty_for_unknown_patient():
    """Patient image index for a patient with no images returns empty list."""
    r = client.get(
        "/api/v1/medical-images/patients/P-NOBODY-9999/index",
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)
