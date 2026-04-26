"""Top-level orchestrator for the TRIBE-inspired DeepTwin layer.

Public functions are the only thing the router (and tests) should call:

- ``encode_all`` — run all 9 modality encoders for a patient
- ``compute_patient_latent`` — encode → fuse → adapt
- ``simulate_protocol`` — full pipeline for a single protocol scenario
- ``compare_protocols`` — multiple protocols, ranked by score
- ``explain_latest`` — re-run explanation against an adapted latent

This is the only file the FastAPI router needs to import; everything
else is implementation detail of the layer.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from . import encoders as enc
from .explanation import explain
from .fusion import fuse
from .heads import predict
from .patient_adapter import adapt
from .types import (
    AdaptedPatient,
    Explanation,
    ModalityEmbedding,
    PatientLatent,
    ProtocolComparison,
    ProtocolSpec,
    SimulationOutput,
)

DEFAULT_HORIZON_WEEKS = 6

GENERIC_DISCLAIMER = (
    "Decision-support only. DeepTwin output is a model-estimated response "
    "hypothesis, not a prescription or diagnosis. All scenarios require "
    "clinician approval before being acted on."
)


def _modality_inputs(samples: dict[str, dict[str, Any]] | None, modality: str) -> dict[str, Any] | None:
    if not samples:
        return None
    return samples.get(modality)


def encode_all(
    patient_id: str,
    *,
    samples: dict[str, dict[str, Any]] | None = None,
    only: list[str] | None = None,
) -> list[ModalityEmbedding]:
    """Run every modality encoder for a patient.

    ``samples`` is an optional dict {modality_name: raw-sample-dict} used by
    encoders to extract features. When absent each encoder synthesizes
    deterministic features seeded by patient_id.

    ``only`` restricts to a subset of modality names.
    """
    runners = {
        "qeeg": enc.encode_qeeg,
        "mri": enc.encode_mri,
        "assessments": enc.encode_assessments,
        "wearables": enc.encode_wearables,
        "treatment_history": enc.encode_treatment_history,
        "demographics": enc.encode_demographics,
        "medications": enc.encode_medications,
        "text": enc.encode_text,
        "voice": enc.encode_voice,
    }
    keep = set(only) if only else set(runners.keys())
    return [
        fn(patient_id, sample=_modality_inputs(samples, name))
        for name, fn in runners.items() if name in keep
    ]


def compute_patient_latent(
    patient_id: str,
    *,
    samples: dict[str, dict[str, Any]] | None = None,
    profile: dict[str, Any] | None = None,
    only: list[str] | None = None,
) -> tuple[list[ModalityEmbedding], PatientLatent, AdaptedPatient]:
    embs = encode_all(patient_id, samples=samples, only=only)
    latent = fuse(patient_id, embs)
    adapted = adapt(latent, profile)
    return embs, latent, adapted


def simulate_protocol(
    patient_id: str,
    protocol: ProtocolSpec,
    *,
    horizon_weeks: int = DEFAULT_HORIZON_WEEKS,
    samples: dict[str, dict[str, Any]] | None = None,
    profile: dict[str, Any] | None = None,
    only: list[str] | None = None,
) -> SimulationOutput:
    embs, latent, adapted = compute_patient_latent(
        patient_id, samples=samples, profile=profile, only=only,
    )
    heads = predict(adapted, protocol, horizon_weeks)
    expl = explain(embeddings=embs, latent=adapted, heads=heads, protocol=protocol)
    return SimulationOutput(
        patient_id=patient_id,
        protocol=protocol,
        horizon_weeks=horizon_weeks,
        heads=heads,
        explanation=expl,
        approval_required=True,
        labels={
            "simulation_only": True,
            "not_a_prescription": True,
            "decision_support_only": True,
            "requires_clinician_review": True,
        },
        disclaimer=GENERIC_DISCLAIMER,
    )


def _score(sim: SimulationOutput) -> float:
    """Single scalar to rank protocols.

    Prefers higher response_probability, lower adverse risk, lower
    drop-out risk delta. Tunable; intentionally cautious.
    """
    risk_penalty = 0.0
    for risk in sim.heads.risk_shifts:
        if risk["direction_better"] == "lower":
            risk_penalty += max(0.0, float(risk.get("delta", 0.0)))
    return round(
        float(sim.heads.response_probability) - 0.4 * risk_penalty, 3,
    )


def compare_protocols(
    patient_id: str,
    protocols: list[ProtocolSpec],
    *,
    horizon_weeks: int = DEFAULT_HORIZON_WEEKS,
    samples: dict[str, dict[str, Any]] | None = None,
    profile: dict[str, Any] | None = None,
    only: list[str] | None = None,
) -> ProtocolComparison:
    sims = [
        simulate_protocol(
            patient_id, p, horizon_weeks=horizon_weeks,
            samples=samples, profile=profile, only=only,
        )
        for p in protocols
    ]
    scores = [(s, _score(s)) for s in sims]
    ranked = sorted(scores, key=lambda x: x[1], reverse=True)
    ranking = [
        {
            "protocol_id": s.protocol.protocol_id,
            "label": s.protocol.label or s.protocol.protocol_id,
            "score": score,
            "rank": idx + 1,
            "rationale": (
                f"Estimated response probability {s.heads.response_probability:.2f}, "
                f"confidence {s.heads.response_confidence}, "
                f"safety level {s.heads.adverse_risk.get('level', 'baseline')}."
            ),
        }
        for idx, (s, score) in enumerate(ranked)
    ]
    winner = ranking[0]["protocol_id"] if ranking else None
    confidence_gap = (
        round(ranking[0]["score"] - ranking[1]["score"], 3)
        if len(ranking) > 1
        else 0.0
    )
    return ProtocolComparison(
        patient_id=patient_id,
        horizon_weeks=horizon_weeks,
        candidates=sims,
        ranking=ranking,
        winner=winner,
        confidence_gap=confidence_gap,
        disclaimer=(
            GENERIC_DISCLAIMER
            + " Ranking is exploratory; clinician judgement remains the source of truth."
        ),
    )


def explain_latest(adapted: AdaptedPatient, sim: SimulationOutput, embs: list[ModalityEmbedding]) -> Explanation:
    return explain(embeddings=embs, latent=adapted, heads=sim.heads, protocol=sim.protocol)


def to_jsonable(obj: Any) -> Any:
    """Recursively convert dataclasses → dicts for FastAPI responses."""
    if hasattr(obj, "__dataclass_fields__"):
        return {k: to_jsonable(v) for k, v in asdict(obj).items()}
    if isinstance(obj, list):
        return [to_jsonable(x) for x in obj]
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    return obj
