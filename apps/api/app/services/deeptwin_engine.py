"""DeepTwin reasoning engine.

Pure deterministic functions that build the data shapes consumed by
the DeepTwin clinician page. Every output is seeded by patient_id so the
same patient always sees the same demo data — this lets clinicians and
QA exercise the workflow without a real ingestion pipeline.

Safety boundary
---------------
Nothing here makes diagnostic or treatment claims. All predictions and
simulations are returned with evidence grades, uncertainty bands and an
explicit ``approval_required`` flag. The router echoes those into the
response so the UI can render the safety stamps without re-deriving them.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import numpy as np

from app.services.deeptwin_decision_support import (
    ANALYZE_SCHEMA_VERSION,
    SCHEMA_VERSION,
    build_calibration_status,
    build_provenance,
    build_scenario_comparison,
    build_uncertainty_block,
    confidence_tier,
    derive_top_drivers,
    evidence_status_for,
    soften_language,
    soften_recommendation_block,
)

EvidenceGrade = Literal["low", "moderate", "high"]
RiskStatus = Literal["stable", "watch", "elevated", "unknown"]

DOMAINS: tuple[str, ...] = (
    "qeeg",
    "mri",
    "assessments",
    "biomarkers",
    "sleep_hrv_activity",
    "sessions",
    "tasks_adherence",
    "notes_text",
)

SOURCE_LABELS: dict[str, str] = {
    "qeeg_features": "qEEG features",
    "qeeg_raw": "qEEG raw",
    "mri_structural": "MRI structural",
    "fmri": "fMRI",
    "wearables": "Wearables",
    "in_clinic_therapy": "In-clinic sessions",
    "home_therapy": "Home therapy",
    "assessments": "Assessments",
    "ehr_text": "EHR text",
    "video": "Video",
    "audio": "Audio",
}


def _seed(patient_id: str, salt: str = "") -> int:
    return abs(hash((str(patient_id), salt))) % (2**31 - 1)


def _rng(patient_id: str, salt: str = "") -> np.random.Generator:
    return np.random.default_rng(_seed(patient_id, salt))


def _round(x: float, n: int = 3) -> float:
    return float(round(float(x), n))


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# ---------------------------------------------------------------------------
# Evidence grading
# ---------------------------------------------------------------------------

def score_evidence_grade(
    *,
    n_observations: int,
    n_studies_supporting: int,
    has_baseline: bool,
) -> EvidenceGrade:
    """Map a tiny evidence vector to a 3-tier grade.

    Conservative on purpose: high grade requires both a real baseline and
    multi-study support. We round down rather than up.
    """
    if not has_baseline or n_observations < 6:
        return "low"
    if n_observations >= 30 and n_studies_supporting >= 3:
        return "high"
    return "moderate"


# ---------------------------------------------------------------------------
# Data completeness
# ---------------------------------------------------------------------------

def compute_data_completeness(patient_id: str) -> dict[str, Any]:
    rng = _rng(patient_id, "completeness")
    sources = ["qeeg_features", "assessments", "wearables", "in_clinic_therapy",
               "home_therapy", "mri_structural", "ehr_text", "video"]
    connected: list[dict[str, Any]] = []
    missing: list[str] = []
    for s in sources:
        # deterministic: connected unless the rng draw is below 0.18
        is_connected = bool(rng.random() > 0.18)
        if is_connected:
            days_ago = int(rng.integers(0, 14))
            connected.append({
                "key": s,
                "label": SOURCE_LABELS.get(s, s),
                "last_sync_days_ago": days_ago,
            })
        else:
            missing.append(s)
    pct = round(100.0 * len(connected) / len(sources), 1)
    return {
        "completeness_pct": pct,
        "sources_connected": connected,
        "sources_missing": [{"key": s, "label": SOURCE_LABELS.get(s, s)} for s in missing],
        "warnings": [
            f"Missing baseline for {SOURCE_LABELS.get(s, s)} weakens predictions in this domain."
            for s in missing
            if s in ("qeeg_features", "assessments")
        ],
    }


# ---------------------------------------------------------------------------
# Twin summary
# ---------------------------------------------------------------------------

def build_twin_summary(patient_id: str) -> dict[str, Any]:
    rng = _rng(patient_id, "summary")
    completeness = compute_data_completeness(patient_id)
    risk_choice: list[RiskStatus] = ["stable", "watch", "elevated"]
    risk = risk_choice[int(rng.integers(0, 3))]
    return {
        "patient_id": patient_id,
        "completeness_pct": completeness["completeness_pct"],
        "risk_status": risk,
        "last_updated": _now_iso(),
        "sources_connected": completeness["sources_connected"],
        "sources_missing": completeness["sources_missing"],
        "review_status": "awaiting_clinician_review",
        "warnings": completeness["warnings"],
        "disclaimer": (
            "Decision-support only. Twin estimates are model-derived hypotheses, "
            "not prescriptions. All outputs require clinician review."
        ),
    }


# ---------------------------------------------------------------------------
# Signal matrix
# ---------------------------------------------------------------------------

_SIGNAL_SPECS: tuple[tuple[str, str, str, float, float], ...] = (
    # (domain, name, unit, baseline, scale)
    ("qeeg", "alpha_peak_hz", "Hz", 9.6, 0.4),
    ("qeeg", "theta_beta_ratio", "ratio", 2.4, 0.3),
    ("qeeg", "frontal_asymmetry_z", "z", -0.4, 0.5),
    ("qeeg", "global_zscore", "z", 0.6, 0.4),
    ("assessments", "phq9_total", "score", 14.0, 3.0),
    ("assessments", "gad7_total", "score", 11.0, 2.5),
    ("assessments", "asrs_total", "score", 38.0, 5.0),
    ("biomarkers", "hrv_rmssd_ms", "ms", 38.0, 6.0),
    ("biomarkers", "resting_hr_bpm", "bpm", 72.0, 4.0),
    ("sleep_hrv_activity", "sleep_total_min", "min", 396.0, 35.0),
    ("sleep_hrv_activity", "deep_sleep_min", "min", 64.0, 10.0),
    ("sleep_hrv_activity", "steps_per_day", "steps", 6800.0, 1500.0),
    ("sessions", "weekly_in_clinic", "count", 3.0, 1.0),
    ("sessions", "weekly_home", "count", 2.5, 1.0),
    ("tasks_adherence", "adherence_pct", "pct", 78.0, 8.0),
    ("tasks_adherence", "task_completion_pct", "pct", 71.0, 10.0),
    ("notes_text", "sentiment_score", "[-1,1]", -0.15, 0.2),
    ("notes_text", "concern_flags_30d", "count", 1.0, 1.0),
)


def build_signal_matrix(patient_id: str) -> dict[str, Any]:
    rng = _rng(patient_id, "signals")
    signals: list[dict[str, Any]] = []
    for domain, name, unit, baseline, scale in _SIGNAL_SPECS:
        spark = []
        cur = float(baseline + rng.normal(0, scale * 0.4))
        for _ in range(12):
            cur += float(rng.normal(0, scale * 0.15))
            spark.append(_round(cur, 3))
        current = spark[-1]
        delta = _round(current - baseline, 3)
        n_obs = int(rng.integers(8, 60))
        n_studies = int(rng.integers(0, 5))
        grade = score_evidence_grade(
            n_observations=n_obs, n_studies_supporting=n_studies, has_baseline=True,
        )
        signals.append({
            "domain": domain,
            "name": name,
            "unit": unit,
            "baseline": _round(baseline, 3),
            "current": _round(current, 3),
            "delta": delta,
            "sparkline": spark,
            "n_observations": n_obs,
            "evidence_grade": grade,
        })
    return {"patient_id": patient_id, "signals": signals}


# ---------------------------------------------------------------------------
# Timeline
# ---------------------------------------------------------------------------

_TIMELINE_KINDS = (
    ("session", "tDCS Fp2 anodal, 20min"),
    ("session", "PBM 810nm, 12min"),
    ("assessment", "PHQ-9 follow-up"),
    ("assessment", "ASRS follow-up"),
    ("qeeg", "qEEG re-recording"),
    ("symptom", "Patient reported brain-fog"),
    ("biometric", "HRV dipped below baseline"),
    ("symptom", "Patient reported improved focus"),
    ("session", "Therapy notes added"),
    ("biometric", "Sleep below 6h two nights"),
)


def align_timeline_events(patient_id: str, days: int = 90) -> dict[str, Any]:
    rng = _rng(patient_id, "timeline")
    events: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    n = int(rng.integers(18, 28))
    for i in range(n):
        kind, label = _TIMELINE_KINDS[int(rng.integers(0, len(_TIMELINE_KINDS)))]
        offset = int(rng.integers(0, days))
        ts = now - timedelta(days=offset, hours=int(rng.integers(0, 24)))
        severity = ["info", "info", "info", "watch", "warn"][int(rng.integers(0, 5))]
        events.append({
            "ts": ts.replace(microsecond=0).isoformat(),
            "kind": kind,
            "label": label,
            "severity": severity,
            "ref": f"evt_{patient_id[:6]}_{i:03d}",
        })
    events.sort(key=lambda e: e["ts"])
    return {"patient_id": patient_id, "events": events, "window_days": days}


# ---------------------------------------------------------------------------
# Correlations + causal hypotheses
# ---------------------------------------------------------------------------

def detect_correlations(patient_id: str) -> dict[str, Any]:
    labels = [
        "sleep_total_min", "hrv_rmssd_ms", "phq9_total", "gad7_total",
        "asrs_total", "tbr_fz", "alpha_peak_hz", "adherence_pct",
        "weekly_sessions", "concern_flags_30d",
    ]
    rng = _rng(patient_id, "corr")
    x = rng.normal(size=(28, len(labels)))
    # inject a few realistic-looking relationships
    x[:, 2] = 0.55 * x[:, 0] * -1 + rng.normal(scale=0.7, size=28)  # sleep ↑ → phq9 ↓
    x[:, 7] = 0.45 * (-x[:, 4]) + rng.normal(scale=0.7, size=28)    # adherence ↑ ↔ asrs ↓
    matrix = np.corrcoef(x, rowvar=False)
    matrix = np.nan_to_num(matrix, nan=0.0, posinf=0.0, neginf=0.0)
    matrix = np.clip(matrix, -1.0, 1.0)

    cards: list[dict[str, Any]] = []
    seen: set[tuple[int, int]] = set()
    flat: list[tuple[float, int, int]] = []
    for i in range(len(labels)):
        for j in range(i + 1, len(labels)):
            flat.append((float(abs(matrix[i, j])), i, j))
    flat.sort(reverse=True)
    for strength, i, j in flat[:8]:
        seen.add((i, j))
        n = int(rng.integers(12, 40))
        cards.append({
            "a": labels[i],
            "b": labels[j],
            "strength": _round(matrix[i, j], 3),
            "abs_strength": _round(strength, 3),
            "confidence": _round(min(0.95, 0.4 + strength * 0.6), 3),
            "n_observations": n,
            "evidence_grade": score_evidence_grade(
                n_observations=n,
                n_studies_supporting=int(rng.integers(0, 4)),
                has_baseline=True,
            ),
            "note": "Correlation does not imply causation. Clinician interpretation required.",
        })
    return {
        "patient_id": patient_id,
        "method": "pearson",
        "labels": labels,
        "matrix": matrix.round(4).tolist(),
        "cards": cards,
        "warnings": [
            "These correlations are derived from this patient's own data and a small window; "
            "they are hypotheses for clinician review, not causal claims."
        ],
    }


def generate_causal_hypotheses(patient_id: str) -> dict[str, Any]:
    rng = _rng(patient_id, "causal")
    hypotheses = [
        {
            "driver": "Reduced sleep duration",
            "outcome": "Worsened attention scores",
            "evidence_for": [
                "Within-patient correlation r ≈ -0.55 over 28 days",
                "Multiple cohort studies report sleep–attention coupling",
            ],
            "evidence_against": [
                "Confounded by stress events on those nights",
                "Caffeine intake not tracked",
            ],
            "missing_data": ["Sleep architecture (REM/Deep) limited to 6 nights"],
            "confidence": _round(0.45 + rng.random() * 0.15, 3),
            "evidence_grade": "moderate",
            "interpretation_required": True,
        },
        {
            "driver": "tDCS Fp2 sessions",
            "outcome": "ASRS reduction",
            "evidence_for": [
                "Within-patient ASRS −6 over 6-week protocol window",
                "Small RCT support in adult ADHD",
            ],
            "evidence_against": [
                "No washout phase tested",
                "Concurrent therapy adjustments could explain change",
            ],
            "missing_data": ["No sham comparator"],
            "confidence": _round(0.40 + rng.random() * 0.2, 3),
            "evidence_grade": "low",
            "interpretation_required": True,
        },
        {
            "driver": "Home-program adherence drop",
            "outcome": "Re-emergence of anxiety",
            "evidence_for": [
                "GAD-7 rose 4 points after adherence dipped below 60%",
            ],
            "evidence_against": [
                "Life-stressor reported same week (confound)",
            ],
            "missing_data": ["Adherence tracking gap of 9 days"],
            "confidence": _round(0.35 + rng.random() * 0.15, 3),
            "evidence_grade": "low",
            "interpretation_required": True,
        },
    ]
    return {"patient_id": patient_id, "hypotheses": hypotheses}


# ---------------------------------------------------------------------------
# Trajectory / prediction
# ---------------------------------------------------------------------------

_HORIZON_DAYS = {"2w": 14, "6w": 42, "12w": 84}


def estimate_trajectory(
    patient_id: str,
    horizon: str = "6w",
) -> dict[str, Any]:
    days = _HORIZON_DAYS.get(horizon, 42)
    rng = _rng(patient_id, f"traj_{horizon}")
    metrics = [
        ("attention_score", 100, -0.18),
        ("mood_score", 100, -0.12),
        ("sleep_total_min", 396, 0.6),
        ("qeeg_global_z", 0.6, -0.005),
        ("adherence_pct", 78, 0.05),
        ("risk_index", 0.42, -0.002),
    ]
    traces: list[dict[str, Any]] = []
    for name, baseline, drift in metrics:
        xs = list(range(0, days + 1, max(1, days // 14)))
        point: list[float] = []
        ci_low: list[float] = []
        ci_high: list[float] = []
        v = float(baseline)
        for d in xs:
            v = v + drift * (d if d == 0 else (xs[xs.index(d)] - xs[xs.index(d) - 1])) \
                  + float(rng.normal(0, abs(baseline) * 0.005 + 0.05))
            band = abs(baseline) * 0.04 + 0.5 + d * abs(baseline) * 0.0008
            point.append(_round(v, 3))
            ci_low.append(_round(v - band, 3))
            ci_high.append(_round(v + band, 3))
        traces.append({
            "metric": name,
            "days": xs,
            "point": point,
            "ci_low": ci_low,
            "ci_high": ci_high,
        })
    # Per-prediction transparency: confidence tier + top drivers + evidence
    # status. Drivers are derived from the request inputs so different
    # patients / horizons see different driver lists.
    inputs = {"patient_id": patient_id, "horizon": horizon, "horizon_days": days}
    tier = confidence_tier(
        model_confidence=0.65,
        input_quality=0.60,
        evidence_strength=0.55 if horizon != "12w" else 0.40,
    )
    drivers = derive_top_drivers(inputs={"weeks": days // 7})
    return {
        "patient_id": patient_id,
        "horizon": horizon,
        "horizon_days": days,
        "traces": traces,
        "assumptions": [
            "Baseline phenotype remains stable.",
            "Adherence trend continues at recent 14-day average.",
            "No new contraindications introduced.",
            "Wearable sampling continuous.",
        ],
        "evidence_grade": "moderate",
        "evidence_status": "pending",
        "confidence_tier": tier,
        "top_drivers": drivers,
        "rationale": soften_language(
            "Best current use is treatment-readiness ranking and "
            "multimodal monitoring, not autonomous treatment selection."
        ),
        "uncertainty_widens_with_horizon": True,
        "uncertainty": build_uncertainty_block(horizon_days=days),
        "calibration": build_calibration_status(),
        "provenance": build_provenance(
            surface=f"trajectory.{horizon}",
            inputs=inputs,
            schema_version=SCHEMA_VERSION,
            extra={
                "seed_salt": f"traj_{horizon}",
                "inputs_used": [name for name, _baseline, _drift in metrics],
            },
        ),
        "explainability": {
            "method": "transparent_metric_drift_with_uncertainty_band",
            "top_drivers": drivers,
            "top_assumptions": [
                "Recent adherence trend persists.",
                "No new contraindications or major medication changes occur.",
                "Sampling quality remains comparable to the current record.",
            ],
        },
        "decision_support_only": True,
        "disclaimer": (
            "Decision-support only. Predictions are model-estimated and "
            "uncalibrated; the confidence band is illustrative — clinician must review."
        ),
    }


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------

_VALID_MODALITIES = ("tms", "tdcs", "tacs", "ces", "pbm", "behavioural", "therapy",
                     "medication", "lifestyle")


def simulate_intervention_scenario(
    patient_id: str,
    *,
    scenario_id: str | None = None,
    modality: str = "tdcs",
    target: str = "Fp2",
    frequency_hz: float | None = 10.0,
    current_ma: float | None = 2.0,
    power_w: float | None = None,
    duration_min: int = 20,
    sessions_per_week: int = 5,
    weeks: int = 5,
    contraindications: list[str] | None = None,
    adherence_assumption_pct: float = 80.0,
    notes: str | None = None,
) -> dict[str, Any]:
    rng = _rng(patient_id, f"sim_{scenario_id or modality}_{target}_{weeks}")
    days = weeks * 7
    xs = list(range(0, days + 1, 7))

    # base improvement assumption per protocol class
    drift = {
        "tdcs": -0.18, "tms": -0.22, "tacs": -0.15, "ces": -0.10, "pbm": -0.08,
        "behavioural": -0.06, "therapy": -0.05, "medication": -0.20, "lifestyle": -0.04,
    }.get(modality, -0.10)
    drift *= max(0.4, min(1.2, adherence_assumption_pct / 80.0))

    point: list[float] = []
    ci_low: list[float] = []
    ci_high: list[float] = []
    v = 0.0
    for d in xs:
        v += drift + float(rng.normal(0, 0.05))
        band = 0.6 + d * 0.012
        point.append(_round(v, 3))
        ci_low.append(_round(v - band, 3))
        ci_high.append(_round(v + band, 3))

    safety_concerns: list[str] = []
    if (contraindications or []):
        safety_concerns.append(
            "Patient has flagged contraindications: " + ", ".join(contraindications or [])
        )
    if modality == "tms" and frequency_hz and frequency_hz > 20:
        safety_concerns.append("High-frequency rTMS — verify seizure-risk screening.")
    if duration_min > 30 and modality in ("tdcs", "tacs"):
        safety_concerns.append("Session duration above typical range — monitor skin tolerance.")
    if adherence_assumption_pct < 60:
        safety_concerns.append("Low adherence assumption — predicted effect highly uncertain.")
    if not safety_concerns:
        safety_concerns.append("No automatic safety concerns flagged. Clinician review still required.")

    expected_domains = {
        "tdcs": ["attention", "mood", "qEEG alpha"],
        "tms": ["mood", "qEEG theta", "executive function"],
        "tacs": ["working memory", "qEEG alpha"],
        "ces": ["sleep", "anxiety"],
        "pbm": ["fatigue", "mood"],
        "behavioural": ["adherence", "mood"],
        "therapy": ["mood", "behavioural activation"],
        "medication": ["mood", "attention"],
        "lifestyle": ["sleep", "HRV", "mood"],
    }.get(modality, ["unspecified"])

    # responder / non-responder hint based on baseline drift bag
    responder_prob = float(min(0.85, max(0.15, 0.55 - rng.normal(0, 0.1))))
    uncertainty_width = _round(max(ci_high) - min(ci_low), 3) if ci_low and ci_high else None

    # Per-recommendation transparency.
    sim_inputs = {
        "modality": modality,
        "target": target,
        "frequency_hz": frequency_hz,
        "current_ma": current_ma,
        "power_w": power_w,
        "duration_min": duration_min,
        "sessions_per_week": sessions_per_week,
        "weeks": weeks,
        "contraindications": contraindications or [],
        "adherence_assumption_pct": adherence_assumption_pct,
        "notes": notes,
        "modalities": [],  # populated by router when fusion modalities are present
    }
    input_quality_score = max(
        0.2,
        min(1.0, 0.4 + 0.06 * (sessions_per_week or 0) + 0.04 * (weeks or 0))
        - 0.1 * len(contraindications or []),
    )
    evidence_strength_score = {"tdcs": 0.55, "tms": 0.7, "tacs": 0.4, "ces": 0.4,
                               "pbm": 0.35, "behavioural": 0.45, "therapy": 0.5,
                               "medication": 0.6, "lifestyle": 0.4}.get(modality, 0.4)
    tier = confidence_tier(
        model_confidence=responder_prob,
        input_quality=input_quality_score,
        evidence_strength=evidence_strength_score,
    )
    base_drivers = [
        {"factor": "protocol_class", "magnitude": round(evidence_strength_score, 3),
         "direction": "positive", "detail": f"Selected modality: {modality}"},
        {"factor": "target_site", "magnitude": 0.5, "direction": "neutral",
         "detail": f"Target: {target}"},
    ]
    drivers = derive_top_drivers(inputs=sim_inputs, base_drivers=base_drivers, limit=5)

    return {
        "patient_id": patient_id,
        "scenario_id": scenario_id or f"scn_{modality}_{target}_{weeks}w",
        "input": {
            "modality": modality,
            "target": target,
            "frequency_hz": frequency_hz,
            "current_ma": current_ma,
            "power_w": power_w,
            "duration_min": duration_min,
            "sessions_per_week": sessions_per_week,
            "weeks": weeks,
            "contraindications": contraindications or [],
            "adherence_assumption_pct": adherence_assumption_pct,
            "notes": notes,
        },
        "predicted_curve": {
            "x_days": xs,
            "delta_outcome_score": point,
            "ci_low": ci_low,
            "ci_high": ci_high,
        },
        "expected_domains": expected_domains,
        "responder_probability": _round(responder_prob, 3),
        "responder_probability_ci95": [
            _round(max(0.0, responder_prob - 0.18), 3),
            _round(min(1.0, responder_prob + 0.18), 3),
        ],
        "non_responder_flag": responder_prob < 0.35,
        "safety_concerns": safety_concerns,
        "missing_data": ["No sham comparator", "Limited within-patient history (<60 days)"],
        "monitoring_plan": [
            "Re-record qEEG at week 3 and week 5.",
            "Repeat target assessment at week 5.",
            "Track adherence weekly; escalate if <60%.",
            "Capture adverse events at every visit.",
        ],
        "evidence_support": [
            {
                "claim": "Within-patient baseline + cohort literature alignment.",
                "evidence_status": "pending",
                "caveat": (
                    "DeepTwin returns a per-claim status. 'pending' means a "
                    "candidate citation set exists in the evidence index but "
                    "has not been bound to this specific recommendation yet."
                ),
            },
            {
                "claim": "Per-protocol RCT evidence to be reviewed in the Evidence panel.",
                "evidence_status": "pending",
                "caveat": "Discuss with clinician; do not act on this row alone.",
            },
        ],
        "rationale": soften_language(
            f"Consider {modality} at {target} for {weeks} weeks if adherence "
            f"holds; the simulator suggests a directional shift in the lead "
            f"biomarker, with uncertainty widening at longer horizons."
        ),
        "patient_specific_notes": [
            f"Adherence assumption used: {adherence_assumption_pct}%.",
            f"Sessions per week: {sessions_per_week}.",
            f"Target site: {target}.",
            (
                "Contraindications flagged: " + ", ".join(contraindications)
                if contraindications else
                "No contraindications supplied — clinician must still verify."
            ),
        ],
        "scenario_comparison": {
            "baseline_reference": "no_protocol_change_counterfactual_not_observed",
            "expected_direction": "improvement" if point and point[-1] < 0 else "uncertain",
            "uncertainty_width": uncertainty_width,
            "adherence_assumption_pct": adherence_assumption_pct,
            "delta_pred": _round(point[-1] if point else 0.0, 3),
            "delta_confidence": None,  # filled by caller when comparing scenarios
            "recommendation_change": None,
        },
        "uncertainty": build_uncertainty_block(
            horizon_days=weeks * 7,
            width=uncertainty_width,
        ),
        "calibration": build_calibration_status(),
        "confidence_tier": tier,
        "top_drivers": drivers,
        "feature_attribution": drivers,  # legacy alias for back-compat
        "provenance": build_provenance(
            surface="simulate",
            inputs=sim_inputs,
            schema_version=SCHEMA_VERSION,
            extra={
                "scenario_id": scenario_id or f"scn_{modality}_{target}_{weeks}w",
                "seed_salt": f"sim_{scenario_id or modality}_{target}_{weeks}",
                # Back-compat: old tests assert provenance["inputs"]["modality"];
                # we keep the readable inputs subset alongside the new
                # ``inputs_hash`` rather than removing it.
                "inputs": {
                    "modality": modality,
                    "target": target,
                    "frequency_hz": frequency_hz,
                    "duration_min": duration_min,
                    "sessions_per_week": sessions_per_week,
                    "weeks": weeks,
                    "adherence_assumption_pct": adherence_assumption_pct,
                },
            },
        ),
        "schema_version": SCHEMA_VERSION,
        "evidence_grade": "moderate",
        "evidence_status": "pending",
        "approval_required": True,
        "decision_support_only": True,
        "labels": {
            "simulation_only": True,
            "not_a_prescription": True,
            "model_estimated": True,
            "decision_support_only": True,
        },
        "disclaimer": (
            "Decision-support only. Simulation output is model-estimated, "
            "uncalibrated, and not a clinical prescription. Clinician must "
            "review and approve before any treatment decision."
        ),
    }


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def _common_report_envelope(patient_id: str, kind: str) -> dict[str, Any]:
    return {
        "patient_id": patient_id,
        "kind": kind,
        "generated_at": _now_iso(),
        "data_sources_used": [s["key"] for s in build_twin_summary(patient_id)["sources_connected"]],
        "date_range_days": 90,
        "audit_refs": [f"twin_audit:{kind}:{_seed(patient_id, kind):x}"],
        "limitations": [
            "Outputs are model-estimated and not diagnostic.",
            "Limited within-patient history may inflate uncertainty.",
        ],
        "review_points": [
            "Verify baseline qEEG and assessments are current.",
            "Confirm contraindications and medications.",
            "Review evidence grade per finding before clinical action.",
        ],
    }


def generate_clinician_report(patient_id: str) -> dict[str, Any]:
    env = _common_report_envelope(patient_id, "clinician_deep")
    summary = build_twin_summary(patient_id)
    signals = build_signal_matrix(patient_id)
    return {
        **env,
        "title": "DeepTwin Clinical Intelligence Report",
        "summary": summary,
        "key_signals": signals["signals"][:6],
        "evidence_grade": "moderate",
    }


def generate_patient_friendly_report(patient_id: str) -> dict[str, Any]:
    env = _common_report_envelope(patient_id, "patient_progress")
    return {
        **env,
        "title": "Your Progress",
        "what_changed_this_week": [
            "Sleep was a little shorter than usual on two nights.",
            "Session attendance stayed strong.",
            "Reported energy improved compared with last week.",
        ],
        "what_to_discuss_with_clinician": [
            "Any side effects after sessions.",
            "How sleep felt over the past two weeks.",
            "Whether home tasks were doable.",
        ],
        "evidence_grade": "moderate",
        "tone": "reassuring, no causal claims",
    }


def generate_governance_report(patient_id: str) -> dict[str, Any]:
    env = _common_report_envelope(patient_id, "governance")
    return {
        **env,
        "title": "DeepTwin Governance & Safety Report",
        "human_review_gates": [
            "Simulation runs require clinician approval before clinical use.",
            "Agent handoffs are logged with patient_id, kind, timestamp.",
            "Research-loop module is disabled in production output.",
        ],
        "audit_events_count_demo": 3,
        "evidence_grade": "high",
    }


def generate_simulation_report(patient_id: str, simulation: dict[str, Any]) -> dict[str, Any]:
    env = _common_report_envelope(patient_id, "simulation")
    return {
        **env,
        "title": "DeepTwin Simulation Report",
        "scenario_id": simulation.get("scenario_id"),
        "input": simulation.get("input"),
        "predicted_curve": simulation.get("predicted_curve"),
        "expected_domains": simulation.get("expected_domains"),
        "safety_concerns": simulation.get("safety_concerns"),
        "monitoring_plan": simulation.get("monitoring_plan"),
        "evidence_grade": simulation.get("evidence_grade", "moderate"),
        "approval_required": True,
    }


def generate_correlation_report(patient_id: str) -> dict[str, Any]:
    env = _common_report_envelope(patient_id, "correlation")
    corr = detect_correlations(patient_id)
    return {
        **env,
        "title": "DeepTwin Correlation Report",
        "cards": corr["cards"],
        "warnings": corr["warnings"],
        "evidence_grade": "moderate",
    }


def generate_causal_report(patient_id: str) -> dict[str, Any]:
    env = _common_report_envelope(patient_id, "causal")
    caus = generate_causal_hypotheses(patient_id)
    return {
        **env,
        "title": "DeepTwin Causal Hypothesis Report",
        "hypotheses": caus["hypotheses"],
        "evidence_grade": "low",
    }


def generate_prediction_report(patient_id: str, horizon: str = "6w") -> dict[str, Any]:
    env = _common_report_envelope(patient_id, "prediction")
    pred = estimate_trajectory(patient_id, horizon)
    return {
        **env,
        "title": "DeepTwin Prediction Report",
        "horizon": pred["horizon"],
        "traces": pred["traces"],
        "assumptions": pred["assumptions"],
        "evidence_grade": pred["evidence_grade"],
    }


def generate_data_completeness_report(patient_id: str) -> dict[str, Any]:
    env = _common_report_envelope(patient_id, "data_completeness")
    comp = compute_data_completeness(patient_id)
    return {
        **env,
        "title": "DeepTwin Data Completeness Report",
        "completeness_pct": comp["completeness_pct"],
        "sources_connected": comp["sources_connected"],
        "sources_missing": comp["sources_missing"],
        "warnings": comp["warnings"],
        "evidence_grade": "high",
    }


REPORT_BUILDERS = {
    "clinician_deep": lambda pid, **_: generate_clinician_report(pid),
    "patient_progress": lambda pid, **_: generate_patient_friendly_report(pid),
    "prediction": lambda pid, horizon="6w", **_: generate_prediction_report(pid, horizon),
    "correlation": lambda pid, **_: generate_correlation_report(pid),
    "causal": lambda pid, **_: generate_causal_report(pid),
    "simulation": lambda pid, simulation=None, **_: generate_simulation_report(pid, simulation or {}),
    "governance": lambda pid, **_: generate_governance_report(pid),
    "data_completeness": lambda pid, **_: generate_data_completeness_report(pid),
}


# ---------------------------------------------------------------------------
# Agent handoff
# ---------------------------------------------------------------------------

_VALID_HANDOFF_KINDS = (
    "send_summary",
    "draft_protocol_update",
    "review_risks",
    "create_followup_tasks",
)


def create_agent_handoff_summary(
    patient_id: str,
    *,
    kind: str,
    note: str | None = None,
) -> dict[str, Any]:
    if kind not in _VALID_HANDOFF_KINDS:
        kind = "send_summary"
    summary = build_twin_summary(patient_id)
    return {
        "patient_id": patient_id,
        "kind": kind,
        "note": note,
        "submitted_at": _now_iso(),
        "audit_ref": f"twin_handoff:{kind}:{_seed(patient_id, kind):x}",
        "summary_markdown": _format_handoff_markdown(patient_id, summary, kind, note),
        "approval_required": True,
        "disclaimer": "Agent handoff is decision-support context only. Clinician review required.",
    }


def _format_handoff_markdown(
    patient_id: str, summary: dict[str, Any], kind: str, note: str | None
) -> str:
    title_map = {
        "send_summary": "DeepTwin Summary",
        "draft_protocol_update": "Draft Protocol Update Request",
        "review_risks": "Risk Review Request",
        "create_followup_tasks": "Follow-up Tasks Request",
    }
    head = title_map.get(kind, "DeepTwin Summary")
    lines = [
        f"# {head}",
        f"- patient_id: `{patient_id}`",
        f"- completeness: {summary['completeness_pct']}%",
        f"- risk_status: {summary['risk_status']}",
        f"- review_status: {summary['review_status']}",
    ]
    if summary.get("warnings"):
        lines.append("\n## Warnings")
        lines.extend(f"- {w}" for w in summary["warnings"])
    if note:
        lines.append("\n## Note")
        lines.append(note)
    lines.append("\n_Decision-support only. Clinician must review before any treatment action._")
    return "\n".join(lines)
