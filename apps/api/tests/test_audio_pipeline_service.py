"""Tests for app.services.audio_pipeline — facade behaviour (PR 83/N).

Covers:
- HAS_AUDIO_PIPELINE is a bool
- run_voice_analysis_safe returns disabled envelope when pipeline unavailable
- run_voice_analysis_safe returns ok=True envelope with mocked pipeline
- run_voice_analysis_safe returns error envelope on pipeline exception
- error envelope has expected keys
- disabled envelope has expected keys and correct error code
- __all__ exports are importable
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch


def test_has_audio_pipeline_is_bool():
    from app.services.audio_pipeline import HAS_AUDIO_PIPELINE

    assert isinstance(HAS_AUDIO_PIPELINE, bool)


def test_disabled_envelope_when_pipeline_unavailable():
    """When the optional dep is not installed, run_voice_analysis_safe returns a structured error."""
    with patch("app.services.audio_pipeline.HAS_AUDIO_PIPELINE", False), \
         patch("app.services.audio_pipeline.run_voice_pipeline_from_paths", None):
        from app.services.audio_pipeline import run_voice_analysis_safe

        result = run_voice_analysis_safe(
            "/tmp/test.wav",
            session_id="sess-001",
            task_protocol="sustained_vowel_a",
        )

    assert result["ok"] is False
    assert result["error"] == "audio_pipeline_unavailable"
    assert "detail" in result


def test_disabled_envelope_contains_install_hint():
    with patch("app.services.audio_pipeline.HAS_AUDIO_PIPELINE", False), \
         patch("app.services.audio_pipeline.run_voice_pipeline_from_paths", None):
        from app.services.audio_pipeline import run_voice_analysis_safe

        result = run_voice_analysis_safe("/tmp/a.wav", session_id="s-001")

    assert "deepsynaps-audio" in result["detail"]


def test_ok_envelope_when_pipeline_succeeds():
    mock_artifact = MagicMock()
    mock_artifact.model_dump.return_value = {"type": "spectral", "value": 0.42}

    mock_run = MagicMock()
    mock_run.run_id = "run-xyz"
    mock_run.status = "completed"
    mock_run.context = {"protocol": "sustained_vowel_a"}
    mock_run.artifacts = [mock_artifact]

    mock_pipeline = MagicMock(return_value=mock_run)

    with patch("app.services.audio_pipeline.HAS_AUDIO_PIPELINE", True), \
         patch("app.services.audio_pipeline.run_voice_pipeline_from_paths", mock_pipeline):
        from app.services.audio_pipeline import run_voice_analysis_safe

        result = run_voice_analysis_safe(
            "/tmp/test.wav",
            session_id="sess-ok",
            task_protocol="sustained_vowel_a",
            patient_id="pt-001",
            transcript="ahh",
        )

    assert result["ok"] is True
    assert result["run_id"] == "run-xyz"
    assert result["status"] == "completed"
    assert len(result["artifacts"]) == 1
    assert result["artifacts"][0]["type"] == "spectral"


def test_error_envelope_on_pipeline_exception():
    def _raise(*args, **kwargs):
        raise RuntimeError("librosa failed")

    with patch("app.services.audio_pipeline.HAS_AUDIO_PIPELINE", True), \
         patch("app.services.audio_pipeline.run_voice_pipeline_from_paths", _raise):
        from app.services.audio_pipeline import run_voice_analysis_safe

        result = run_voice_analysis_safe("/tmp/bad.wav", session_id="sess-err")

    assert result["ok"] is False
    assert result["error"] == "voice_pipeline_failed"
    assert "librosa failed" in result["detail"]


def test_error_envelope_has_required_keys():
    with patch("app.services.audio_pipeline.HAS_AUDIO_PIPELINE", True), \
         patch("app.services.audio_pipeline.run_voice_pipeline_from_paths", side_effect=ValueError("bad")):
        from app.services.audio_pipeline import run_voice_analysis_safe

        result = run_voice_analysis_safe("/tmp/x.wav", session_id="s-x")

    assert {"ok", "error", "detail"} <= set(result.keys())


def test_all_exports_are_importable():
    from app.services import audio_pipeline

    for name in audio_pipeline.__all__:
        assert hasattr(audio_pipeline, name), f"Missing __all__ export: {name}"


def test_pipeline_called_with_correct_kwargs():
    mock_run = MagicMock()
    mock_run.run_id = "run-kwarg"
    mock_run.status = "completed"
    mock_run.context = {}
    mock_run.artifacts = []

    mock_pipeline = MagicMock(return_value=mock_run)

    with patch("app.services.audio_pipeline.HAS_AUDIO_PIPELINE", True), \
         patch("app.services.audio_pipeline.run_voice_pipeline_from_paths", mock_pipeline):
        from app.services.audio_pipeline import run_voice_analysis_safe

        run_voice_analysis_safe(
            "/data/audio.wav",
            session_id="sess-kw",
            task_protocol="reading_passage",
            patient_id="pt-kw",
            transcript="hello world",
        )

    mock_pipeline.assert_called_once_with(
        audio_path="/data/audio.wav",
        session_id="sess-kw",
        task_protocol="reading_passage",
        patient_id="pt-kw",
        transcript="hello world",
    )
