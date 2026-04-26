"""qEEG modality encoder.

Today: deterministic feature extraction seeded by patient_id, simulating
what a real qEEG biomarker pipeline (band-power z-scores, theta/beta
ratio, alpha asymmetry, coherence summaries) would yield.

Tomorrow: replace ``_extract_features`` with reads from
``app.services.qeeg`` / ``app.services.qeeg_ai_interpreter`` so a real
pretrained spectral/connectivity encoder can plug in unchanged.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ..types import ModalityEmbedding
from ._common import attribution_dict, compute_quality, empty_embedding, project_features, stable_seed

FEATURE_NAMES = [
    "alpha_power_z",
    "beta_power_z",
    "theta_power_z",
    "delta_power_z",
    "gamma_power_z",
    "theta_beta_ratio",
    "alpha_asymmetry_F3F4",
    "coherence_frontal",
    "coherence_temporal",
    "peak_alpha_freq",
    "qeeg_global_zscore",
    "artifact_pct",
]


def _extract_features(patient_id: str, sample: dict[str, Any] | None) -> tuple[np.ndarray, float]:
    """Return (feature_vector, artifact_pct).

    Real version would pull QEEGAnalysis rows; demo version generates a
    stable synthetic vector seeded by patient_id.
    """
    if sample and "band_powers" in sample:
        bp = sample.get("band_powers") or {}
        artifact_pct = float(sample.get("artifact_pct", 0.05))
        vec = np.array([
            float(bp.get("alpha_z", 0.0)),
            float(bp.get("beta_z", 0.0)),
            float(bp.get("theta_z", 0.0)),
            float(bp.get("delta_z", 0.0)),
            float(bp.get("gamma_z", 0.0)),
            float(sample.get("theta_beta_ratio", 0.0)),
            float(sample.get("alpha_asymmetry", 0.0)),
            float(sample.get("coherence_frontal", 0.0)),
            float(sample.get("coherence_temporal", 0.0)),
            float(sample.get("peak_alpha_freq", 10.0)),
            float(sample.get("qeeg_global_zscore", 0.0)),
            artifact_pct,
        ])
        return vec, artifact_pct
    rng = np.random.default_rng(stable_seed("qeeg_features", patient_id))
    vec = rng.standard_normal(size=len(FEATURE_NAMES))
    vec[5] = abs(vec[5]) * 1.5 + 1.5  # theta/beta ratio always positive
    vec[9] = 9.0 + rng.normal(scale=0.8)  # peak alpha around 9-11
    artifact_pct = float(np.clip(0.04 + abs(rng.normal(scale=0.04)), 0.0, 0.4))
    vec[-1] = artifact_pct
    return vec, artifact_pct


def encode_qeeg(patient_id: str, *, sample: dict[str, Any] | None = None) -> ModalityEmbedding:
    if "__no_qeeg__" in patient_id or "__no_data__" in patient_id:
        return empty_embedding("qeeg", "No qEEG recording available for this patient.")
    has_data = bool(sample and sample.get("band_powers"))
    if not has_data and patient_id:
        # Demo mode: synthesize features for any real-looking patient_id.
        has_data = True
    if not has_data:
        return empty_embedding("qeeg", "No qEEG recording available for this patient.")
    vec, artifact_pct = _extract_features(patient_id, sample)
    quality = compute_quality(available=12, expected=12, artifact_pct=artifact_pct)
    embedding = project_features(vec, modality="qeeg", patient_id=patient_id)
    return ModalityEmbedding(
        modality="qeeg",
        vector=embedding.tolist(),
        quality=quality,
        missing=False,
        feature_attributions=attribution_dict(FEATURE_NAMES, vec),
        notes=[
            f"qEEG biomarker quality estimate: {quality:.2f} (artifact_pct={artifact_pct:.2f}).",
        ],
    )
