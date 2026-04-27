"""Voice / prosody encoder (placeholder).

Today: deterministic affective features (pitch, jitter, energy, pause
ratio) seeded by patient_id, when audio analysis exists. Tomorrow: real
prosody encoder (e.g. wav2vec2 features) plugs into the same interface.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ..types import ModalityEmbedding
from ._common import attribution_dict, compute_quality, empty_embedding, project_features, stable_seed

FEATURE_NAMES = [
    "n_voice_samples_30d",
    "f0_mean_hz",
    "f0_variance",
    "jitter_pct",
    "shimmer_pct",
    "energy_mean",
    "pause_ratio",
    "speech_rate_wpm",
    "affect_negative",
    "affect_positive",
]


def _extract_features(patient_id: str, sample: dict[str, Any] | None) -> tuple[np.ndarray, int]:
    if sample:
        n = int(sample.get("n_samples", 0))
        if n == 0:
            return np.zeros(len(FEATURE_NAMES)), 0
        return np.array([
            float(n),
            float(sample.get("f0_mean_hz", 130.0)),
            float(sample.get("f0_variance", 25.0)),
            float(sample.get("jitter_pct", 0.4)),
            float(sample.get("shimmer_pct", 3.5)),
            float(sample.get("energy_mean", 0.05)),
            float(sample.get("pause_ratio", 0.18)),
            float(sample.get("speech_rate_wpm", 140.0)),
            float(sample.get("affect_negative", 0.3)),
            float(sample.get("affect_positive", 0.4)),
        ]), n
    rng = np.random.default_rng(stable_seed("voice_features", patient_id))
    n = int(np.clip(rng.normal(loc=2, scale=2), 0, 10))
    if n == 0:
        return np.zeros(len(FEATURE_NAMES)), 0
    vec = np.array([
        float(n),
        float(np.clip(130 + rng.normal(scale=30), 60, 320)),
        float(abs(rng.normal(loc=22, scale=8))),
        float(np.clip(rng.normal(loc=0.5, scale=0.2), 0.0, 3.0)),
        float(np.clip(rng.normal(loc=3.5, scale=1.0), 0.5, 12.0)),
        float(np.clip(rng.normal(loc=0.05, scale=0.02), 0.0, 0.4)),
        float(np.clip(rng.normal(loc=0.2, scale=0.08), 0.0, 0.7)),
        float(np.clip(140 + rng.normal(scale=25), 60, 240)),
        float(np.clip(0.3 + rng.normal(scale=0.15), 0.0, 1.0)),
        float(np.clip(0.4 + rng.normal(scale=0.15), 0.0, 1.0)),
    ])
    return vec, n


def encode_voice(patient_id: str, *, sample: dict[str, Any] | None = None) -> ModalityEmbedding:
    if "__no_voice__" in patient_id:
        return empty_embedding("voice", "No voice samples available.")
    vec, n = _extract_features(patient_id, sample)
    quality = compute_quality(available=int(n), expected=4)
    if quality == 0:
        return empty_embedding("voice", "Voice modality has zero recent samples.")
    embedding = project_features(vec, modality="voice", patient_id=patient_id)
    return ModalityEmbedding(
        modality="voice",
        vector=embedding.tolist(),
        quality=quality,
        missing=False,
        feature_attributions=attribution_dict(FEATURE_NAMES, vec),
        notes=["Prosodic features are population-normed; clinician interpretation needed."],
    )
