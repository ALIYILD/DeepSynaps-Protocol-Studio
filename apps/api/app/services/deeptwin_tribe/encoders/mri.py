"""MRI / structural imaging encoder.

Today: synthesizes structural region features + brain age delta.
Tomorrow: read from ``app.services.mri_pipeline`` outputs.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ..types import ModalityEmbedding
from ._common import attribution_dict, compute_quality, empty_embedding, project_features, stable_seed

FEATURE_NAMES = [
    "brain_age_delta_yrs",
    "cortical_thickness_dlpfc_z",
    "cortical_thickness_acc_z",
    "hippocampus_volume_z",
    "amygdala_volume_z",
    "white_matter_lesion_load",
    "ventricle_ratio_z",
    "fa_uncinate",
    "fa_cingulum",
]


def _extract_features(patient_id: str, sample: dict[str, Any] | None) -> np.ndarray:
    if sample and ("brain_age_delta" in sample or "regions" in sample):
        regions = sample.get("regions") or {}
        return np.array([
            float(sample.get("brain_age_delta", 0.0)),
            float(regions.get("dlpfc_thickness_z", 0.0)),
            float(regions.get("acc_thickness_z", 0.0)),
            float(regions.get("hippocampus_volume_z", 0.0)),
            float(regions.get("amygdala_volume_z", 0.0)),
            float(sample.get("wml_load", 0.0)),
            float(regions.get("ventricle_ratio_z", 0.0)),
            float(sample.get("fa_uncinate", 0.0)),
            float(sample.get("fa_cingulum", 0.0)),
        ])
    rng = np.random.default_rng(stable_seed("mri_features", patient_id))
    return rng.standard_normal(size=len(FEATURE_NAMES)) * 0.7


def encode_mri(patient_id: str, *, sample: dict[str, Any] | None = None) -> ModalityEmbedding:
    if "__no_mri__" in patient_id:
        return empty_embedding("mri", "No MRI scan on file. Structural features unavailable.")
    # Default: synthesize for any real-looking patient_id (demo mode).
    if not patient_id:
        return empty_embedding("mri", "No MRI scan on file. Structural features unavailable.")
    vec = _extract_features(patient_id, sample)
    quality = compute_quality(available=9, expected=9, artifact_pct=0.05)
    embedding = project_features(vec, modality="mri", patient_id=patient_id)
    return ModalityEmbedding(
        modality="mri",
        vector=embedding.tolist(),
        quality=quality,
        missing=False,
        feature_attributions=attribution_dict(FEATURE_NAMES, vec),
        notes=["MRI features are population-normed z-scores; clinician review required."],
    )
