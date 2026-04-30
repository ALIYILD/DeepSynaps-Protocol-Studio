from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import Clinic, MriAnalysis, QEEGAnalysis, User


def _ensure_demo_clinician_in_clinic() -> None:
    """Create a Clinic + a User row keyed on the demo clinician's actor_id so
    that the cross-clinic ownership gate (added in the audit) sees a real
    clinic_id when the demo `clinician-demo-token` is used. Idempotent."""
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id="actor-clinician-demo").first()
        if existing is not None and existing.clinic_id:
            return
        clinic_id = "clinic-fusion-demo"
        if db.query(Clinic).filter_by(id=clinic_id).first() is None:
            db.add(Clinic(id=clinic_id, name="Fusion Demo Clinic"))
            db.flush()
        if existing is None:
            db.add(
                User(
                    id="actor-clinician-demo",
                    email=f"demo_clin_{uuid.uuid4().hex[:6]}@example.com",
                    display_name="Verified Clinician Demo",
                    hashed_password="x",
                    role="clinician",
                    package_id="clinician_pro",
                    clinic_id=clinic_id,
                )
            )
        else:
            existing.clinic_id = clinic_id
        db.commit()
    finally:
        db.close()


def _seed_patient(client: TestClient, auth_headers: dict[str, dict[str, str]]) -> str:
    _ensure_demo_clinician_in_clinic()
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "Fusion", "last_name": "Test", "dob": "1988-08-08", "gender": "F"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_fusion_recommendation_combines_latest_qeeg_and_mri(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)

    db = SessionLocal()
    try:
        db.add(
            QEEGAnalysis(
                id="qeeg-fusion-1",
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                analysis_status="completed",
                risk_scores_json=json.dumps({"mdd_like": {"score": 0.71}}),
                protocol_recommendation_json=json.dumps(
                    {"primary_modality": "rtms_10hz", "target_region": "L_DLPFC"}
                ),
                analyzed_at=datetime.now(timezone.utc),
            )
        )
        db.add(
            MriAnalysis(
                analysis_id="mri-fusion-1",
                patient_id=patient_id,
                state="SUCCESS",
                stim_targets_json=json.dumps(
                    [{"target_id": "t1", "region_name": "Left DLPFC", "modality": "rtms", "confidence": "high"}]
                ),
                functional_json=json.dumps({"sgACC_DLPFC_anticorrelation": {"z": -2.6}}),
            )
        )
        db.commit()
    finally:
        db.close()

    resp = client.post(
        f"/api/v1/fusion/recommend/{patient_id}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["patient_id"] == patient_id
    assert body["qeeg_analysis_id"] == "qeeg-fusion-1"
    assert body["mri_analysis_id"] == "mri-fusion-1"
    assert body["recommendations"]
    assert body["confidence"] >= 0.5
    assert "Dual-modality fusion available" in body["summary"]
    assert body["confidence_disclaimer"]
    assert "heuristic" in body["confidence_disclaimer"]
    assert body["confidence_grade"] == "heuristic"
    assert body["modality_agreement"]["status"] == "multimodal_available"
    assert "limitations" in body and body["limitations"]


def test_fusion_recommendation_fails_soft_for_single_modality(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)

    db = SessionLocal()
    try:
        db.add(
            QEEGAnalysis(
                id="qeeg-only-1",
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                analysis_status="completed",
                protocol_recommendation_json=json.dumps({"primary_modality": "iTBS"}),
                analyzed_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
    finally:
        db.close()

    resp = client.post(
        f"/api/v1/fusion/recommend/{patient_id}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["qeeg_analysis_id"] == "qeeg-only-1"
    assert body["mri_analysis_id"] is None
    assert body["partial"] is True
    assert "Partial fusion available" in body["summary"]
    assert any("Add MRI" in item or "missing" in item for item in body["recommendations"])
    assert body["confidence_disclaimer"]
    assert body["confidence_grade"] == "heuristic"
    assert "MRI" in body["missing_modalities"]


def test_fusion_recommendation_returns_empty_state_when_no_modalities_exist(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)

    resp = client.post(
        f"/api/v1/fusion/recommend/{patient_id}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["qeeg_analysis_id"] is None
    assert body["mri_analysis_id"] is None
    assert body["partial"] is True
    assert "No completed qEEG or MRI analyses are available" in body["summary"]
    assert body["confidence_disclaimer"]
    assert body["confidence_grade"] == "heuristic"


def test_qeeg_sse_stream_emits_progress_snapshot(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)

    db = SessionLocal()
    try:
        db.add(
            QEEGAnalysis(
                id="qeeg-sse-1",
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                analysis_status="processing:parsing",
            )
        )
        db.commit()
    finally:
        db.close()

    with client.stream(
        "GET",
        "/api/v1/qeeg-analysis/qeeg-sse-1/events",
        headers=auth_headers["clinician"],
    ) as resp:
        assert resp.status_code == 200
        first_chunk = next(resp.iter_text())
    assert "event: progress" in first_chunk
    assert '"analysis_id": "qeeg-sse-1"' in first_chunk
    assert '"step": "parsing"' in first_chunk


def test_fusion_recommendation_forbids_guest_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)

    resp = client.post(
        f"/api/v1/fusion/recommend/{patient_id}",
        headers=auth_headers["guest"],
    )
    assert resp.status_code == 403, resp.text


def test_mri_sse_stream_emits_terminal_snapshot(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)

    db = SessionLocal()
    try:
        db.add(
            MriAnalysis(
                analysis_id="mri-sse-1",
                patient_id=patient_id,
                job_id="mri-sse-1",
                state="SUCCESS",
            )
        )
        db.commit()
    finally:
        db.close()

    with client.stream(
        "GET",
        "/api/v1/mri/status/mri-sse-1/events",
        headers=auth_headers["clinician"],
    ) as resp:
        assert resp.status_code == 200
        first_chunk = next(resp.iter_text())
    assert "event: complete" in first_chunk
    assert '"analysis_id": "mri-sse-1"' in first_chunk
    assert '"state": "SUCCESS"' in first_chunk


# ── Fusion Workbench endpoints (Migration 054) ───────────────────────────────

from app.persistence.models import FusionCase, FusionCaseAudit


def _seed_qeeg_and_mri(
    patient_id: str,
    qeeg_state: str = "completed",
    mri_state: str = "SUCCESS",
    qeeg_safety: dict | None = None,
    mri_safety: dict | None = None,
    qeeg_report_state: str | None = None,
    mri_report_state: str | None = "MRI_APPROVED",
) -> tuple[str, str]:
    """Create QEEGAnalysis + MriAnalysis rows directly. Returns (qeeg_id, mri_id)."""
    db = SessionLocal()
    try:
        qeeg_id = f"qeeg-wb-{uuid.uuid4().hex[:8]}"
        mri_id = f"mri-wb-{uuid.uuid4().hex[:8]}"
        db.add(
            QEEGAnalysis(
                id=qeeg_id,
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                analysis_status=qeeg_state,
                band_powers_json=json.dumps({"bands": {}}),
                advanced_analyses_json=None,
                brain_age_json=json.dumps({"gap_years": 3.0}),
                risk_scores_json=None,
                protocol_recommendation_json=json.dumps({"target_region": "DLPFC", "frequency_hz": 10}),
                flagged_conditions=json.dumps([{"condition": "Depression"}]),
                quality_metrics_json=json.dumps({"bad_channels": []}),
                safety_cockpit_json=json.dumps(qeeg_safety) if qeeg_safety else json.dumps({"red_flags": []}),
                red_flags_json=None,
                analyzed_at=datetime.now(timezone.utc),
            )
        )
        db.add(
            MriAnalysis(
                analysis_id=mri_id,
                patient_id=patient_id,
                state=mri_state,
                structural_json=json.dumps({"findings": []}),
                functional_json=None,
                diffusion_json=None,
                stim_targets_json=json.dumps([{"region": "DLPFC", "x": 1, "y": 2, "z": 3}]),
                qc_json=None,
                condition="Depression",
                safety_cockpit_json=json.dumps(mri_safety) if mri_safety else json.dumps({"red_flags": []}),
                red_flags_json=None,
                report_state=mri_report_state,
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
        return qeeg_id, mri_id
    finally:
        db.close()


# ── Create case ──────────────────────────────────────────────────────────────


def test_create_fusion_case_success(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["patient_id"] == patient_id
    assert body["report_state"] == "FUSION_DRAFT_AI"
    assert body["partial"] is False
    assert body["qeeg_analysis_id"]
    assert body["mri_analysis_id"]
    assert body["modality_agreement"]["overall_status"] in ("agreement", "partial")
    assert body["protocol_fusion"]["fusion_status"] == "merged"
    assert body["safety_cockpit"]["overall_status"] == "safe"
    assert body["limitations"]
    assert body["provenance"]["generator"] == "fusion_workbench_service.v1"


def test_create_fusion_case_blocked_by_red_flags(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(
        patient_id,
        mri_safety={
            "red_flags": [
                {"code": "RADIOLOGY_REVIEW_REQUIRED", "severity": "high", "resolved": False}
            ]
        },
    )

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["blocked"] is True
    assert any("radiology review" in r.lower() for r in body["reasons"])
    assert body["next_steps"]


# ── List / Get ───────────────────────────────────────────────────────────────


def test_list_fusion_cases(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    # Create two cases
    for _ in range(2):
        resp = client.post(
            "/api/v1/fusion/cases",
            json={"patient_id": patient_id},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201, resp.text

    resp = client.get(
        f"/api/v1/fusion/cases?patient_id={patient_id}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 2
    assert body[0]["report_state"] == "FUSION_DRAFT_AI"


def test_get_fusion_case(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    case_id = resp.json()["id"]

    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == case_id
    assert body["patient_id"] == patient_id


def test_get_fusion_case_not_found(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.get(
        "/api/v1/fusion/cases/nonexistent-id",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404, resp.text


# ── State transitions ────────────────────────────────────────────────────────


def test_transition_approve_and_sign(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    case_id = resp.json()["id"]

    # needs_clinical_review
    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/transition",
        json={"action": "needs_clinical_review"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["report_state"] == "FUSION_NEEDS_CLINICAL_REVIEW"

    # approve
    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/transition",
        json={"action": "approve", "note": "Looks good"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["report_state"] == "FUSION_APPROVED"
    assert body["reviewer_id"] == "actor-clinician-demo"
    assert body["reviewed_at"]

    # sign
    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/transition",
        json={"action": "sign"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["report_state"] == "FUSION_SIGNED"
    assert body["signed_by"] == "actor-clinician-demo"
    assert body["signed_at"]


def test_transition_invalid_action(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    case_id = resp.json()["id"]

    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/transition",
        json={"action": "sign"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 400, resp.text
    assert "Invalid transition" in resp.json()["message"]


# ── Patient-facing report ────────────────────────────────────────────────────


def test_patient_report_gated_before_approval(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    case_id = resp.json()["id"]

    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}/patient-report",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403, resp.text
    assert "not yet available" in resp.json()["message"]


def test_patient_report_returns_after_sign(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    case_id = resp.json()["id"]

    # Move to signed
    for action in ("needs_clinical_review", "approve", "sign"):
        resp = client.post(
            f"/api/v1/fusion/cases/{case_id}/transition",
            json={"action": action},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text

    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}/patient-report",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["disclaimer"]
    assert body["decision_support_only"] is True
    assert "sha256:" in body["patient_id_hash"]


# ── Agreement / Protocol Fusion ──────────────────────────────────────────────


def test_agreement_endpoint(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    case_id = resp.json()["id"]

    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}/agreement",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "overall_status" in body
    assert "items" in body
    assert body["decision_support_only"] is True


def test_protocol_fusion_endpoint(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    case_id = resp.json()["id"]

    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}/protocol-fusion",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["fusion_status"] == "merged"
    assert body["decision_support_only"] is True


# ── Audit trail ──────────────────────────────────────────────────────────────


def test_audit_endpoint(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    case_id = resp.json()["id"]

    # Transition to create audit entries
    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/transition",
        json={"action": "needs_clinical_review"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text

    resp = client.get(
        f"/api/v1/fusion/cases/{case_id}/audit",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) >= 2
    assert any(a["action"] == "create" for a in body)
    assert any(a["action"] == "needs_clinical_review" for a in body)


# ── Export gating ────────────────────────────────────────────────────────────


def test_export_blocked_before_signed(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    case_id = resp.json()["id"]

    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/export",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403, resp.text
    assert "must be signed" in resp.json()["message"]


def test_export_allowed_after_signed(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["clinician"],
    )
    case_id = resp.json()["id"]

    for action in ("needs_clinical_review", "approve", "sign"):
        resp = client.post(
            f"/api/v1/fusion/cases/{case_id}/transition",
            json={"action": action},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text

    resp = client.post(
        f"/api/v1/fusion/cases/{case_id}/export",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["format"] == "deepsynaps-fusion-v1"
    assert body["download_url"].startswith("data:application/json;base64,")


# ── Auth / role checks ───────────────────────────────────────────────────────


def test_workbench_endpoints_forbid_guest(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    patient_id = _seed_patient(client, auth_headers)
    _seed_qeeg_and_mri(patient_id)

    resp = client.post(
        "/api/v1/fusion/cases",
        json={"patient_id": patient_id},
        headers=auth_headers["guest"],
    )
    assert resp.status_code == 403, resp.text

    resp = client.get(
        f"/api/v1/fusion/cases?patient_id={patient_id}",
        headers=auth_headers["guest"],
    )
    assert resp.status_code == 403, resp.text
