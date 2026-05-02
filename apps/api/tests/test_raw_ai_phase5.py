"""Phase 5 — AI co-pilot overlay tests.

Covers:
  * Each of the 9 endpoints returns the canonical
    ``{result, reasoning, features}`` envelope (with ``analysis_id``)
    on a happy-path mock analysis.
  * LLM-failure path: when ``chat_service._llm_chat`` raises, the
    deterministic ``result`` still ships and ``reasoning`` falls back to
    the documented fallback string.
  * ``auto_clean_propose`` creates an ``AutoCleanRun`` row.
  * All 9 endpoints require the ``clinician`` role (no Authorization
    header → 401 / 403).
"""
from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import (
    AutoCleanRun,
    CleaningDecision,
    Clinic,
    Patient,
    QEEGAnalysis,
    User,
)
from app.services.auth_service import create_access_token


# ── Fixture ─────────────────────────────────────────────────────────────────


def _make_clinician_and_analysis(db: Session) -> dict[str, Any]:
    clinic = Clinic(id=str(uuid.uuid4()), name="Phase5 Clinic")
    clin = User(
        id=str(uuid.uuid4()),
        email=f"p5_{uuid.uuid4().hex[:8]}@example.com",
        display_name="P5",
        hashed_password="x",
        role="clinician",
        package_id="clinician_pro",
        clinic_id=clinic.id,
    )
    db.add_all([clinic, clin])
    db.flush()
    patient = Patient(
        id=str(uuid.uuid4()),
        clinician_id=clin.id,
        first_name="A",
        last_name="P",
    )
    db.add(patient)
    db.flush()
    analysis = QEEGAnalysis(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        clinician_id=clin.id,
        file_ref="memory://p5-test",
        original_filename="syn.edf",
        file_size_bytes=1024,
        recording_duration_sec=120.0,
        sample_rate_hz=256.0,
        channel_count=19,
        channels_json='["Fp1","Fp2","T3","O1","Cz","Pz","Fz","F3","F4","C3","C4","P3","P4","T4","T5","T6","O2","F7","F8"]',
        recording_date="2026-04-29",
        eyes_condition="closed",
        equipment="demo",
        analysis_status="completed",
    )
    db.add(analysis)
    db.commit()
    token = create_access_token(
        user_id=clin.id,
        email=clin.email,
        role="clinician",
        package_id="clinician_pro",
        clinic_id=clin.clinic_id,
    )
    return {"analysis_id": analysis.id, "token": token}


@pytest.fixture
def phase5_fixture() -> dict[str, Any]:
    db = SessionLocal()
    try:
        return _make_clinician_and_analysis(db)
    finally:
        db.close()


# Stub scan + ICA payloads big enough to exercise every code path.
_FAKE_SCAN = {
    "bad_channels": [
        {
            "channel": "T3",
            "reason": "flatline",
            "metric": {"flat_sec": 8.2},
            "confidence": 0.91,
        },
        {
            "channel": "O1",
            "reason": "line_noise",
            "metric": {"line_hz": 50.0, "ratio": 0.32},
            "confidence": 0.78,
        },
    ],
    "bad_segments": [
        {
            "start_sec": 12.4,
            "end_sec": 13.1,
            "reason": "amp_threshold",
            "metric": {"peak_uv": 312.0},
            "confidence": 0.88,
        }
    ],
    "summary": {
        "n_bad_channels": 2,
        "n_bad_segments": 1,
        "total_excluded_sec": 0.7,
        "scanner_version": "1.0",
    },
}

_FAKE_ICA = {
    "n_components": 3,
    "method": "infomax",
    "iclabel_available": True,
    "auto_excluded_indices": [0],
    "components": [
        {
            "index": 0,
            "label": "eye",
            "label_probabilities": {"eye": 0.92, "brain": 0.08},
            "is_excluded": False,
            "topomap_b64": "",
        },
        {
            "index": 1,
            "label": "brain",
            "label_probabilities": {"brain": 0.95, "eye": 0.05},
            "is_excluded": False,
            "topomap_b64": "",
        },
        {
            "index": 2,
            "label": "muscle",
            "label_probabilities": {"muscle": 0.81, "brain": 0.19},
            "is_excluded": False,
            "topomap_b64": "",
        },
    ],
}


def _patch_features(monkeypatch, *, scan=_FAKE_SCAN, ica=_FAKE_ICA) -> None:
    """Stub deterministic feature computation used by raw_ai.*."""
    from app.services import raw_ai as raw_ai_mod

    monkeypatch.setattr(raw_ai_mod, "_scan_or_empty", lambda aid, db: dict(scan))
    monkeypatch.setattr(raw_ai_mod, "_ica_or_empty", lambda aid, db: dict(ica))


def _stub_llm_ok(monkeypatch, text: str = "Mocked LLM narrative.") -> None:
    """Force ``raw_ai._safe_llm`` to return a deterministic string."""
    from app.services import raw_ai as raw_ai_mod

    monkeypatch.setattr(raw_ai_mod, "_safe_llm", lambda **kwargs: text)


def _stub_llm_fail(monkeypatch) -> None:
    """Force the underlying ``_llm_chat`` to raise so the wrapper falls back."""
    from app.services import chat_service

    def _boom(*args, **kwargs):
        raise RuntimeError("simulated LLM outage")

    monkeypatch.setattr(chat_service, "_llm_chat", _boom)


# ── 1. Envelope shape on the happy path ─────────────────────────────────────

# The 9 endpoints we expect to expose. Mapped to their HTTP path templates
# (``{aid}`` will be substituted with the fixture analysis id).
ENVELOPE_ENDPOINTS = [
    ("quality_score", "POST", "/api/v1/qeeg-ai/{aid}/quality_score", None),
    ("auto_clean_propose", "POST", "/api/v1/qeeg-ai/{aid}/auto_clean_propose", None),
    (
        "explain_bad_channel",
        "POST",
        "/api/v1/qeeg-ai/{aid}/explain_bad_channel/T3",
        None,
    ),
    ("classify_components", "POST", "/api/v1/qeeg-ai/{aid}/classify_components", None),
    (
        "classify_segment",
        "POST",
        "/api/v1/qeeg-ai/{aid}/classify_segment",
        {"start_sec": 10.0, "end_sec": 14.0},
    ),
    ("recommend_filters", "POST", "/api/v1/qeeg-ai/{aid}/recommend_filters", None),
    ("recommend_montage", "POST", "/api/v1/qeeg-ai/{aid}/recommend_montage", None),
    ("segment_eo_ec", "POST", "/api/v1/qeeg-ai/{aid}/segment_eo_ec", None),
    ("narrate", "POST", "/api/v1/qeeg-ai/{aid}/narrate", None),
]


@pytest.mark.parametrize("name,method,path_tpl,body", ENVELOPE_ENDPOINTS)
def test_envelope_shape_happy_path(
    client: TestClient,
    phase5_fixture: dict[str, Any],
    monkeypatch,
    name: str,
    method: str,
    path_tpl: str,
    body: dict | None,
) -> None:
    """Each AI endpoint returns ``{result, reasoning, features}`` + analysis_id."""
    aid = phase5_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase5_fixture['token']}"}

    _patch_features(monkeypatch)
    _stub_llm_ok(monkeypatch, text=f"OK reasoning for {name}.")

    url = path_tpl.format(aid=aid)
    if method == "POST":
        resp = client.post(url, json=body, headers=headers)
    else:  # pragma: no cover - all routes are POST in Phase 5
        resp = client.get(url, headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # Canonical envelope — three required keys plus the analysis id.
    for key in ("analysis_id", "result", "reasoning", "features"):
        assert key in data, f"{name}: missing '{key}' in {data}"
    assert data["analysis_id"] == aid
    assert data["reasoning"] == f"OK reasoning for {name}."
    assert isinstance(data["features"], dict)
    # ``result`` may be a dict OR a list (classify_components returns a list,
    # segment_eo_ec returns a list of fragments). Both are OK.
    assert data["result"] is not None


# ── 2. LLM-failure path → deterministic result still ships ─────────────────


def test_llm_failure_falls_back_gracefully(
    client: TestClient, phase5_fixture: dict[str, Any], monkeypatch
) -> None:
    aid = phase5_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase5_fixture['token']}"}

    _patch_features(monkeypatch)
    _stub_llm_fail(monkeypatch)  # ``_llm_chat`` raises

    r = client.post(
        f"/api/v1/qeeg-ai/{aid}/quality_score",
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    # Deterministic result is still present.
    assert "score" in data["result"]
    assert "subscores" in data["result"]
    # Reasoning is the documented fallback string.
    assert data["reasoning"] == (
        "LLM unavailable; deterministic result above is authoritative."
    )
    # Features are still populated.
    assert "n_bad_channels" in data["features"]


# ── 3. auto_clean_propose creates an AutoCleanRun row ──────────────────────


def test_auto_clean_propose_creates_autocleanrun(
    client: TestClient, phase5_fixture: dict[str, Any], monkeypatch
) -> None:
    aid = phase5_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase5_fixture['token']}"}

    _patch_features(monkeypatch)
    _stub_llm_ok(monkeypatch, text="auto-clean narrative")

    r = client.post(
        f"/api/v1/qeeg-ai/{aid}/auto_clean_propose",
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    run_id = data["result"].get("run_id")
    assert run_id, data
    # Phase-4-shaped proposal blocks present in result.
    assert "bad_channels" in data["result"]
    assert "bad_segments" in data["result"]
    assert "summary" in data["result"]
    assert "proposed_ic_exclusions" in data["result"]

    db = SessionLocal()
    try:
        run = db.query(AutoCleanRun).filter_by(id=run_id).one()
        assert run.analysis_id == aid
        proposal = json.loads(run.proposal_json)
        assert proposal["bad_channels"][0]["channel"] == "T3"
        assert proposal["proposed_ic_exclusions"][0]["label"] in (
            "eye",
            "muscle",
        )
        # AI proposal audit row exists for this run.
        audit_rows = (
            db.query(CleaningDecision)
            .filter_by(auto_clean_run_id=run_id, action="propose_auto_clean")
            .all()
        )
        assert len(audit_rows) == 1
        assert audit_rows[0].actor == "ai"
    finally:
        db.close()


# ── 4. Audit row is also written for non-run AI endpoints ──────────────────


def test_quality_score_writes_audit_row(
    client: TestClient, phase5_fixture: dict[str, Any], monkeypatch
) -> None:
    aid = phase5_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase5_fixture['token']}"}

    _patch_features(monkeypatch)
    _stub_llm_ok(monkeypatch)

    r = client.post(
        f"/api/v1/qeeg-ai/{aid}/quality_score",
        headers=headers,
    )
    assert r.status_code == 200, r.text

    db = SessionLocal()
    try:
        rows = (
            db.query(CleaningDecision)
            .filter_by(analysis_id=aid, action="propose_quality_score")
            .all()
        )
        assert len(rows) == 1
        assert rows[0].actor == "ai"
    finally:
        db.close()


# ── 5. Auth: clinician role required on all 9 endpoints ────────────────────


@pytest.mark.parametrize("name,method,path_tpl,body", ENVELOPE_ENDPOINTS)
def test_endpoints_require_clinician(
    client: TestClient,
    phase5_fixture: dict[str, Any],
    name: str,
    method: str,
    path_tpl: str,
    body: dict | None,
) -> None:
    aid = phase5_fixture["analysis_id"]
    url = path_tpl.format(aid=aid)
    # No Authorization header → 401 or 403 (depends on whether the auth
    # dep raises before the role guard).
    resp = client.post(url, json=body)
    assert resp.status_code in (401, 403), (
        f"{name}: expected 401/403, got {resp.status_code}: {resp.text}"
    )
