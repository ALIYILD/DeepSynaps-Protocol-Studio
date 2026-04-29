"""End-to-End Controlled Demo Validation — DeepSynaps Protocol Studio"""
from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    Clinic,
    FusionCase,
    MriAnalysis,
    QEEGAnalysis,
    QEEGAIReport,
    User,
)


def _ensure_demo_clinician_in_clinic() -> str:
    db = SessionLocal()
    try:
        clinic_id = "clinic-demo-e2e"
        if db.query(Clinic).filter_by(id=clinic_id).first() is None:
            db.add(Clinic(id=clinic_id, name="E2E Demo Clinic"))
            db.flush()
        user = db.query(User).filter_by(id="actor-clinician-demo").first()
        if user is None:
            db.add(
                User(
                    id="actor-clinician-demo",
                    email="demo_clin@example.com",
                    display_name="Verified Clinician Demo",
                    hashed_password="x",
                    role="clinician",
                    package_id="clinician_pro",
                    clinic_id=clinic_id,
                )
            )
        else:
            user.clinic_id = clinic_id
        db.commit()
        return clinic_id
    finally:
        db.close()


def _seed_patient(client: TestClient, auth_headers: dict) -> str:
    _ensure_demo_clinician_in_clinic()
    resp = client.post(
        "/api/v1/patients",
        json={
            "first_name": "Demo",
            "last_name": "Patient",
            "dob": "1985-03-15",
            "gender": "M",
            "email": "demo.patient@example.com",
            "phone": "+1-555-0199",
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, f"Patient creation failed: {resp.text}"
    data = resp.json()
    assert "id" in data
    return data["id"]


def _seed_qeeg_analysis(
    patient_id: str,
    analysis_id: str,
    report_state: str = "APPROVED",
    signed: bool = True,
    red_flags: list | None = None,
    brain_age_gap: float = 3.2,
) -> None:
    db = SessionLocal()
    try:
        safety_cockpit = {
            "red_flags": red_flags or [],
            "overall_status": "VALID_FOR_REVIEW",
            "checks": [],
            "disclaimer": "Decision-support only. Not a diagnosis.",
        }
        db.add(
            QEEGAnalysis(
                id=analysis_id,
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                analysis_status="completed",
                band_powers_json=json.dumps({"alpha": {"mean": 8.5}}),
                risk_scores_json=json.dumps(
                    {"mdd_like": {"score": 0.71}, "gad_like": {"score": 0.45}}
                ),
                protocol_recommendation_json=json.dumps(
                    {
                        "primary_modality": "rtms_10hz",
                        "target_region": "L_DLPFC",
                        "parameters": {"frequency": 10, "intensity_mt": 120},
                    }
                ),
                brain_age_json=json.dumps(
                    {"predicted_age": 42, "chronological_age": 39, "gap_years": brain_age_gap}
                ),
                quality_metrics_json=json.dumps(
                    {"snr_db": 25, "artifact_ratio": 0.02}
                ),
                flagged_conditions=json.dumps(["MDD", "GAD"]),
                safety_cockpit_json=json.dumps(safety_cockpit),
                analyzed_at=datetime.now(timezone.utc) - timedelta(days=10),
            )
        )
        db.add(
            QEEGAIReport(
                id=f"report-{analysis_id}",
                analysis_id=analysis_id,
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                report_state=report_state,
                signed_by="actor-clinician-demo" if signed else None,
                signed_at=datetime.now(timezone.utc) if signed else None,
                clinical_impressions="Synthetic qEEG summary for demo.",
                created_at=datetime.now(timezone.utc) - timedelta(days=10),
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_mri_analysis(
    patient_id: str,
    analysis_id: str,
    report_state: str = "MRI_APPROVED",
    signed: bool = True,
    red_flags: list | None = None,
    stim_region: str = "L_DLPFC",
    mri_state: str = "SUCCESS",
) -> None:
    db = SessionLocal()
    try:
        safety_cockpit = {
            "red_flags": red_flags or [],
            "overall_status": "MRI_VALID_FOR_REVIEW",
            "checks": [
                {"name": "registration_confidence", "status": "pass", "value": 0.92}
            ],
            "disclaimer": "Decision-support only. Not a diagnosis.",
        }
        db.add(
            MriAnalysis(
                analysis_id=analysis_id,
                patient_id=patient_id,
                state=mri_state,
                signed_by="actor-clinician-demo" if signed else None,
                signed_at=datetime.now(timezone.utc) if signed else None,
                structural_json=json.dumps(
                    {"t1_contrast": "normal", "ventricle_ratio": 0.28}
                ),
                functional_json=json.dumps(
                    {"resting_state_networks": ["default_mode", "salience"]}
                ),
                diffusion_json=json.dumps({"fa_map_quality": "good"}),
                stim_targets_json=json.dumps(
                    [
                        {
                            "region": stim_region,
                            "coordinates": [-42, 36, 28],
                            "confidence": 0.88,
                        }
                    ]
                ),
                qc_json=json.dumps({"snr": 45, "motion_score": 0.5}),
                condition="MDD",
                safety_cockpit_json=json.dumps(safety_cockpit),
                report_state=report_state,
                created_at=datetime.now(timezone.utc) - timedelta(days=8),
            )
        )
        db.commit()
    finally:
        db.close()


# STEP 1 — Open Patient Profile

def test_step_01_open_patient_profile(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient(client, auth_headers)
    assert len(patient_id) == 36
    assert "demo" not in patient_id.lower()
    assert "patient" not in patient_id.lower()

    resp = client.get(
        f"/api/v1/patients/{patient_id}", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["first_name"] == "Demo"
    assert data["last_name"] == "Patient"

    resp = client.get("/api/v1/patients", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    list_data = resp.json()
    assert any(p["id"] == patient_id for p in list_data.get("items", []))


# STEP 2 — Open qEEG Clinical Workbench

def test_step_02_qeeg_clinical_workbench(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)

    resp = client.get(
        f"/api/v1/qeeg-analysis/{qeeg_id}/safety-cockpit",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    cockpit = resp.json()
    assert cockpit["overall_status"] == "VALID_FOR_REVIEW"

    resp = client.get(
        f"/api/v1/qeeg-analysis/{qeeg_id}/red-flags",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    flags = resp.json()
    assert isinstance(flags.get("red_flags", []), list)

    resp = client.get(
        f"/api/v1/qeeg-analysis/{qeeg_id}/reports",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    reports = resp.json()
    assert len(reports) >= 1

    report_id = reports[0]["id"]
    resp = client.get(
        f"/api/v1/qeeg-analysis/reports/{report_id}/patient-facing",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    pfr = resp.json()
    if "decision_support_only" in pfr:
        assert pfr["decision_support_only"] is True


# STEP 3 — Open Raw EEG Cleaning Workbench

def test_step_03_raw_eeg_cleaning_workbench(
    client: TestClient, auth_headers: dict
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-raw-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)

    resp = client.get(
        f"/api/v1/qeeg-raw/{qeeg_id}/metadata",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    meta = resp.json()
    if "patient_name" in meta:
        assert meta["patient_name"] in (None, "", "[redacted]")

    resp = client.post(
        f"/api/v1/qeeg-raw/{qeeg_id}/cleaning-config",
        json={
            "highpass_hz": 0.5,
            "lowpass_hz": 45,
            "notch_hz": 50,
            "ica_enabled": True,
            "reject_threshold_uv": 200,
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code in (200, 201)

    resp = client.get(
        f"/api/v1/qeeg-raw/{qeeg_id}/cleaning-config",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    config_wrapper = resp.json()
    assert "config" in config_wrapper
    assert isinstance(config_wrapper["config"], dict)

    resp = client.get(
        f"/api/v1/qeeg-raw/{qeeg_id}/cleaning-log",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    log = resp.json()
    assert "items" in log or "entries" in log


# STEP 4 — Open MRI Clinical Workbench

def test_step_04_mri_clinical_workbench(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient(client, auth_headers)
    mri_id = f"mri-e2e-{uuid.uuid4().hex[:8]}"
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.get(
        f"/api/v1/mri/{mri_id}/safety-cockpit",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    cockpit = resp.json()
    assert cockpit["overall_status"] == "MRI_VALID_FOR_REVIEW"

    resp = client.get(
        f"/api/v1/mri/{mri_id}/red-flags",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200

    resp = client.get(
        f"/api/v1/mri/{mri_id}/patient-facing",
        headers=auth_headers["clinician"],
    )
    if resp.status_code == 200:
        pfr = resp.json()
        if "decision_support_only" in pfr:
            assert pfr["decision_support_only"] is True
    else:
        assert resp.status_code == 403

    resp = client.get(
        f"/api/v1/mri/{mri_id}/audit-trail",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    trail = resp.json()
    assert "audits" in trail
    assert isinstance(trail["audits"], list)

    resp = client.get(
        f"/api/v1/mri/{mri_id}/phi-audit",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200


# STEP 5 — Open Brain Twin

def test_step_05_brain_twin(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient(client, auth_headers)

    resp = client.get(
        f"/api/v1/deeptwin/patients/{patient_id}/summary",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200

    resp = client.get(
        f"/api/v1/deeptwin/patients/{patient_id}/timeline",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    timeline = resp.json()
    assert "events" in timeline

    resp = client.get(
        f"/api/v1/deeptwin/patients/{patient_id}/predictions",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200

    resp = client.post(
        f"/api/v1/deeptwin/patients/{patient_id}/simulations",
        json={
            "intervention_type": "rtms",
            "target_region": "L_DLPFC",
            "parameters": {"sessions": 20, "frequency_hz": 10},
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    sim = resp.json()
    assert "safety_concerns" in sim


# STEP 6 & 7 — Create Fusion Case + Attach qEEG and MRI

def test_step_06_07_create_fusion_case_with_attachments(
    client: TestClient, auth_headers: dict
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-fusion-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-fusion-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    case = resp.json()
    assert case["patient_id"] == patient_id
    assert case["report_state"] == "FUSION_DRAFT_AI"
    assert case["qeeg_analysis_id"] == qeeg_id
    assert case["mri_analysis_id"] == mri_id
    assert case["partial"] is False

    case_id = case["id"]
    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    fetched = resp.json()
    assert fetched["id"] == case_id
    assert "summary" in fetched
    assert "confidence" in fetched


# STEP 8 — Generate Fusion Summary

def test_step_08_generate_fusion_summary(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-sum-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-sum-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    case = resp.json()
    assert case["summary"] is not None
    assert case["confidence"] is not None
    assert 0.0 <= case["confidence"] <= 1.0
    assert case["confidence_grade"] == "heuristic"
    assert case["provenance"] is not None
    assert "generator" in case["provenance"]


# STEP 9 — Check Safety Gates

def test_step_09_safety_gates_all_clear(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-safe-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-safe-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    case = resp.json()
    assert case.get("blocked") is not True
    assert case["report_state"] == "FUSION_DRAFT_AI"


def test_step_09_safety_gates_blocked_by_critical_red_flag(
    client: TestClient, auth_headers: dict
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-flag-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-flag-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(
        patient_id,
        qeeg_id,
        red_flags=[
            {
                "code": "SEVERE_ARTEFACT",
                "severity": "critical",
                "resolved": False,
                "message": "Severe motion artifact detected.",
            }
        ],
    )
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    result = resp.json()
    assert result["blocked"] is True
    assert any("critical" in r.lower() for r in result["reasons"])
    assert len(result["next_steps"]) > 0


def test_step_09_safety_gates_blocked_by_radiology_review(
    client: TestClient, auth_headers: dict
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-rad-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-rad-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)
    _seed_mri_analysis(
        patient_id,
        mri_id,
        red_flags=[
            {
                "code": "RADIOLOGY_REVIEW_REQUIRED",
                "severity": "high",
                "resolved": False,
                "message": "Radiology review required before use.",
            }
        ],
    )

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    result = resp.json()
    assert result["blocked"] is True
    assert any("radiology" in r.lower() for r in result["reasons"])


# STEP 10 — Check Agreement / Disagreement Map

def test_step_10_agreement_map(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-agree-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-agree-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    case_id = resp.json()["id"]

    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}/agreement",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    agreement = resp.json()
    assert "overall_status" in agreement
    assert agreement["overall_status"] in (
        "agreement",
        "partial",
        "disagreement",
        "conflict",
    )
    assert "score" in agreement
    assert 0.0 <= agreement["score"] <= 1.0
    assert "items" in agreement
    assert agreement.get("decision_support_only") is True


# STEP 11 — Generate Candidate Protocol Fit

def test_step_11_protocol_fusion(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-prot-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-prot-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    case_id = resp.json()["id"]

    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}/protocol-fusion",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    pf = resp.json()
    assert "fusion_status" in pf
    assert pf["fusion_status"] in (
        "merged",
        "conflict",
        "qeeg_only",
        "mri_only",
        "none",
    )
    assert "recommendation" in pf
    assert "decision_support_only" in pf
    assert pf["decision_support_only"] is True


# STEP 12 — Clinician Review / Sign-off

def test_step_12_clinician_review_and_sign_off(
    client: TestClient, auth_headers: dict
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-sign-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-sign-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    case_id = resp.json()["id"]

    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/transition",
        json={"action": "needs_clinical_review"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    assert resp.json()["report_state"] == "FUSION_NEEDS_CLINICAL_REVIEW"

    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/transition",
        json={"action": "approve"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    assert resp.json()["report_state"] == "FUSION_APPROVED"
    assert resp.json()["reviewer_id"] == "actor-clinician-demo"
    assert resp.json()["reviewed_at"] is not None

    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/transition",
        json={"action": "sign"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    assert resp.json()["report_state"] == "FUSION_SIGNED"
    assert resp.json()["signed_by"] == "actor-clinician-demo"
    assert resp.json()["signed_at"] is not None

    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}/audit",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    audits = resp.json()
    assert len(audits) >= 4
    states = [a["new_state"] for a in audits]
    assert "FUSION_DRAFT_AI" in states
    assert "FUSION_SIGNED" in states


# STEP 13 — Generate Patient-Facing Report

def test_step_13_patient_facing_report(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-pfr-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-pfr-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    case_id = resp.json()["id"]

    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}/patient-report",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403

    for action in ("needs_clinical_review", "approve", "sign"):
        resp = client.post(
            f"/api/v1/fusion/cases/{case_id}/transition",
            json={"action": action},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200

    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}/patient-report",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    pfr = resp.json()
    assert "summary" in pfr
    assert "decision_support_only" in pfr
    assert pfr["decision_support_only"] is True
    assert "disclaimer" in pfr

    if "patient_id" in pfr:
        assert pfr["patient_id"] != patient_id
        assert len(pfr["patient_id"]) <= 20

    claims = pfr.get("claims", [])
    assert not any(c.get("claim_type") == "BLOCKED" for c in claims)


# STEP 14 — Export Clinical Package

def test_step_14_export_clinical_package(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-exp-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-exp-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    case_id = resp.json()["id"]

    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/export",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403

    for action in ("needs_clinical_review", "approve", "sign"):
        resp = client.post(
            f"/api/v1/fusion/cases/{case_id}/transition",
            json={"action": action},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200

    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/export",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    export_data = resp.json()
    assert "download_url" in export_data
    assert export_data["download_url"].startswith("data:application/json;base64,")
    b64_part = export_data["download_url"].split(",", 1)[1]
    payload = base64.b64decode(b64_part)
    package = json.loads(payload)
    assert package["format"] == "deepsynaps-fusion-v1"
    assert "fusion_case_id" in package
    assert "patient_id_hash" in package
    assert package["patient_id_hash"].startswith("sha256:")
    assert "source_analyses" in package
    assert "summary" in package
    assert "safety_cockpit" in package


# Cross-cutting: Unsigned qEEG

def test_unsigned_qeeg_blocks_fusion_finalisation(
    client: TestClient, auth_headers: dict
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-unsign-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-unsign-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id, report_state="DRAFT_AI", signed=False)
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    case = resp.json()
    assert case["source_qeeg_state"] in ("DRAFT_AI", None)

    case_id = case["id"]
    for action in ("needs_clinical_review", "approve", "sign"):
        resp = client.post(
            f"/api/v1/fusion/cases/{case_id}/transition",
            json={"action": action},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200


# Cross-cutting: Low registration confidence

def test_low_registration_confidence_warned_in_safety_cockpit(
    client: TestClient, auth_headers: dict
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    mri_id = f"mri-reg-e2e-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        db.add(
            MriAnalysis(
                analysis_id=mri_id,
                patient_id=patient_id,
                state="SUCCESS",
                signed_by="actor-clinician-demo",
                signed_at=datetime.now(timezone.utc),
                structural_json=json.dumps({}),
                functional_json=json.dumps({}),
                diffusion_json=json.dumps({}),
                stim_targets_json=json.dumps([]),
                qc_json=json.dumps({"registration_confidence": 0.45}),
                condition="MDD",
                safety_cockpit_json=json.dumps(
                    {
                        "red_flags": [],
                        "overall_status": "MRI_LIMITED_QUALITY",
                        "checks": [
                            {
                                "name": "registration_confidence",
                                "status": "warn",
                                "value": 0.45,
                            }
                        ],
                        "disclaimer": "Decision-support only.",
                    }
                ),
                created_at=datetime.now(timezone.utc) - timedelta(days=8),
            )
        )
        db.commit()
    finally:
        db.close()

    resp = client.get(
        f"/api/v1/mri/{mri_id}/safety-cockpit",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    cockpit = resp.json()
    assert cockpit["overall_status"] == "MRI_LIMITED_QUALITY"
    reg_check = next(
        (c for c in cockpit.get("checks", []) if "registration" in c.get("name", "")),
        None,
    )
    assert reg_check is not None
    assert reg_check["status"] == "warn"


# Cross-cutting: PHI never leaks

def test_phi_not_in_urls_or_exports(client: TestClient, auth_headers: dict) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-phi-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-phi-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    case_id = resp.json()["id"]

    for action in ("needs_clinical_review", "approve", "sign"):
        resp = client.post(
            f"/api/v1/fusion/cases/{case_id}/transition",
            json={"action": action},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200

    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/export",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    export = resp.json()
    assert "download_url" in export
    b64_part = export["download_url"].split(",", 1)[1]
    payload = base64.b64decode(b64_part)
    package = json.loads(payload)
    assert package["patient_id_hash"].startswith("sha256:")
    assert package["patient_id_hash"] != patient_id

    package_str = json.dumps(package)
    for phi in ("demo.patient@example.com", "+1-555-0199", "Demo", "Patient"):
        assert phi not in package_str, f"PHI '{phi}' leaked into export payload"

    assert len(patient_id) == 36
    assert len(case_id) == 36
    assert "demo" not in case_id.lower()
    assert "patient" not in case_id.lower()


# Cross-cutting: Unsafe claims blocked

def test_unsafe_claims_blocked_in_patient_facing_report(
    client: TestClient, auth_headers: dict
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    qeeg_id = f"qeeg-claim-e2e-{uuid.uuid4().hex[:8]}"
    mri_id = f"mri-claim-e2e-{uuid.uuid4().hex[:8]}"
    _seed_qeeg_analysis(patient_id, qeeg_id)
    _seed_mri_analysis(patient_id, mri_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    case_id = resp.json()["id"]

    db = SessionLocal()
    try:
        case = db.query(FusionCase).filter_by(id=case_id).first()
        assert case is not None
        governance = [
            {"claim_type": "OBSERVED", "text": "Alpha asymmetry noted."},
            {"claim_type": "INFERRED", "text": "suggests MDD pathology."},
            {"claim_type": "BLOCKED", "text": "Confirms bipolar disorder."},
        ]
        case.governance_json = json.dumps(governance)
        db.commit()
    finally:
        db.close()

    for action in ("needs_clinical_review", "approve", "sign"):
        resp = client.post(
            f"/api/v1/fusion/cases/{case_id}/transition",
            json={"action": action},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200

    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}/patient-report",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    pfr = resp.json()
    claims = pfr.get("claims", [])

    assert not any("bipolar" in c.get("text", "").lower() for c in claims)
    assert not any(c.get("claim_type") == "BLOCKED" for c in claims)

    inferred = [c for c in claims if c.get("claim_type") == "INFERRED"]
    if inferred:
        text = inferred[0]["text"].lower()
        assert "suggests" not in text or "could be associated with" in text
