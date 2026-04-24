"""Integration tests for the eight AI-upgrade endpoints (CONTRACT_V2 §4).

These tests mock the :mod:`app.services.qeeg_ai_bridge` façade so they
exercise the router + persistence plumbing without requiring the heavy
optional scaffold deps (torch, sentence_transformers, captum,
pcntoolkit, networkx, plotly). Every endpoint must:

* Persist its output to the expected ``*_json`` column on success.
* Return ``success=False`` with status 200 (never 500) when the bridge
  returns a failure envelope.
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import QEEGAnalysis


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "AI", "last_name": "Upgrades", "dob": "1985-05-05", "gender": "M"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def analysis_row(patient_id: str) -> str:
    analysis_id = "test-ai-upgrade-0001"
    db = SessionLocal()
    try:
        row = QEEGAnalysis(
            id=analysis_id,
            patient_id=patient_id,
            clinician_id="actor-clinician-demo",
            analysis_status="completed",
            band_powers_json=json.dumps(
                {
                    "bands": {
                        "alpha": {
                            "channels": {
                                "Cz": {"absolute_uv2": 10.0, "relative_pct": 40.0},
                            }
                        }
                    }
                }
            ),
        )
        db.add(row)
        db.commit()
    finally:
        db.close()
    return analysis_id


def _reload(analysis_id: str) -> QEEGAnalysis:
    db = SessionLocal()
    try:
        row = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
        assert row is not None
        return row
    finally:
        db.close()


# ── compute-embedding ────────────────────────────────────────────────────────


def test_compute_embedding_persists_vector(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_vec = [float(i) / 200.0 for i in range(200)]
    monkeypatch.setattr(
        "app.services.qeeg_ai_bridge.run_compute_embedding_safe",
        lambda *a, **k: {
            "success": True,
            "data": {"embedding": fake_vec, "model": "labram-stub", "dim": 200, "is_stub": True},
            "error": None,
            "is_stub": True,
        },
    )
    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/compute-embedding",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["analysis"]["embedding"][0] == pytest.approx(fake_vec[0])

    row = _reload(analysis_row)
    assert row.embedding_json is not None
    assert json.loads(row.embedding_json)[0] == pytest.approx(fake_vec[0])


def test_compute_embedding_graceful_when_bridge_fails(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.qeeg_ai_bridge.run_compute_embedding_safe",
        lambda *a, **k: {"success": False, "data": None, "error": "missing dep", "is_stub": True},
    )
    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/compute-embedding",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert "missing dep" in (body.get("error") or "")


# ── predict-brain-age ────────────────────────────────────────────────────────


def test_predict_brain_age_persists_dict(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "predicted_years": 42.5,
        "chronological_years": 40,
        "gap_years": 2.5,
        "gap_percentile": 68.0,
        "confidence": "moderate",
        "electrode_importance": {"Cz": 0.1, "Pz": 0.2},
    }
    monkeypatch.setattr(
        "app.services.qeeg_ai_bridge.run_predict_brain_age_safe",
        lambda *a, **k: {"success": True, "data": payload, "error": None, "is_stub": False},
    )
    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/predict-brain-age?chronological_age=40",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["predicted_years"] == pytest.approx(42.5)

    row = _reload(analysis_row)
    assert row.brain_age_json is not None
    assert json.loads(row.brain_age_json)["gap_years"] == pytest.approx(2.5)


# ── score-conditions ─────────────────────────────────────────────────────────


def test_score_conditions_persists_dict(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "mdd_like": {"score": 0.6, "ci95": [0.5, 0.7]},
        "adhd_like": {"score": 0.2, "ci95": [0.1, 0.3]},
    }
    monkeypatch.setattr(
        "app.services.qeeg_ai_bridge.run_score_conditions_safe",
        lambda *a, **k: {"success": True, "data": payload, "error": None, "is_stub": False},
    )
    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/score-conditions",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["mdd_like"]["score"] == pytest.approx(0.6)

    row = _reload(analysis_row)
    assert row.risk_scores_json is not None


# ── fit-centiles ─────────────────────────────────────────────────────────────


def test_fit_centiles_persists_dict(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "spectral": {"bands": {"alpha": {"absolute_uv2": {"Cz": 62.0}}}},
        "norm_db_version": "gamlss-v1",
    }
    monkeypatch.setattr(
        "app.services.qeeg_ai_bridge.run_fit_centiles_safe",
        lambda *a, **k: {"success": True, "data": payload, "error": None, "is_stub": False},
    )
    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/fit-centiles",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    row = _reload(analysis_row)
    assert row.centiles_json is not None


# ── explain ──────────────────────────────────────────────────────────────────


def test_explain_persists_dict(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "per_risk_score": {"mdd_like": {"channel_importance": {"Cz": {"alpha": 0.3}}}},
        "ood_score": {"percentile": 40.0, "distance": 1.2, "interpretation": "in-distribution"},
        "adebayo_sanity_pass": True,
        "method": "integrated_gradients",
    }
    monkeypatch.setattr(
        "app.services.qeeg_ai_bridge.run_explain_safe",
        lambda *a, **k: {"success": True, "data": payload, "error": None, "is_stub": False},
    )
    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/explain",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    row = _reload(analysis_row)
    assert row.explainability_json is not None


# ── similar-cases (GET) ──────────────────────────────────────────────────────


def test_similar_cases_returns_cached_when_present(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
) -> None:
    cached = [
        {"id": "case-1", "age": 35, "sex": "F", "outcome": "improved"},
        {"id": "case-2", "age": 42, "sex": "M", "outcome": "stable"},
    ]
    db = SessionLocal()
    try:
        row = db.query(QEEGAnalysis).filter_by(id=analysis_row).first()
        row.similar_cases_json = json.dumps(cached)
        db.commit()
    finally:
        db.close()

    resp = client.get(
        f"/api/v1/qeeg-analysis/{analysis_row}/similar-cases?k=5",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["cached"] is True
    assert len(body["cases"]) == 2


def test_similar_cases_computes_on_the_fly(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_cases = [
        {"id": "n-1", "distance": 0.12, "outcome": "improved"},
    ]
    monkeypatch.setattr(
        "app.services.qeeg_ai_bridge.run_similar_cases_safe",
        lambda *a, **k: {"success": True, "data": {"cases": fake_cases}, "error": None, "is_stub": True},
    )
    resp = client.get(
        f"/api/v1/qeeg-analysis/{analysis_row}/similar-cases?k=5",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["cached"] is False
    assert body["cases"][0]["id"] == "n-1"

    row = _reload(analysis_row)
    assert row.similar_cases_json is not None


# ── recommend-protocol ───────────────────────────────────────────────────────


def test_recommend_protocol_persists_dict(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "primary_modality": "rtms_10hz",
        "target_region": "L_DLPFC",
        "dose": {"sessions": 30, "intensity": "110% RMT", "duration_min": 37, "frequency": "5x/week"},
        "session_plan": {
            "induction": {"sessions": 10, "notes": "ramp intensity"},
            "consolidation": {"sessions": 15, "notes": "full dose"},
            "maintenance": {"sessions": 5, "notes": "tapering"},
        },
        "contraindications": ["implanted device"],
        "expected_response_window_weeks": [4, 8],
        "citations": [{"n": 1, "pmid": "12345", "doi": None, "title": "RCT", "url": "https://pubmed/"}],
        "confidence": "moderate",
        "alternative_protocols": [],
        "rationale": "patterned on published RCTs.",
    }
    monkeypatch.setattr(
        "app.services.qeeg_ai_bridge.run_retrieve_papers_safe",
        lambda *a, **k: {"success": True, "data": [], "error": None, "is_stub": True},
    )
    monkeypatch.setattr(
        "app.services.qeeg_ai_bridge.run_recommend_protocol_safe",
        lambda *a, **k: {"success": True, "data": payload, "error": None, "is_stub": False},
    )
    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/recommend-protocol",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["primary_modality"] == "rtms_10hz"
    row = _reload(analysis_row)
    assert row.protocol_recommendation_json is not None


# ── patient trajectory ───────────────────────────────────────────────────────


def test_patient_trajectory_returns_envelope(
    client: TestClient,
    auth_headers: dict,
    patient_id: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.qeeg_ai_bridge.run_trajectory_report_safe",
        lambda *a, **k: {
            "success": True,
            "data": {
                "n_sessions": 0,
                "baseline_date": None,
                "days_since_baseline": 0,
                "feature_trajectories": {},
                "brain_age_trajectory": {"gap_years": [], "dates": []},
                "normative_distance_trajectory": [],
                "plotly_html": None,
                "is_stub": True,
            },
            "error": None,
            "is_stub": True,
        },
    )
    resp = client.get(
        f"/api/v1/qeeg-analysis/patients/{patient_id}/trajectory",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["trajectory"]["n_sessions"] == 0


def test_patient_trajectory_graceful_when_bridge_fails(
    client: TestClient,
    auth_headers: dict,
    patient_id: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.qeeg_ai_bridge.run_trajectory_report_safe",
        lambda *a, **k: {"success": False, "data": None, "error": "missing dep", "is_stub": True},
    )
    resp = client.get(
        f"/api/v1/qeeg-analysis/patients/{patient_id}/trajectory",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert "missing dep" in (body.get("error") or "")
