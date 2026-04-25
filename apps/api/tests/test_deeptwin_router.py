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

from fastapi.testclient import TestClient

from app.routers import deeptwin_router


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


# ---------------------------------------------------------------------------
# DeepTwin v1 endpoints (clinician page)
# ---------------------------------------------------------------------------

PID = "pat-demo-1"


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
