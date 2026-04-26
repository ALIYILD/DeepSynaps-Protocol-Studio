"""Simulation heads (TRIBE-inspired multi-task prediction layer).

Each head consumes the adapted patient latent + a ``ProtocolSpec`` and
returns a structured forecast:

- ``symptom_trajectories`` — clinical scales (PHQ-9, GAD-7, etc.) over time
- ``biomarker_trajectories`` — qEEG / wearable biomarkers over time
- ``risk_shifts`` — change-of-risk estimates
- ``response_probability`` — single 0..1 score
- ``adverse_risk`` — flagged concerns + monitoring hints
- ``latent_state_change`` — direction + magnitude of latent shift

All forecasts include an uncertainty band that widens with horizon and
shrinks with fusion quality. The output is intentionally cautious — no
strong clinical claim is encoded here.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from .encoders._common import stable_seed
from .types import (
    AdaptedPatient,
    HeadOutputs,
    ProtocolSpec,
    TrajectoryHead,
    TrajectoryPoint,
)

SYMPTOM_METRICS: tuple[tuple[str, str, str], ...] = (
    ("phq9_total", "score (0-27)", "lower"),
    ("gad7_total", "score (0-21)", "lower"),
    ("isi_total", "score (0-28)", "lower"),
    ("who5_total", "score (0-25)", "higher"),
)

BIOMARKER_METRICS: tuple[tuple[str, str, str], ...] = (
    ("alpha_power_norm", "z-score", "higher"),
    ("theta_beta_ratio", "ratio", "lower"),
    ("hrv_rmssd_ms", "ms", "higher"),
    ("sleep_total_min", "min", "higher"),
)


def _modality_factor(protocol: ProtocolSpec) -> float:
    """Per-modality response prior (low/moderate, deliberately cautious)."""
    return {
        "tms": 0.30,
        "tdcs": 0.22,
        "tacs": 0.18,
        "ces": 0.12,
        "pbm": 0.14,
        "behavioural": 0.20,
        "therapy": 0.20,
        "medication": 0.25,
        "lifestyle": 0.15,
    }.get(protocol.modality, 0.18)


def _dose_factor(protocol: ProtocolSpec) -> float:
    spw = max(1, protocol.sessions_per_week or 3)
    weeks = max(1, protocol.weeks or 4)
    dose = float(spw * weeks)
    return float(np.clip(dose / 30.0, 0.2, 1.4))


def _adherence_factor(protocol: ProtocolSpec) -> float:
    return float(np.clip(protocol.adherence_assumption_pct / 100.0, 0.0, 1.0))


def _trajectory(
    *,
    metric: str,
    units: str,
    direction_better: str,
    baseline: float,
    expected_total_change: float,
    horizon_weeks: int,
    quality: float,
    seed_parts: tuple,
) -> TrajectoryHead:
    rng = np.random.default_rng(stable_seed(*seed_parts))
    weeks = list(range(0, horizon_weeks + 1, max(1, horizon_weeks // 6)))
    sign = -1.0 if direction_better == "lower" else 1.0
    points: list[TrajectoryPoint] = []
    for week in weeks:
        progress = float(week / max(1, horizon_weeks))
        smooth = 1.0 - np.exp(-3.0 * progress)
        delta = sign * expected_total_change * smooth
        noise = float(rng.normal(scale=0.05 * abs(expected_total_change)))
        point = baseline + delta + noise
        ci_width = abs(expected_total_change) * (0.4 + 0.6 * progress) * (1.5 - quality)
        points.append(
            TrajectoryPoint(
                week=int(week),
                point=round(float(point), 3),
                ci_low=round(float(point - ci_width / 2.0), 3),
                ci_high=round(float(point + ci_width / 2.0), 3),
            )
        )
    return TrajectoryHead(
        metric=metric, units=units, baseline=round(float(baseline), 3),
        points=points, direction_better=direction_better,  # type: ignore[arg-type]
    )


def _baseline_for(metric: str, latent: AdaptedPatient) -> float:
    seed = stable_seed("baseline", metric, latent.base.patient_id)
    rng = np.random.default_rng(seed)
    if metric == "phq9_total":
        return float(np.clip(rng.normal(loc=12, scale=4), 0, 27))
    if metric == "gad7_total":
        return float(np.clip(rng.normal(loc=10, scale=3), 0, 21))
    if metric == "isi_total":
        return float(np.clip(rng.normal(loc=14, scale=4), 0, 28))
    if metric == "who5_total":
        return float(np.clip(rng.normal(loc=11, scale=4), 0, 25))
    if metric == "alpha_power_norm":
        return float(rng.normal(loc=-0.3, scale=0.6))
    if metric == "theta_beta_ratio":
        return float(np.clip(rng.normal(loc=2.6, scale=0.6), 1.0, 5.0))
    if metric == "hrv_rmssd_ms":
        return float(np.clip(rng.normal(loc=42, scale=10), 15, 90))
    if metric == "sleep_total_min":
        return float(np.clip(rng.normal(loc=420, scale=40), 240, 600))
    return 0.0


def _expected_change(metric: str, factor: float, quality: float) -> float:
    base_changes = {
        "phq9_total": 5.0, "gad7_total": 4.0, "isi_total": 3.5, "who5_total": 4.0,
        "alpha_power_norm": 0.4, "theta_beta_ratio": 0.4,
        "hrv_rmssd_ms": 6.0, "sleep_total_min": 25.0,
    }
    return base_changes.get(metric, 1.0) * factor * (0.5 + 0.5 * quality)


def predict(latent: AdaptedPatient, protocol: ProtocolSpec, horizon_weeks: int) -> HeadOutputs:
    # Effective confidence combines per-modality quality with coverage
    # so a small handful of high-quality modalities can never claim
    # the same confidence as a fully-covered patient.
    quality = latent.base.fusion_quality * latent.base.coverage_ratio
    factor = _modality_factor(protocol) * _dose_factor(protocol) * _adherence_factor(protocol)

    symptom_trajectories: list[TrajectoryHead] = []
    for metric, units, dir_better in SYMPTOM_METRICS:
        baseline = _baseline_for(metric, latent)
        change = _expected_change(metric, factor, quality)
        symptom_trajectories.append(_trajectory(
            metric=metric, units=units, direction_better=dir_better,
            baseline=baseline, expected_total_change=change,
            horizon_weeks=horizon_weeks, quality=quality,
            seed_parts=("sym_traj", metric, latent.base.patient_id, protocol.protocol_id),
        ))

    biomarker_trajectories: list[TrajectoryHead] = []
    for metric, units, dir_better in BIOMARKER_METRICS:
        baseline = _baseline_for(metric, latent)
        change = _expected_change(metric, factor, quality)
        biomarker_trajectories.append(_trajectory(
            metric=metric, units=units, direction_better=dir_better,
            baseline=baseline, expected_total_change=change,
            horizon_weeks=horizon_weeks, quality=quality,
            seed_parts=("bio_traj", metric, latent.base.patient_id, protocol.protocol_id),
        ))

    risk_shifts: list[dict[str, Any]] = [
        {"name": "Drop-out risk",       "delta": round(-0.08 * factor + (1.0 - _adherence_factor(protocol)) * 0.2, 3),
         "direction_better": "lower",   "evidence_grade": _evidence_grade(quality)},
        {"name": "Adverse-event risk",  "delta": round(0.04 + 0.05 * (len(protocol.contraindications) > 0), 3),
         "direction_better": "lower",   "evidence_grade": _evidence_grade(quality)},
        {"name": "Symptom-rebound risk","delta": round(-0.06 * factor, 3),
         "direction_better": "lower",   "evidence_grade": _evidence_grade(quality)},
    ]

    response_probability = float(np.clip(0.30 + 0.55 * factor + 0.15 * quality - 0.05 * len(protocol.contraindications), 0.05, 0.92))
    response_confidence = "high" if quality >= 0.65 else "moderate" if quality >= 0.4 else "low"

    adverse_risk = {
        "level": "elevated" if protocol.contraindications else "baseline",
        "concerns": list(protocol.contraindications) or [
            "No specific contraindications recorded; standard safety monitoring still applies.",
        ],
        "monitoring_plan": [
            "Reassess symptom scales mid-course.",
            "Track adherence weekly; pause protocol if drop-out risk rises.",
            "Document any adverse events using the standard CTCAE-aligned form.",
        ],
    }

    latent_state_change = {
        "direction": "improving" if response_probability >= 0.5 else "uncertain",
        "magnitude": round(factor * 0.6, 3),
        "explanation": "Latent state shift estimated from protocol modality, dose, and adherence assumption.",
    }

    return HeadOutputs(
        symptom_trajectories=symptom_trajectories,
        biomarker_trajectories=biomarker_trajectories,
        risk_shifts=risk_shifts,
        response_probability=round(response_probability, 3),
        response_confidence=response_confidence,  # type: ignore[arg-type]
        adverse_risk=adverse_risk,
        latent_state_change=latent_state_change,
    )


def _evidence_grade(quality: float) -> str:
    if quality >= 0.65:
        return "moderate"
    if quality >= 0.4:
        return "low"
    return "low"
