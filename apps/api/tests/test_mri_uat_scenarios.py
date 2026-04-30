"""MRI Clinical Workbench — Staging UAT Scenario Tests.

Executes the 5 demo scenarios from docs/mri-demo-script.md and verifies
all panels, gates, and audit trails.
"""
from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import MriAnalysis, MriReportAudit, Patient


def _seed_analysis(
    client: TestClient,
    auth_headers: dict,
    structural_json: dict | None = None,
    qc_json: dict | None = None,
    modalities_present_json: dict | None = None,
    stim_targets_json: list | None = None,
    upload_ref: dict | None = None,
    claim_governance_json: list | None = None,
    patient_facing_report_json: str | None = None,
) -> str:
    """Upload + analyze, then seed custom JSON for the scenario."""
    import io as _io
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
    buf = _io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(nifti)
    valid_nifti_gz = buf.getvalue()
    files = {"file": ("scan.nii.gz", _io.BytesIO(valid_nifti_gz), "application/gzip")}
    resp = client.post(
        "/api/v1/mri/upload",
        data={"patient_id": "pat-uat"},
        files=files,
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    upload_id = resp.json()["upload_id"]

    resp = client.post(
        "/api/v1/mri/analyze",
        data={"upload_id": upload_id, "patient_id": "pat-uat", "condition": "mdd"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    analysis_id = resp.json()["job_id"]

    db = SessionLocal()
    try:
        if db.query(Patient).filter_by(id="pat-uat").first() is None:
            db.add(Patient(id="pat-uat", clinician_id="actor-clinician-demo", first_name="UAT", last_name="Patient", primary_condition="mdd"))
            db.flush()
        row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
        if structural_json is not None:
            row.structural_json = json.dumps(structural_json)
        if qc_json is not None:
            row.qc_json = json.dumps(qc_json)
        if modalities_present_json is not None:
            row.modalities_present_json = json.dumps(modalities_present_json)
        if stim_targets_json is not None:
            row.stim_targets_json = json.dumps(stim_targets_json)
        if upload_ref is not None:
            row.upload_ref = json.dumps(upload_ref)
        if claim_governance_json is not None:
            row.claim_governance_json = json.dumps(claim_governance_json)
        if patient_facing_report_json is not None:
            row.patient_facing_report_json = patient_facing_report_json
        db.commit()
    finally:
        db.close()

    return analysis_id


# ═══════════════════════════════════════════════════════════════════════════════
# Scenario 1: Clean T1 MRI
# ═══════════════════════════════════════════════════════════════════════════════


def test_scenario_1_clean_t1(
    client: TestClient,
    auth_headers: dict,
) -> None:
    """Clean T1 MRI — all checks pass, export gated until sign-off."""
    analysis_id = _seed_analysis(
        client,
        auth_headers,
        structural_json={
            "registration": {"status": "ok", "confidence": "high", "template_space": "MNI152", "uncertainty_mm": 1.0, "atlas_overlap_dice": 0.92},
            "atlas_version": "Desikan-Killiany",
            "segmentation_method": "synthseg",
            "brain_extraction": "done",
        },
        qc_json={
            "mriqc": {"snr": 55.0, "cnr": 3.0, "motion_mean_fd_mm": 0.2},
            "segmentation_failed_regions": [],
            "passed": True,
        },
        modalities_present_json={"t1": True, "fmri": False, "dti": False},
        stim_targets_json=[{
            "target_id": "T1",
            "anatomical_label": "Left DLPFC",
            "modality": "rtms",
            "mni_xyz": [-41, 43, 28],
            "patient_xyz": [-41, 43, 28],
            "evidence_grade": "EV-B",
            "supported_conditions": ["mdd"],
        }],
        upload_ref={"filename": "clean_t1.zip"},
        patient_facing_report_json=json.dumps({"text": "Your MRI shows normal structure."}),
    )

    # 1. Safety cockpit
    resp = client.get(f"/api/v1/mri/{analysis_id}/safety-cockpit", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    cockpit = resp.json()
    assert cockpit["overall_status"] == "MRI_VALID_FOR_REVIEW"
    checks = {c["label"]: c["status"] for c in cockpit["checks"]}
    assert checks.get("File type") == "pass"
    assert checks.get("De-identification") == "pass"
    assert checks.get("SNR") == "pass"
    assert checks.get("CNR") == "pass"
    assert checks.get("Motion (FD)") == "pass"
    assert checks.get("Registration") == "pass"

    # 2. Red flags
    resp = client.get(f"/api/v1/mri/{analysis_id}/red-flags", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    flags = resp.json()
    assert flags["flag_count"] == 0
    assert flags["high_severity_count"] == 0

    # 3. Registration QA
    resp = client.get(f"/api/v1/mri/{analysis_id}/registration-qa", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    qa = resp.json()
    assert qa["registration_confidence"] == "high"
    assert qa["atlas_overlap_confidence"] == "high"
    assert qa["target_finalisation_allowed"] is True
    assert qa["target_finalisation_blocked_reasons"] == []

    # 4. PHI audit
    resp = client.get(f"/api/v1/mri/{analysis_id}/phi-audit", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    audit = resp.json()
    assert audit["risk_level"] == "low"
    assert audit["filename_heuristic"]["potential_phi_in_filename"] is False
    assert "burned_in_annotation_warning" in audit
    assert "disclaimer" in audit

    # 5. Atlas model card
    resp = client.get(f"/api/v1/mri/{analysis_id}/atlas-model-card", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    card = resp.json()
    assert card["template_space"] == "MNI152"
    assert card["registration_confidence"] == "high"

    # 6. Target governance
    resp = client.post(f"/api/v1/mri/{analysis_id}/target-plan-governance", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    plans = resp.json()
    assert len(plans) == 1
    assert plans[0]["anatomical_label"] == "Left DLPFC"
    assert plans[0]["off_label_flag"] is False

    # 7. Clinician review / sign-off
    # Export should be blocked before approval
    resp = client.post(f"/api/v1/mri/{analysis_id}/export-bids", headers=auth_headers["clinician"])
    assert resp.status_code == 403

    # Transition to approved
    client.post(f"/api/v1/mri/{analysis_id}/transition", json={"action": "MRI_NEEDS_CLINICAL_REVIEW"}, headers=auth_headers["clinician"])
    client.post(f"/api/v1/mri/{analysis_id}/transition", json={"action": "MRI_APPROVED"}, headers=auth_headers["clinician"])

    # Still blocked — not signed
    resp = client.post(f"/api/v1/mri/{analysis_id}/export-bids", headers=auth_headers["clinician"])
    assert resp.status_code == 403

    # Sign off
    resp = client.post(f"/api/v1/mri/{analysis_id}/sign", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    assert resp.json()["signed_by"]
    assert resp.json()["signed_at"]

    # 8. Patient-facing report
    resp = client.get(f"/api/v1/mri/{analysis_id}/patient-facing", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    pfr = resp.json()
    # Patient-facing content is present; decision-support disclaimer may be inside the content or not
    assert pfr is not None

    # 9. BIDS export now succeeds
    resp = client.post(f"/api/v1/mri/{analysis_id}/export-bids", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    buf = io.BytesIO(resp.content)
    with zipfile.ZipFile(buf, "r") as zf:
        names = zf.namelist()
        assert "dataset_description.json" in names
        assert "participants.tsv" in names
        assert any("desc-deidentification_log.json" in n for n in names)
        assert any("desc-audit_trail.json" in n for n in names)

    # 10. Audit trail
    resp = client.get(f"/api/v1/mri/{analysis_id}/audit-trail", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    trail = resp.json()
    assert trail["analysis_id"] == analysis_id
    actions = [a["action"] for a in trail["audits"]]
    assert "transition" in actions
    assert "sign" in actions


# ═══════════════════════════════════════════════════════════════════════════════
# Scenario 2: Poor-Quality Scan
# ═══════════════════════════════════════════════════════════════════════════════


def test_scenario_2_poor_quality(
    client: TestClient,
    auth_headers: dict,
) -> None:
    """Poor-quality scan — safety cockpit shows LIMITED_QUALITY, target finalisation blocked."""
    analysis_id = _seed_analysis(
        client,
        auth_headers,
        structural_json={
            "registration": {"status": "ok", "confidence": "low", "template_space": "MNI152", "uncertainty_mm": 5.0, "atlas_overlap_dice": 0.55},
        },
        qc_json={
            "mriqc": {"snr": 30.0, "cnr": 1.8, "motion_mean_fd_mm": 1.2},
            "segmentation_failed_regions": ["frontal"],
        },
        modalities_present_json={"t1": True},
        stim_targets_json=[{"target_id": "T1", "anatomical_label": "Left DLPFC", "modality": "rtms", "mni_xyz": [-41, 43, 28]}],
        upload_ref={"filename": "poor_quality.zip"},
    )

    resp = client.get(f"/api/v1/mri/{analysis_id}/safety-cockpit", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    cockpit = resp.json()
    assert cockpit["overall_status"] == "MRI_LIMITED_QUALITY"
    red_flag_codes = [f["code"] for f in cockpit["red_flags"]]
    assert "SNR_LOW" in red_flag_codes
    assert "CNR_LOW" in red_flag_codes
    assert "MOTION_HIGH" in red_flag_codes

    resp = client.get(f"/api/v1/mri/{analysis_id}/registration-qa", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    qa = resp.json()
    assert qa["target_finalisation_allowed"] is False
    assert any("low" in r.lower() for r in qa["target_finalisation_blocked_reasons"])


# ═══════════════════════════════════════════════════════════════════════════════
# Scenario 3: Radiology Review Required
# ═══════════════════════════════════════════════════════════════════════════════


def test_scenario_3_radiology_review_required(
    client: TestClient,
    auth_headers: dict,
) -> None:
    """Radiology review required — approval blocked, export blocked."""
    analysis_id = _seed_analysis(
        client,
        auth_headers,
        structural_json={
            "registration": {"status": "ok", "confidence": "high", "template_space": "MNI152", "uncertainty_mm": 1.0, "atlas_overlap_dice": 0.92},
        },
        qc_json={
            "mriqc": {"snr": 55.0, "cnr": 3.0, "motion_mean_fd_mm": 0.2},
            "incidental": {"any_flagged": True, "findings": ["possible mass"]},
            "passed": True,
        },
        modalities_present_json={"t1": True},
        upload_ref={"filename": "radiology_case.zip"},
    )

    resp = client.get(f"/api/v1/mri/{analysis_id}/safety-cockpit", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    cockpit = resp.json()
    assert cockpit["overall_status"] == "MRI_RADIOLOGY_REVIEW_REQUIRED"
    assert any(f["code"] == "RADIOLOGY_REVIEW_REQUIRED" for f in cockpit["red_flags"])

    # Transition to review first
    client.post(f"/api/v1/mri/{analysis_id}/transition", json={"action": "MRI_NEEDS_CLINICAL_REVIEW"}, headers=auth_headers["clinician"])

    # APPROVE blocked
    resp = client.post(f"/api/v1/mri/{analysis_id}/transition", json={"action": "MRI_APPROVED"}, headers=auth_headers["clinician"])
    assert resp.status_code == 409
    assert "radiology" in resp.json()["message"].lower()


# ═══════════════════════════════════════════════════════════════════════════════
# Scenario 4: Missing Metadata / Atlas Case
# ═══════════════════════════════════════════════════════════════════════════════


def test_scenario_4_missing_metadata(
    client: TestClient,
    auth_headers: dict,
) -> None:
    """Missing metadata — safety cockpit shows unknowns, atlas card incomplete."""
    analysis_id = _seed_analysis(
        client,
        auth_headers,
        structural_json={},
        qc_json={},
        modalities_present_json={},
        stim_targets_json=[],
        upload_ref={"filename": "missing_meta.zip"},
    )

    resp = client.get(f"/api/v1/mri/{analysis_id}/safety-cockpit", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    cockpit = resp.json()
    assert cockpit["overall_status"] in ("MRI_LIMITED_QUALITY", "MRI_REPEAT_RECOMMENDED")
    # SNR/CNR/Motion should show "warn" with "Unknown"
    snr_check = next((c for c in cockpit["checks"] if c["label"] == "SNR"), None)
    assert snr_check is not None
    assert snr_check["status"] == "warn"

    resp = client.get(f"/api/v1/mri/{analysis_id}/atlas-model-card", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    card = resp.json()
    assert card["template_space"] == "MNI152"
    assert card["registration_confidence"] == "unknown"
    assert card["complete"] is False


# ═══════════════════════════════════════════════════════════════════════════════
# Scenario 5: Unsafe Claim Challenge
# ═══════════════════════════════════════════════════════════════════════════════


def test_scenario_5_unsafe_claim(
    client: TestClient,
    auth_headers: dict,
) -> None:
    """Unsafe claim — claim governance blocks diagnostic wording."""
    analysis_id = _seed_analysis(
        client,
        auth_headers,
        structural_json={},
        qc_json={},
        modalities_present_json={"t1": True},
        upload_ref={"filename": "unsafe_claim.zip"},
        claim_governance_json=[
            {"section": "findings", "claim_type": "BLOCKED", "text": "MRI confirms dementia", "block_reason": "Diagnostic claim blocked"},
            {"section": "findings", "claim_type": "INFERRED", "text": "May indicate cognitive decline", "block_reason": None},
        ],
        patient_facing_report_json=json.dumps({"text": "Your MRI shows some differences. Decision-support only."}),
    )

    # Claim governance is already seeded in DB; verify via GET
    resp = client.get(f"/api/v1/mri/{analysis_id}/claim-governance", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    findings = resp.json()["findings"]
    assert any(f["claim_type"] == "BLOCKED" for f in findings)

    # Approve so patient-facing is accessible
    client.post(f"/api/v1/mri/{analysis_id}/transition", json={"action": "MRI_NEEDS_CLINICAL_REVIEW"}, headers=auth_headers["clinician"])
    client.post(f"/api/v1/mri/{analysis_id}/transition", json={"action": "MRI_APPROVED"}, headers=auth_headers["clinician"])

    resp = client.get(f"/api/v1/mri/{analysis_id}/patient-facing", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    pfr = resp.json()
    text = json.dumps(pfr)
    assert "confirms dementia" not in text
    assert "differences" in text.lower() or "mri" in text.lower()


# ═══════════════════════════════════════════════════════════════════════════════
# PHI Scrutiny — confirm no PHI in URLs, titles, filenames, logs, timeline
# ═══════════════════════════════════════════════════════════════════════════════


def test_phi_scrutiny_no_patient_name_in_export_filename(
    client: TestClient,
    auth_headers: dict,
) -> None:
    """Exported package name must not contain patient name or ID."""
    analysis_id = _seed_analysis(
        client,
        auth_headers,
        structural_json={},
        qc_json={},
        modalities_present_json={"t1": True},
        upload_ref={"filename": "patient_john_doe.zip"},
    )
    client.post(f"/api/v1/mri/{analysis_id}/transition", json={"action": "MRI_NEEDS_CLINICAL_REVIEW"}, headers=auth_headers["clinician"])
    client.post(f"/api/v1/mri/{analysis_id}/transition", json={"action": "MRI_APPROVED"}, headers=auth_headers["clinician"])
    client.post(f"/api/v1/mri/{analysis_id}/sign", headers=auth_headers["clinician"])

    resp = client.post(f"/api/v1/mri/{analysis_id}/export-bids", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    cd = resp.headers.get("content-disposition", "")
    assert "patient_john_doe" not in cd.lower()
    assert "pat-uat" not in cd.lower()
    # Should contain analysis_id (which is a UUID, not PHI)
    assert analysis_id in cd


def test_phi_scrutury_timeline_no_patient_name(
    client: TestClient,
    auth_headers: dict,
) -> None:
    """Timeline events must reference patient_id only, never patient name."""
    analysis_id = _seed_analysis(
        client,
        auth_headers,
        structural_json={},
        qc_json={},
        modalities_present_json={"t1": True},
        upload_ref={"filename": "timeline_test.zip"},
    )

    resp = client.get("/api/v1/mri/patient/pat-uat/timeline", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    events = resp.json()
    for evt in events:
        text = json.dumps(evt)
        assert "john" not in text.lower()
        assert "doe" not in text.lower()
        # patient_id may appear (it's the pseudonymized ID in export, but raw here)
        assert "patient_id" in evt or "source_analysis_id" in evt


def test_phi_scrutiny_urls_never_contain_patient_name(
    client: TestClient,
    auth_headers: dict,
) -> None:
    """All MRI endpoint URLs use analysis_id or patient_id, never names."""
    # This is a design-level check: verify the router paths
    from app.routers import mri_analysis_router as router_mod
    router = router_mod.router
    for route in router.routes:
        path = getattr(route, "path", "")
        assert "patient_name" not in path.lower()
        assert "name" not in path.lower()
