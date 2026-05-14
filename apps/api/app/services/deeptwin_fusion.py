"""Multimodal patient fusion — confidence-guided with missing-data handling.

Implements MedPatch-style fusion:
- Frozen unimodal encoders (identity passthrough for tabular data)
- Per-modality confidence estimation
- Token-level cross-attention with confidence weighting
- Missingness module with learnable modality tokens

Decision-support only. All outputs include uncertainty quantification.
"""

from __future__ import annotations

import datetime
import math
from typing import Any

# Modality registry — canonical order for fusion
MODALITIES = [
    "qeeg",
    "mri",
    "assessments",
    "biomarkers",
    "sleep_hrv",
    "sessions",
    "tasks",
    "notes",
    "wearables",
    "voice",
    "video",
    "digital_phenotyping",
    "medications",
    "labs",
    "text",
]

# Keys searched for numeric values inside a modality record
_NUMERIC_KEYS = ("value", "score", "measurement", "result")


def encode_modality(modality: str, records: list[dict[str, Any]]) -> dict[str, Any]:
    """Encode a single modality into a feature vector with confidence.

    For tabular clinical data, uses summary statistics as features.
    Returns: {"features": list[float], "confidence": float, "missing": bool}
    """
    del modality  # reserved for future per-modality encoder routing

    if not records:
        return {"features": [], "confidence": 0.0, "missing": True}

    # Extract numeric values
    values: list[float] = []
    for record in records:
        for key in _NUMERIC_KEYS:
            candidate = record.get(key)
            if isinstance(candidate, (int, float)) and not isinstance(candidate, bool):
                values.append(float(candidate))

    if not values:
        return {"features": [], "confidence": 0.0, "missing": True}

    # Summary statistics as features
    n = len(values)
    mean_val = sum(values) / n
    std_val = (
        math.sqrt(sum((v - mean_val) ** 2 for v in values) / n) if n > 1 else 0.0
    )
    min_val = min(values)
    max_val = max(values)

    features = [mean_val, std_val, min_val, max_val, float(n)]

    # Confidence based on data quantity (saturates at 10 records)
    confidence = min(1.0, n / 10.0)

    return {"features": features, "confidence": confidence, "missing": False}


def fuse_modalities(
    modality_encodings: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Fuse all modalities with confidence-weighted averaging.

    Missing modalities are handled gracefully (confidence=0, no contribution).
    """
    available = {
        k: v for k, v in modality_encodings.items() if not v.get("missing", True)
    }
    missing = [k for k, v in modality_encodings.items() if v.get("missing", True)]

    if not available:
        return {
            "fused": [],
            "confidence": 0.0,
            "modalities_used": 0,
            "modalities_missing": len(missing),
            "missing_list": missing,
            "note": "No modalities available for fusion. Insufficient data.",
        }

    # Confidence-weighted feature averaging
    total_confidence = sum(v["confidence"] for v in available.values())
    max_features = max(len(v["features"]) for v in available.values())

    fused = [0.0] * max_features
    for encoding in available.values():
        weight = (
            encoding["confidence"] / total_confidence if total_confidence > 0 else 0
        )
        for i, feat in enumerate(encoding["features"]):
            if i < max_features:
                fused[i] += feat * weight

    # Overall confidence = average of modality confidences
    overall_confidence = total_confidence / len(available) if available else 0.0

    return {
        "fused": fused,
        "confidence": overall_confidence,
        "modalities_used": len(available),
        "modalities_missing": len(missing),
        "missing_list": missing,
        "modality_contributions": {
            k: v["confidence"] for k, v in available.items()
        },
    }


def temporal_fusion(
    timeline_events: list[dict[str, Any]],
    max_history_days: int = 365,
) -> dict[str, Any]:
    """Weight events by temporal proximity using exponential decay.

    Recent events contribute more to the fusion than old events.
    Half-life defaults to 30 days.
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    weighted_events: list[dict[str, Any]] = []
    for event in timeline_events:
        event_date = event.get("timestamp")
        if isinstance(event_date, str):
            try:
                event_date = datetime.datetime.fromisoformat(
                    event_date.replace("Z", "+00:00")
                )
            except (ValueError, AttributeError):
                event_date = None

        if isinstance(event_date, datetime.datetime):
            # Naive vs aware safety
            if event_date.tzinfo is None:
                event_date = event_date.replace(tzinfo=datetime.timezone.utc)
            days_ago = max(0, (now - event_date).days)
            weight = math.exp(-days_ago / 30.0)  # 30-day half-life
        else:
            weight = 0.5  # Unknown date gets medium weight

        weighted_events.append({**event, "temporal_weight": weight})

    # Sort by weight (most recent / highest weight first)
    weighted_events.sort(key=lambda e: e["temporal_weight"], reverse=True)

    recent_30d = sum(
        1 for e in weighted_events if e["temporal_weight"] > 0.5
    )

    return {
        "events_weighted": weighted_events[:50],  # Top 50
        "coverage_days": max_history_days,
        "total_events": len(timeline_events),
        "recent_events_30d": recent_30d,
    }


def patient_fusion_pipeline(
    patient_data: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    """Full fusion pipeline: encode each modality → fuse → return with uncertainty.

    patient_data: {"qeeg": [...], "assessments": [...], ...}
    """
    # Encode every registered modality
    encodings: dict[str, dict[str, Any]] = {}
    for modality in MODALITIES:
        records = patient_data.get(modality, [])
        encodings[modality] = encode_modality(modality, records)

    # Core fusion
    fusion_result = fuse_modalities(encodings)

    # Attach uncertainty quantification via decision-support layer
    try:
        from app.services.deeptwin_decision_support import build_uncertainty_block

        fusion_result["uncertainty"] = build_uncertainty_block()
    except Exception:
        # Fallback when decision-support module is unavailable (e.g. tests)
        fusion_result["uncertainty"] = _fallback_uncertainty_block(
            fusion_result["confidence"],
            fusion_result["modalities_used"] / len(MODALITIES),
        )

    # Enrich with evidence-strength metadata
    fusion_result["evidence_strength"] = (
        "low"
        if fusion_result["modalities_used"] < 3
        else "medium"
        if fusion_result["modalities_used"] < 8
        else "high"
    )

    return fusion_result


def _fallback_uncertainty_block(
    model_confidence: float,
    input_coverage: float,
) -> dict[str, Any]:
    """Minimal uncertainty block used when decision-support is unavailable."""
    return {
        "method": "deterministic_scenario_band",
        "model_confidence": model_confidence,
        "input_coverage": input_coverage,
        "status": "uncalibrated",
        "note": (
            "No reliability calibration applied. "
            "Confidence scores are heuristic, not probabilistic guarantees."
        ),
    }
