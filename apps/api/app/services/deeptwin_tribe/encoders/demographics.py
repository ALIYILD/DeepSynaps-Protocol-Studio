"""Demographics encoder (age, sex, education, baseline severity).

Privacy boundary
----------------
Only de-identified, aggregated demographic features are encoded. No
direct identifiers (name, email, address) leak into the latent.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ..types import ModalityEmbedding
from ._common import attribution_dict, compute_quality, empty_embedding, project_features, stable_seed

FEATURE_NAMES = [
    "age_normalized",
    "sex_male",
    "sex_female",
    "sex_other",
    "education_years_normalized",
    "primary_dx_neurodev",
    "primary_dx_mood",
    "primary_dx_anxiety",
    "primary_dx_other",
    "baseline_severity_z",
]


def _onehot_sex(sex: str | None) -> tuple[float, float, float]:
    s = (sex or "").lower()
    if s.startswith("m"):
        return (1.0, 0.0, 0.0)
    if s.startswith("f"):
        return (0.0, 1.0, 0.0)
    return (0.0, 0.0, 1.0)


def _onehot_dx(dx: str | None) -> tuple[float, float, float, float]:
    d = (dx or "").lower()
    if any(k in d for k in ("adhd", "asd", "autism", "neurodev")):
        return (1.0, 0.0, 0.0, 0.0)
    if any(k in d for k in ("depress", "bipolar", "mood")):
        return (0.0, 1.0, 0.0, 0.0)
    if any(k in d for k in ("anxiety", "ptsd", "ocd", "panic")):
        return (0.0, 0.0, 1.0, 0.0)
    return (0.0, 0.0, 0.0, 1.0)


def _extract_features(patient_id: str, sample: dict[str, Any] | None) -> np.ndarray:
    if sample:
        age = float(sample.get("age", 35))
        sex_m, sex_f, sex_o = _onehot_sex(sample.get("sex"))
        edu = float(sample.get("education_years", 14))
        dx_n, dx_m, dx_a, dx_o = _onehot_dx(sample.get("primary_diagnosis"))
        sev = float(sample.get("baseline_severity_z", 0.0))
        return np.array([
            (age - 35.0) / 20.0, sex_m, sex_f, sex_o,
            (edu - 14.0) / 6.0, dx_n, dx_m, dx_a, dx_o, sev,
        ])
    rng = np.random.default_rng(stable_seed("demographics_features", patient_id))
    age = float(np.clip(rng.normal(loc=37, scale=14), 8, 85))
    sex_m, sex_f, sex_o = (1.0, 0.0, 0.0) if rng.random() < 0.5 else (0.0, 1.0, 0.0)
    edu = float(np.clip(rng.normal(loc=14, scale=3), 4, 22))
    dx = ["neurodev", "mood", "anxiety", "other"][int(rng.integers(0, 4))]
    dx_n, dx_m, dx_a, dx_o = _onehot_dx(dx)
    sev = float(np.clip(rng.normal(scale=0.8), -2, 2))
    return np.array([(age - 35.0) / 20.0, sex_m, sex_f, sex_o,
                     (edu - 14.0) / 6.0, dx_n, dx_m, dx_a, dx_o, sev])


def encode_demographics(patient_id: str, *, sample: dict[str, Any] | None = None) -> ModalityEmbedding:
    if "__no_demographics__" in patient_id:
        return empty_embedding("demographics", "Demographics not available; using cohort-mean prior.")
    vec = _extract_features(patient_id, sample)
    quality = compute_quality(available=10, expected=10)
    embedding = project_features(vec, modality="demographics", patient_id=patient_id)
    return ModalityEmbedding(
        modality="demographics",
        vector=embedding.tolist(),
        quality=quality,
        missing=False,
        feature_attributions=attribution_dict(FEATURE_NAMES, vec),
        notes=["Demographics use coarse one-hot encodings; no direct identifiers stored."],
    )
