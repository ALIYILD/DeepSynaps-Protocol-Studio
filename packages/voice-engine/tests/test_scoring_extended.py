"""Extended tests for voice-engine scoring.py — no XGBoost models required.

Covers:
- _clamp01: boundary and out-of-range values
- _encode_emotion: None, known, unknown labels
- _mean_timeline_valence / _mean_timeline_arousal: empty, single, multi
- build_feature_vector: length contract (FEATURE_VECTOR_LENGTH=48), None fields → 0.0,
  mfcc padding/truncation, emotion block values
- derive_risk_tier: all four tier boundary transitions
- _score_rule_based: baseline, flag increments, deduplication, sparse-data guard
- score_risk: no-models path triggers rule-based, fallback_used contract
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

import scoring as sc
from biomarkers import BiomarkerFlags, BiomarkerResult
from emotion import EmotionPoint, EmotionResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _minimal_biomarkers(**overrides) -> BiomarkerResult:
    """Return a BiomarkerResult with sensible non-None defaults."""
    defaults = dict(
        duration_sec=2.0,
        f0_mean_hz=150.0,
        f0_std_hz=25.0,
        f0_min_hz=100.0,
        f0_max_hz=250.0,
        f0_range_hz=150.0,
        jitter_local=0.005,
        jitter_rap=0.003,
        jitter_ppq5=0.004,
        jitter_ddp=0.009,
        shimmer_local=0.06,
        shimmer_apq3=0.04,
        shimmer_apq5=0.05,
        shimmer_apq11=0.07,
        shimmer_dda=0.12,
        hnr_db=18.0,
        mfcc_means=[float(i) for i in range(13)],
        mfcc_stds=[float(i) * 0.1 for i in range(13)],
        speech_rate_syllables_per_sec=4.0,
        pause_ratio=0.15,
        voice_breaks_count=1,
        cpp=12.0,
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


def _minimal_emotion(label: str = "neutral", conf: float = 0.7) -> EmotionResult:
    from emotion import emotion_to_valence_arousal, emotion_to_affect_indicator
    v, a = emotion_to_valence_arousal(label)
    pt = EmotionPoint(start=0.0, end=1.0, emotion=label, confidence=conf, valence=v, arousal=a, acoustic_affect_indicator=emotion_to_affect_indicator(label))
    return EmotionResult(
        overall_emotion=label,
        overall_confidence=conf,
        timeline=[pt],
        model_name="test-model",
        fallback_used=False,
    )


# ---------------------------------------------------------------------------
# _clamp01
# ---------------------------------------------------------------------------

class TestClamp01:
    def test_zero_stays_zero(self):
        assert sc._clamp01(0.0) == 0.0

    def test_one_stays_one(self):
        assert sc._clamp01(1.0) == 1.0

    def test_above_one_clamped(self):
        assert sc._clamp01(1.5) == 1.0

    def test_below_zero_clamped(self):
        assert sc._clamp01(-0.2) == 0.0

    def test_midpoint_unchanged(self):
        assert sc._clamp01(0.5) == 0.5


# ---------------------------------------------------------------------------
# _encode_emotion
# ---------------------------------------------------------------------------

class TestEncodeEmotion:
    def test_none_emotion_returns_zero(self):
        assert sc._encode_emotion(None) == 0

    def test_neutral_label_returns_zero(self):
        em = _minimal_emotion("neutral")
        assert sc._encode_emotion(em) == 0

    def test_happy_label_returns_two(self):
        em = _minimal_emotion("happy")
        assert sc._encode_emotion(em) == 2

    def test_sad_label_returns_three(self):
        em = _minimal_emotion("sad")
        assert sc._encode_emotion(em) == 3

    def test_unknown_label_returns_zero(self):
        em = _minimal_emotion()
        em.overall_emotion = "zorblax"
        assert sc._encode_emotion(em) == 0


# ---------------------------------------------------------------------------
# _mean_timeline_valence / _mean_timeline_arousal
# ---------------------------------------------------------------------------

class TestMeanTimeline:
    def test_none_emotion_valence_returns_zero(self):
        assert sc._mean_timeline_valence(None) == 0.0

    def test_none_emotion_arousal_returns_zero(self):
        assert sc._mean_timeline_arousal(None) == 0.0

    def test_empty_timeline_returns_zero(self):
        em = _minimal_emotion("calm")
        em.timeline = []
        assert sc._mean_timeline_valence(em) == 0.0
        assert sc._mean_timeline_arousal(em) == 0.0

    def test_single_point_valence(self):
        from emotion import EmotionPoint
        em_r = _minimal_emotion("happy")
        em_r.timeline = [EmotionPoint(0.0, 1.0, "happy", 0.9, 0.8, 0.5, None)]
        assert abs(sc._mean_timeline_valence(em_r) - 0.8) < 1e-6

    def test_multi_point_arousal_average(self):
        from emotion import EmotionPoint
        em_r = _minimal_emotion("neutral")
        em_r.timeline = [
            EmotionPoint(0.0, 1.0, "angry", 0.9, -0.7, 0.8, None),
            EmotionPoint(1.0, 2.0, "calm", 0.9, 0.4, -0.4, None),
        ]
        expected_arousal = (0.8 + (-0.4)) / 2.0
        assert abs(sc._mean_timeline_arousal(em_r) - expected_arousal) < 1e-6


# ---------------------------------------------------------------------------
# build_feature_vector
# ---------------------------------------------------------------------------

class TestBuildFeatureVector:
    def test_feature_vector_length_is_48(self):
        bm = _minimal_biomarkers()
        fv = sc.build_feature_vector(bm)
        assert len(fv) == sc.FEATURE_VECTOR_LENGTH

    def test_none_f0_fields_become_zero(self):
        bm = _minimal_biomarkers(
            f0_mean_hz=None, f0_std_hz=None, f0_min_hz=None,
            f0_max_hz=None, f0_range_hz=None,
        )
        fv = sc.build_feature_vector(bm)
        assert len(fv) == 48
        for i in range(5):
            assert float(fv[i]) == 0.0, f"index {i} should be 0.0 for None f0 field"

    def test_mfcc_means_padded_to_13(self):
        bm = _minimal_biomarkers(mfcc_means=[1.0, 2.0], mfcc_stds=[])
        fv = sc.build_feature_vector(bm)
        assert len(fv) == 48

    def test_mfcc_means_truncated_to_13(self):
        bm = _minimal_biomarkers(mfcc_means=list(range(20)), mfcc_stds=list(range(20)))
        fv = sc.build_feature_vector(bm)
        assert len(fv) == 48

    def test_emotion_block_with_none_emotion(self):
        bm = _minimal_biomarkers()
        fv = sc.build_feature_vector(bm, emotion=None)
        # emotion_label_index=0, confidence=0, valence=0, arousal=0
        assert float(fv[44]) == 0.0
        assert float(fv[45]) == 0.0

    def test_emotion_block_with_happy_emotion(self):
        bm = _minimal_biomarkers()
        em = _minimal_emotion("happy", 0.9)
        fv = sc.build_feature_vector(bm, emotion=em)
        # happy → index 2
        assert float(fv[44]) == 2.0
        assert abs(float(fv[45]) - 0.9) < 1e-5


# ---------------------------------------------------------------------------
# derive_risk_tier
# ---------------------------------------------------------------------------

class TestDeriveRiskTier:
    def test_all_low_returns_low(self):
        assert sc.derive_risk_tier(0.10, 0.10, 0.10, 0.10) == "low"

    def test_moderate_boundary_at_030(self):
        assert sc.derive_risk_tier(0.30, 0.10, 0.10, 0.10) == "moderate"

    def test_high_boundary_at_060(self):
        assert sc.derive_risk_tier(0.60, 0.10, 0.10, 0.10) == "high"

    def test_critical_boundary_at_080(self):
        assert sc.derive_risk_tier(0.80, 0.10, 0.10, 0.10) == "critical"

    def test_just_below_moderate_is_low(self):
        assert sc.derive_risk_tier(0.29, 0.29, 0.29, 0.29) == "low"

    def test_just_below_high_is_moderate(self):
        assert sc.derive_risk_tier(0.59, 0.59, 0.59, 0.59) == "moderate"

    def test_secondary_score_drives_tier(self):
        # depression=0.10 but anxiety=0.75 → high
        assert sc.derive_risk_tier(0.10, 0.75, 0.10, 0.10) == "high"


# ---------------------------------------------------------------------------
# _score_rule_based: baseline and signal increments
# ---------------------------------------------------------------------------

class TestScoreRuleBased:
    def test_baseline_gives_low_tier_with_clean_biomarkers(self):
        bm = _minimal_biomarkers()
        result = sc._score_rule_based(bm, emotion=None)
        assert result.fallback_used is True
        assert result.model_name == "rule-based-v1"
        assert result.risk_tier == "low"

    def test_flat_f0_range_increments_depression(self):
        bm = _minimal_biomarkers(
            flags=BiomarkerFlags(elevated_jitter=False, reduced_hnr=False, flat_f0_range=True, high_pause_ratio=False)
        )
        result = sc._score_rule_based(bm, emotion=None)
        # baseline 0.15 + 0.20 = 0.35 → moderate
        assert result.depression_risk == pytest.approx(0.35, abs=1e-6)
        assert "Flat pitch range detected" in result.flags

    def test_elevated_jitter_increments_anxiety(self):
        bm = _minimal_biomarkers(
            flags=BiomarkerFlags(elevated_jitter=True, reduced_hnr=False, flat_f0_range=False, high_pause_ratio=False)
        )
        result = sc._score_rule_based(bm, emotion=None)
        # baseline 0.15 + 0.20 = 0.35
        assert result.anxiety_risk == pytest.approx(0.35, abs=1e-6)
        assert "Elevated vocal instability" in result.flags

    def test_sad_emotion_increments_depression(self):
        bm = _minimal_biomarkers()
        result = sc._score_rule_based(bm, emotion=_minimal_emotion("sad"))
        # baseline 0.15 + 0.20 (negative affect) = 0.35
        assert result.depression_risk == pytest.approx(0.35, abs=1e-6)
        assert "Negative affect pattern" in result.flags

    def test_many_voice_breaks_increments_anxiety_and_cognitive_load(self):
        bm = _minimal_biomarkers(voice_breaks_count=10)
        result = sc._score_rule_based(bm, emotion=None)
        # anxiety baseline 0.15 + 0.15 = 0.30
        assert result.anxiety_risk >= 0.30
        assert "Frequent voice breaks" in result.flags

    def test_sparse_data_guard_appended_when_majority_none(self):
        bm = _minimal_biomarkers(
            f0_mean_hz=None, f0_std_hz=None, f0_range_hz=None,
            jitter_local=None, shimmer_local=None, hnr_db=None,
            speech_rate_syllables_per_sec=None, pause_ratio=None, voice_breaks_count=None,
        )
        result = sc._score_rule_based(bm, emotion=None)
        assert any("Limited acoustic evidence" in f for f in result.flags)

    def test_flags_deduplicated(self):
        # Elevated jitter is counted for both anxiety and stress; should appear once
        bm = _minimal_biomarkers(
            flags=BiomarkerFlags(elevated_jitter=True, reduced_hnr=False, flat_f0_range=False, high_pause_ratio=False),
            voice_breaks_count=10,
        )
        result = sc._score_rule_based(bm, emotion=_minimal_emotion("fearful"))
        # "Elevated vocal instability" fires for anxiety and stress — should appear once
        assert result.flags.count("Elevated vocal instability") == 1


# ---------------------------------------------------------------------------
# score_risk public entry point
# ---------------------------------------------------------------------------

class TestScoreRisk:
    def test_no_models_uses_rule_based(self, monkeypatch):
        monkeypatch.setattr(sc, "get_risk_models", lambda: {})
        # Ensure cache is cleared
        sc._RISK_MODEL_CACHE = None
        bm = _minimal_biomarkers()
        result = sc.score_risk(bm)
        assert result.fallback_used is True
        assert result.model_name == "rule-based-v1"

    def test_result_scores_are_clamped_to_01(self, monkeypatch):
        monkeypatch.setattr(sc, "get_risk_models", lambda: {})
        sc._RISK_MODEL_CACHE = None
        bm = _minimal_biomarkers(
            flags=BiomarkerFlags(elevated_jitter=True, reduced_hnr=True, flat_f0_range=True, high_pause_ratio=True),
            voice_breaks_count=20,
            speech_rate_syllables_per_sec=1.0,
        )
        result = sc.score_risk(bm, emotion=_minimal_emotion("sad"))
        assert 0.0 <= result.depression_risk <= 1.0
        assert 0.0 <= result.anxiety_risk <= 1.0
        assert 0.0 <= result.stress_level <= 1.0
        assert 0.0 <= result.cognitive_load <= 1.0
