"""Multimodal fusion layer (TRIBE-inspired temporal/multimodal integration).

Takes a list of ``ModalityEmbedding`` and produces a single
``PatientLatent``. Missing modalities are masked out and the remaining
weights re-normalised, so the latent is well-defined even when most
modalities are absent.

Design choices
--------------
- Attention weights are derived from ``embedding.quality`` (0..1).
  This is a quality-weighted mean, the simplest TRIBE-shaped fusion that
  preserves the property "more reliable modalities contribute more".
- A modality with quality == 0 (or ``missing``) gets zero weight and is
  marked in ``missing_modalities``.
- Coverage ratio is the share of expected modalities that contributed.
- A scalar ``fusion_quality`` summarises overall reliability.

Real-model upgrade path
-----------------------
Replace ``_attention_weights`` with a learned cross-modal transformer
attention head. The contract above does not need to change.
"""

from __future__ import annotations

from typing import Iterable

import numpy as np

from .types import ALL_MODALITIES, EMBED_DIM, ModalityEmbedding, PatientLatent


def _attention_weights(qualities: np.ndarray) -> np.ndarray:
    """Quality-weighted softmax-ish attention.

    A modality with quality 0 stays at 0; the others split the
    remaining weight in proportion to their quality.
    """
    safe = np.clip(qualities, 0.0, 1.0)
    total = float(safe.sum())
    if total <= 0:
        return np.zeros_like(safe)
    return safe / total


def fuse(
    patient_id: str,
    embeddings: Iterable[ModalityEmbedding],
) -> PatientLatent:
    embs = list(embeddings)
    if not embs:
        return PatientLatent(
            patient_id=patient_id,
            vector=[0.0] * EMBED_DIM,
            modality_weights={},
            used_modalities=[],
            missing_modalities=list(ALL_MODALITIES),
            fusion_quality=0.0,
            coverage_ratio=0.0,
            notes=["No modality embeddings provided to fusion."],
        )

    vectors = np.array([e.vector for e in embs], dtype=float)
    qualities = np.array([0.0 if e.missing else e.quality for e in embs], dtype=float)
    weights = _attention_weights(qualities)
    fused = (vectors * weights[:, None]).sum(axis=0)

    used = [e.modality for e, w in zip(embs, weights) if w > 0]
    missing = [e.modality for e, w in zip(embs, weights) if w == 0]
    coverage_ratio = round(len(used) / float(len(ALL_MODALITIES)), 3)
    fusion_quality = round(float((qualities * weights).sum()), 3)

    notes: list[str] = []
    if coverage_ratio < 0.4:
        notes.append(
            "Modality coverage is low; fused latent should be treated as "
            "exploratory and reviewed by a clinician."
        )
    if fusion_quality < 0.3:
        notes.append("Average modality quality is low; downstream confidence will be reduced.")

    return PatientLatent(
        patient_id=patient_id,
        vector=fused.tolist(),
        modality_weights={e.modality: round(float(w), 4) for e, w in zip(embs, weights)},
        used_modalities=used,
        missing_modalities=missing,
        fusion_quality=fusion_quality,
        coverage_ratio=coverage_ratio,
        notes=notes,
    )
