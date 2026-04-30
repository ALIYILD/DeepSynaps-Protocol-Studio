"""MRI Clinical Workbench endpoints (migration 053).

Covers safety cockpit, red flags, claim governance, report state transitions,
sign-off, audit trail, patient-facing report, and export gating.
"""
from __future__ import annotations

import io
import json
import zipfile
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


# ── Registration QA ──────────────────────────────────────────────────────────


def test_registration_qa_200(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    resp = client.get(
        f"/api/v1/mri/{analysis_id}/registration-qa",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "registration_status" in body
    assert "registration_confidence" in body
    assert "coordinate_uncertainty_mm" in body
    assert "segmentation_quality" in body
    assert "atlas_overlap_confidence" in body
    assert "target_finalisation_allowed" in body
    assert "target_finalisation_blocked_reasons" in body
    assert "disclaimer" in body


def test_registration_qa_blocks_low_confidence(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    # Seed low-confidence registration data
    db = SessionLocal()
    try:
        row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
        row.structural_json = json.dumps({
            "registration": {
                "status": "ok",
                "confidence": "low",
                "template_space": "MNI152",
                "uncertainty_mm": 5.0,
                "atlas_overlap_dice": 0.55,
            },
            "segmentation_method": "synthseg",
            "brain_extraction": "done",
        })
        row.qc_json = json.dumps({
            "segmentation_failed_regions": ["frontal"],
        })
        db.commit()
    finally:
        db.close()

    resp = client.get(
        f"/api/v1/mri/{analysis_id}/registration-qa",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["target_finalisation_allowed"] is False
    assert any("low" in r.lower() for r in body["target_finalisation_blocked_reasons"])


# ── PHI Audit ────────────────────────────────────────────────────────────────


def test_phi_audit_200(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    resp = client.get(
        f"/api/v1/mri/{analysis_id}/phi-audit",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "risk_level" in body
    assert "dicom_tag_scan" in body
    assert "burned_in_annotation_warning" in body
    assert "export_filename" in body
    assert "process_log" in body
    assert "disclaimer" in body
    assert body["dicom_tag_scan"]["removed_categories"]
    assert body["dicom_tag_scan"]["retained_categories"]


def test_phi_audit_high_risk_for_phi_filename(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    db = SessionLocal()
    try:
        row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
        row.upload_ref = json.dumps({"filename": "patient_john_doe_dob_1990.zip"})
        db.commit()
    finally:
        db.close()

    resp = client.get(
        f"/api/v1/mri/{analysis_id}/phi-audit",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["risk_level"] == "high"
    assert body["filename_heuristic"]["potential_phi_in_filename"] is True


# ── BIDS export package contents ─────────────────────────────────────────────


def test_bids_export_contains_required_files(
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
        f"/api/v1/mri/{analysis_id}/export-bids",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/zip"

    buf = io.BytesIO(resp.content)
    with zipfile.ZipFile(buf, "r") as zf:
        names = zf.namelist()
        assert "dataset_description.json" in names
        assert "participants.tsv" in names
        assert "participants.json" in names
        # Sidecar + metadata in anat/
        assert any("_T1w.json" in n for n in names)
        assert any("_desc-scan_metadata.json" in n for n in names)
        # Derivatives
        assert any("desc-deidentification_log.json" in n for n in names)
        assert any("desc-qc_report.json" in n for n in names)
        assert any("desc-atlas_model_card.json" in n for n in names)
        assert any("desc-target_plan.json" in n for n in names)
        assert any("desc-ai_report.json" in n for n in names)
        assert any("desc-clinician_review.json" in n for n in names)
        assert any("desc-audit_trail.json" in n for n in names)
        assert any("desc-audit_trail.tsv" in n for n in names)

        # Verify de-identification log disclaimer is present
        deid = json.loads(zf.read([n for n in names if "desc-deidentification_log.json" in n][0]))
        assert deid["phi_scrubbed"] is True
        assert "disclaimer" in deid
        assert "best-effort" in deid["disclaimer"].lower()


# ── Radiology review blocks export ───────────────────────────────────────────


def test_radiology_review_blocks_approval(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    db = SessionLocal()
    try:
        row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
        row.safety_cockpit_json = json.dumps({
            "checks": [],
            "red_flags": [
                {"code": "RADIOLOGY_REVIEW_REQUIRED", "severity": "high", "message": "Incidental finding"}
            ],
            "overall_status": "MRI_RADIOLOGY_REVIEW_REQUIRED",
        })
        db.commit()
    finally:
        db.close()

    # Transition to NEEDS_CLINICAL_REVIEW first
    client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_NEEDS_CLINICAL_REVIEW"},
        headers=auth_headers["clinician"],
    )

    # APPROVE should be blocked
    resp = client.post(
        f"/api/v1/mri/{analysis_id}/transition",
        json={"action": "MRI_APPROVED"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 409
    assert "radiology" in resp.json()["message"].lower()


def test_radiology_review_blocks_export_even_if_approved(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    db = SessionLocal()
    try:
        row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
        row.report_state = "MRI_APPROVED"
        row.signed_by = "dr.smith"
        row.signed_at = datetime.now(timezone.utc)
        row.safety_cockpit_json = json.dumps({
            "checks": [],
            "red_flags": [
                {"code": "RADIOLOGY_REVIEW_REQUIRED", "severity": "high", "message": "Incidental finding", "resolved": False}
            ],
            "overall_status": "MRI_RADIOLOGY_REVIEW_REQUIRED",
            "disclaimer": "Decision-support only.",
        })
        db.commit()
    finally:
        db.close()

    # Frontend export gate should block
    resp = client.get(
        f"/api/v1/mri/{analysis_id}/safety-cockpit",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert any(f["code"] == "RADIOLOGY_REVIEW_REQUIRED" for f in body["red_flags"])


# ── Unsafe claim blocking ────────────────────────────────────────────────────


def test_blocked_claims_in_patient_facing_report(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    db = SessionLocal()
    try:
        row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
        row.claim_governance_json = json.dumps([
            {"section": "findings", "claim_type": "BLOCKED", "text": "MRI confirms dementia", "block_reason": "Diagnostic claim blocked"},
            {"section": "findings", "claim_type": "OBSERVED", "text": "Hippocampal volume is reduced", "block_reason": None},
        ])
        row.patient_facing_report_json = json.dumps({
            "text": "Your MRI shows some structural differences. This is decision-support only.",
        })
        row.report_state = "MRI_APPROVED"
        db.commit()
    finally:
        db.close()

    # Patient-facing should not contain blocked claim
    resp = client.get(
        f"/api/v1/mri/{analysis_id}/patient-facing",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    text = json.dumps(body)
    assert "confirms dementia" not in text
    assert "decision-support" in text.lower() or "disclaimer" in text.lower()


# ── BIDS export vs /export endpoint consistency ──────────────────────────────


def test_export_endpoint_and_bids_endpoint_are_consistent(
    client: TestClient,
    auth_headers: dict,
    analysis_id: str,
) -> None:
    # Approve + sign
    for action in ("MRI_NEEDS_CLINICAL_REVIEW", "MRI_APPROVED"):
        client.post(
            f"/api/v1/mri/{analysis_id}/transition",
            json={"action": action},
            headers=auth_headers["clinician"],
        )
    client.post(
        f"/api/v1/mri/{analysis_id}/sign",
        headers=auth_headers["clinician"],
    )

    bids_resp = client.post(
        f"/api/v1/mri/{analysis_id}/export-bids",
        headers=auth_headers["clinician"],
    )
    export_resp = client.post(
        f"/api/v1/mri/{analysis_id}/export",
        headers=auth_headers["clinician"],
    )
    assert bids_resp.status_code == 200
    assert export_resp.status_code == 200
    assert bids_resp.headers["content-type"] == "application/zip"
    assert export_resp.headers["content-type"] == "application/zip"
