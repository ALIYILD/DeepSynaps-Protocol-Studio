"""Assessment encoder (PHQ-9, GAD-7, QIDS, MADRS, WHO-5, MoCA, etc.)."""

from __future__ import annotations

from typing import Any

import numpy as np

from ..types import ModalityEmbedding
from ._common import attribution_dict, compute_quality, empty_embedding, project_features, stable_seed

FEATURE_NAMES = [
    "phq9_total",
    "phq9_slope_4w",
    "gad7_total",
    "gad7_slope_4w",
    "qids_total",
    "madrs_total",
    "who5_total",
    "moca_total",
    "isi_total",
    "n_assessments_90d",
]


def _normalize(value: float | None, lo: float, hi: float) -> float:
    if value is None:
        return 0.0
    return max(-3.0, min(3.0, (float(value) - (lo + hi) / 2.0) / max(1.0, (hi - lo) / 2.0)))


def _extract_features(patient_id: str, sample: dict[str, Any] | None) -> tuple[np.ndarray, int]:
    if sample:
        n = int(sample.get("n_assessments_90d", 0) or 0)
        vec = np.array([
            _normalize(sample.get("phq9_total"), 0, 27),
            float(sample.get("phq9_slope_4w", 0.0)),
            _normalize(sample.get("gad7_total"), 0, 21),
            float(sample.get("gad7_slope_4w", 0.0)),
            _normalize(sample.get("qids_total"), 0, 27),
            _normalize(sample.get("madrs_total"), 0, 60),
            _normalize(sample.get("who5_total"), 0, 25),
            _normalize(sample.get("moca_total"), 0, 30),
            _normalize(sample.get("isi_total"), 0, 28),
            min(8.0, n),
        ])
        return vec, n
    rng = np.random.default_rng(stable_seed("assessments_features", patient_id))
    n = int(np.clip(rng.normal(loc=4, scale=2), 0, 12))
    vec = rng.standard_normal(size=len(FEATURE_NAMES)) * 0.6
    vec[-1] = n
    return vec, n


def encode_assessments(patient_id: str, *, sample: dict[str, Any] | None = None) -> ModalityEmbedding:
    if "__no_assessments__" in patient_id:
        return empty_embedding("assessments", "No assessment scores on file in the last 90 days.")
    vec, n = _extract_features(patient_id, sample)
    quality = compute_quality(available=int(n), expected=6)
    if quality == 0:
        return empty_embedding("assessments", "Patient has no recent assessments to summarise.")
    embedding = project_features(vec, modality="assessments", patient_id=patient_id)
    return ModalityEmbedding(
        modality="assessments",
        vector=embedding.tolist(),
        quality=quality,
        missing=False,
        feature_attributions=attribution_dict(FEATURE_NAMES, vec),
        notes=[f"Assessment burden score derived from {n} submission(s) in the last 90 days."],
    )
