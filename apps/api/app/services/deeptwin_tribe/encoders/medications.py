"""Medications encoder (count + drug class signature)."""

from __future__ import annotations

from typing import Any

import numpy as np

from ..types import ModalityEmbedding
from ._common import attribution_dict, compute_quality, empty_embedding, project_features, stable_seed

DRUG_CLASSES = [
    "ssri",
    "snri",
    "stimulant",
    "atypical_antipsychotic",
    "benzodiazepine",
    "anticonvulsant",
    "lithium",
    "tca",
    "maoi",
    "non_pharm",
]
FEATURE_NAMES = ["n_medications", *DRUG_CLASSES]


def _extract_features(patient_id: str, sample: dict[str, Any] | None) -> np.ndarray:
    if sample:
        meds: list[str] = [str(m).lower() for m in (sample.get("medications") or [])]
        vec = [float(len(meds))]
        for cls in DRUG_CLASSES:
            vec.append(1.0 if any(cls in m or m in cls for m in meds) else 0.0)
        return np.array(vec)
    rng = np.random.default_rng(stable_seed("medications_features", patient_id))
    n = int(np.clip(rng.normal(loc=1.5, scale=1.2), 0, 6))
    vec = [float(n)]
    for _ in DRUG_CLASSES:
        vec.append(1.0 if rng.random() < 0.18 else 0.0)
    return np.array(vec)


def encode_medications(patient_id: str, *, sample: dict[str, Any] | None = None) -> ModalityEmbedding:
    if "__no_medications__" in patient_id:
        return empty_embedding("medications", "No medication list on file; assume nil-by-mouth.")
    vec = _extract_features(patient_id, sample)
    quality = compute_quality(available=len(FEATURE_NAMES), expected=len(FEATURE_NAMES))
    embedding = project_features(vec, modality="medications", patient_id=patient_id)
    return ModalityEmbedding(
        modality="medications",
        vector=embedding.tolist(),
        quality=quality,
        missing=False,
        feature_attributions=attribution_dict(FEATURE_NAMES, vec),
        notes=["Medication classes encoded as multi-hot; doses are not used in this version."],
    )
