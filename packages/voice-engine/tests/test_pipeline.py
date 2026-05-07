"""Tests for packages/voice-engine/pipeline.py and api/router.py pipeline endpoints.

All heavy deps (boto3, SQLAlchemy, whisper, parselmouth, etc.) are monkeypatched.
No real S3, DB, or LLM calls are made.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest

# Ensure the voice-engine dir is importable (conftest also does this, belt-and-suspenders).
_PKG = str(Path(__file__).parent.parent)
if _PKG not in sys.path:
    sys.path.insert(0, _PKG)

# FastAPI guard — tests that use TestClient are skipped if fastapi isn't present.
fastapi = pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from audio_io import AudioMeta
from biomarkers import BiomarkerFlags, BiomarkerResult
from emotion import EmotionResult
from pipeline import PipelineStatus, VoiceAnalysisResult, run_voice_analysis_for_session
from report import ClinicalFinding, ClinicalVoiceReport
from scoring import RiskScoreResult
from transcription import TranscriptResult, TranscriptSegment


# ---------------------------------------------------------------------------
# Fixture WAV path
# ---------------------------------------------------------------------------

_FIXTURE_WAV = str(Path(__file__).parent / "fixtures" / "sample_16k.wav")


# ---------------------------------------------------------------------------
# Fake result factories
# ---------------------------------------------------------------------------


def _fake_transcript() -> TranscriptResult:
    return TranscriptResult(
        text="Hello world",
        language="en",
        duration_sec=3.0,
        segments=[TranscriptSegment(start=0.0, end=3.0, text="Hello world", confidence=0.95)],
        model_name="fake-whisper",
        diarization_used=False,
    )


def _fake_emotion() -> EmotionResult:
    return EmotionResult(
        overall_emotion="neutral",
        overall_confidence=0.8,
        timeline=[],
        model_name="fake-ser",
        fallback_used=True,
    )


def _fake_biomarkers() -> BiomarkerResult:
    return BiomarkerResult(
        duration_sec=3.0,
        f0_mean_hz=120.0,
        f0_std_hz=10.0,
        f0_min_hz=80.0,
        f0_max_hz=200.0,
        f0_range_hz=120.0,
        jitter_local=0.01,
        jitter_rap=None,
        jitter_ppq5=None,
        jitter_ddp=None,
        shimmer_local=0.05,
        shimmer_apq3=None,
        shimmer_apq5=None,
        shimmer_apq11=None,
        shimmer_dda=None,
        hnr_db=15.0,
        mfcc_means=[0.0] * 13,
        mfcc_stds=[0.0] * 13,
        speech_rate_syllables_per_sec=3.5,
        pause_ratio=0.1,
        voice_breaks_count=0,
        cpp=None,
        flags=BiomarkerFlags(
            elevated_jitter=False,
            reduced_hnr=False,
            flat_f0_range=False,
            high_pause_ratio=False,
        ),
        extraction_warnings=[],
    )


def _fake_risk() -> RiskScoreResult:
    return RiskScoreResult(
        depression_risk=0.2,
        anxiety_risk=0.15,
        stress_level=0.1,
        cognitive_load=0.1,
        risk_tier="low",
        flags=[],
        model_name="fake-risk",
        fallback_used=True,
    )


def _fake_report() -> ClinicalVoiceReport:
    return ClinicalVoiceReport(
        summary="Patterns within normal limits.",
        findings=[],
        recommendations=["No immediate action required."],
        risk_tier="low",
        raw_scores={
            "depression_risk": 0.2,
            "anxiety_risk": 0.15,
            "stress_level": 0.1,
            "cognitive_load": 0.1,
        },
        raw_flags=[],
        data_quality_notes=["Fallback scoring used."],
    )


def _fake_voice_analysis_result() -> VoiceAnalysisResult:
    return VoiceAnalysisResult(
        audio_meta=None,
        transcript=_fake_transcript(),
        emotion=_fake_emotion(),
        biomarkers=_fake_biomarkers(),
        risk=_fake_risk(),
        report=_fake_report(),
        pipeline_status=PipelineStatus(
            steps_completed=["transcription", "emotion", "biomarkers", "scoring", "report"],
            failed_steps=[],
            total_steps=5,
        ),
    )


# ---------------------------------------------------------------------------
# Test 1: Happy path — all 5 stages complete
# ---------------------------------------------------------------------------


def test_run_voice_analysis_for_session_happy_path(monkeypatch):
    """All stages succeed; result has all 5 steps_completed, no failed_steps."""

    # Patch S3 download to return the fixture WAV path.
    monkeypatch.setattr("pipeline._download_processed_to_temp", lambda key: _FIXTURE_WAV)

    # Patch each engine function on the pipeline module (the module that imports them).
    monkeypatch.setattr("pipeline.transcribe_audio", lambda path: _fake_transcript())
    monkeypatch.setattr(
        "pipeline.analyze_emotion",
        lambda path, segments: _fake_emotion(),
    )
    monkeypatch.setattr("pipeline.extract_biomarkers", lambda path: _fake_biomarkers())
    monkeypatch.setattr(
        "pipeline.score_risk",
        lambda biomarkers, emotion=None: _fake_risk(),
    )
    monkeypatch.setattr(
        "pipeline.generate_clinical_report",
        lambda risk, biomarkers=None, emotion=None, transcript=None: _fake_report(),
    )

    # Also patch os.unlink so we don't try to delete the real fixture.
    monkeypatch.setattr("pipeline.os.unlink", lambda p: None)

    result = run_voice_analysis_for_session("pt-x", "sess-1", db_session=None)

    assert isinstance(result, VoiceAnalysisResult)
    assert result.pipeline_status.total_steps == 5
    assert set(result.pipeline_status.steps_completed) == {
        "transcription", "emotion", "biomarkers", "scoring", "report"
    }
    assert result.pipeline_status.failed_steps == []
    assert result.report is not None
    assert result.risk is not None


# ---------------------------------------------------------------------------
# Test 2: biomarkers fails → scoring and report skipped
# ---------------------------------------------------------------------------


def test_run_voice_analysis_handles_step_failure(monkeypatch):
    """biomarkers raises → scoring skipped (dependency), report skipped (risk is None)."""

    monkeypatch.setattr("pipeline._download_processed_to_temp", lambda key: _FIXTURE_WAV)
    monkeypatch.setattr("pipeline.transcribe_audio", lambda path: _fake_transcript())
    monkeypatch.setattr(
        "pipeline.analyze_emotion",
        lambda path, segments: _fake_emotion(),
    )
    monkeypatch.setattr(
        "pipeline.extract_biomarkers",
        lambda path: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    # scoring and report should not be called, but patch defensively.
    monkeypatch.setattr(
        "pipeline.score_risk",
        lambda biomarkers, emotion=None: _fake_risk(),
    )
    monkeypatch.setattr(
        "pipeline.generate_clinical_report",
        lambda risk, biomarkers=None, emotion=None, transcript=None: _fake_report(),
    )
    monkeypatch.setattr("pipeline.os.unlink", lambda p: None)

    result = run_voice_analysis_for_session("pt-x", "sess-1", db_session=None)

    assert isinstance(result, VoiceAnalysisResult)
    assert "biomarkers" in result.pipeline_status.failed_steps
    # scoring skipped because biomarkers failed
    assert "scoring" in result.pipeline_status.failed_steps
    # report skipped because risk is None (scoring never ran)
    assert "report" in result.pipeline_status.failed_steps
    # Function did not raise
    assert result.risk is None
    assert result.report is None


# ---------------------------------------------------------------------------
# Test 3: /voice/analyze endpoint runs pipeline and returns JSON
# ---------------------------------------------------------------------------


def test_analyze_endpoint_runs_pipeline_and_returns_json(monkeypatch):
    """POST /voice/analyze/{session_id} calls pipeline, returns proper JSON."""
    import importlib
    import importlib.util

    # Import the router *module* directly, bypassing api/__init__.py which re-exports
    # the APIRouter object and shadows the module reference.
    spec = importlib.util.spec_from_file_location(
        "api.router",
        str(Path(__file__).parent.parent / "api" / "router.py"),
    )
    voice_router_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(voice_router_module)

    # Monkeypatch pipeline.run_voice_analysis_for_session on the router module.
    monkeypatch.setattr(
        voice_router_module._pipeline,
        "run_voice_analysis_for_session",
        lambda patient_id, session_id, db_session=None: _fake_voice_analysis_result(),
    )

    # Monkeypatch DB dependency to return None (no DB).
    monkeypatch.setattr(
        voice_router_module,
        "_get_optional_db",
        lambda: iter([None]),
    )

    app = FastAPI()
    app.include_router(voice_router_module.router)
    client = TestClient(app)

    resp = client.post("/voice/analyze/sess-1", json={"patient_id": "pt-x"})

    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "session_id" in data
    assert "patient_id" in data
    assert "risk_tier" in data
    assert "risk_scores" in data
    assert "pipeline_status" in data
    assert data["status"] == "completed"
    assert data["session_id"] == "sess-1"


# ---------------------------------------------------------------------------
# Test 4: /voice/result endpoint — pending, completed, and not-found
# ---------------------------------------------------------------------------


class _FakeRow:
    """Minimal stand-in for an AudioAnalysis ORM row."""

    def __init__(self, status: str, session_id: str = "sess-2", patient_id: str = "pt-y"):
        self.status = status
        self.session_id = session_id
        self.patient_id = patient_id
        _blob = {
            "summary": "Patterns within normal limits.",
            "risk_tier": "low",
            "raw_scores": {"depression_risk": 0.2, "anxiety_risk": 0.15, "stress_level": 0.1, "cognitive_load": 0.1},
            "raw_flags": [],
            "flags": [],
            "data_quality_notes": ["Fallback used."],
        }
        self.voice_report_json = json.dumps(_blob)


def test_result_endpoint_pending_and_completed(monkeypatch):
    """GET /voice/result/{session_id}: 404, pending, and completed cases."""
    import importlib
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "api.router",
        str(Path(__file__).parent.parent / "api" / "router.py"),
    )
    voice_router_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(voice_router_module)

    # Monkeypatch DB dependency to no-op.
    monkeypatch.setattr(
        voice_router_module,
        "_get_optional_db",
        lambda: iter([None]),
    )

    app = FastAPI()
    app.include_router(voice_router_module.router)
    client = TestClient(app)

    # Sub-test A: no row → 404
    monkeypatch.setattr(
        voice_router_module,
        "_lookup_audio_analysis",
        lambda session_id, db=None: None,
    )
    resp = client.get("/voice/result/sess-missing")
    assert resp.status_code == 404

    # Sub-test B: status="uploaded" → pending
    monkeypatch.setattr(
        voice_router_module,
        "_lookup_audio_analysis",
        lambda session_id, db=None: _FakeRow(status="uploaded", session_id=session_id),
    )
    resp = client.get("/voice/result/sess-2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending"
    assert data["session_id"] == "sess-2"

    # Sub-test C: status="completed" with JSON blob
    monkeypatch.setattr(
        voice_router_module,
        "_lookup_audio_analysis",
        lambda session_id, db=None: _FakeRow(status="completed", session_id=session_id),
    )
    resp = client.get("/voice/result/sess-2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert "summary" in data
    assert "risk_tier" in data
    assert "flags" in data
    assert "data_quality_notes" in data
