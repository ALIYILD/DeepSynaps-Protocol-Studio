"""Explanation layer for the TRIBE-inspired DeepTwin layer.

Produces human-readable rationale + uncertainty + missing-data notes for
every simulation output. Inputs:
- the per-modality embeddings (their feature attributions),
- the fused patient latent (which modalities contributed how much),
- the head outputs (response probability, adverse risk).

All language is intentionally cautious — predictions are framed as
estimated response patterns, not guaranteed clinical outcomes.
"""

from __future__ import annotations

from typing import Iterable

from .types import (
    AdaptedPatient,
    Explanation,
    HeadOutputs,
    ModalityEmbedding,
    ProtocolSpec,
)


def _grade(quality: float, coverage: float) -> str:
    score = 0.5 * quality + 0.5 * coverage
    if score >= 0.7:
        return "moderate"  # we never claim "high" without real outcome data
    return "low"


def explain(
    *,
    embeddings: Iterable[ModalityEmbedding],
    latent: AdaptedPatient,
    heads: HeadOutputs,
    protocol: ProtocolSpec,
) -> Explanation:
    embs = list(embeddings)

    # Top-3 contributing modalities by fusion weight.
    weights = latent.base.modality_weights
    top_modalities = sorted(
        ({"modality": m, "weight": float(w),
          "quality": next((float(e.quality) for e in embs if e.modality == m), 0.0)}
         for m, w in weights.items() if w > 0),
        key=lambda d: d["weight"], reverse=True,
    )[:3]

    # Top-3 drivers across modalities (highest |attribution|).
    drivers: list[dict] = []
    for emb in embs:
        for feat, val in emb.feature_attributions.items():
            drivers.append({
                "modality": emb.modality,
                "feature": feat,
                "weight": float(val),
                "direction": "↑" if val > 0 else "↓",
            })
    top_drivers = sorted(drivers, key=lambda d: abs(d["weight"]), reverse=True)[:3]

    missing_data_notes: list[str] = []
    for m in latent.base.missing_modalities:
        missing_data_notes.append(f"Modality '{m}' is missing — its drivers were not used in this prediction.")
    if latent.base.coverage_ratio < 0.4:
        missing_data_notes.append(
            "Fewer than 40% of expected modalities contributed; treat the prediction as exploratory.")

    cautions: list[str] = [
        "DeepTwin output is decision-support only, not a prescription or diagnosis.",
        "Predicted trajectories are model-estimated response patterns with uncertainty.",
        "Causal claims are not implied; clinician interpretation required.",
    ]
    if heads.adverse_risk.get("level") == "elevated":
        cautions.append(
            "Patient has recorded contraindications; expanded safety monitoring is recommended."
        )
    if heads.response_confidence == "low":
        cautions.append(
            "Response confidence is low. Consider gathering more baseline data before committing."
        )

    rationale = (
        f"Estimated response probability {heads.response_probability:.2f} for protocol "
        f"{protocol.protocol_id} ({protocol.modality}). Top contributing modalities: "
        + ", ".join(f"{m['modality']} ({m['weight']:.2f})" for m in top_modalities)
        + ". This is a model-estimated hypothesis, not a clinical recommendation."
    )

    return Explanation(
        top_modalities=top_modalities,
        top_drivers=top_drivers,
        missing_data_notes=missing_data_notes,
        cautions=cautions,
        evidence_grade=_grade(latent.base.fusion_quality, latent.base.coverage_ratio),  # type: ignore[arg-type]
        rationale=rationale,
    )
