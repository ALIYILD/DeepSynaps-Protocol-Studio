"""Shared helpers for modality encoders.

Every encoder follows the same recipe:
1. Pull (or synthesize) per-modality features.
2. Compute a quality score in [0, 1].
3. Project features into EMBED_DIM via a deterministic, seeded linear map.
4. Return ``ModalityEmbedding`` with feature attributions for explanation.

The seeded projection acts as a stand-in for a learned encoder. When real
pretrained encoders are wired in later, only the project/quality/feature
extraction inside each module needs to change — the contract stays.
"""

from __future__ import annotations

import hashlib
from typing import Any

import numpy as np

from ..types import EMBED_DIM, ModalityEmbedding, ModalityName


def stable_seed(*parts: Any) -> int:
    """Deterministic 32-bit seed from arbitrary parts."""
    joined = "|".join(str(p or "") for p in parts).encode("utf-8")
    return int(hashlib.blake2s(joined, digest_size=4).hexdigest(), 16)


def project_features(
    feature_vec: np.ndarray,
    *,
    modality: ModalityName,
    patient_id: str,
) -> np.ndarray:
    """Project a feature vector into EMBED_DIM with a seeded linear map.

    The map is per-modality (so each modality lives in its own subspace)
    but stable across patients (so two patients with similar features
    map to similar latents).
    """
    proj_seed = stable_seed("encoder_proj", modality)
    proj_rng = np.random.default_rng(proj_seed)
    weights = proj_rng.standard_normal(size=(EMBED_DIM, len(feature_vec))) * 0.1
    bias_seed = stable_seed("encoder_bias", modality)
    bias = np.random.default_rng(bias_seed).standard_normal(size=EMBED_DIM) * 0.05
    pat_jitter_rng = np.random.default_rng(stable_seed(modality, patient_id, "jitter"))
    jitter = pat_jitter_rng.standard_normal(size=EMBED_DIM) * 0.02
    out = np.tanh(weights @ feature_vec + bias + jitter)
    return out


def empty_embedding(modality: ModalityName, note: str) -> ModalityEmbedding:
    """Embedding for a modality with no usable data."""
    return ModalityEmbedding(
        modality=modality,
        vector=[0.0] * EMBED_DIM,
        quality=0.0,
        missing=True,
        feature_attributions={},
        notes=[note],
    )


def compute_quality(
    *, available: int, expected: int, artifact_pct: float = 0.0
) -> float:
    """Heuristic quality in [0, 1]: coverage minus artifact penalty.

    available/expected gives coverage; artifact_pct (0..1) is subtracted
    to penalise noisy data. Result is clipped to [0, 1].
    """
    if expected <= 0:
        return 0.0
    coverage = max(0.0, min(1.0, available / expected))
    quality = max(0.0, coverage - 0.5 * max(0.0, min(1.0, artifact_pct)))
    return round(quality, 3)


def attribution_dict(
    feature_names: list[str], feature_vec: np.ndarray, top_k: int = 5
) -> dict[str, float]:
    """Take the top-k absolute-magnitude features as attribution drivers."""
    if len(feature_vec) == 0:
        return {}
    abs_idx = np.argsort(-np.abs(feature_vec))[:top_k]
    return {feature_names[i]: round(float(feature_vec[i]), 4) for i in abs_idx}
