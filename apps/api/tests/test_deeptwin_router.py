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

    assert body["engine"]["status"] in {"ok", "available", "placeholder"}
    # Stub engine must be honest about not being real AI
    if body["engine"]["status"] == "placeholder":
        assert body["engine"].get("real_ai") is False
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
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["schema_version"].startswith("deeptwin.simulate.")
    assert body["provenance"]["inputs_hash"].startswith("sha256:")
    assert body["decision_support_only"] is True
    out = body["outputs"]
    assert out["confidence_tier"] in {"high", "medium", "low"}
    assert isinstance(out["top_drivers"], list) and out["top_drivers"]
    assert out["calibration"]["status"] == "uncalibrated"
    assert "components" in out["uncertainty"]
    assert "delta_pred" in out["scenario_comparison"]


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
