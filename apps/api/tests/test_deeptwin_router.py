from __future__ import annotations

from fastapi.testclient import TestClient

from app.routers import deeptwin_router


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


def test_deeptwin_simulate_returns_forecast_biomarkers_and_monitoring_plan(
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
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["engine"]["status"] in {"ok", "available"}
    assert body["outputs"]["clinical_forecast"]["summary"]
    assert body["outputs"]["clinical_forecast"]["response_probability"] > 0
    assert body["outputs"]["biomarker_forecast"]
    assert body["outputs"]["timecourse"]
    assert body["outputs"]["monitoring_plan"]
    assert body["outputs"]["assumptions"]
