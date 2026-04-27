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
