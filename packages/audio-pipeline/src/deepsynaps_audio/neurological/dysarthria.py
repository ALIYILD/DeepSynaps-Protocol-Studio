"""Dysarthria severity heuristic from perturbation + rate features."""

from __future__ import annotations

from typing import Mapping

from ..schemas import DysarthriaScore

MODEL_VERSION = "heuristic_severity/v1"


def dysarthria_severity(features: Mapping[str, float]) -> DysarthriaScore:
    """Continuous severity 0–4 from jitter, shimmer, DDK regularity proxy."""

    jitter = float(features.get("jitter_local", 0.0))
    shimmer = float(features.get("shimmer_local", 0.0))
    reg = float(features.get("ddk_regularity_index", 1.0))

    raw = 8.0 * jitter + 6.0 * shimmer + 2.0 * max(0.0, 1.0 - reg)
    severity = float(max(0.0, min(4.0, raw)))

    drivers: list[str] = []
    if jitter > 0.025:
        drivers.append("jitter")
    if shimmer > 0.08:
        drivers.append("shimmer")
    if reg < 0.5:
        drivers.append("irregular_ddk")

    return DysarthriaScore(
        severity=severity,
        subtype_hint="hypokinetic" if severity > 1.5 else None,
        drivers=drivers,
        confidence=0.5,
        model_version=MODEL_VERSION,
    )
