"""Tests for the cognitive speech analyzer (synthetic audio + text)."""

from __future__ import annotations

import math
import uuid

import numpy as np
import pytest

from deepsynaps_audio.analyzers.cognitive_speech import (
    BASELINE_COGNITIVE_LR_VERSION,
    extract_linguistic_features,
    extract_paralinguistic_cognitive_features,
    score_cognitive_speech_risk,
)
from deepsynaps_audio.schemas import (
    AcousticFeatureSet,
    VoiceAsset,
    VoiceSegment,
)


def _synthetic_speech_like_waveform(
    sr: int = 16000,
    duration_s: float = 4.0,
    word_burst_s: float = 0.35,
    pause_s: float = 0.45,
    n_words: int = 8,
) -> np.ndarray:
    """Alternating voiced bursts (noise + tone) and silence to mimic words + pauses."""
    hop = word_burst_s + pause_s
    n_samples = int(sr * duration_s)
    out = np.zeros(n_samples, dtype=np.float64)
    t_global = np.arange(n_samples) / sr
    for w in range(n_words):
        start = int(w * hop * sr)
        end = min(int(start + word_burst_s * sr), n_samples)
        if start >= n_samples:
            break
        tt = t_global[start:end] - t_global[start]
        carrier = 0.35 * np.sin(2 * math.pi * 180.0 * tt)
        noise = 0.08 * np.random.default_rng(42 + w).standard_normal(end - start)
        out[start:end] = carrier + noise
    return out


def test_extract_paralinguistic_stable_schema_and_rates() -> None:
    sr = 16000
    wf = _synthetic_speech_like_waveform(sr=sr, duration_s=3.5, n_words=6)
    seg = VoiceSegment(start_s=0.0, end_s=len(wf) / sr, sample_rate_hz=sr, waveform=list(wf.tolist()))
    feat = extract_paralinguistic_cognitive_features(seg)
    assert feat.__class__.__name__ == "ParalinguisticCognitiveFeatures"
    assert feat.speech_rate_wpm >= 0.0
    assert feat.articulation_rate_syl_per_s >= 0.0
    assert 0.0 <= feat.pause_time_ratio <= 1.0
    assert feat.syllable_count_est >= 1
    # Same input → same output (deterministic)
    feat2 = extract_paralinguistic_cognitive_features(seg)
    assert feat2.speech_rate_wpm == pytest.approx(feat.speech_rate_wpm, rel=1e-9)


def test_extract_paralinguistic_with_acoustic_feature_set_only() -> None:
    """No waveform: rely on AcousticFeatureSet for variability proxies."""
    asset = VoiceAsset(duration_s=2.0, sample_rate_hz=16000, waveform=None, asset_id=uuid.uuid4())
    ac = AcousticFeatureSet(f0_sd_hz=12.5, intensity_sd_db=3.2)
    feat = extract_paralinguistic_cognitive_features(asset, features=ac)
    assert "no_raw_audio_waveform" in feat.extraction_notes
    assert feat.f0_variability_hz == pytest.approx(12.5)
    assert feat.intensity_variability_db == pytest.approx(3.2)
    assert feat.pause_count == 0


def test_extract_linguistic_features_stable() -> None:
    text = (
        "The patient described a picture with several objects. "
        "The patient described a picture again. There was a garden and a child."
    )
    lf = extract_linguistic_features(text)
    assert lf.type_token_ratio > 0.0
    assert lf.repetition_ratio >= 0.0
    assert 0.0 <= lf.coherence_score <= 1.0
    lf2 = extract_linguistic_features(text)
    assert lf2.type_token_ratio == pytest.approx(lf.type_token_ratio)


def test_score_provenance_and_missing_linguistic() -> None:
    wf = _synthetic_speech_like_waveform()
    seg = VoiceSegment(
        start_s=0.0,
        end_s=len(wf) / 16000.0,
        sample_rate_hz=16000,
        waveform=list(wf.tolist()),
    )
    para = extract_paralinguistic_cognitive_features(seg)
    score_none = score_cognitive_speech_risk(para, None, model_name="baseline_cognitive_lr")
    assert score_none.model_name == "baseline_cognitive_lr"
    assert score_none.model_version == BASELINE_COGNITIVE_LR_VERSION
    assert 0.0 <= score_none.score <= 1.0
    assert score_none.linguistic_features_used is False
    assert score_none.confidence < 0.65  # lower when linguistic missing

    ling = extract_linguistic_features("I went to the store. I bought milk and bread.")
    score_full = score_cognitive_speech_risk(para, ling, model_name="baseline_cognitive_lr")
    assert score_full.linguistic_features_used is True
    assert score_full.confidence > score_none.confidence
    assert score_full.model_version == BASELINE_COGNITIVE_LR_VERSION


def test_score_unknown_model_falls_back() -> None:
    para = extract_paralinguistic_cognitive_features(
        VoiceAsset(duration_s=1.0, sample_rate_hz=16000),
        features=AcousticFeatureSet(f0_sd_hz=5.0, intensity_sd_db=2.0),
    )
    out = score_cognitive_speech_risk(para, None, model_name="does_not_exist")
    assert out.model_name == "baseline_cognitive_lr"
    assert out.model_version == BASELINE_COGNITIVE_LR_VERSION
