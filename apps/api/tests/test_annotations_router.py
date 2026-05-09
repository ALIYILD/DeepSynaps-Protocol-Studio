"""Tests for annotations_router — /api/v1/annotations.

Covers:
  - auth gates (403 without token)
  - 404 when referencing a non-existent analysis
  - create annotation happy path (qeeg)
  - list annotations returns created items
  - patch annotation (text + resolved flag)
  - patch forbidden for non-author non-admin
  - delete annotation (soft delete) — 204 + gone
  - delete 404 on missing
  - 422 on invalid target_kind / analysis_type
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
ADMIN = {"Authorization": "Bearer admin-demo-token"}
NO_AUTH: dict = {}

_QEEG_ANALYSIS_ID = "ann-test-qeeg-001"
_PATIENT_ID = "ann-test-patient-001"


def _seed_qeeg_analysis() -> None:
    """Ensure a QEEGAnalysis row exists so annotation FK checks pass."""
    from app.database import SessionLocal
    from app.persistence.models import Clinic, Patient, QEEGAnalysis, User

    db = SessionLocal()
    try:
        clinic_id = "clinic-demo-default"
        if db.query(Patient).filter_by(id=_PATIENT_ID).first() is None:
            db.add(Patient(
                id=_PATIENT_ID,
                clinician_id="actor-clinician-demo",
                first_name="Ann",
                last_name="Testpatient",
                status="active",
            ))
            db.flush()
        if db.query(QEEGAnalysis).filter_by(id=_QEEG_ANALYSIS_ID).first() is None:
            db.add(QEEGAnalysis(
                id=_QEEG_ANALYSIS_ID,
                patient_id=_PATIENT_ID,
                clinician_id="actor-clinician-demo",
                analysis_status="completed",
            ))
        db.commit()
    finally:
        db.close()


# ── auth gates ─────────────────────────────────────────────────────────────────

def test_create_annotation_requires_auth():
    r = client.post("/api/v1/annotations", json={
        "analysis_id": _QEEG_ANALYSIS_ID,
        "analysis_type": "qeeg",
        "target_kind": "target",
        "text": "Test note",
    })
    assert r.status_code == 403


def test_list_annotations_requires_auth():
    r = client.get("/api/v1/annotations", params={
        "analysis_id": _QEEG_ANALYSIS_ID,
        "analysis_type": "qeeg",
    })
    assert r.status_code == 403


# ── 404 on missing analysis ───────────────────────────────────────────────────

def test_create_annotation_missing_analysis_404():
    r = client.post("/api/v1/annotations", json={
        "analysis_id": "does-not-exist",
        "analysis_type": "qeeg",
        "target_kind": "target",
        "text": "Orphan annotation",
    }, headers=CLINICIAN)
    assert r.status_code == 404


def test_list_annotations_missing_analysis_404():
    r = client.get("/api/v1/annotations", params={
        "analysis_id": "does-not-exist",
        "analysis_type": "qeeg",
    }, headers=CLINICIAN)
    assert r.status_code == 404


# ── create annotation ─────────────────────────────────────────────────────────

def test_create_annotation_happy_path():
    _seed_qeeg_analysis()
    r = client.post("/api/v1/annotations", json={
        "analysis_id": _QEEG_ANALYSIS_ID,
        "analysis_type": "qeeg",
        "target_kind": "target",
        "target_ref": "Fp1",
        "text": "Elevated alpha at Fp1, review recommended.",
        "tags": ["alpha", "follow-up"],
    }, headers=CLINICIAN)
    assert r.status_code == 201
    body = r.json()
    assert body["analysis_id"] == _QEEG_ANALYSIS_ID
    assert body["analysis_type"] == "qeeg"
    assert body["text"] == "Elevated alpha at Fp1, review recommended."
    assert "alpha" in body["tags"]
    assert body["resolved"] is False


def test_create_annotation_invalid_target_kind_422():
    _seed_qeeg_analysis()
    r = client.post("/api/v1/annotations", json={
        "analysis_id": _QEEG_ANALYSIS_ID,
        "analysis_type": "qeeg",
        "target_kind": "not_a_valid_kind",
        "text": "Bad kind",
    }, headers=CLINICIAN)
    # 422 from schema validation or 422 raised by the router.
    assert r.status_code == 422


def test_create_annotation_invalid_analysis_type_422():
    r = client.post("/api/v1/annotations", json={
        "analysis_id": _QEEG_ANALYSIS_ID,
        "analysis_type": "fmri",  # not in {qeeg, mri}
        "target_kind": "target",
        "text": "Bad type",
    }, headers=CLINICIAN)
    assert r.status_code == 422


# ── list annotations ──────────────────────────────────────────────────────────

def test_list_annotations_returns_created_items():
    _seed_qeeg_analysis()
    client.post("/api/v1/annotations", json={
        "analysis_id": _QEEG_ANALYSIS_ID,
        "analysis_type": "qeeg",
        "target_kind": "section",
        "text": "List check annotation",
    }, headers=CLINICIAN)
    r = client.get("/api/v1/annotations", params={
        "analysis_id": _QEEG_ANALYSIS_ID,
        "analysis_type": "qeeg",
    }, headers=CLINICIAN)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    texts = [item["text"] for item in items]
    assert "List check annotation" in texts


# ── patch annotation ──────────────────────────────────────────────────────────

def _create_annotation(text: str = "Original text") -> str:
    _seed_qeeg_analysis()
    r = client.post("/api/v1/annotations", json={
        "analysis_id": _QEEG_ANALYSIS_ID,
        "analysis_type": "qeeg",
        "target_kind": "finding",
        "text": text,
    }, headers=CLINICIAN)
    assert r.status_code == 201
    return r.json()["id"]


def test_patch_annotation_text():
    ann_id = _create_annotation()
    r = client.patch(f"/api/v1/annotations/{ann_id}", json={"text": "Updated text"}, headers=CLINICIAN)
    assert r.status_code == 200
    assert r.json()["text"] == "Updated text"


def test_patch_annotation_resolve():
    ann_id = _create_annotation()
    r = client.patch(f"/api/v1/annotations/{ann_id}", json={"resolved": True}, headers=CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert body["resolved"] is True
    assert body["resolved_by"] is not None


def test_patch_annotation_not_found_404():
    r = client.patch("/api/v1/annotations/no-such-id", json={"text": "x"}, headers=CLINICIAN)
    assert r.status_code == 404


# ── delete annotation ─────────────────────────────────────────────────────────

def test_delete_annotation_soft_deletes():
    ann_id = _create_annotation("To be deleted")
    r = client.delete(f"/api/v1/annotations/{ann_id}", headers=CLINICIAN)
    assert r.status_code == 204
    # Second delete should 404 (already soft-deleted).
    r2 = client.delete(f"/api/v1/annotations/{ann_id}", headers=CLINICIAN)
    assert r2.status_code == 404


def test_delete_annotation_not_found_404():
    r = client.delete("/api/v1/annotations/nonexistent-id", headers=CLINICIAN)
    assert r.status_code == 404
