"""ML risk scoring: depression, anxiety, stress, cognitive load.

XGBoost primary path (loads models from packages/voice-engine/models/ if present).
Rule-based fallback when models are absent or fail. Always returns a result.

All heavy imports (numpy, xgboost) are lazy — inside functions — so this
module can be imported in CPU-only test environments without those packages.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Optional

from biomarkers import BiomarkerResult
from emotion import EmotionResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature vector layout — fixed length, fixed order. Audit here before
# touching build_feature_vector.
#
#  Index  Field
#  -----  -----
#   0     f0_mean_hz
#   1     f0_std_hz
#   2     f0_min_hz
#   3     f0_max_hz
#   4     f0_range_hz
#   5     jitter_local
#   6     jitter_rap
#   7     jitter_ppq5
#   8     jitter_ddp
#   9     shimmer_local
#  10     shimmer_apq3
#  11     shimmer_apq5
#  12     shimmer_apq11
#  13     shimmer_dda
#  14     hnr_db
#  15-27  mfcc_means[0..12]   (13 values)
#  28-40  mfcc_stds[0..12]    (13 values)
#  41     speech_rate_syllables_per_sec
#  42     pause_ratio
#  43     voice_breaks_count
#  44     emotion_label_index  (canonical int, 0=neutral)
#  45     emotion_overall_confidence
#  46     mean_timeline_valence
#  47     mean_timeline_arousal
# ---------------------------------------------------------------------------

FEATURE_VECTOR_LENGTH = 48

# Canonical emotion → integer index. Unknown / missing → 0 (neutral).
_EMOTION_INDEX: dict[str, int] = {
    "neutral": 0,
    "calm": 1,
    "happy": 2,
    "sad": 3,
    "angry": 4,
    "fearful": 5,
    "disgust": 6,
    "surprised": 7,
}

# Path to XGBoost model artifacts (relative to this file's directory).
_MODELS_DIR = Path(__file__).parent / "models"

_MODEL_NAMES = ("depression", "anxiety", "stress", "cognitive_load")

# Module-level cache: populated lazily by get_risk_models().
_RISK_MODEL_CACHE: Optional[dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Public dataclass
# ---------------------------------------------------------------------------


@dataclass
class RiskScoreResult:
    depression_risk: float    # [0.0, 1.0]
    anxiety_risk: float       # [0.0, 1.0]
    stress_level: float       # [0.0, 1.0]
    cognitive_load: float     # [0.0, 1.0]
    risk_tier: Literal["low", "moderate", "high", "critical"]
    flags: list[str]
    model_name: str
    fallback_used: bool


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def _clamp01(x: float) -> float:
    """Clamp a float to [0.0, 1.0]."""
    return max(0.0, min(1.0, x))


def _encode_emotion(emotion: Optional[EmotionResult]) -> int:
    """Return the canonical integer index for the overall emotion label."""
    if emotion is None:
        return 0
    return _EMOTION_INDEX.get(emotion.overall_emotion, 0)


def _mean_timeline_valence(emotion: Optional[EmotionResult]) -> float:
    """Return mean valence across the emotion timeline, or 0.0 if unavailable."""
    if emotion is None or not emotion.timeline:
        return 0.0
    vals = [pt.valence for pt in emotion.timeline]
    return sum(vals) / len(vals)


def _mean_timeline_arousal(emotion: Optional[EmotionResult]) -> float:
    """Return mean arousal across the emotion timeline, or 0.0 if unavailable."""
    if emotion is None or not emotion.timeline:
        return 0.0
    arousals = [pt.arousal for pt in emotion.timeline]
    return sum(arousals) / len(arousals)


# ---------------------------------------------------------------------------
# Feature vector construction
# ---------------------------------------------------------------------------


def build_feature_vector(
    biomarkers: BiomarkerResult,
    emotion: Optional[EmotionResult] = None,
) -> "Any":  # np.ndarray — type string avoids import at module level
    """Build a fixed-length (FEATURE_VECTOR_LENGTH=48) feature vector.

    None numeric fields → 0.0. None voice_breaks_count → 0.
    The emotion block is always present; zeros when emotion is None.

    Raises RuntimeError if numpy is not installed (should not happen in normal use).
    """
    _numpy_available = True
    try:
        import numpy as np  # lazy import
    except ImportError:
        _numpy_available = False
        np = None  # type: ignore[assignment]

    def _f(v: Optional[float]) -> float:
        return float(v) if v is not None else 0.0

    def _i(v: Optional[int]) -> float:
        return float(v) if v is not None else 0.0

    # F0 block (5)
    f0_block = [
        _f(biomarkers.f0_mean_hz),
        _f(biomarkers.f0_std_hz),
        _f(biomarkers.f0_min_hz),
        _f(biomarkers.f0_max_hz),
        _f(biomarkers.f0_range_hz),
    ]

    # Jitter block (4)
    jitter_block = [
        _f(biomarkers.jitter_local),
        _f(biomarkers.jitter_rap),
        _f(biomarkers.jitter_ppq5),
        _f(biomarkers.jitter_ddp),
    ]

    # Shimmer block (5)
    shimmer_block = [
        _f(biomarkers.shimmer_local),
        _f(biomarkers.shimmer_apq3),
        _f(biomarkers.shimmer_apq5),
        _f(biomarkers.shimmer_apq11),
        _f(biomarkers.shimmer_dda),
    ]

    # HNR (1)
    hnr_block = [_f(biomarkers.hnr_db)]

    # MFCC means (13) — pad or truncate to exactly 13
    mfcc_means = list(biomarkers.mfcc_means) if biomarkers.mfcc_means else []
    mfcc_means = (mfcc_means + [0.0] * 13)[:13]

    # MFCC stds (13)
    mfcc_stds = list(biomarkers.mfcc_stds) if biomarkers.mfcc_stds else []
    mfcc_stds = (mfcc_stds + [0.0] * 13)[:13]

    # Prosody / temporal (3)
    prosody_block = [
        _f(biomarkers.speech_rate_syllables_per_sec),
        _f(biomarkers.pause_ratio),
        _i(biomarkers.voice_breaks_count),
    ]

    # Emotion block (4)
    emotion_block = [
        float(_encode_emotion(emotion)),
        float(emotion.overall_confidence) if emotion is not None else 0.0,
        _mean_timeline_valence(emotion),
        _mean_timeline_arousal(emotion),
    ]

    features = (
        f0_block
        + jitter_block
        + shimmer_block
        + hnr_block
        + mfcc_means
        + mfcc_stds
        + prosody_block
        + emotion_block
    )

    assert len(features) == FEATURE_VECTOR_LENGTH, (
        f"Feature vector length mismatch: expected {FEATURE_VECTOR_LENGTH}, got {len(features)}"
    )

    if _numpy_available:
        return np.array(features, dtype=np.float32)  # type: ignore[union-attr]
    # numpy absent — return a plain list; callers that need ndarray (XGBoost path)
    # should not reach here because get_risk_models() will return {} when xgboost
    # is also absent.  The list is length-correct for test assertions.
    return features


# ---------------------------------------------------------------------------
# XGBoost model loading and prediction
# ---------------------------------------------------------------------------


def _load_model_impl(model_path: str) -> Optional[Any]:
    """Lazy-import xgboost and load a Booster from *model_path*.

    Returns None on FileNotFoundError or any other exception.
    This is the seam for monkeypatching in tests.
    """
    try:
        import xgboost  # lazy import

        booster = xgboost.Booster()
        booster.load_model(model_path)
        logger.info("_load_model_impl: loaded %s", model_path)
        return booster
    except FileNotFoundError:
        logger.debug("_load_model_impl: model not found at %s", model_path)
        return None
    except Exception as exc:
        logger.warning("_load_model_impl: failed to load %s: %s", model_path, exc)
        return None


def get_risk_models() -> dict[str, Any]:
    """Return a dict of loaded XGBoost Boosters keyed by construct name.

    Keys: "depression", "anxiety", "stress", "cognitive_load".
    Only models whose .json files exist on disk are present in the dict.
    Empty dict if none load. Module-level cached after first call.
    """
    global _RISK_MODEL_CACHE
    if _RISK_MODEL_CACHE is not None:
        return _RISK_MODEL_CACHE

    models: dict[str, Any] = {}
    for name in _MODEL_NAMES:
        path = str(_MODELS_DIR / f"{name}_xgb.json")
        model = _load_model_impl(path)
        if model is not None:
            models[name] = model

    logger.info(
        "get_risk_models: loaded %d/%d models: %s",
        len(models),
        len(_MODEL_NAMES),
        list(models.keys()),
    )
    _RISK_MODEL_CACHE = models
    return models


def _predict_with_models(
    models: dict[str, Any],
    feature_vector: "Any",  # np.ndarray
) -> dict[str, float]:
    """Run each loaded Booster and return {name: score} clamped to [0,1].

    If a model exposes predict_proba (unlikely for raw Booster, but future-safe),
    uses that; otherwise uses predict and clamps the scalar output.
    """
    import numpy as np  # lazy import

    scores: dict[str, float] = {}
    dmatrix_input = feature_vector.reshape(1, -1)

    try:
        import xgboost  # lazy import

        dmat = xgboost.DMatrix(dmatrix_input)
    except Exception as exc:
        logger.warning("_predict_with_models: DMatrix construction failed: %s", exc)
        return scores

    for name, booster in models.items():
        try:
            raw = booster.predict(dmat)
            val = float(raw[0]) if hasattr(raw, "__getitem__") else float(raw)
            scores[name] = _clamp01(val)
        except Exception as exc:
            logger.warning("_predict_with_models: predict failed for %s: %s", name, exc)

    return scores


# ---------------------------------------------------------------------------
# Rule-based fallback
# ---------------------------------------------------------------------------


def _score_rule_based(
    biomarkers: BiomarkerResult,
    emotion: Optional[EmotionResult],
) -> RiskScoreResult:
    """Rule-based risk scoring when XGBoost models are unavailable.

    Starts each construct at 0.15 baseline and adds weighted increments for
    evidence signals derived from BiomarkerFlags, speech parameters, and
    emotion.

    # TODO: thresholds and weights below need calibration with labeled,
    #       clinician-reviewed data before any clinical deployment. These
    #       are literature-informed starting points only.
    """
    flags: list[str] = []

    mean_valence = _mean_timeline_valence(emotion)
    mean_arousal = _mean_timeline_arousal(emotion)
    overall_emotion = emotion.overall_emotion if emotion is not None else None

    # ------------------------------------------------------------------
    # Depression (blunted affect / hypoarticulation)
    # ------------------------------------------------------------------
    depression = 0.15

    if biomarkers.flags.flat_f0_range:
        depression += 0.20
        flags.append("Flat pitch range detected")

    if biomarkers.flags.high_pause_ratio:
        depression += 0.15
        flags.append("High pause ratio")

    if biomarkers.flags.reduced_hnr:
        depression += 0.15
        flags.append("Reduced harmonicity")

    if (
        biomarkers.speech_rate_syllables_per_sec is not None
        and biomarkers.speech_rate_syllables_per_sec < 2.0
    ):
        depression += 0.15
        flags.append("Low speech rate")

    if overall_emotion == "sad" or mean_valence < -0.3:
        depression += 0.20
        flags.append("Negative affect pattern")

    depression = _clamp01(depression)

    # ------------------------------------------------------------------
    # Anxiety (instability + heightened arousal)
    # ------------------------------------------------------------------
    anxiety = 0.15

    if biomarkers.flags.elevated_jitter:
        anxiety += 0.20
        flags.append("Elevated vocal instability")

    if overall_emotion in {"fearful", "angry"}:
        anxiety += 0.20
        flags.append("Threat-pattern affect")

    if mean_arousal > 0.5:
        anxiety += 0.15
        flags.append("High arousal")

    if (
        biomarkers.voice_breaks_count is not None
        and biomarkers.voice_breaks_count > 5
    ):
        anxiety += 0.15
        flags.append("Frequent voice breaks")

    anxiety = _clamp01(anxiety)

    # ------------------------------------------------------------------
    # Stress (high arousal + instability)
    # ------------------------------------------------------------------
    stress = 0.15

    if mean_arousal > 0.4:
        stress += 0.20
        flags.append("High arousal")

    if overall_emotion in {"angry", "fearful", "surprised"}:
        stress += 0.15
        flags.append("Acute affect pattern")

    if biomarkers.flags.elevated_jitter:
        stress += 0.15
        flags.append("Elevated vocal instability")

    if (
        biomarkers.voice_breaks_count is not None
        and biomarkers.voice_breaks_count > 5
    ) or (
        biomarkers.pause_ratio is not None
        and biomarkers.pause_ratio > 0.4
    ):
        stress += 0.15
        flags.append("Disrupted vocal flow")

    stress = _clamp01(stress)

    # ------------------------------------------------------------------
    # Cognitive load (planning difficulty)
    # ------------------------------------------------------------------
    cognitive_load = 0.15

    if biomarkers.flags.high_pause_ratio:
        cognitive_load += 0.20
        flags.append("High pause ratio")

    if (
        biomarkers.speech_rate_syllables_per_sec is not None
        and biomarkers.speech_rate_syllables_per_sec < 2.0
    ):
        cognitive_load += 0.15
        flags.append("Low speech rate")

    if (
        biomarkers.voice_breaks_count is not None
        and biomarkers.voice_breaks_count > 5
    ):
        cognitive_load += 0.15
        flags.append("Frequent voice breaks")

    if (
        biomarkers.f0_std_hz is not None
        and biomarkers.f0_std_hz < 15.0
    ):
        cognitive_load += 0.15
        flags.append("Reduced prosodic variation")

    cognitive_load = _clamp01(cognitive_load)

    # ------------------------------------------------------------------
    # Deduplicate flags (preserve first-occurrence order)
    # ------------------------------------------------------------------
    seen: set[str] = set()
    deduped: list[str] = []
    for f in flags:
        if f not in seen:
            seen.add(f)
            deduped.append(f)

    # ------------------------------------------------------------------
    # Sparse-data guard: if >50% of relevant biomarker fields are None
    # ------------------------------------------------------------------
    relevant_fields = [
        biomarkers.f0_mean_hz,
        biomarkers.f0_std_hz,
        biomarkers.f0_range_hz,
        biomarkers.jitter_local,
        biomarkers.shimmer_local,
        biomarkers.hnr_db,
        biomarkers.speech_rate_syllables_per_sec,
        biomarkers.pause_ratio,
        biomarkers.voice_breaks_count,
    ]
    none_count = sum(1 for v in relevant_fields if v is None)
    if none_count > len(relevant_fields) / 2:
        deduped.append("Limited acoustic evidence; score confidence reduced")

    tier = derive_risk_tier(depression, anxiety, stress, cognitive_load)

    return RiskScoreResult(
        depression_risk=depression,
        anxiety_risk=anxiety,
        stress_level=stress,
        cognitive_load=cognitive_load,
        risk_tier=tier,
        flags=deduped,
        model_name="rule-based-v1",
        fallback_used=True,
    )


# ---------------------------------------------------------------------------
# Risk tier
# ---------------------------------------------------------------------------


def derive_risk_tier(
    depression: float,
    anxiety: float,
    stress: float,
    cognitive_load: float,
) -> Literal["low", "moderate", "high", "critical"]:
    """Map the maximum of the four risk scores to a tier label.

    This is an initial operating policy, not a validated clinical threshold.
    Tiers must be reviewed and calibrated with labeled clinical data before
    use in any diagnostic or treatment workflow.

    Boundaries:
      max < 0.30           → "low"
      0.30 ≤ max < 0.60   → "moderate"
      0.60 ≤ max < 0.80   → "high"
      max ≥ 0.80          → "critical"
    """
    max_score = max(depression, anxiety, stress, cognitive_load)
    if max_score >= 0.80:
        return "critical"
    if max_score >= 0.60:
        return "high"
    if max_score >= 0.30:
        return "moderate"
    return "low"


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def score_risk(
    biomarkers: BiomarkerResult,
    emotion: Optional[EmotionResult] = None,
) -> RiskScoreResult:
    """Compute risk scores from acoustic biomarkers and optional emotion result.

    Attempts XGBoost models first (if any model artifacts are present on disk).
    Falls back to rule-based scoring transparently. Never raises on missing
    biomarker fields.

    The feature vector (build_feature_vector) is only built when at least one
    XGBoost model is available — rule-based scoring operates directly on the
    BiomarkerResult fields, so numpy is not required for that path.

    Parameters
    ----------
    biomarkers:
        Extracted acoustic biomarkers. None fields are treated as zero /
        absent — scoring never crashes on partial data.
    emotion:
        Optional emotion analysis result. When None, emotion-conditioned
        increments in the rule-based path simply do not fire.

    Returns
    -------
    RiskScoreResult
        Always a valid result. fallback_used=False only when all four
        XGBoost models loaded and predicted successfully.
    """
    models = get_risk_models()

    if not models:
        # No models available — go straight to rule-based (no numpy needed).
        return _score_rule_based(biomarkers, emotion)

    # At least one model loaded — build the feature vector (requires numpy).
    try:
        fv = build_feature_vector(biomarkers, emotion)
    except Exception as exc:
        logger.warning("score_risk: build_feature_vector failed (%s); using rule-based", exc)
        return _score_rule_based(biomarkers, emotion)

    ml_scores = _predict_with_models(models, fv)

    # For any construct missing an ML score, fall back to rule-based values.
    rule_result: Optional[RiskScoreResult] = None
    all_four = all(name in ml_scores for name in _MODEL_NAMES)

    if not all_four:
        rule_result = _score_rule_based(biomarkers, emotion)

    def _pick(name: str, rule_attr: str) -> float:
        if name in ml_scores:
            return ml_scores[name]
        assert rule_result is not None
        return getattr(rule_result, rule_attr)

    depression = _pick("depression", "depression_risk")
    anxiety = _pick("anxiety", "anxiety_risk")
    stress = _pick("stress", "stress_level")
    cognitive_load = _pick("cognitive_load", "cognitive_load")

    tier = derive_risk_tier(depression, anxiety, stress, cognitive_load)

    # Collect flags from rule-based result when it was computed.
    extra_flags = rule_result.flags if rule_result is not None else []

    return RiskScoreResult(
        depression_risk=depression,
        anxiety_risk=anxiety,
        stress_level=stress,
        cognitive_load=cognitive_load,
        risk_tier=tier,
        flags=extra_flags,
        model_name="xgboost-v1",
        fallback_used=not all_four,
    )
