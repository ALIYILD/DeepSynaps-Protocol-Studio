"""Additional tests for clinician_facade.py residual branches (PR 84).

Targets missing lines from 65% coverage:
- line 23: import_voice_sample → delegates to load_recording (needs mock)
- line 37: check_audio_quality → delegates to compute_qc
- line 49-54: extract_acoustic_features uses voice_handler_acoustic
- lines 66-76: compute_pd_voice_biomarkers full bundle

Research/wellness positioning: all tests verify contract, not diagnostic claims.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from deepsynaps_audio.clinician_facade import (
    check_audio_quality,
    compute_pd_voice_biomarkers,
    extract_acoustic_features,
    extract_audio_metadata,
    gate_audio_for_analysis,
    score_pd_voice_risk,
)
from deepsynaps_audio.schemas import (
    AcousticFeatureSet,
    PDVoiceRiskScore,
    QCReport,
    Recording,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_recording(waveform: list[float] | None = None, sr: int = 16000) -> Recording:
    n = len(waveform) if waveform else 0
    return Recording(
        recording_id=uuid4(),
        task_protocol="sustained_vowel_a",
        sample_rate=sr,
        duration_s=n / sr if n else 0.0,
        n_samples=n,
        channels=1,
        waveform=waveform,
    )


def _make_qc_report(recording: Recording, verdict: str = "pass") -> QCReport:
    return QCReport(
        recording_id=recording.recording_id,
        verdict=verdict,  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# import_voice_sample (line 23) — delegates to load_recording
# ---------------------------------------------------------------------------

def test_import_voice_sample_delegates_to_load_recording() -> None:
    """import_voice_sample is an alias for load_recording — verify delegation."""
    from deepsynaps_audio import clinician_facade

    mock_rec = _make_recording([0.1, 0.2, 0.3], sr=16000)
    with patch.object(clinician_facade, "load_recording", return_value=mock_rec) as mock_lr:
        result = clinician_facade.import_voice_sample("/fake/path/clip.wav", "sustained_vowel_a")

    mock_lr.assert_called_once_with("/fake/path/clip.wav", "sustained_vowel_a")
    assert result is mock_rec


def test_import_voice_sample_propagates_load_error() -> None:
    """If load_recording raises (missing acoustic deps), import_voice_sample propagates it."""
    from deepsynaps_audio import clinician_facade

    with patch.object(clinician_facade, "load_recording", side_effect=ImportError("acoustic deps")):
        with pytest.raises(ImportError, match="acoustic deps"):
            clinician_facade.import_voice_sample("/no/file.wav", "sustained_vowel_a")


# ---------------------------------------------------------------------------
# extract_audio_metadata — already at 100% but validate contract
# ---------------------------------------------------------------------------

def test_extract_audio_metadata_excludes_waveform() -> None:
    rec = _make_recording([0.1] * 1000)
    meta = extract_audio_metadata(rec)
    assert "waveform" not in meta
    assert meta["task_protocol"] == "sustained_vowel_a"
    assert meta["sample_rate"] == 16000
    assert "recording_id" in meta


# ---------------------------------------------------------------------------
# check_audio_quality (line 37) — delegates to compute_qc
# ---------------------------------------------------------------------------

def test_check_audio_quality_returns_qc_report() -> None:
    """check_audio_quality should return a QCReport for a Recording with waveform."""
    import numpy as np, math
    sr = 16000
    t = [math.sin(2 * math.pi * 200 * i / sr) * 0.3 for i in range(sr)]
    rec = _make_recording(t, sr=sr)
    qc = check_audio_quality(rec)
    assert isinstance(qc, QCReport)
    assert qc.recording_id == rec.recording_id
    assert qc.verdict in {"pass", "warn", "fail"}


def test_check_audio_quality_delegates_to_compute_qc() -> None:
    """Verify that compute_qc is called, not re-implemented."""
    from deepsynaps_audio import clinician_facade

    rec = _make_recording([0.1] * 100)
    mock_qc = QCReport(recording_id=rec.recording_id, verdict="warn")
    with patch.object(clinician_facade, "compute_qc", return_value=mock_qc) as mock_fn:
        result = check_audio_quality(rec)

    mock_fn.assert_called_once_with(rec)
    assert result is mock_qc


# ---------------------------------------------------------------------------
# gate_audio_for_analysis
# ---------------------------------------------------------------------------

def test_gate_audio_for_analysis_pass_verdict() -> None:
    rec = _make_recording([0.1])
    qc = QCReport(recording_id=rec.recording_id, verdict="pass")
    assert gate_audio_for_analysis(qc) is True


def test_gate_audio_for_analysis_fail_verdict() -> None:
    rec = _make_recording([0.1])
    qc = QCReport(recording_id=rec.recording_id, verdict="fail")
    assert gate_audio_for_analysis(qc) is False


# ---------------------------------------------------------------------------
# extract_acoustic_features (lines 49-54)
# ---------------------------------------------------------------------------

def test_extract_acoustic_features_returns_dict() -> None:
    """extract_acoustic_features calls voice_handler_acoustic which mutates ctx,
    then returns ctx minus the 'recording' key."""
    from deepsynaps_audio import clinician_facade

    rec = _make_recording([0.1] * 1000)

    # voice_handler_acoustic mutates ctx directly and returns ({}, artifacts).
    # Use a side_effect to simulate the mutation.
    def fake_acoustic(ctx: dict, node: Any, inp: Any) -> tuple[dict, list]:
        ctx["acoustic_features"] = {"f0_mean_hz": 115.0}
        ctx["perturbation"] = {"jitter_local": 0.005, "hnr_db": 20.0}
        return {}, []

    with patch.object(clinician_facade, "voice_handler_acoustic", side_effect=fake_acoustic) as mock_fn:
        result = extract_acoustic_features(rec)

    assert mock_fn.called
    assert "acoustic_features" in result
    # waveform key dropped
    assert "recording" not in result


def test_extract_acoustic_features_no_recording_in_output() -> None:
    """The 'recording' key (raw waveform) must not appear in the returned dict,
    even if voice_handler_acoustic injects it into ctx."""
    from deepsynaps_audio import clinician_facade

    rec = _make_recording([0.1] * 200)

    def fake_acoustic(ctx: dict, node: Any, inp: Any) -> tuple[dict, list]:
        # Simulate a handler that writes recording back into ctx (shouldn't happen
        # in practice, but the filter must strip it either way)
        ctx["recording"] = {"waveform": [0.1] * 200}
        ctx["acoustic_features"] = {"f0_mean_hz": 100.0}
        return {}, []

    with patch.object(clinician_facade, "voice_handler_acoustic", side_effect=fake_acoustic):
        result = extract_acoustic_features(rec)

    assert "recording" not in result
    assert "acoustic_features" in result


# ---------------------------------------------------------------------------
# score_pd_voice_risk
# ---------------------------------------------------------------------------

def test_score_pd_voice_risk_returns_dict() -> None:
    """score_pd_voice_risk delegates to pd_voice_likelihood and returns dict.

    pd_voice_likelihood returns a PDLikelihood (no model_name field — that
    lives on PDVoiceRiskScore used in reports). The returned dict has
    score, confidence, model_version, drivers, percentile.
    """
    features = {
        "jitter_local": 0.008,
        "shimmer_local": 0.05,
        "hnr_db": 18.0,
        "rpde": 0.45,
        "dfa": 0.72,
        "ppe": 0.22,
    }
    result = score_pd_voice_risk(features)
    assert isinstance(result, dict)
    assert "score" in result
    assert "confidence" in result
    assert "model_version" in result
    assert 0.0 <= result["score"] <= 1.0


def test_score_pd_voice_risk_empty_features() -> None:
    """Empty feature map should not crash — falls back to default model."""
    result = score_pd_voice_risk({})
    assert isinstance(result, dict)
    assert "score" in result


# ---------------------------------------------------------------------------
# compute_pd_voice_biomarkers (lines 66-76) — full nonlinear + PD bundle
# ---------------------------------------------------------------------------

def test_compute_pd_voice_biomarkers_structure() -> None:
    """compute_pd_voice_biomarkers returns dict with 'nonlinear' and 'pd_likelihood' keys."""
    from deepsynaps_audio import clinician_facade

    rec = _make_recording([0.1] * 500)

    fake_nl = MagicMock()
    fake_nl.rpde = 0.45
    fake_nl.dfa = 0.72
    fake_nl.ppe = 0.22
    fake_nl.model_dump.return_value = {"rpde": 0.45, "dfa": 0.72, "ppe": 0.22}

    fake_pd = PDVoiceRiskScore(
        score=0.3,
        model_name="pd_fake",
        model_version="0.1.0",
        confidence=0.6,
        drivers=[],
    )

    with patch.object(clinician_facade, "nonlinear_features", return_value=fake_nl), \
         patch.object(clinician_facade, "pd_voice_likelihood", return_value=fake_pd), \
         patch.object(clinician_facade, "extract_acoustic_features", return_value={"perturbation": {"jitter_local": 0.01, "hnr_db": 20.0}}):
        result = compute_pd_voice_biomarkers(rec)

    assert "nonlinear" in result
    assert "pd_likelihood" in result
    assert isinstance(result["pd_likelihood"], dict)
    assert result["pd_likelihood"]["score"] == pytest.approx(0.3)


def test_compute_pd_voice_biomarkers_no_perturbation_context() -> None:
    """If 'perturbation' not in context, defaults to 0.0 for jitter/hnr."""
    from deepsynaps_audio import clinician_facade

    rec = _make_recording([0.1] * 500)

    fake_nl = MagicMock()
    fake_nl.rpde = 0.5
    fake_nl.dfa = 0.7
    fake_nl.ppe = 0.2
    fake_nl.model_dump.return_value = {"rpde": 0.5, "dfa": 0.7, "ppe": 0.2}

    fake_pd = PDVoiceRiskScore(
        score=0.25,
        model_name="pd_fake",
        model_version="0.1.0",
        confidence=0.5,
        drivers=[],
    )

    with patch.object(clinician_facade, "nonlinear_features", return_value=fake_nl), \
         patch.object(clinician_facade, "pd_voice_likelihood", return_value=fake_pd), \
         patch.object(clinician_facade, "extract_acoustic_features", return_value={}):
        result = compute_pd_voice_biomarkers(rec)

    assert "nonlinear" in result
    assert "pd_likelihood" in result


def test_compute_pd_voice_biomarkers_clinical_label_contract() -> None:
    """Output keys must not contain diagnostic or treatment strings (regulatory)."""
    from deepsynaps_audio import clinician_facade

    rec = _make_recording([0.1] * 500)
    fake_nl = MagicMock()
    fake_nl.rpde = 0.4
    fake_nl.dfa = 0.65
    fake_nl.ppe = 0.18
    fake_nl.model_dump.return_value = {"rpde": 0.4, "dfa": 0.65, "ppe": 0.18}

    fake_pd = PDVoiceRiskScore(
        score=0.4,
        model_name="pd_fake",
        model_version="0.1.0",
        confidence=0.65,
        drivers=["f0_sd_hz"],
    )

    with patch.object(clinician_facade, "nonlinear_features", return_value=fake_nl), \
         patch.object(clinician_facade, "pd_voice_likelihood", return_value=fake_pd), \
         patch.object(clinician_facade, "extract_acoustic_features", return_value={"perturbation": {}}):
        result = compute_pd_voice_biomarkers(rec)

    result_str = str(result)
    for forbidden in ("diagnosis", "diagnostic", "treatment recommendation"):
        assert forbidden not in result_str.lower(), f"Regulatory violation: '{forbidden}' found in output"
