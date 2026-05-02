"""Patient-as-own-baseline deltas and simple timelines."""

from __future__ import annotations

from typing import Mapping
from uuid import UUID

from .schemas import Delta, Timeline


def delta_vs_baseline(
    feature: str,
    current: float,
    baseline: float,
    *,
    sd_baseline: float | None = None,
) -> Delta:
    """Cohen's d style effect size; MDC flag when small relative change."""

    raw_delta = current - baseline
    pct_delta = float(raw_delta / max(abs(baseline), 1e-12))
    sd = sd_baseline if sd_baseline is not None else abs(baseline) * 0.1 + 1e-12
    effect_size = float(raw_delta / sd)
    mdc = abs(effect_size) < 0.2

    return Delta(
        feature=feature,
        current=current,
        baseline=baseline,
        raw_delta=raw_delta,
        pct_delta=pct_delta,
        effect_size=effect_size,
        minimum_detectable_change_flag=mdc,
    )


def timeline(
    patient_id: UUID,
    sessions: Mapping[UUID, Mapping[str, float]],
) -> Timeline:
    """Merge session feature dicts into parallel lists."""

    key_features: dict[str, list[float]] = {}
    session_order = list(sessions.keys())
    for sid in session_order:
        feats = sessions[sid]
        for k, v in feats.items():
            key_features.setdefault(k, []).append(float(v))
    return Timeline(patient_id=patient_id, sessions=list(session_order), key_features=key_features)
