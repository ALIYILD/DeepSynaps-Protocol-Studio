"""Tests for packages/voice-engine/scoring.py.

All heavy imports (numpy, xgboost) remain inside functions.
Module top is stdlib + dataclasses + the BiomarkerResult/EmotionResult imports.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure voice-engine is importable (conftest also does this, but belt-and-suspenders).
_PKG = str(Path(__file__).parent.parent)
if _PKG not in sys.path:
    sys.path.insert(0, _PKG)

from biomarkers import BiomarkerFlags, BiomarkerResult
from emotion import EmotionPoint, EmotionResult
import scoring
from scoring import (
    FEATURE_VECTOR_LENGTH,
    RiskScoreResult,
    build_feature_vector,
    derive_risk_tier,
    score_risk,
)


# ---------------------------------------------------------------------------
# Fixtures / factories
# ---------------------------------------------------------------------------


def _minimal_biomarkers(**overrides) -> BiomarkerResult:
    """Return a BiomarkerResult with most fields None except mfcc lists (length-13 zeros)."""
    defaults = dict(
        duration_sec=5.0,
        f0_mean_hz=None,
        f0_std_hz=None,
        f0_min_hz=None,
        f0_max_hz=None,
        f0_range_hz=None,
        jitter_local=None,
        jitter_rap=None,
        jitter_ppq5=None,
        jitter_ddp=None,
        shimmer_local=None,
        shimmer_apq3=None,
        shimmer_apq5=None,
        shimmer_apq11=None,
        shimmer_dda=None,
        hnr_db=None,
        mfcc_means=[0.0] * 13,
        mfcc_stds=[0.0] * 13,
        speech_rate_syllables_per_sec=None,
        pause_ratio=None,
        voice_breaks_count=None,
        cpp=None,
        flags=BiomarkerFlags(
            elevated_jitter=False,
            reduced_hnr=False,
            flat_f0_range=False,
            high_pause_ratio=False,
        ),
        extraction_warnings=[],
    )
    defaults.update(overrides)
    return BiomarkerResult(**defaults)


def _minimal_emotion(overall: str = "neutral", timeline_len: int = 2) -> EmotionResult:
    """Return a minimal EmotionResult with a short timeline."""
    timeline = [
        EmotionPoint(
            start=float(i),
            end=float(i + 1),
            emotion=overall,
            confidence=0.7,
            valence=0.0,
            arousal=0.1,
            acoustic_affect_indicator=None,
        )
        for i in range(timeline_len)
    ]
    return EmotionResult(
        overall_emotion=overall,
        overall_confidence=0.7,
        timeline=timeline,
        model_name="test-stub",
        fallback_used=True,
    )


# ---------------------------------------------------------------------------
# Test 1
# ---------------------------------------------------------------------------


def test_build_feature_vector_returns_fixed_shape():
    """Feature vector length must always equal FEATURE_VECTOR_LENGTH (48)."""
    bio = _minimal_biomarkers()
    emotion = _minimal_emotion("happy", timeline_len=2)

    fv_with_emotion = build_feature_vector(bio, emotion)
    assert len(fv_with_emotion) == FEATURE_VECTOR_LENGTH, (
        f"Expected {FEATURE_VECTOR_LENGTH}, got {len(fv_with_emotion)}"
    )

    fv_no_emotion = build_feature_vector(bio, None)
    assert len(fv_no_emotion) == FEATURE_VECTOR_LENGTH, (
        f"Expected {FEATURE_VECTOR_LENGTH}, got {len(fv_no_emotion)}"
    )


# ---------------------------------------------------------------------------
# Test 2
# ---------------------------------------------------------------------------


def test_rule_based_scoring_returns_valid_result(monkeypatch):
    """Rule-based path returns correct structure and expected flag strings."""
    monkeypatch.setattr(scoring, "get_risk_models", lambda: {})
    # Also clear the module-level cache so get_risk_models() isn't stale.
    monkeypatch.setattr(scoring, "_RISK_MODEL_CACHE", None)

    bio = _minimal_biomarkers(
        flags=BiomarkerFlags(
            elevated_jitter=True,
            reduced_hnr=False,
            flat_f0_range=False,
            high_pause_ratio=True,
        ),
    )
    emotion = _minimal_emotion("sad")

    result = score_risk(bio, emotion)

    assert isinstance(result, RiskScoreResult)
    assert 0.0 <= result.depression_risk <= 1.0
    assert 0.0 <= result.anxiety_risk <= 1.0
    assert 0.0 <= result.stress_level <= 1.0
    assert 0.0 <= result.cognitive_load <= 1.0
    assert result.risk_tier in {"low", "moderate", "high", "critical"}
    assert isinstance(result.flags, list)
    assert result.fallback_used is True
    assert result.model_name == "rule-based-v1"
    assert "Negative affect pattern" in result.flags
    assert "Elevated vocal instability" in result.flags
    assert "High pause ratio" in result.flags


# ---------------------------------------------------------------------------
# Test 3
# ---------------------------------------------------------------------------


def test_risk_tier_thresholds_are_correct():
    """derive_risk_tier must respect exact boundary values."""
    # All zeros → low
    assert derive_risk_tier(0.0, 0.0, 0.0, 0.0) == "low"
    # Exactly at 0.30 → moderate
    assert derive_risk_tier(0.3, 0.0, 0.0, 0.0) == "moderate"
    # Exactly at 0.60 → high
    assert derive_risk_tier(0.6, 0.0, 0.0, 0.0) == "high"
    # Exactly at 0.80 → critical
    assert derive_risk_tier(0.8, 0.0, 0.0, 0.0) == "critical"

    # One off-boundary inside each range
    assert derive_risk_tier(0.1, 0.0, 0.0, 0.0) == "low"
    assert derive_risk_tier(0.45, 0.0, 0.0, 0.0) == "moderate"
    assert derive_risk_tier(0.70, 0.0, 0.0, 0.0) == "high"
    assert derive_risk_tier(0.95, 0.0, 0.0, 0.0) == "critical"

    # max is driven by the highest individual score
    assert derive_risk_tier(0.0, 0.0, 0.0, 0.65) == "high"
    assert derive_risk_tier(0.0, 0.85, 0.0, 0.0) == "critical"


# ---------------------------------------------------------------------------
# Test 4
# ---------------------------------------------------------------------------


def test_missing_models_falls_back_cleanly(monkeypatch):
    """When _load_model_impl always returns None, scoring falls back to rule-based."""
    monkeypatch.setattr(scoring, "_load_model_impl", lambda path: None)
    monkeypatch.setattr(scoring, "_RISK_MODEL_CACHE", None)

    bio = _minimal_biomarkers()
    emotion = _minimal_emotion("neutral")

    result = score_risk(bio, emotion)

    assert result.fallback_used is True
    assert result.model_name == "rule-based-v1"
    assert 0.0 <= result.depression_risk <= 1.0
    assert 0.0 <= result.anxiety_risk <= 1.0
    assert 0.0 <= result.stress_level <= 1.0
    assert 0.0 <= result.cognitive_load <= 1.0


# ---------------------------------------------------------------------------
# Test 5
# ---------------------------------------------------------------------------


def test_sparse_biomarkers_do_not_crash_scoring(monkeypatch):
    """All-None biomarker fields must not crash; sparse-data flag must appear."""
    monkeypatch.setattr(scoring, "get_risk_models", lambda: {})
    monkeypatch.setattr(scoring, "_RISK_MODEL_CACHE", None)

    # All numeric fields None; mfcc lists are length-13 zeros to satisfy schema.
    bio = _minimal_biomarkers()  # already all-None numerics by default

    result = score_risk(bio, None)

    assert isinstance(result, RiskScoreResult)
    assert 0.0 <= result.depression_risk <= 1.0
    assert 0.0 <= result.anxiety_risk <= 1.0
    assert 0.0 <= result.stress_level <= 1.0
    assert 0.0 <= result.cognitive_load <= 1.0
    assert "Limited acoustic evidence; score confidence reduced" in result.flags
