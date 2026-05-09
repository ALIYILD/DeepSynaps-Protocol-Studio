"""DeepTwin router tests.

Combined suite covering:
- The legacy enriched ``/analyze`` and ``/simulate`` endpoints (parallel
  session work landed on main).
- The DeepTwin v1 endpoints used by the clinician page (this branch):
  summary, timeline, signals, correlations, predictions, simulations,
  reports, agent-handoff.

We use the clinician demo token from conftest.py; the goal is to verify
that every endpoint returns 200 with the expected top-level keys and the
stable safety stamps the frontend relies on.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AssessmentRecord,
    ClinicalSession,
    DeepTwinAnalysisRun,
    DeepTwinClinicianNote,
    DeepTwinSimulationRun,
    OutcomeEvent,
    Patient,
    User,
    WearableAlertFlag,
)
from app.routers import deeptwin_router
from app.services.auth_service import create_access_token


# ---------------------------------------------------------------------------
# Legacy enriched analyze / simulate endpoints
# ---------------------------------------------------------------------------

def test_deeptwin_analyze_returns_ranked_workspace_outputs(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        deeptwin_router,
        "build_fusion_recommendation",
        lambda _session, patient_id: {
            "patient_id": patient_id,
            "summary": "Dual-modality fusion available",
            "recommendations": ["Review qEEG and MRI together before target selection."],
        },
    )

    resp = client.post(
        "/api/v1/deeptwin/analyze",
        json={
            "patient_id": "patient-deeptwin-1",
            "modalities": ["qeeg_features", "mri_structural", "wearables", "assessments"],
            "analysis_modes": ["correlation", "prediction", "causation"],
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["patient_id"] == "patient-deeptwin-1"
    assert body["correlation"]["priority_pairs"]
    assert body["correlation"]["priority_pairs"][0]["clinical_readout"]
    assert body["prediction"]["executive_summary"]
    assert body["prediction"]["key_predictions"]
    assert body["prediction"]["fusion"]["summary"] == "Dual-modality fusion available"
    assert body["causation"]["hypotheses"]
    assert body["engine"]["notes"]


def test_real_patient_analyze_and_brain_twin_alias_withhold_exploratory_outputs(
    client: TestClient,
) -> None:
    patient_id = "pat-real-analyze-1"
    user_id = "user-real-analyze-1"

    session = SessionLocal()
    try:
        user = _seed_real_clinician(session, user_id=user_id)
        _seed_real_patient(session, patient_id=patient_id, clinician_id=user.id)
    finally:
        session.close()

    headers = _real_headers(user_id)
    payload = {
        "patient_id": patient_id,
        "modalities": ["qeeg_features", "mri_structural", "wearables"],
        "analysis_modes": ["correlation", "prediction", "causation"],
    }

    deeptwin_resp = client.post("/api/v1/deeptwin/analyze", headers=headers, json=payload)
    assert deeptwin_resp.status_code == 200, deeptwin_resp.text
    deeptwin_body = deeptwin_resp.json()
    assert deeptwin_body["available"] is False
    assert deeptwin_body["status"] == "withheld"
    assert deeptwin_body["reason"] == "no_validated_analysis_model"
    assert deeptwin_body["used_modalities"] == []
    assert deeptwin_body["provenance"]["model_id"] == "deeptwin.analyze.withheld"
    assert deeptwin_body["engine"]["mode"] == "withheld"
    assert deeptwin_body["engine"]["requested_modalities"] == payload["modalities"]
    assert deeptwin_body["correlation"]["status"] == "withheld"
    assert deeptwin_body["prediction"]["status"] == "withheld"
    assert deeptwin_body["causation"]["status"] == "withheld"
    assert any("withheld" in item.lower() for item in deeptwin_body["limitations"])

    brain_twin_resp = client.post("/api/v1/brain-twin/analyze", headers=headers, json=payload)
    assert brain_twin_resp.status_code == 200, brain_twin_resp.text
    brain_twin_body = brain_twin_resp.json()
    assert brain_twin_body["available"] is False
    assert brain_twin_body["status"] == "withheld"
    assert brain_twin_body["reason"] == deeptwin_body["reason"]
    assert brain_twin_body["summary"] == deeptwin_body["summary"]
    assert brain_twin_body["correlation"]["status"] == deeptwin_body["correlation"]["status"]
    assert brain_twin_body["prediction"]["status"] == deeptwin_body["prediction"]["status"]
    assert brain_twin_body["causation"]["status"] == deeptwin_body["causation"]["status"]
    assert brain_twin_body["provenance"]["model_id"] == "deeptwin.analyze.withheld"


def test_deeptwin_simulate_returns_503_when_no_validated_engine_is_connected(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    resp = client.post(
        "/api/v1/deeptwin/simulate",
        json={
            "patient_id": "patient-deeptwin-1",
            "protocol_id": "rtms_fp2_10hz",
            "horizon_days": 35,
            "modalities": ["qeeg_features", "wearables", "assessments"],
            "scenario": {
                "intervention_type": "rTMS",
                "target": "Fp2",
                "frequency_hz": 10,
                "sessions_per_day": 5,
                "sessions_per_week": 5,
                "weeks": 5,
                "expected_biomarker": "alpha",
                "clinical_goal": "attention",
            },
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 503, resp.text
    body = resp.json()
    assert body["code"] == "deeptwin_simulation_not_implemented"
    assert body["details"]["reason"] == "no_validated_simulation_engine"
    assert body["details"]["placeholder_simulations_disabled"] is True


def test_real_patient_simulate_and_brain_twin_alias_withhold_legacy_outputs(
    client: TestClient,
) -> None:
    patient_id = "pat-real-sim-1"
    user_id = "user-real-sim-1"

    session = SessionLocal()
    try:
        user = _seed_real_clinician(session, user_id=user_id)
        _seed_real_patient(session, patient_id=patient_id, clinician_id=user.id)
    finally:
        session.close()

    headers = _real_headers(user_id)
    payload = {
        "patient_id": patient_id,
        "protocol_id": "rtms_fp2_10hz",
        "horizon_days": 35,
        "modalities": ["qeeg_features", "wearables", "assessments"],
        "scenario": {
            "intervention_type": "rTMS",
            "target": "Fp2",
            "frequency_hz": 10,
            "sessions_per_day": 5,
            "sessions_per_week": 5,
            "weeks": 5,
            "expected_biomarker": "alpha",
            "clinical_goal": "attention",
        },
    }

    deeptwin_resp = client.post("/api/v1/deeptwin/simulate", headers=headers, json=payload)
    assert deeptwin_resp.status_code == 200, deeptwin_resp.text
    deeptwin_body = deeptwin_resp.json()
    assert deeptwin_body["available"] is False
    assert deeptwin_body["status"] == "withheld"
    assert deeptwin_body["reason"] == "no_validated_simulation_engine"
    assert deeptwin_body["engine"]["mode"] == "withheld"
    assert deeptwin_body["engine"]["requested_protocol_id"] == payload["protocol_id"]
    assert deeptwin_body["outputs"]["clinical_forecast"]["status"] == "withheld"
    assert deeptwin_body["outputs"]["clinical_forecast"]["reason"] == "no_validated_simulation_engine"
    assert deeptwin_body["outputs"]["timecourse"] == []
    assert deeptwin_body["outputs"]["biomarker_forecast"] == []
    assert deeptwin_body["outputs"]["provenance"]["model_id"] == "deeptwin.legacy_simulate.withheld"
    assert any("withheld" in item.lower() for item in deeptwin_body["limitations"])

    brain_twin_resp = client.post("/api/v1/brain-twin/simulate", headers=headers, json=payload)
    assert brain_twin_resp.status_code == 200, brain_twin_resp.text
    brain_twin_body = brain_twin_resp.json()
    assert brain_twin_body["available"] is False
    assert brain_twin_body["status"] == "withheld"
    assert brain_twin_body["reason"] == deeptwin_body["reason"]
    assert brain_twin_body["summary"] == deeptwin_body["summary"]
    assert brain_twin_body["outputs"]["clinical_forecast"]["status"] == "withheld"
    assert brain_twin_body["outputs"]["provenance"]["model_id"] == "deeptwin.legacy_simulate.withheld"


# ---------------------------------------------------------------------------
# DeepTwin v1 endpoints (clinician page)
# ---------------------------------------------------------------------------

PID = "pat-demo-1"

CLINIC_REAL = "clinic-real"


def _seed_real_clinician(session, *, user_id: str, clinic_id: str = CLINIC_REAL) -> User:
    user = User(
        id=user_id,
        email=f"{user_id}@example.com",
        display_name="Real Clinician",
        role="clinician",
        clinic_id=clinic_id,
        hashed_password="x",
        package_id="clinician_pro",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(user)
    session.commit()
    return user


def _seed_real_patient(session, *, patient_id: str, clinician_id: str) -> Patient:
    patient = Patient(
        id=patient_id,
        clinician_id=clinician_id,
        first_name="Taylor",
        last_name="Rivers",
        dob="1991-03-12",
        email=f"{patient_id}@example.com",
        primary_condition="ADHD",
        secondary_conditions='["anxiety"]',
        notes="Persistent executive dysfunction with intermittent sleep disruption.",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(patient)
    session.commit()
    return patient


def _real_headers(user_id: str, clinic_id: str = CLINIC_REAL) -> dict[str, str]:
    token = create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role="clinician",
        package_id="clinician_pro",
        clinic_id=clinic_id,
    )
    return {"Authorization": f"Bearer {token}"}


def test_summary_endpoint(client: TestClient, auth_headers: dict[str, dict[str, str]]) -> None:
    r = client.get(f"/api/v1/deeptwin/patients/{PID}/summary", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert body["patient_id"] == PID
    assert "completeness_pct" in body
    assert body["review_status"] == "awaiting_clinician_review"
    assert "decision-support" in body["disclaimer"].lower()


def test_timeline_endpoint(client: TestClient, auth_headers: dict[str, dict[str, str]]) -> None:
    r = client.get(
        f"/api/v1/deeptwin/patients/{PID}/timeline?days=60",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["window_days"] == 60
    assert isinstance(body["events"], list)


def test_signals_endpoint(client: TestClient, auth_headers: dict[str, dict[str, str]]) -> None:
    r = client.get(f"/api/v1/deeptwin/patients/{PID}/signals", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert len(body["signals"]) >= 8
    assert {"domain", "name", "current", "baseline", "evidence_grade"}.issubset(body["signals"][0].keys())


def test_correlations_endpoint_has_warning(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    r = client.get(
        f"/api/v1/deeptwin/patients/{PID}/correlations",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["matrix"], list)
    assert isinstance(body["cards"], list) and body["cards"]
    assert isinstance(body["hypotheses"], list) and body["hypotheses"]
    assert any("correlation" in w.lower() for w in body["warnings"])


def test_predictions_horizons(client: TestClient, auth_headers: dict[str, dict[str, str]]) -> None:
    for horizon in ("2w", "6w", "12w"):
        r = client.get(
            f"/api/v1/deeptwin/patients/{PID}/predictions?horizon={horizon}",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["horizon"] == horizon
        assert body["uncertainty_widens_with_horizon"] is True
        assert body["evidence_grade"] in {"low", "moderate", "high"}


def test_real_patient_v1_endpoints_use_persisted_data_and_withhold_predictions(
    client: TestClient,
) -> None:
    patient_id = "pat-real-v1"
    user_id = "user-real-v1"
    now = datetime.now(timezone.utc)
    analysis_run_id: str | None = None
    analysis_observed_at: str | None = None

    session = SessionLocal()
    try:
        user = _seed_real_clinician(session, user_id=user_id)
        _seed_real_patient(session, patient_id=patient_id, clinician_id=user.id)
        analysis_run = DeepTwinAnalysisRun(
            patient_id=patient_id,
            clinician_id=user.id,
            analysis_type="correlation",
            output_summary_json=json.dumps({
                "priority_pairs": [
                    {
                        "left": "sleep_total_min",
                        "right": "phq9_total",
                        "score": -0.58,
                        "confidence": "moderate",
                        "clinical_readout": "Sleep contraction tracks higher symptom burden.",
                    },
                ],
            }),
            confidence=0.74,
            model_name="tribe-v1",
            created_at=now - timedelta(hours=3),
            reviewed_at=now - timedelta(hours=2),
            reviewed_by=user.id,
        )
        session.add(analysis_run)
        session.flush()
        analysis_run_id = analysis_run.id
        analysis_observed_at = analysis_run.created_at.replace(tzinfo=timezone.utc).isoformat()
        session.add(AssessmentRecord(
            patient_id=patient_id,
            clinician_id=user.id,
            template_id="phq9",
            template_title="PHQ-9",
            data_json="{}",
            score="14",
            score_numeric=14.0,
            severity="moderate",
            completed_at=now - timedelta(days=3),
            created_at=now - timedelta(days=3),
        ))
        session.add(ClinicalSession(
            patient_id=patient_id,
            clinician_id=user.id,
            scheduled_at=(now - timedelta(days=2)).isoformat(),
            modality="tdcs",
            status="completed",
            session_number=4,
            completed_at=(now - timedelta(days=2)).isoformat(),
            created_at=now - timedelta(days=2),
        ))
        session.add(OutcomeEvent(
            patient_id=patient_id,
            clinician_id=user.id,
            event_type="improvement",
            title="Attention improved after block one",
            summary="Clinician documented better sustained attention.",
            severity="info",
            payload_json="{}",
            recorded_at=now - timedelta(days=1),
            created_at=now - timedelta(days=1),
        ))
        session.add(DeepTwinClinicianNote(
            patient_id=patient_id,
            clinician_id=user.id,
            note_text="Cross-check sleep before increasing stimulation burden.",
            related_analysis_id=analysis_run.id,
            created_at=now - timedelta(hours=1),
        ))
        session.add(DeepTwinSimulationRun(
            patient_id=patient_id,
            clinician_id=user.id,
            clinician_review_required=True,
            limitations="Persisted for review only; not a validated prediction.",
            created_at=now - timedelta(minutes=45),
        ))
        session.add(WearableAlertFlag(
            patient_id=patient_id,
            flag_type="sleep_drop",
            severity="warning",
            detail="Sleep duration dropped below baseline for 3 nights.",
            triggered_at=now - timedelta(hours=4),
        ))
        session.commit()
    finally:
        session.close()

    headers = _real_headers(user_id)

    summary_resp = client.get(
        f"/api/v1/deeptwin/patients/{patient_id}/summary",
        headers=headers,
    )
    assert summary_resp.status_code == 200, summary_resp.text
    summary = summary_resp.json()
    assert summary["patient_id"] == patient_id
    assert summary["risk_status"] == "watch"
    assert summary["review_status"] == "awaiting_clinician_review"
    assert any(
        src["key"] == "assessments" and src["record_count"] == 1
        for src in summary["sources_connected"]
    )
    assert any("withheld" in warning.lower() for warning in summary["warnings"])

    timeline_resp = client.get(
        f"/api/v1/deeptwin/patients/{patient_id}/timeline?days=30",
        headers=headers,
    )
    assert timeline_resp.status_code == 200, timeline_resp.text
    timeline = timeline_resp.json()
    assert timeline["window_days"] == 30
    assert any(
        event["kind"] == "note" and event["label"].startswith("Clinician note added:")
        for event in timeline["events"]
    )
    assert any(
        event["kind"] == "review" and event["label"] == "DeepTwin analysis reviewed: correlation"
        for event in timeline["events"]
    )

    signals_resp = client.get(
        f"/api/v1/deeptwin/patients/{patient_id}/signals",
        headers=headers,
    )
    assert signals_resp.status_code == 200, signals_resp.text
    signals_body = signals_resp.json()
    assert signals_body["warnings"] == []
    assert any(
        signal["name"] == "assessments_records"
        and signal["current"] == 1
        and signal["measurement_type"] == "observed_count"
        for signal in signals_body["signals"]
    )
    assert any(
        signal["name"] == "clinician_notes" and signal["current"] == 1
        for signal in signals_body["signals"]
    )

    corr_resp = client.get(
        f"/api/v1/deeptwin/patients/{patient_id}/correlations",
        headers=headers,
    )
    assert corr_resp.status_code == 200, corr_resp.text
    corr = corr_resp.json()
    assert corr["method"] == "persisted_analysis_runs"
    assert corr["matrix"] == []
    assert corr["hypotheses"] == []
    assert corr["cards"] == [
        {
            "left": "sleep_total_min",
            "right": "phq9_total",
            "strength": -0.58,
            "confidence": "moderate",
            "n_observations": None,
            "evidence_grade": None,
            "note": "Sleep contraction tracks higher symptom burden.",
            "source_run_id": analysis_run_id,
            "source_model_name": "tribe-v1",
            "observed_at": analysis_observed_at,
        },
    ]
    assert any("persisted" in warning.lower() for warning in corr["warnings"])

    pred_resp = client.get(
        f"/api/v1/deeptwin/patients/{patient_id}/predictions?horizon=6w",
        headers=headers,
    )
    assert pred_resp.status_code == 200, pred_resp.text
    pred = pred_resp.json()
    assert pred["horizon"] == "6w"
    assert pred["traces"] == []
    assert pred["available"] is False
    assert pred["status"] == "not_implemented"
    assert pred["reason"] == "no_validated_prediction_model"
    assert pred["summary"].lower().startswith("deeptwin prediction output is withheld")
    assert pred["evidence_grade"] is None
    assert pred["evidence_status"] == "unavailable"
    assert pred["confidence_tier"] is None
    assert pred["top_drivers"] == []
    assert pred["uncertainty_widens_with_horizon"] is False
    assert pred["calibration"]["status"] == "withheld"
    assert pred["provenance"]["model_id"] == "deeptwin.predictions.withheld"
    assert pred["limitations"]


def test_simulation_endpoint_requires_approval(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    r = client.post(
        f"/api/v1/deeptwin/patients/{PID}/simulations",
        headers=auth_headers["clinician"],
        json={
            "scenario_id": "scn_fp2_10hz_5w",
            "modality": "tdcs",
            "target": "Fp2",
            "frequency_hz": 10,
            "current_ma": 2.0,
            "duration_min": 20,
            "sessions_per_week": 5,
            "weeks": 5,
            "contraindications": [],
            "adherence_assumption_pct": 80.0,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["approval_required"] is True
    assert body["labels"]["simulation_only"] is True
    assert body["evidence_grade"] in {"low", "moderate", "high"}
    assert "x_days" in body["predicted_curve"]


def test_real_patient_simulation_endpoint_withholds_heuristic_output(
    client: TestClient,
) -> None:
    patient_id = "pat-real-sim-v1"
    user_id = "user-real-sim-v1"

    session = SessionLocal()
    try:
        user = _seed_real_clinician(session, user_id=user_id)
        _seed_real_patient(session, patient_id=patient_id, clinician_id=user.id)
    finally:
        session.close()

    response = client.post(
        f"/api/v1/deeptwin/patients/{patient_id}/simulations",
        headers=_real_headers(user_id),
        json={
            "scenario_id": "scn_real_tdcs_fp2",
            "modality": "tdcs",
            "target": "Fp2",
            "frequency_hz": 10,
            "current_ma": 2.0,
            "duration_min": 20,
            "sessions_per_week": 5,
            "weeks": 5,
            "contraindications": [],
            "adherence_assumption_pct": 80.0,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["available"] is False
    assert body["status"] == "withheld"
    assert body["reason"] == "no_validated_simulation_engine"
    assert body["summary"].lower().startswith("deeptwin simulation output is withheld")
    assert body["predicted_curve"] == {
        "x_days": [],
        "y_response_pct": [],
        "y_symptom_pct": [],
    }
    assert body["responder_probability"] is None
    assert body["non_responder_flag"] is None
    assert body["evidence_grade"] is None
    assert body["evidence_status"] == "unavailable"
    assert body["top_drivers"] == []
    assert body["scenario_comparison"]["status"] == "withheld"
    assert body["scenario_comparison"]["reason"] == "no_validated_simulation_engine"
    assert body["calibration"]["status"] == "withheld"
    assert body["provenance"]["model_id"] == "deeptwin.simulations.withheld"
    assert any("withheld" in item.lower() for item in body["limitations"])


def test_report_endpoint(client: TestClient, auth_headers: dict[str, dict[str, str]]) -> None:
    r = client.post(
        f"/api/v1/deeptwin/patients/{PID}/reports",
        headers=auth_headers["clinician"],
        json={"kind": "clinician_deep"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "clinician_deep"
    assert body["title"]
    assert "body" in body and isinstance(body["body"], dict)


def test_real_patient_report_and_handoff_use_observed_only_or_withheld_payloads(
    client: TestClient,
) -> None:
    patient_id = "pat-real-report-1"
    user_id = "user-real-report-1"

    session = SessionLocal()
    try:
        user = _seed_real_clinician(session, user_id=user_id)
        _seed_real_patient(session, patient_id=patient_id, clinician_id=user.id)
    finally:
        session.close()

    headers = _real_headers(user_id)

    clinician_report = client.post(
        f"/api/v1/deeptwin/patients/{patient_id}/reports",
        headers=headers,
        json={"kind": "clinician_deep"},
    )
    assert clinician_report.status_code == 200, clinician_report.text
    clinician_body = clinician_report.json()
    assert clinician_body["available"] is True
    assert clinician_body["status"] == "observed_only"
    assert clinician_body["reason"] is None
    assert clinician_body["summary"].lower().startswith("observed-only deeptwin report")
    assert clinician_body["body"]["status"] == "observed_only"
    assert "completeness" in clinician_body["body"]
    assert "review" in clinician_body["body"]
    assert "Deterministic DeepTwin report builders are disabled" in clinician_body["limitations"][1]

    prediction_report = client.post(
        f"/api/v1/deeptwin/patients/{patient_id}/reports",
        headers=headers,
        json={"kind": "prediction"},
    )
    assert prediction_report.status_code == 200, prediction_report.text
    prediction_body = prediction_report.json()
    assert prediction_body["available"] is False
    assert prediction_body["status"] == "withheld"
    assert prediction_body["reason"] == "no_validated_prediction_model"
    assert prediction_body["body"]["prediction"]["status"] == "not_implemented"
    assert any("withheld" in item.lower() for item in prediction_body["limitations"])

    handoff = client.post(
        f"/api/v1/deeptwin/patients/{patient_id}/agent-handoff",
        headers=headers,
        json={"kind": "send_summary", "note": "focus on review state"},
    )
    assert handoff.status_code == 200, handoff.text
    handoff_body = handoff.json()
    assert handoff_body["available"] is True
    assert handoff_body["status"] == "observed_only"
    assert handoff_body["audit_ref"] == "twin_handoff:send_summary:observed_only"
    assert "report_mode: observed_only" in handoff_body["summary_markdown"]
    assert "pending_review_items" in handoff_body["summary_markdown"]


def test_agent_handoff_endpoint(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    r = client.post(
        f"/api/v1/deeptwin/patients/{PID}/agent-handoff",
        headers=auth_headers["clinician"],
        json={"kind": "send_summary", "note": "please prep prep"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["audit_ref"].startswith("twin_handoff:")
    assert body["approval_required"] is True
    assert "DeepTwin Summary" in body["summary_markdown"]


def test_deeptwin_patient_routes_require_clinician_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.get(
        f"/api/v1/deeptwin/patients/{PID}/summary",
        headers=auth_headers["patient"],
    )

    assert response.status_code == 403
    payload = response.json()
    assert payload["code"] == "insufficient_role"


def test_deeptwin_simulate_requires_clinician_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.post(
        "/api/v1/deeptwin/simulate",
        headers=auth_headers["guest"],
        json={
            "patient_id": "patient-deeptwin-1",
            "protocol_id": "rtms_fp2_10hz",
            "horizon_days": 35,
        },
    )

    assert response.status_code == 403
    payload = response.json()
    assert payload["code"] == "insufficient_role"


# ---------------------------------------------------------------------------
# Stream 3 night-shift upgrades — decision-support contract
# ---------------------------------------------------------------------------

def test_v1_simulation_response_has_decision_support_contract(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """Every /simulations response must carry confidence_tier, top_drivers,
    calibration, uncertainty (3-component), provenance with model id +
    schema version + inputs hash, and scenario_comparison."""
    r = client.post(
        f"/api/v1/deeptwin/patients/{PID}/simulations",
        headers=auth_headers["clinician"],
        json={
            "scenario_id": "scn_tdcs_fp2",
            "modality": "tdcs",
            "target": "Fp2",
            "frequency_hz": 10.0,
            "current_ma": 2.0,
            "duration_min": 20,
            "sessions_per_week": 5,
            "weeks": 5,
            "contraindications": [],
            "adherence_assumption_pct": 80.0,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Confidence tier present and valid
    assert body["confidence_tier"] in {"high", "medium", "low"}
    # At least one top-driver
    assert isinstance(body["top_drivers"], list) and len(body["top_drivers"]) >= 1
    for d in body["top_drivers"]:
        assert "factor" in d and "magnitude" in d and "direction" in d
        assert d["direction"] in {"positive", "negative", "neutral"}
        assert 0.0 <= float(d["magnitude"]) <= 1.0
    # Provenance fields
    prov = body["provenance"]
    assert prov["model_id"] == "deeptwin_engine.deterministic_rules"
    assert prov["schema_version"].startswith("deeptwin.simulate.")
    assert prov["inputs_hash"].startswith("sha256:")
    assert prov["calibration_status"] == "uncalibrated"
    assert prov["decision_support_only"] is True
    # Calibration honestly disclosed
    assert body["calibration"]["status"] == "uncalibrated"
    assert "calibrat" in body["calibration"]["note"].lower()  # discusses calibration honestly
    assert body["calibration"]["method"] == "uncalibrated"
    # 3-component uncertainty block
    comps = body["uncertainty"]["components"]
    assert {"epistemic", "aleatoric", "calibration"} == set(comps.keys())
    for comp in comps.values():
        assert "status" in comp and "method" in comp and "note" in comp
    # Scenario comparison shape
    sc = body["scenario_comparison"]
    assert "delta_pred" in sc and "expected_direction" in sc
    # Patient-specific notes (rationale binding)
    assert isinstance(body["patient_specific_notes"], list)
    assert body["rationale"]
    # Schema version present
    assert body["schema_version"].startswith("deeptwin.simulate.")
    assert body["decision_support_only"] is True
    # Evidence status surfaced
    assert body["evidence_status"] in {"linked", "pending", "unavailable"}


def test_v1_predictions_have_confidence_and_drivers(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    r = client.get(
        f"/api/v1/deeptwin/patients/{PID}/predictions?horizon=6w",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["confidence_tier"] in {"high", "medium", "low"}
    assert isinstance(body["top_drivers"], list) and len(body["top_drivers"]) >= 1
    assert body["calibration"]["status"] == "uncalibrated"
    assert body["uncertainty"]["components"].keys() == {
        "epistemic", "aleatoric", "calibration",
    }
    assert body["provenance"]["schema_version"]
    assert body["provenance"]["inputs_hash"].startswith("sha256:")
    assert body["evidence_status"] in {"linked", "pending", "unavailable"}
    assert body["decision_support_only"] is True


def test_legacy_analyze_response_has_provenance_and_softened_language(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        deeptwin_router,
        "build_fusion_recommendation",
        lambda _session, patient_id: {
            "patient_id": patient_id,
            "summary": "Dual-modality fusion available",
            "recommendations": ["Review qEEG and MRI together before target selection."],
        },
    )
    r = client.post(
        "/api/v1/deeptwin/analyze",
        json={
            "patient_id": "pat-decision-support",
            "modalities": ["qeeg_features", "mri_structural"],
            "analysis_modes": ["prediction"],
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Schema/provenance at top-level
    assert body["schema_version"].startswith("deeptwin.analyze.")
    assert body["provenance"]["model_id"]
    assert body["provenance"]["inputs_hash"].startswith("sha256:")
    # Predictions enriched
    pred = body["prediction"]
    assert pred["confidence_tier"] in {"high", "medium", "low"}
    assert isinstance(pred["top_drivers"], list) and pred["top_drivers"]
    assert pred["calibration"]["status"] == "uncalibrated"
    # Per-key-prediction enrichment
    for kp in pred["key_predictions"]:
        assert kp["confidence_tier"] in {"high", "medium", "low"}
        assert kp["evidence_status"] in {"linked", "pending", "unavailable"}
        assert isinstance(kp["top_drivers"], list)
    # Softened language: no forbidden terms
    blob = " ".join([
        pred.get("executive_summary", ""),
        *(kp.get("summary", "") for kp in pred["key_predictions"]),
    ]).lower()
    for term in ("diagnose", "prescribe", "guarantee", "should take"):
        assert term not in blob


def test_legacy_simulate_response_has_provenance_and_decision_support(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    r = client.post(
        "/api/v1/deeptwin/simulate",
        headers=auth_headers["clinician"],
        json={
            "patient_id": "pat-ds-1",
            "protocol_id": "rtms_fp2_10hz",
            "horizon_days": 35,
            "modalities": ["qeeg_features", "wearables"],
            "scenario": {
                "intervention_type": "rTMS",
                "target": "Fp2",
                "frequency_hz": 10,
                "sessions_per_week": 5,
                "weeks": 5,
            },
        },
    )
    assert r.status_code == 503, r.text
    body = r.json()
    assert body["code"] == "deeptwin_simulation_not_implemented"
    assert body["details"]["reason"] == "no_validated_simulation_engine"
    assert body["details"]["feature"] == "deeptwin_simulation"


def test_scenario_comparison_endpoint(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """POST /scenarios/compare returns structured deltas across scenarios."""
    sims: list[dict] = []
    for modality, target in (("tdcs", "Fp2"), ("tms", "L_DLPFC")):
        sim_resp = client.post(
            f"/api/v1/deeptwin/patients/{PID}/simulations",
            headers=auth_headers["clinician"],
            json={
                "scenario_id": f"scn_{modality}_compare",
                "modality": modality,
                "target": target,
                "frequency_hz": 10.0,
                "current_ma": 2.0,
                "duration_min": 20,
                "sessions_per_week": 5,
                "weeks": 5,
                "contraindications": [],
                "adherence_assumption_pct": 80.0,
            },
        )
        assert sim_resp.status_code == 200
        sims.append(sim_resp.json())

    r = client.post(
        f"/api/v1/deeptwin/patients/{PID}/scenarios/compare",
        headers=auth_headers["clinician"],
        json={"scenarios": sims},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["count"] == 2
    assert len(body["items"]) == 2
    # Exactly one delta between two scenarios
    assert len(body["deltas"]) == 1
    delta = body["deltas"][0]
    assert "delta_endpoint" in delta and "delta_responder_probability" in delta
    assert "confidence_tier_changed" in delta and "recommendation_changed" in delta
    # Modality changed → recommendation_changed True
    assert delta["recommendation_changed"] is True
    # Schema + provenance present
    assert body["schema_version"].startswith("deeptwin.simulate.")
    assert body["provenance"]["inputs_hash"].startswith("sha256:")
    assert body["decision_support_only"] is True


def test_scenario_comparison_handles_empty_input(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    r = client.post(
        f"/api/v1/deeptwin/patients/{PID}/scenarios/compare",
        headers=auth_headers["clinician"],
        json={"scenarios": []},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 0
    assert body["items"] == []
    assert body["deltas"] == []


def test_scenario_compare_requires_clinician(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    r = client.post(
        f"/api/v1/deeptwin/patients/{PID}/scenarios/compare",
        headers=auth_headers["patient"],
        json={"scenarios": []},
    )
    assert r.status_code == 403
    assert r.json()["code"] == "insufficient_role"


def test_simulate_disabled_returns_503_with_provenance(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch,
) -> None:
    """Timeout/feature-gate path: when /simulate is gated off, the 503
    must include a structured details block (already covered in
    test_deeptwin_simulation_gate.py); sanity-check we kept that contract.
    """
    from app.routers import deeptwin_router as router_mod

    real_settings = router_mod.get_settings()
    gated = real_settings.model_copy(update={"enable_deeptwin_simulation": False})
    monkeypatch.setattr(router_mod, "get_settings", lambda: gated)

    resp = client.post(
        "/api/v1/deeptwin/simulate",
        json={
            "patient_id": "pat-503",
            "protocol_id": "rtms_fp2_10hz",
            "horizon_days": 30,
        },
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 503
    body = resp.json()
    assert body["code"] == "deeptwin_simulation_disabled"


def test_handoff_confirmation_guard_returns_audit_ref(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """Handoff endpoint must always return an audit_ref so the UI
    confirmation dialog has something to log + display."""
    r = client.post(
        f"/api/v1/deeptwin/patients/{PID}/agent-handoff",
        headers=auth_headers["clinician"],
        json={"kind": "review_risks", "note": "double-check seizure screen"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["audit_ref"].startswith("twin_handoff:")
    assert body["approval_required"] is True
    assert "decision-support" in body["disclaimer"].lower()
