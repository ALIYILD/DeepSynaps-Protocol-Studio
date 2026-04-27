"""Wearables encoder (sleep, HRV, activity, stress, RHR)."""

from __future__ import annotations

from typing import Any

import numpy as np

from ..types import ModalityEmbedding
from ._common import attribution_dict, compute_quality, empty_embedding, project_features, stable_seed

FEATURE_NAMES = [
    "sleep_total_min_avg",
    "sleep_efficiency_pct",
    "sleep_variability_min",
    "hrv_rmssd_ms",
    "rhr_bpm",
    "steps_per_day",
    "activity_minutes",
    "stress_score",
    "wearable_days_with_data",
]


def _extract_features(patient_id: str, sample: dict[str, Any] | None) -> tuple[np.ndarray, int]:
    if sample:
        days = int(sample.get("days_with_data", 0))
        vec = np.array([
            float(sample.get("sleep_total_min_avg", 0.0)),
            float(sample.get("sleep_efficiency_pct", 0.0)),
            float(sample.get("sleep_variability_min", 0.0)),
            float(sample.get("hrv_rmssd_ms", 0.0)),
            float(sample.get("rhr_bpm", 0.0)),
            float(sample.get("steps_per_day", 0.0)),
            float(sample.get("activity_minutes", 0.0)),
            float(sample.get("stress_score", 0.0)),
            float(days),
        ])
        return vec, days
    rng = np.random.default_rng(stable_seed("wearables_features", patient_id))
    days = int(np.clip(rng.normal(loc=24, scale=10), 0, 90))
    vec = np.array([
        float(np.clip(420 + rng.normal(scale=45), 240, 600)),
        float(np.clip(85 + rng.normal(scale=6), 50, 100)),
        float(abs(rng.normal(loc=35, scale=12))),
        float(np.clip(40 + rng.normal(scale=12), 10, 100)),
        float(np.clip(64 + rng.normal(scale=8), 40, 110)),
        float(np.clip(7800 + rng.normal(scale=2400), 0, 20000)),
        float(np.clip(28 + rng.normal(scale=12), 0, 200)),
        float(np.clip(40 + rng.normal(scale=15), 0, 100)),
        float(days),
    ])
    return vec, days


def encode_wearables(patient_id: str, *, sample: dict[str, Any] | None = None) -> ModalityEmbedding:
    if "__no_wearables__" in patient_id:
        return empty_embedding("wearables", "No wearable data linked to this patient.")
    vec, days = _extract_features(patient_id, sample)
    quality = compute_quality(available=days, expected=30)
    if quality == 0:
        return empty_embedding("wearables", "Wearable data window has zero days of coverage.")
    embedding = project_features(vec, modality="wearables", patient_id=patient_id)
    return ModalityEmbedding(
        modality="wearables",
        vector=embedding.tolist(),
        quality=quality,
        missing=False,
        feature_attributions=attribution_dict(FEATURE_NAMES, vec),
        notes=[f"Wearable coverage: {days}/30 expected days."],
    )
