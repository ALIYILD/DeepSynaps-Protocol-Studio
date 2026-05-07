"""Deterministic feature extraction stubs — no black-box clinical inference."""

from __future__ import annotations

from statistics import mean
from typing import Any

from deeptwin_neuroai_lab.schemas import (
    FeatureExtractionResult,
    Modality,
    PatientDataEvent,
)


def extract_features(event: PatientDataEvent) -> FeatureExtractionResult:
    dispatch = {
        Modality.eeg: extract_eeg_features,
        Modality.qeeg: extract_eeg_features,
        Modality.assessment: extract_assessment_features,
        Modality.outcome_score: extract_assessment_features,
        Modality.intervention: extract_intervention_features,
        Modality.biometric: extract_biometric_features,
        Modality.wearable: extract_biometric_features,
        Modality.video: extract_video_features,
        Modality.audio: extract_voice_features,
        Modality.voice: extract_voice_features,
    }
    fn = dispatch.get(event.modality, _generic_stub)
    return fn(event)


def _numeric_summary(values: list[float]) -> dict[str, float | int]:
    if not values:
        return {}
    return {
        "count": len(values),
        "mean": float(mean(values)),
        "min": float(min(values)),
        "max": float(max(values)),
    }


def extract_eeg_features(event: PatientDataEvent) -> FeatureExtractionResult:
    warnings: list[str] = []
    missing: list[str] = []
    safety_flags: list[str] = []
    payload = event.payload or {}
    features: dict[str, Any] = {}

    if "band_power" in payload and isinstance(payload["band_power"], dict):
        features["band_power"] = payload["band_power"]
    else:
        missing.append("band_power")

    nums = _collect_numeric_values(payload.get("channels"))
    if nums:
        features["channel_numeric_summary"] = _numeric_summary(nums)
    else:
        warnings.append("No numeric channel summaries supplied; skipped derived summaries.")

    if not payload:
        warnings.append("Empty payload — no spectral features to summarize.")

    if not event.clinician_verified:
        safety_flags.append("not_clinician_verified_source")

    return FeatureExtractionResult(
        features=features,
        warnings=warnings,
        missing_fields=missing,
        safety_flags=safety_flags,
        confidence=event.confidence,
        research_only=True,
    )


def extract_assessment_features(event: PatientDataEvent) -> FeatureExtractionResult:
    warnings: list[str] = []
    missing: list[str] = []
    payload = event.payload or {}
    features: dict[str, Any] = {}

    score = payload.get("score")
    if score is None and event.outcome:
        score = event.outcome.score
    if score is None:
        missing.append("score")
    else:
        try:
            features["score"] = float(score)
        except (TypeError, ValueError):
            missing.append("score")
            warnings.append("Score field not numeric.")

    baseline = payload.get("baseline_score")
    if baseline is not None and features.get("score") is not None:
        try:
            b = float(baseline)
            s = float(features["score"])
            features["delta_vs_baseline"] = s - b
            if b != 0:
                features["pct_change_vs_baseline"] = (s - b) / abs(b) * 100.0
        except (TypeError, ValueError):
            warnings.append("Could not compute baseline change.")

    scale = payload.get("scale_name") or (event.outcome.scale_name if event.outcome else None)
    if scale:
        features["scale_name"] = scale
    else:
        missing.append("scale_name")

    return FeatureExtractionResult(
        features=features,
        warnings=warnings,
        missing_fields=missing,
        safety_flags=["interpretation_requires_validated_instrument"],
        confidence=event.confidence,
        research_only=True,
    )


def extract_intervention_features(event: PatientDataEvent) -> FeatureExtractionResult:
    warnings: list[str] = []
    payload = event.payload or {}
    features: dict[str, Any] = {"sessions_in_event": 1}

    if event.intervention:
        features["intervention_type"] = event.intervention.intervention_type.value
        features["target"] = event.intervention.target
        if event.intervention.duration_minutes is not None:
            features["duration_minutes"] = event.intervention.duration_minutes
        if event.intervention.frequency_hz is not None:
            features["frequency_hz"] = event.intervention.frequency_hz
        if event.intervention.off_label:
            features["off_label"] = True
    else:
        warnings.append("Intervention structured fields absent — only payload keys used.")

    session_idx = payload.get("session_number")
    if session_idx is not None:
        features["session_number"] = session_idx

    return FeatureExtractionResult(
        features=features,
        warnings=warnings,
        missing_fields=[],
        safety_flags=["no_automatic_parameter_change"],
        confidence=event.confidence,
        research_only=True,
    )


def extract_biometric_features(event: PatientDataEvent) -> FeatureExtractionResult:
    payload = event.payload or {}
    features: dict[str, Any] = {}
    missing: list[str] = []

    for key in ("heart_rate", "hrv_rmssd", "steps", "sleep_minutes"):
        if key in payload:
            try:
                features[key] = float(payload[key])
            except (TypeError, ValueError):
                missing.append(key)
        else:
            missing.append(key)

    nums = _collect_numeric_values(payload.get("series"))
    if nums:
        features["series_summary"] = _numeric_summary(nums)

    return FeatureExtractionResult(
        features=features,
        warnings=[] if features else ["No biometric numeric fields found."],
        missing_fields=missing,
        safety_flags=["supportive_context_only"],
        confidence=event.confidence,
        research_only=True,
    )


def extract_video_features(event: PatientDataEvent) -> FeatureExtractionResult:
    payload = event.payload or {}
    features = {k: v for k, v in payload.items() if k in ("gaze_metrics", "movement_index", "engagement_proxy")}
    warnings: list[str] = []
    if not features:
        warnings.append("No precomputed video feature keys present — skipped inference.")
    safety_flags = [
        "no_facial_recognition",
        "no_patient_identification",
        "behavioural_context_only",
    ]
    return FeatureExtractionResult(
        features=features,
        warnings=warnings,
        missing_fields=[k for k in ("gaze_metrics", "movement_index") if k not in payload],
        safety_flags=safety_flags,
        confidence=event.confidence,
        research_only=True,
    )


def extract_voice_features(event: PatientDataEvent) -> FeatureExtractionResult:
    payload = event.payload or {}
    keys = ("prosody", "pitch_std", "speech_rate_wpm", "pause_fraction", "sentiment_proxy")
    features = {k: payload[k] for k in keys if k in payload}
    warnings: list[str] = []
    if not features:
        warnings.append("No precomputed voice features — extraction skipped.")
    return FeatureExtractionResult(
        features=features,
        warnings=warnings,
        missing_fields=[k for k in keys if k not in payload],
        safety_flags=["exploratory_prosody_only", "not_diagnostic"],
        confidence=event.confidence,
        research_only=True,
    )


def _generic_stub(event: PatientDataEvent) -> FeatureExtractionResult:
    return FeatureExtractionResult(
        features={"modality": event.modality.value, "payload_keys": list((event.payload or {}).keys())},
        warnings=["Generic extractor — modality-specific summary not implemented."],
        missing_fields=[],
        safety_flags=["research_only_stub"],
        confidence=event.confidence,
        research_only=True,
    )


def _collect_numeric_values(raw: Any) -> list[float]:
    out: list[float] = []
    if raw is None:
        return out
    if isinstance(raw, dict):
        iterable = raw.values()
    elif isinstance(raw, list):
        iterable = raw
    else:
        return out
    for v in iterable:
        try:
            out.append(float(v))
        except (TypeError, ValueError):
            continue
    return out
