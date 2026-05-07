"""Tests for packages/voice-engine/pipeline.py and api/router.py pipeline endpoints.

All heavy deps (SQLAlchemy, whisper, parselmouth, etc.) are monkeypatched.
No real filesystem, DB, or LLM calls are made.
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
        disclaimer=(
            "Voice-derived decision support; not a diagnostic device. "
            "Patterns are statistical, not validated against clinical outcomes. "
            "All findings require clinician interpretation."
        ),
        engine_version="0.1.0",
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
# Fake actor helper for auth tests
# ---------------------------------------------------------------------------


def _make_fake_actor(clinic_id: str, role: str = "clinician") -> Any:
    """Build a minimal object that duck-types as AuthenticatedActor for gate tests."""
    from types import SimpleNamespace
    return SimpleNamespace(actor_id="actor-test", display_name="Test Actor", role=role, clinic_id=clinic_id)


# ---------------------------------------------------------------------------
# Test 1: Happy path — all 5 stages complete
# ---------------------------------------------------------------------------


def test_run_voice_analysis_for_session_happy_path(monkeypatch):
    """All stages succeed; result has all 5 steps_completed, no failed_steps."""

    # Patch volume path resolution to return the fixture WAV path.
    monkeypatch.setattr("pipeline._resolve_processed_path", lambda key: _FIXTURE_WAV)

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

    monkeypatch.setattr("pipeline._resolve_processed_path", lambda key: _FIXTURE_WAV)
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

    # Monkeypatch DB dependency to return a non-None placeholder so the row lookup runs.
    monkeypatch.setattr(
        voice_router_module,
        "_get_optional_db",
        lambda: iter([object()]),
    )

    # Supply a fake DB row so the handler does not 404 (Blocker 3 behavior).
    monkeypatch.setattr(
        voice_router_module,
        "_lookup_audio_analysis",
        lambda session_id, db=None: _FakeRow(status="completed", session_id=session_id, patient_id="pt-x"),
    )

    app = FastAPI()
    app.include_router(voice_router_module.router)
    # Override auth dependency to return None (no auth in bare test env).
    try:
        from app.auth import get_authenticated_actor
        app.dependency_overrides[get_authenticated_actor] = lambda: None
    except ImportError:
        pass

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
    assert "disclaimer" in data
    assert "engine_version" in data


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
    try:
        from app.auth import get_authenticated_actor
        app.dependency_overrides[get_authenticated_actor] = lambda: None
    except ImportError:
        pass

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


# ---------------------------------------------------------------------------
# Auth tests: cross-clinic 403 paths
# ---------------------------------------------------------------------------


def _load_voice_router_module():
    """Helper: load api/router.py as a fresh module for each auth test."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "api.router_auth",
        str(Path(__file__).parent.parent / "api" / "router.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _FakeRowWithClinic:
    """AudioAnalysis row stub with a patient in clinic-a."""

    def __init__(self, session_id: str = "sess-x", patient_id: str = "pt-a"):
        self.session_id = session_id
        self.patient_id = patient_id
        self.status = "completed"
        self.voice_report_json = json.dumps({"risk_tier": "low", "summary": "ok"})


def _make_cross_clinic_app(router_mod, actor_clinic_id: str, patient_clinic_id: str, db_row=None):
    """Build a TestClient app wired with a cross-clinic actor and a DB row whose patient
    is in a different clinic.  Patches _gate_session_clinic_access to perform a real
    clinic comparison without importing the full app.auth stack.
    """
    from fastapi import HTTPException as _HTTPException

    actor = _make_fake_actor(clinic_id=actor_clinic_id)

    # Replace _gate_session_clinic_access with a thin local implementation that
    # just compares clinic IDs directly — no app.auth import needed in tests.
    def _fake_gate(gate_actor, patient_id, db):
        if gate_actor is None or not patient_id:
            return
        if gate_actor.clinic_id != patient_clinic_id:
            raise _HTTPException(status_code=403, detail="session not in your clinic")

    router_mod._gate_session_clinic_access = _fake_gate
    router_mod._get_optional_db = lambda: iter([object()])  # non-None DB placeholder

    if db_row is not None:
        router_mod._lookup_audio_analysis = lambda session_id, db=None: db_row

    app = FastAPI()
    app.include_router(router_mod.router)

    # Override the auth dependency to inject our fake actor.
    # _get_actor_dependency() returns Depends(get_authenticated_actor) when importable,
    # but in this test env app.auth isn't importable — the dependency resolves to None
    # by default. We patch at the router function level instead by re-wiring
    # dependency_overrides if possible, else rely on the gate patch above being called
    # with the actor we inject via a thin wrapper.

    # The cleanest approach: replace _get_optional_db AND override the actor seam
    # by wrapping the endpoint via dependency_overrides on the *app* level.
    # Since actor comes from _get_actor_dependency() which returns Depends(fn),
    # and fn is get_authenticated_actor (lazy), we re-patch the module-level
    # _get_actor_dependency to return our actor directly.
    router_mod._current_test_actor = actor

    original_actor_dep = router_mod._get_actor_dependency

    def _patched_actor_dep():
        from fastapi import Depends
        return Depends(lambda: router_mod._current_test_actor)

    router_mod._get_actor_dependency = _patched_actor_dep

    # Re-exec the router registration with the patched dependency.
    # Actually we need to rebuild the app with updated routes.
    # Simplest: rebuild entirely.
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "api.router_rebuilt",
        str(Path(__file__).parent.parent / "api" / "router.py"),
    )
    mod2 = importlib.util.module_from_spec(spec)
    # Inject our actor factory before exec
    import sys
    # Temporarily make a fake app.auth importable so _get_actor_dependency resolves.
    # We'll inject a fake module.
    import types
    fake_auth_mod = types.ModuleType("app.auth")
    fake_auth_mod.get_authenticated_actor = lambda: router_mod._current_test_actor  # type: ignore[attr-defined]
    fake_app_mod = types.ModuleType("app")
    sys.modules.setdefault("app", fake_app_mod)
    sys.modules["app.auth"] = fake_auth_mod

    spec.loader.exec_module(mod2)
    mod2._gate_session_clinic_access = _fake_gate
    mod2._get_optional_db = lambda: iter([object()])
    if db_row is not None:
        mod2._lookup_audio_analysis = lambda session_id, db=None: db_row

    app2 = FastAPI()
    app2.include_router(mod2.router)

    # Override get_authenticated_actor at app level.
    app2.dependency_overrides[fake_auth_mod.get_authenticated_actor] = lambda: actor

    return TestClient(app2)


def test_result_endpoint_blocks_cross_clinic_access():
    """GET /voice/result/{session_id}: actor from clinic-b gets 403 for session in clinic-a."""
    import importlib.util, types, sys

    actor_clinic = "clinic-b"
    patient_clinic = "clinic-a"
    actor = _make_fake_actor(clinic_id=actor_clinic)
    row = _FakeRowWithClinic(session_id="sess-cross", patient_id="pt-clinic-a")

    from fastapi import HTTPException as _HTTPException, FastAPI as _FastAPI, Depends as _Depends

    def _fake_gate(gate_actor, patient_id, db):
        if gate_actor is None or not patient_id:
            return
        if getattr(gate_actor, "clinic_id", None) != patient_clinic:
            raise _HTTPException(status_code=403, detail="session not in your clinic")

    # Build fresh module with fake app.auth injected
    fake_auth_mod = types.ModuleType("app.auth")
    fake_auth_mod.get_authenticated_actor = lambda: actor  # type: ignore[attr-defined]
    fake_app_mod = sys.modules.get("app") or types.ModuleType("app")
    sys.modules["app"] = fake_app_mod
    sys.modules["app.auth"] = fake_auth_mod

    spec = importlib.util.spec_from_file_location(
        "api.router_result_test",
        str(Path(__file__).parent.parent / "api" / "router.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    mod._gate_session_clinic_access = _fake_gate
    mod._get_optional_db = lambda: iter([object()])
    mod._lookup_audio_analysis = lambda session_id, db=None: row

    app = _FastAPI()
    app.include_router(mod.router)
    app.dependency_overrides[fake_auth_mod.get_authenticated_actor] = lambda: actor

    client = TestClient(app)
    resp = client.get("/voice/result/sess-cross")
    assert resp.status_code == 403
    assert resp.json()["detail"] == "session not in your clinic"


def test_analyze_endpoint_blocks_cross_clinic_access():
    """POST /voice/analyze/{session_id}: actor from clinic-b gets 403 for session in clinic-a."""
    import importlib.util, types, sys

    actor_clinic = "clinic-b"
    patient_clinic = "clinic-a"
    actor = _make_fake_actor(clinic_id=actor_clinic)
    row = _FakeRowWithClinic(session_id="sess-cross2", patient_id="pt-clinic-a")

    from fastapi import HTTPException as _HTTPException, FastAPI as _FastAPI

    def _fake_gate(gate_actor, patient_id, db):
        if gate_actor is None or not patient_id:
            return
        if getattr(gate_actor, "clinic_id", None) != patient_clinic:
            raise _HTTPException(status_code=403, detail="session not in your clinic")

    fake_auth_mod = types.ModuleType("app.auth")
    fake_auth_mod.get_authenticated_actor = lambda: actor  # type: ignore[attr-defined]
    sys.modules["app.auth"] = fake_auth_mod

    spec = importlib.util.spec_from_file_location(
        "api.router_analyze_test",
        str(Path(__file__).parent.parent / "api" / "router.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    mod._gate_session_clinic_access = _fake_gate
    mod._get_optional_db = lambda: iter([object()])
    mod._lookup_audio_analysis = lambda session_id, db=None: row

    app = _FastAPI()
    app.include_router(mod.router)
    app.dependency_overrides[fake_auth_mod.get_authenticated_actor] = lambda: actor

    client = TestClient(app)
    resp = client.post("/voice/analyze/sess-cross2", json={})
    assert resp.status_code == 403
    assert resp.json()["detail"] == "session not in your clinic"


def test_upload_endpoint_blocks_patient_outside_actor_clinic():
    """POST /voice/upload: actor from clinic-b gets 403 for uploading to patient in clinic-a."""
    import importlib.util, types, sys

    actor_clinic = "clinic-b"
    patient_clinic = "clinic-a"
    actor = _make_fake_actor(clinic_id=actor_clinic)

    from fastapi import HTTPException as _HTTPException, FastAPI as _FastAPI

    def _fake_gate(gate_actor, patient_id, db):
        if gate_actor is None or not patient_id:
            return
        # Simulate patient being in clinic-a
        if getattr(gate_actor, "clinic_id", None) != patient_clinic:
            raise _HTTPException(status_code=403, detail="session not in your clinic")

    fake_auth_mod = types.ModuleType("app.auth")
    fake_auth_mod.get_authenticated_actor = lambda: actor  # type: ignore[attr-defined]
    sys.modules["app.auth"] = fake_auth_mod

    spec = importlib.util.spec_from_file_location(
        "api.router_upload_test",
        str(Path(__file__).parent.parent / "api" / "router.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    mod._gate_session_clinic_access = _fake_gate
    mod._get_optional_db = lambda: iter([object()])

    app = _FastAPI()
    app.include_router(mod.router)
    app.dependency_overrides[fake_auth_mod.get_authenticated_actor] = lambda: actor

    client = TestClient(app)
    resp = client.post(
        "/voice/upload",
        data={"patient_id": "pt-clinic-a"},
        files={"file": ("test.wav", b"RIFF\x00\x00\x00\x00WAVEfmt ", "audio/wav")},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "session not in your clinic"


# ---------------------------------------------------------------------------
# Security regression tests (Blocker 2, 3, 4)
# ---------------------------------------------------------------------------


def test_gate_real_cross_clinic_403():
    """Real _gate_session_clinic_access raises 403 when actor is in a different clinic.

    Exercises the gate without stubbing it out — monkeypatches only the three
    lazy imports (app.auth, app.repositories.patients, app.errors).
    """
    import importlib.util, types, sys
    from fastapi import HTTPException as _HTTPException

    actor = _make_fake_actor(clinic_id="clinic-b")

    # Fake app.auth — get_authenticated_actor returns our actor; require_patient_owner
    # raises ApiServiceError with code="cross_clinic_access_denied" on mismatch.
    class _FakeApiServiceError(Exception):
        def __init__(self, code: str):
            self.code = code

    fake_auth_mod = types.ModuleType("app.auth")
    fake_auth_mod.get_authenticated_actor = lambda: actor  # type: ignore[attr-defined]

    def _require_patient_owner(act, clinic_id):
        if getattr(act, "clinic_id", None) != clinic_id:
            raise _FakeApiServiceError(code="cross_clinic_access_denied")

    fake_auth_mod.require_patient_owner = _require_patient_owner  # type: ignore[attr-defined]

    # Fake app.repositories.patients — patient is in clinic-a.
    fake_repo_patients_mod = types.ModuleType("app.repositories.patients")
    fake_repo_patients_mod.resolve_patient_clinic_id = lambda db, pid: (True, "clinic-a")  # type: ignore[attr-defined]

    # Fake app.errors — ApiServiceError is our local class.
    fake_errors_mod = types.ModuleType("app.errors")
    fake_errors_mod.ApiServiceError = _FakeApiServiceError  # type: ignore[attr-defined]

    fake_app_mod = sys.modules.get("app") or types.ModuleType("app")
    sys.modules.setdefault("app", fake_app_mod)
    sys.modules["app.auth"] = fake_auth_mod
    sys.modules["app.repositories"] = types.ModuleType("app.repositories")
    sys.modules["app.repositories.patients"] = fake_repo_patients_mod
    sys.modules["app.errors"] = fake_errors_mod

    # Load a fresh router module so it picks up the injected sys.modules.
    spec = importlib.util.spec_from_file_location(
        "api.router_real_gate_test",
        str(Path(__file__).parent.parent / "api" / "router.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    # Call the real gate directly — actor in clinic-b, patient in clinic-a.
    with pytest.raises(_HTTPException) as exc_info:
        mod._gate_session_clinic_access(actor, "pt-clinic-a", object())
    assert exc_info.value.status_code == 403
    assert "clinic" in exc_info.value.detail


def test_gate_fail_closed_on_missing_import():
    """_gate_session_clinic_access raises (propagates ImportError as 500) when
    app.repositories.patients is missing — it must NOT silently return.
    """
    import importlib.util, types, sys

    actor = _make_fake_actor(clinic_id="clinic-b")

    # app.auth is importable but app.repositories.patients is NOT.
    fake_auth_mod = types.ModuleType("app.auth")
    fake_auth_mod.get_authenticated_actor = lambda: actor  # type: ignore[attr-defined]
    fake_app_mod = sys.modules.get("app") or types.ModuleType("app")
    sys.modules.setdefault("app", fake_app_mod)
    sys.modules["app.auth"] = fake_auth_mod
    # Ensure the patients sub-module is absent so the lazy import fails.
    sys.modules.pop("app.repositories.patients", None)
    sys.modules.pop("app.repositories", None)
    sys.modules.pop("app.errors", None)

    spec = importlib.util.spec_from_file_location(
        "api.router_fail_closed_test",
        str(Path(__file__).parent.parent / "api" / "router.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    # Gate must raise — NOT silently return — when a required dep is absent.
    with pytest.raises((ImportError, Exception)) as exc_info:
        mod._gate_session_clinic_access(actor, "pt-x", object())
    # Must not be a silent no-op: an exception was raised (ImportError propagates).
    assert exc_info.value is not None


def test_analyze_returns_404_when_no_db_row():
    """POST /voice/analyze/{session_id} returns 404 when no AudioAnalysis row exists.

    Verifies Blocker 3: the handler must not fall back to body.patient_id for
    gating when the DB has no record.
    """
    import importlib.util, types, sys
    from fastapi import FastAPI as _FastAPI

    fake_auth_mod = types.ModuleType("app.auth")
    fake_auth_mod.get_authenticated_actor = lambda: None  # type: ignore[attr-defined]
    fake_app_mod = sys.modules.get("app") or types.ModuleType("app")
    sys.modules.setdefault("app", fake_app_mod)
    sys.modules["app.auth"] = fake_auth_mod

    spec = importlib.util.spec_from_file_location(
        "api.router_404_test",
        str(Path(__file__).parent.parent / "api" / "router.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    # DB always returns None — no row exists.
    mod._lookup_audio_analysis = lambda session_id, db=None: None
    mod._get_optional_db = lambda: iter([object()])

    app = _FastAPI()
    app.include_router(mod.router)
    app.dependency_overrides[fake_auth_mod.get_authenticated_actor] = lambda: None

    client = TestClient(app)
    resp = client.post("/voice/analyze/no-such-session", json={"patient_id": "pt-spoof"})
    assert resp.status_code == 404
    assert resp.json()["detail"] == "session not found"
