"""MRI Clinical Workbench endpoints (migration 053).

Covers safety cockpit, red flags, claim governance, report state transitions,
sign-off, audit trail, patient-facing report, and export gating.
"""
from __future__ import annotations

import io
import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import MriAnalysis, MriReportAudit, MriReportFinding

def _do_upload(client: TestClient, auth_headers: dict) -> str:
    import io
    import struct
    import gzip
    header = bytearray(348)
    struct.pack_into("i", header, 0, 348)
    struct.pack_into("h", header, 40, 3)
    struct.pack_into("h", header, 42, 4)
    struct.pack_into("h", header, 44, 4)
    struct.pack_into("h", header, 46, 4)
    struct.pack_into("h", header, 48, 1)
    struct.pack_into("h", header, 50, 1)
    struct.pack_into("h", header, 52, 1)
    struct.pack_into("h", header, 54, 1)
    struct.pack_into("h", header, 70, 16)
    struct.pack_into("h", header, 72, 32)
    struct.pack_into("f", header, 76, 1.0)
    struct.pack_into("f", header, 80, 1.0)
    struct.pack_into("f", header, 84, 1.0)
    struct.pack_into("f", header, 88, 1.0)
    struct.pack_into("f", header, 108, 352.0)
    struct.pack_into("h", header, 252, 1)
    struct.pack_into("h", header, 254, 1)
    struct.pack_into("4f", header, 280, 1.0, 0.0, 0.0, 0.0)
    struct.pack_into("4f", header, 296, 0.0, 1.0, 0.0, 0.0)
    struct.pack_into("4f", header, 312, 0.0, 0.0, 1.0, 0.0)
    header[344:348] = b"n+1\x00"
    nifti = bytes(header) + bytes(4) + bytes(256)
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(nifti)
    valid_nifti_gz = buf.getvalue()
    files = {"file": ("scan.nii.gz", io.BytesIO(valid_nifti_gz), "application/gzip")}
    resp = client.post(
        "/api/v1/mri/upload",
        data={"patient_id": "pat-mri-1"},
        files=files,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["upload_id"]


@pytest.fixture
def analysis_id(client: TestClient, auth_headers: dict) -> str:
    """Upload + analyze in demo mode, return analysis_id."""
    upload_id = _do_upload(client, auth_headers)
    resp = client.post(
        "/api/v1/mri/analyze",
        data={"upload_id": upload_id, "patient_id": "pat-mri-1", "condition": "mdd"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["job_id"]


# ── Safety cockpit ───────────────────────────────────────────────────────────


def test_safety_cockpit_200(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    resp = client.get(
        f"/api/v1/mri/{analysis_id}/safety-cockpit",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "checks" in body
    assert "red_flags" in body
    assert "overall_status" in body
    assert "disclaimer" in body

    # Persisted to DB
    db = SessionLocal()
    try:
        row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
        assert row and row.safety_cockpit_json
    finally:
        db.close()


def test_red_flags_200(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    resp = client.get(
        f"/api/v1/mri/{analysis_id}/red-flags",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "flags" in body
    assert "flag_count" in body
    assert "high_severity_count" in body
    assert "disclaimer" in body


# ── Claim governance ─────────────────────────────────────────────────────────


def test_generate_claim_governance_200(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    resp = client.post(
        f"/api/v1/mri/{analysis_id}/claim-governance",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["analysis_id"] == analysis_id
    assert isinstance(body["findings"], list)

    # Persisted + MriReportFinding rows created
    db = SessionLocal()
    try:
        row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
        assert row and row.claim_governance_json
        findings = db.query(MriReportFinding).filter_by(analysis_id=analysis_id).all()
        assert len(findings) == len(body["findings"])
    finally:
        db.close()


def test_get_claim_governance_200(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    # generate first
    client.post(
        f"/api/v1/mri/{analysis_id}/claim-governance",
        headers=auth_headers["clinician"],
    )
    resp = client.get(
        f"/api/v1/mri/{analysis_id}/claim-governance",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["analysis_id"] == analysis_id
    assert isinstance(body["findings"], list)


# ── State transitions ────────────────────────────────────────────────────────


def test_transition_happy_path(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    # DRAFT_AI -> NEEDS_CLINICAL_REVIEW
    resp = client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_NEEDS_CLINICAL_REVIEW"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["report_state"] == "MRI_NEEDS_CLINICAL_REVIEW"

    # NEEDS_CLINICAL_REVIEW -> APPROVED
    resp = client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_APPROVED"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["report_state"] == "MRI_APPROVED"
    assert body["reviewer_id"]
    assert body["reviewed_at"]


def test_transition_invalid_blocked(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    # Can't go straight from DRAFT_AI to APPROVED
    resp = client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_APPROVED"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 409


def test_sign_requires_approved(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    # Not approved yet → 409
    resp = client.post(
        f"/api/v1/mri/{analysis_id}/sign",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 409

    # Approve
    client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_NEEDS_CLINICAL_REVIEW"},
        headers=auth_headers["clinician"],
    )
    client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_APPROVED"},
        headers=auth_headers["clinician"],
    )

    # Now sign works
    resp = client.post(
        f"/api/v1/mri/{analysis_id}/sign",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["signed_by"]
    assert body["signed_at"]


# ── Audit trail ──────────────────────────────────────────────────────────────


def test_audit_trail_records_transitions(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_NEEDS_CLINICAL_REVIEW"},
        headers=auth_headers["clinician"],
    )
    client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_APPROVED"},
        headers=auth_headers["clinician"],
    )

    resp = client.get(
        f"/api/v1/mri/{analysis_id}/audit-trail",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["analysis_id"] == analysis_id
    assert len(body["audits"]) >= 2
    actions = {a["action"] for a in body["audits"]}
    assert "transition" in actions


# ── Patient-facing report ────────────────────────────────────────────────────


def test_patient_facing_gated_before_approval(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    resp = client.get(
        f"/api/v1/mri/{analysis_id}/patient-facing",
        headers=auth_headers["clinician"],
    )
    # DRAFT_AI state → forbidden
    assert resp.status_code == 403


def test_patient_facing_returns_after_approval(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    # Approve
    client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_NEEDS_CLINICAL_REVIEW"},
        headers=auth_headers["clinician"],
    )
    client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_APPROVED"},
        headers=auth_headers["clinician"],
    )

    resp = client.get(
        f"/api/v1/mri/{analysis_id}/patient-facing",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "disclaimer" in body


# ── Export gating ────────────────────────────────────────────────────────────


def test_export_denied_before_sign_off(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    # Approve but don't sign
    client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_NEEDS_CLINICAL_REVIEW"},
        headers=auth_headers["clinician"],
    )
    client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_APPROVED"},
        headers=auth_headers["clinician"],
    )

    resp = client.post(
        f"/api/v1/mri/{analysis_id}/export",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403


def test_export_succeeds_after_sign_off(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    # Approve + sign
    client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_NEEDS_CLINICAL_REVIEW"},
        headers=auth_headers["clinician"],
    )
    client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_APPROVED"},
        headers=auth_headers["clinician"],
    )
    client.post(
        f"/api/v1/mri/{analysis_id}/sign",
        headers=auth_headers["clinician"],
    )

    resp = client.post(
        f"/api/v1/mri/{analysis_id}/export",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/zip"


# ── Cross-clinic guard ───────────────────────────────────────────────────────


def test_safety_cockpit_404_for_other_clinic(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    # Guest token belongs to a different clinic
    resp = client.get(
        f"/api/v1/mri/{analysis_id}/safety-cockpit",
        headers=auth_headers["guest"],
    )
    assert resp.status_code == 403
