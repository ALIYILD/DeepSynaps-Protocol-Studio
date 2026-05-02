"""Tests for the respiratory voice analyzer (synthetic cough / breath signals)."""

from __future__ import annotations

import math

import numpy as np
import pytest

from deepsynaps_audio.analyzers.respiratory_voice import (
    BASELINE_RESPIRATORY_LR_VERSION,
    extract_respiration_features,
    score_respiratory_risk,
)
from deepsynaps_audio.schemas import RespiratoryFeatures, VoiceAsset, VoiceSegment


def _synthetic_cough_burst(sr: int = 16000, duration_s: float = 2.5, n_coughs: int = 3) -> np.ndarray:
    """Short broadband impulse + decay bursts spaced apart (cough-like)."""
    n = int(sr * duration_s)
    out = np.zeros(n, dtype=np.float64)
    rng = np.random.default_rng(123)
    base_positions = np.linspace(int(0.2 * sr), int((duration_s - 0.35) * sr), n_coughs, dtype=int)
    for pos in base_positions:
        burst_len = int(0.08 * sr)
        t = np.arange(burst_len) / sr
        burst = 0.55 * np.sin(2 * math.pi * 220 * t) * np.exp(-18 * t)
        burst += 0.25 * rng.standard_normal(burst_len)
        end = min(pos + burst_len, n)
        out[pos:end] += burst[: end - pos]
    return out


def _synthetic_breath_like(sr: int = 16000, duration_s: float = 12.0, hz: float = 0.25) -> np.ndarray:
    """Slow amplitude-modulated noise mimicking breath cycles (~15/min)."""
    n = int(sr * duration_s)
    t = np.arange(n) / sr
    carrier = 0.08 * np.sin(2 * math.pi * (180 + 40 * np.sin(2 * math.pi * 0.05 * t)) * t)
    env = 0.5 * (1.0 + np.sin(2 * math.pi * hz * t))
    noise = 0.04 * np.random.default_rng(7).standard_normal(n)
    return (carrier * env + noise).astype(np.float64)


def test_extract_cough_features_typed_and_positive_counts() -> None:
    wf = _synthetic_cough_burst()
    seg = VoiceSegment(
        start_s=0.0,
        end_s=len(wf) / 16000.0,
        sample_rate_hz=16000,
        waveform=list(wf.tolist()),
    )
    feat = extract_respiration_features(seg, task_type="cough")
    assert isinstance(feat, RespiratoryFeatures)
    assert feat.task_type == "cough"
    assert feat.cough_count >= 0
    assert feat.cough_rate_per_min >= 0.0
    assert feat.mean_cough_duration_s >= 0.0
    assert -120.0 <= feat.peak_rms_db <= 0.0
    assert 0.0 <= feat.band_energy_ratio_low + feat.band_energy_ratio_mid + feat.band_energy_ratio_high <= 1.01
    assert feat.wheeze_like_band_ratio >= 0.0


def test_extract_breath_features_cycles_and_ie() -> None:
    wf = _synthetic_breath_like()
    asset = VoiceAsset(
        duration_s=len(wf) / 16000.0,
        sample_rate_hz=16000,
        waveform=list(wf.tolist()),
    )
    feat = extract_respiration_features(asset, task_type="breath")
    assert feat.task_type == "breath"
    assert feat.breath_cycles_estimated >= 0
    assert feat.breath_rate_per_min >= 0.0
    assert 0.0 <= feat.ie_ratio <= 1.0 or feat.breath_cycles_estimated == 0


def test_extract_other_task_spectral_summary() -> None:
    wf = _synthetic_cough_burst(n_coughs=1)
    seg = VoiceSegment(
        start_s=0.0,
        end_s=len(wf) / 16000.0,
        sample_rate_hz=16000,
        waveform=list(wf.tolist()),
    )
    feat = extract_respiration_features(seg, task_type="other")
    assert feat.task_type == "other"
    assert "task_type_other_spectral_summary_only" in feat.extraction_notes


def test_score_respiratory_risk_provenance_and_bounds() -> None:
    wf = _synthetic_cough_burst()
    seg = VoiceSegment(
        start_s=0.0,
        end_s=len(wf) / 16000.0,
        sample_rate_hz=16000,
        waveform=list(wf.tolist()),
    )
    feat = extract_respiration_features(seg, task_type="cough")
    score = score_respiratory_risk(feat, model_name="baseline_respiratory_lr")
    assert 0.0 <= score.score <= 1.0
    assert score.model_name == "baseline_respiratory_lr"
    assert score.model_version == BASELINE_RESPIRATORY_LR_VERSION
    assert 0.0 <= score.confidence <= 1.0
    assert isinstance(score.drivers, list)


def test_score_unknown_model_fallback() -> None:
    feat = RespiratoryFeatures(task_type="cough")
    out = score_respiratory_risk(feat, model_name="unknown_xyz")
    assert out.model_name == "baseline_respiratory_lr"
    assert out.model_version == BASELINE_RESPIRATORY_LR_VERSION


def test_empty_waveform_stable_schema() -> None:
    asset = VoiceAsset(duration_s=1.0, sample_rate_hz=16000, waveform=None)
    feat = extract_respiration_features(asset, task_type="cough")
    assert feat.cough_count == 0
    assert "insufficient_audio" in feat.extraction_notes or "no_raw_audio_waveform" in feat.extraction_notes
