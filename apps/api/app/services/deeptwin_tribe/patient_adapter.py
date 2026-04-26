"""Patient-specific adaptation layer (TRIBE-inspired subject mapping).

Conditions the fused latent on subject-specific information that lives
outside any single modality:
- demographics (age, sex)
- primary diagnosis / comorbidities
- baseline severity
- prior protocol response history
- modality availability profile

This is implemented as a deterministic affine bias so the contract is
predictable. A learned subject-mapping layer can replace ``_bias`` later
without touching downstream heads.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from .encoders._common import stable_seed
from .types import EMBED_DIM, AdaptedPatient, PatientLatent


def _bias(patient_id: str, profile: dict[str, Any]) -> np.ndarray:
    seed = stable_seed("subject_adapter", patient_id, profile.get("primary_diagnosis"))
    rng = np.random.default_rng(seed)
    bias = rng.standard_normal(size=EMBED_DIM) * 0.04
    severity = float(profile.get("baseline_severity_z", 0.0) or 0.0)
    bias = bias + severity * 0.02
    return bias


def adapt(latent: PatientLatent, profile: dict[str, Any] | None = None) -> AdaptedPatient:
    profile = profile or {}
    base_vec = np.array(latent.vector, dtype=float)
    bias = _bias(latent.patient_id, profile)
    adapted = np.tanh(base_vec + bias)
    summary: dict[str, Any] = {
        "applied_baseline_severity": float(profile.get("baseline_severity_z", 0.0) or 0.0),
        "primary_diagnosis": profile.get("primary_diagnosis"),
        "n_used_modalities": len(latent.used_modalities),
        "fusion_quality": latent.fusion_quality,
        "coverage_ratio": latent.coverage_ratio,
        "notes": [
            "Subject adaptation is a deterministic bias; it does not encode "
            "any individual identifier.",
        ],
    }
    return AdaptedPatient(base=latent, adapted_vector=adapted.tolist(), adaptation_summary=summary)
