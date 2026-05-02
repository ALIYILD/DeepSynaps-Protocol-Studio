"""P1 / v1.5 cautious causal scaffolding — NOT enabled as MVP default."""

from __future__ import annotations

from typing import Any

from deepsynaps_biometrics.enums import CausalModuleWarning
from deepsynaps_biometrics.schemas import CausalAnalysisRequest, CausalAnalysisResult


def build_biometric_dag(edges: list[tuple[str, str]]) -> dict[str, Any]:
    """Return adjacency structure for review — assumptions required."""
    return {"nodes": sorted({e[0] for e in edges} | {e[1] for e in edges}), "edges": list(edges)}


def suggest_backdoor_adjustment_set(
    dag_edges: list[tuple[str, str]],
    exposure: str,
    outcome: str,
) -> list[str]:
    """Placeholder: list parents of exposure as naive adjustment (often wrong)."""
    parents = [src for src, dst in dag_edges if dst == exposure]
    del outcome
    return parents


def estimate_intervention_effect(
    request: CausalAnalysisRequest,
    *,
    observed_data: dict[str, list[float]],
) -> CausalAnalysisResult:
    """Linear residual stub — real impl needs identifiability checks."""
    del observed_data
    from datetime import datetime, timezone

    return CausalAnalysisResult(
        request_id=f"causal-{request.user_id}",
        estimated_effect=None,
        method="not_implemented_observational",
        warnings=[
            CausalModuleWarning.OBSERVATIONAL_ONLY.value,
            CausalModuleWarning.ASSUMPTION_DRIVEN.value,
            CausalModuleWarning.NOT_DIAGNOSTIC.value,
        ],
        compared_correlation=None,
        computed_at_utc=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


def compare_correlation_vs_causal_effect(
    correlation: float,
    causal_estimate: float | None,
) -> dict[str, Any]:
    return {
        "correlation": correlation,
        "causal_effect_observational": causal_estimate,
        "interpretation": (
            "Correlation and causal effect differ under confounding; "
            "do not equate them without explicit DAG assumptions."
        ),
    }
