"""Treatment history encoder (prior sessions, response trend, adherence)."""

from __future__ import annotations

from typing import Any

import numpy as np

from ..types import ModalityEmbedding
from ._common import attribution_dict, compute_quality, empty_embedding, project_features, stable_seed

FEATURE_NAMES = [
    "n_prior_sessions",
    "n_prior_protocols",
    "median_response_pct",
    "best_response_pct",
    "worst_response_pct",
    "adherence_pct_90d",
    "drop_out_count",
    "weeks_since_last_session",
    "prior_adverse_events",
]


def _extract_features(patient_id: str, sample: dict[str, Any] | None) -> tuple[np.ndarray, int]:
    if sample:
        n = int(sample.get("n_prior_sessions", 0))
        vec = np.array([
            float(n),
            float(sample.get("n_prior_protocols", 0)),
            float(sample.get("median_response_pct", 0.0)),
            float(sample.get("best_response_pct", 0.0)),
            float(sample.get("worst_response_pct", 0.0)),
            float(sample.get("adherence_pct_90d", 80.0)),
            float(sample.get("drop_out_count", 0)),
            float(sample.get("weeks_since_last_session", 0)),
            float(sample.get("prior_adverse_events", 0)),
        ])
        return vec, n
    rng = np.random.default_rng(stable_seed("history_features", patient_id))
    n = int(np.clip(rng.normal(loc=12, scale=8), 0, 80))
    vec = np.array([
        float(n),
        float(int(np.clip(rng.normal(loc=2, scale=1), 0, 6))),
        float(np.clip(rng.normal(loc=18, scale=12), -20, 60)),
        float(np.clip(rng.normal(loc=32, scale=14), 0, 80)),
        float(np.clip(rng.normal(loc=4, scale=10), -20, 40)),
        float(np.clip(rng.normal(loc=78, scale=12), 30, 100)),
        float(int(abs(rng.normal(scale=0.4)))),
        float(int(np.clip(rng.normal(loc=2, scale=2), 0, 12))),
        float(int(abs(rng.normal(scale=0.3)))),
    ])
    return vec, n


def encode_treatment_history(patient_id: str, *, sample: dict[str, Any] | None = None) -> ModalityEmbedding:
    if "__no_history__" in patient_id:
        return empty_embedding("treatment_history", "Patient is treatment-naive — no prior protocol response on file.")
    vec, n = _extract_features(patient_id, sample)
    quality = compute_quality(available=min(n, 6), expected=6)
    embedding = project_features(vec, modality="treatment_history", patient_id=patient_id)
    return ModalityEmbedding(
        modality="treatment_history",
        vector=embedding.tolist(),
        quality=quality,
        missing=False,
        feature_attributions=attribution_dict(FEATURE_NAMES, vec),
        notes=[f"Prior session count: {n}."],
    )
