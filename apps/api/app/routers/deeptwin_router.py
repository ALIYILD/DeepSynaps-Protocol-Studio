from __future__ import annotations

import importlib
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AssessmentRecord,
    ClinicalSession,
    DeepTwinAnalysisRun,
    DeepTwinClinicianNote,
    DeepTwinSimulationRun,
    MriAnalysis,
    OutcomeEvent,
    QEEGAnalysis,
    WearableObservation,
)
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id
from app.services.deeptwin_decision_support import (
    ANALYZE_SCHEMA_VERSION,
    SCHEMA_VERSION,
    build_calibration_status,
    build_provenance,
    build_scenario_comparison,
    build_uncertainty_block,
    confidence_tier,
    derive_top_drivers,
    soften_language,
)
from app.services.deeptwin_engine import (
    REPORT_BUILDERS,
    align_timeline_events,
    build_signal_matrix,
    build_twin_summary,
    create_agent_handoff_summary,
    detect_correlations,
    estimate_trajectory,
    generate_causal_hypotheses,
    simulate_intervention_scenario,
)
from app.services.fusion_service import build_fusion_recommendation
from app.services.neuromodulation_research import bundle_root_or_none, search_ranked_papers
from app.settings import get_settings

router = APIRouter(prefix="/api/v1/deeptwin", tags=["deeptwin"])
brain_twin_router = APIRouter(prefix="/api/v1/brain-twin", tags=["brain-twin"])


def _gate_patient_access(
    actor: AuthenticatedActor,
    patient_id: str,
    db: Session | None = None,
) -> None:
    """Cross-clinic ownership gate for the deeptwin patient endpoints.

    These endpoints generate decision-support outputs from synthetic /
    deterministic builders seeded by ``patient_id``, so they previously
    accepted any string. We now look up the patient's owning clinic and
    block requests where the actor's clinic doesn't match.

    Patients that do not exist in the DB (synthetic / demo IDs used by
    older tests and the read-only stub renderers) are permitted to pass —
    there is no real-tenant data to leak in that case. This preserves
    backward-compat with seeded demo flows while still slamming the door on
    the real cross-clinic IDOR (an existing patient at clinic B being
    pulled by a clinician at clinic A).
    """
    from app.database import SessionLocal

    owns_session = db is None
    if owns_session:
        db = SessionLocal()
    try:
        exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
        if exists:
            require_patient_owner(actor, clinic_id)
    finally:
        if owns_session and db is not None:
            db.close()


ModalityKey = Literal[
    "qeeg_raw",
    "qeeg_features",
    "mri_structural",
    "fmri",
    "wearables",
    "in_clinic_therapy",
    "home_therapy",
    "video",
    "audio",
    "assessments",
    "ehr_text",
]

AnalysisMode = Literal["correlation", "prediction", "causation"]


class DeeptwinAnalyzeRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    as_of: str | None = None
    modalities: list[ModalityKey] = Field(default_factory=list)
    combine: Literal["all_selected", "minimal_viable", "custom_weights"] = "all_selected"
    custom_weights: dict[ModalityKey, float] | None = None
    analysis_modes: list[AnalysisMode] = Field(default_factory=lambda: ["prediction"])


class DeeptwinAnalyzeResponse(BaseModel):
    patient_id: str
    as_of: str | None = None
    used_modalities: list[ModalityKey]
    analysis_modes: list[AnalysisMode]
    correlation: dict[str, Any] | None = None
    prediction: dict[str, Any] | None = None
    causation: dict[str, Any] | None = None
    engine: dict[str, Any]
    provenance: dict[str, Any] | None = None
    schema_version: str | None = None
    decision_support_only: bool = True


class DeeptwinSimulateRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    protocol_id: str = Field(..., min_length=1)
    horizon_days: int = Field(30, ge=7, le=365)
    modalities: list[ModalityKey] = Field(default_factory=list)
    scenario: dict[str, Any] | None = None


class DeeptwinSimulateResponse(BaseModel):
    patient_id: str
    protocol_id: str
    horizon_days: int
    engine: dict[str, Any]
    outputs: dict[str, Any]
    schema_version: str | None = None
    provenance: dict[str, Any] | None = None
    decision_support_only: bool = True


class DeeptwinEvidenceRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1)
    modalities: list[ModalityKey] = Field(default_factory=list)
    analysis_mode: AnalysisMode = "prediction"
    ranking_mode: Literal["best", "clinical", "regulatory", "safety", "recent"] = "clinical"
    limit: int = Field(8, ge=1, le=25)


class DeeptwinEvidenceResponse(BaseModel):
    patient_id: str
    trace_id: str
    index_snapshot_id: str | None = None
    question: str
    modalities: list[ModalityKey] = Field(default_factory=list)
    analysis_mode: AnalysisMode
    papers: list[dict[str, Any]] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


_MODALITY_LABELS: dict[ModalityKey, str] = {
    "qeeg_raw": "Raw qEEG",
    "qeeg_features": "qEEG biomarkers",
    "mri_structural": "Structural MRI",
    "fmri": "Functional MRI",
    "wearables": "Wearables",
    "in_clinic_therapy": "Clinic therapy logs",
    "home_therapy": "Home therapy logs",
    "video": "Video analysis",
    "audio": "Audio analysis",
    "assessments": "Assessments",
    "ehr_text": "Medical record text",
}


def _safe_weights(
    modalities: list[ModalityKey],
    combine: str,
    custom_weights: dict[ModalityKey, float] | None,
) -> dict[ModalityKey, float]:
    if not modalities:
        return {}
    if combine != "custom_weights" or not custom_weights:
        weight = 1.0 / float(len(modalities))
        return {modality: weight for modality in modalities}
    weights = {modality: float(custom_weights.get(modality, 0.0)) for modality in modalities}
    total = sum(max(value, 0.0) for value in weights.values())
    if total <= 0:
        weight = 1.0 / float(len(modalities))
        return {modality: weight for modality in modalities}
    return {modality: max(value, 0.0) / total for modality, value in weights.items()}


def _stable_seed(*parts: Any) -> int:
    joined = "|".join(str(part or "") for part in parts)
    return int(uuid.uuid5(uuid.NAMESPACE_URL, joined).hex[:8], 16)


def _confidence_label(score: float) -> str:
    if score >= 0.72:
        return "high"
    if score >= 0.5:
        return "moderate"
    return "low"


def _modality_coverage(modalities: list[ModalityKey]) -> dict[str, Any]:
    groups = {
        "neurophysiology": {"qeeg_raw", "qeeg_features"},
        "imaging": {"mri_structural", "fmri"},
        "physiology": {"wearables"},
        "clinical": {"assessments", "ehr_text"},
        "behavioral": {"video", "audio"},
        "treatment": {"in_clinic_therapy", "home_therapy"},
    }
    covered_groups = [
        name for name, keys in groups.items() if any(modality in keys for modality in modalities)
    ]
    return {
        "covered_domains": len(covered_groups),
        "coverage_ratio": round(len(covered_groups) / float(len(groups)), 3),
        "covered_groups": covered_groups,
    }


def _build_priority_pairs(
    patient_id: str,
    as_of: str | None,
    used_modalities: list[ModalityKey],
) -> tuple[list[str], list[list[float]], list[dict[str, Any]]]:
    labels = [
        "attention_score",
        "alpha_power",
        "theta_beta_ratio",
        "sleep_total_min",
        "hrv_rmssd_ms",
        "mood_burden",
        "target_readiness",
    ]
    seed = _stable_seed(patient_id, as_of, "corr")
    rng = np.random.default_rng(seed)
    raw = rng.normal(size=(max(10, len(labels) + 2), len(labels)))
    matrix = np.corrcoef(raw, rowvar=False)
    matrix = np.nan_to_num(matrix, nan=0.0, posinf=0.0, neginf=0.0)
    matrix = np.clip(matrix, -1.0, 1.0)
    pair_templates = [
        (
            "alpha_power",
            "attention_score",
            "Higher posterior alpha normalization may track better sustained attention if treatment adherence and sleep are stable.",
        ),
        (
            "theta_beta_ratio",
            "attention_score",
            "Elevated theta/beta ratio often travels with reduced attentional efficiency and should be monitored against symptom change.",
        ),
        (
            "sleep_total_min",
            "hrv_rmssd_ms",
            "Sleep recovery and autonomic resilience can move together and change intervention readiness.",
        ),
        (
            "mood_burden",
            "sleep_total_min",
            "Mood burden and sleep disruption can reinforce each other across treatment weeks.",
        ),
        (
            "target_readiness",
            "alpha_power",
            "Stimulation readiness and alpha response should be reviewed together when selecting protocol cadence.",
        ),
    ]
    ranked: list[dict[str, Any]] = []
    for left, right, explanation in pair_templates:
        left_index = labels.index(left)
        right_index = labels.index(right)
        score = float(matrix[left_index][right_index])
        ranked.append(
            {
                "left": left,
                "right": right,
                "score": round(score, 3),
                "interpretation": "moves together" if score >= 0 else "moves in opposite directions",
                "clinical_readout": explanation,
                "confidence": _confidence_label(min(0.88, 0.42 + (abs(score) * 0.6))),
                "modalities": [_MODALITY_LABELS[item] for item in used_modalities[:4]],
            }
        )
    ranked.sort(key=lambda item: abs(float(item["score"])), reverse=True)
    return labels, matrix.round(4).tolist(), ranked


def _build_prediction(
    patient_id: str,
    used_modalities: list[ModalityKey],
    fusion: dict[str, Any],
    weights: dict[ModalityKey, float],
) -> dict[str, Any]:
    coverage = _modality_coverage(used_modalities)
    readiness_score = min(
        0.92,
        0.34
        + (coverage["coverage_ratio"] * 0.28)
        + (0.22 if "qeeg_features" in used_modalities else 0.0)
        + (0.12 if "mri_structural" in used_modalities else 0.0)
        + (0.08 if "wearables" in used_modalities else 0.0),
    )
    confidence = _confidence_label(readiness_score)
    summary_parts = [
        f"DeepTwin fused {len(used_modalities)} modalities across {coverage['covered_domains']} of 6 data domains.",
        "Best current use is treatment-readiness ranking and multimodal monitoring, not autonomous treatment selection.",
    ]
    if "qeeg_features" in used_modalities and "mri_structural" in used_modalities:
        summary_parts.append(
            "qEEG plus MRI supports stronger target-triangulation than either modality alone."
        )
    if "wearables" in used_modalities:
        summary_parts.append(
            "Wearables add recovery-state context that can change daily confidence in predicted response."
        )
    tier = confidence_tier(
        model_confidence=readiness_score,
        input_quality=coverage["coverage_ratio"],
        evidence_strength=0.55,
    )
    drivers = derive_top_drivers(
        inputs={"modalities": list(used_modalities)},
        base_drivers=[
            {
                "factor": "modality_agreement",
                "magnitude": coverage["coverage_ratio"],
                "direction": "positive",
                "detail": (
                    f"{coverage['covered_domains']} of 6 data domains "
                    "represented; agreement across qEEG/MRI/assessments tightens prediction."
                ),
            }
        ],
        limit=5,
    )
    key_predictions = [
        {
            "title": "Target-response readiness",
            "summary": soften_language(
                "Prediction is strongest when neurophysiology, imaging, and "
                "symptom layers all agree on the current treatment objective."
            ),
            "expected_direction": "Confidence improves with multimodal agreement",
            "why": soften_language(
                "qEEG, imaging, and assessment trajectories are the highest-"
                "value combination for protocol planning."
            ),
            "confidence": confidence,
            "confidence_tier": tier,
            "top_drivers": drivers,
            "evidence_status": "pending",
            "caveat": "Missing longitudinal response data weakens patient-specific calibration.",
        },
        {
            "title": "Biomarker tracking value",
            "summary": soften_language(
                "Consider tracking alpha, theta/beta ratio, sleep, and HRV as a "
                "linked monitoring set rather than isolated metrics."
            ),
            "expected_direction": "Daily readiness may improve as autonomic and electrophysiology markers stabilize",
            "why": "These features can change faster than global clinical scales and help explain response lag.",
            "confidence": "moderate" if "wearables" in used_modalities else "low",
            "confidence_tier": confidence_tier(
                model_confidence=0.55 if "wearables" in used_modalities else 0.35,
                input_quality=coverage["coverage_ratio"],
                evidence_strength=0.5,
            ),
            "top_drivers": derive_top_drivers(
                inputs={"modalities": list(used_modalities)}, limit=3
            ),
            "evidence_status": "pending",
            "caveat": "Association does not establish causal treatment effect.",
        },
        {
            "title": "Operational next step",
            "summary": soften_language(
                "Consider using DeepTwin to rank likely mechanisms, pick a "
                "candidate protocol, then monitor whether the leading "
                "biomarker actually moves after week 1 to 2."
            ),
            "expected_direction": "Earlier detection of non-response",
            "why": "Fast biomarker drift can trigger protocol review before waiting for a long symptom cycle.",
            "confidence": "moderate",
            "confidence_tier": "medium",
            "top_drivers": derive_top_drivers(inputs={"weeks": 6}, limit=3),
            "evidence_status": "pending",
            "caveat": "Requires clinician review and protocol-specific evidence.",
        },
    ]
    return {
        "patient_id": patient_id,
        "prediction_band": confidence.capitalize(),
        "confidence": round(readiness_score, 3),
        "confidence_tier": tier,
        "executive_summary": soften_language(" ".join(summary_parts)),
        "coverage": coverage,
        "weights": weights,
        "fusion": fusion,
        "key_predictions": key_predictions,
        "top_drivers": drivers,
        "calibration": build_calibration_status(),
        "uncertainty": build_uncertainty_block(),
        "evidence_status": "pending",
        "decision_support_only": True,
        "monitoring_priorities": [
            "Repeat qEEG or biomarker review after the first protocol block.",
            "Track sleep and HRV during the scenario window.",
            "Review symptom scales and adherence together rather than in separate silos.",
        ],
    }


def _build_causation(
    used_modalities: list[ModalityKey],
    priority_pairs: list[dict[str, Any]],
) -> dict[str, Any]:
    hypotheses = [
        {
            "title": "Recovery-mediated response variability",
            "summary": "Sleep and autonomic strain may moderate whether biomarker change converts into clinical benefit.",
            "confidence": 0.67 if "wearables" in used_modalities else 0.48,
            "support": [
                "Wearable recovery markers can explain day-to-day volatility.",
                "Clinical scales often lag behind physiological adaptation.",
            ],
            "caveat": "Mechanism hypothesis only; requires longitudinal within-patient confirmation.",
        },
        {
            "title": "Targeting triangulation hypothesis",
            "summary": "MRI target context and qEEG dysregulation patterns should be interpreted together before assigning likely response mechanisms.",
            "confidence": 0.73
            if {"qeeg_features", "mri_structural"}.issubset(set(used_modalities))
            else 0.54,
            "support": [
                "Imaging provides an anatomic prior.",
                "qEEG provides a functional dysregulation signal.",
            ],
            "caveat": "Not sufficient for autonomous targeting decisions.",
        },
    ]
    if priority_pairs:
        top_pair = priority_pairs[0]
        hypotheses.append(
            {
                "title": "Top-ranked interaction hypothesis",
                "summary": f"{top_pair['left']} and {top_pair['right']} currently show the strongest modeled interaction and should anchor review of mechanism and monitoring.",
                "confidence": min(0.81, 0.45 + abs(float(top_pair["score"])) * 0.4),
                "support": [
                    top_pair["clinical_readout"],
                    f"Observed direction: {top_pair['interpretation']}.",
                ],
                "caveat": "Correlation ranking is not proof of causal linkage.",
            }
        )
    return {
        "algorithm": "hypothesis_graph_v2",
        "nodes": [
            "treatment_protocol",
            "qeeg_biomarkers",
            "recovery_state",
            "symptom_burden",
            "attention_function",
        ],
        "edges": [
            {"from": "treatment_protocol", "to": "qeeg_biomarkers", "kind": "hypothesis", "confidence": 0.66},
            {"from": "recovery_state", "to": "symptom_burden", "kind": "hypothesis", "confidence": 0.61},
            {"from": "qeeg_biomarkers", "to": "attention_function", "kind": "hypothesis", "confidence": 0.58},
        ],
        "hypotheses": hypotheses[:4],
    }


def _normalize_number(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _require_clinician_review_actor(actor: AuthenticatedActor) -> None:
    require_minimum_role(
        actor,
        "clinician",
        warnings=[
            "DeepTwin outputs are clinician decision support only.",
            "Patient-specific simulations and predictions require clinician or admin access.",
        ],
    )


def _build_simulation_outputs(
    patient_id: str,
    protocol_id: str,
    horizon_days: int,
    modalities: list[ModalityKey],
    scenario: dict[str, Any],
) -> dict[str, Any]:
    seed = _stable_seed(patient_id, protocol_id, horizon_days, "simulate")
    rng = np.random.default_rng(seed)
    sessions_per_day = max(1.0, _normalize_number(scenario.get("sessions_per_day"), 1.0))
    sessions_per_week = max(1.0, _normalize_number(scenario.get("sessions_per_week"), 5.0))
    weeks = max(1.0, _normalize_number(scenario.get("weeks"), max(2.0, horizon_days / 7.0)))
    frequency_hz = max(0.0, _normalize_number(scenario.get("frequency_hz"), 0.0))
    dose_score = min(
        1.0,
        ((sessions_per_day * sessions_per_week * weeks) / 90.0)
        + (min(frequency_hz, 20.0) / 50.0),
    )
    effect_size = round(min(0.62, 0.14 + (dose_score * 0.32) + rng.normal(0.0, 0.03)), 3)
    response_probability = round(min(0.84, 0.36 + effect_size), 3)
    biomarker = str(scenario.get("expected_biomarker") or "alpha").strip() or "alpha"
    target = str(scenario.get("target") or "fronto-central target").strip()
    clinical_goal = str(scenario.get("clinical_goal") or "attention").strip()
    intervention = str(scenario.get("intervention_type") or protocol_id).strip()
    days = list(range(0, horizon_days + 1, 7))
    running = 0.0
    timecourse: list[dict[str, Any]] = []
    for day in days:
        weekly_gain = effect_size / max(1.0, horizon_days / 7.0)
        running += weekly_gain + float(rng.normal(0.0, 0.015))
        timecourse.append(
            {
                "day": day,
                "delta_symptom_score": round(-running, 3),
                "expected_confidence": round(
                    min(0.9, 0.42 + (day / max(horizon_days, 7)) * 0.26), 3
                ),
            }
        )
    sim_inputs = {
        "patient_id": patient_id,
        "protocol_id": protocol_id,
        "horizon_days": horizon_days,
        "modalities": list(modalities or []),
        "scenario": scenario,
    }
    tier = confidence_tier(
        model_confidence=response_probability,
        input_quality=min(1.0, 0.4 + 0.05 * len(modalities or [])),
        evidence_strength=0.5,
    )
    drivers = derive_top_drivers(
        inputs={
            "modalities": list(modalities or []),
            "weeks": int(weeks),
            "frequency_hz": frequency_hz,
        },
        base_drivers=[
            {
                "factor": "intervention",
                "magnitude": round(effect_size, 3),
                "direction": "positive" if effect_size > 0 else "neutral",
                "detail": f"Intervention type: {intervention} at {target}",
            }
        ],
        limit=5,
    )
    return {
        "timecourse": timecourse,
        "timecourse_summary": soften_language(
            f"Modeled weekly drift suggests approximately {round(effect_size * 100)}% "
            f"directional movement in the lead biomarker across {int(weeks)} weeks if adherence holds."
        ),
        "clinical_forecast": {
            "summary": soften_language(
                f"Consider {intervention} at {target} for {int(weeks)} weeks; "
                f"DeepTwin suggests a {biomarker} shift may improve {clinical_goal} "
                "if sleep, adherence, and symptom review remain stable."
            ),
            "expected_direction": f"{biomarker} normalization with possible improvement in {clinical_goal}",
            "caveat": "This is a modeled what-if scenario, not a validated patient-specific treatment guarantee.",
            "response_probability": response_probability,
            "confidence_tier": tier,
            "evidence_status": "pending",
        },
        "biomarker_forecast": [
            {
                "name": biomarker,
                "direction": "increase" if biomarker.lower() == "alpha" else "normalize",
                "summary": soften_language(
                    "The lead biomarker may move first if the protocol is "
                    "having the intended physiologic effect."
                ),
                "why": "Short-latency biomarker change is usually the earliest signal that the scenario is directionally plausible.",
                "confidence_tier": tier,
            },
            {
                "name": "theta_beta_ratio",
                "direction": "decrease",
                "summary": soften_language(
                    "Consider watching the attention-linked dysregulation "
                    "marker alongside alpha rather than on its own."
                ),
                "why": "qEEG ratios can help distinguish physiologic response from noise or adherence artifacts.",
                "confidence_tier": "medium",
            },
            {
                "name": "recovery_state",
                "direction": "stabilize",
                "summary": soften_language(
                    "Sleep and HRV may hold or improve if protocol intensity is tolerable."
                ),
                "why": "Recovery burden can overwhelm otherwise promising biomarker gains.",
                "confidence_tier": "medium",
            },
        ],
        "monitoring_plan": [
            "Review adherence daily during the first treatment week.",
            "Repeat biomarker review after week 1 to 2 before increasing intensity.",
            "Track symptom scales, sleep, and HRV together for early non-response detection.",
        ],
        "assumptions": [
            "The simulation assumes adequate adherence and no major intercurrent clinical change.",
            "Modeled response strength rises when qEEG, MRI, and symptom context are all available.",
            "Any treatment decision still requires protocol-specific evidence review and clinician judgment.",
        ],
        "modalities_used": modalities,
        "scenario": scenario,
        "confidence_tier": tier,
        "top_drivers": drivers,
        "calibration": build_calibration_status(),
        "uncertainty": build_uncertainty_block(horizon_days=horizon_days),
        "scenario_comparison": {
            "baseline_reference": "no_protocol_change_counterfactual_not_observed",
            "expected_direction": "improvement" if effect_size > 0 else "uncertain",
            "delta_pred": round(effect_size, 3),
            "delta_confidence": None,
            "recommendation_change": None,
        },
        "provenance": build_provenance(
            surface="legacy_simulate",
            inputs=sim_inputs,
            schema_version=SCHEMA_VERSION,
            extra={"protocol_id": protocol_id, "horizon_days": horizon_days},
        ),
        "schema_version": SCHEMA_VERSION,
        "evidence_status": "pending",
        "decision_support_only": True,
    }


def _try_autoresearch_simulate(inputs: dict[str, Any]) -> dict[str, Any] | None:
    try:
        importlib.import_module("autoresearch")
    except Exception:
        return None
    return {
        "status": "available_for_research",
        "reason": "Autoresearch is installed, but the clinical DeepTwin wrapper still returns a governed preview response.",
        "research_mode": {
            "enabled": True,
            "next_step": "Use evidence search plus governed simulation outputs while a domain-specific worker wrapper is wired.",
        },
        "inputs_echo": inputs,
    }


@router.post("/analyze", response_model=DeeptwinAnalyzeResponse)
def deeptwin_analyze(
    payload: DeeptwinAnalyzeRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DeeptwinAnalyzeResponse:
    _require_clinician_review_actor(_actor)
    _gate_patient_access(_actor, payload.patient_id, session)
    used = payload.modalities or ["qeeg_features", "assessments", "wearables"]
    weights = _safe_weights(used, payload.combine, payload.custom_weights)

    out = DeeptwinAnalyzeResponse(
        patient_id=payload.patient_id,
        as_of=payload.as_of,
        used_modalities=used,
        analysis_modes=payload.analysis_modes,
        engine={
            "combine": payload.combine,
            "weights": weights,
            "notes": [
                "Deeptwin is decision-support only and does not make diagnostic claims.",
                "Causation outputs are hypotheses, not clinical truth.",
            ],
        },
        schema_version=ANALYZE_SCHEMA_VERSION,
        provenance=build_provenance(
            surface="analyze",
            inputs={
                "patient_id": payload.patient_id,
                "as_of": payload.as_of,
                "modalities": list(used),
                "analysis_modes": list(payload.analysis_modes),
                "combine": payload.combine,
            },
            schema_version=ANALYZE_SCHEMA_VERSION,
        ),
    )

    if "correlation" in payload.analysis_modes:
        labels, matrix, priority_pairs = _build_priority_pairs(payload.patient_id, payload.as_of, used)
        out.correlation = {
            "method": "pearson",
            "labels": labels,
            "matrix": matrix,
            "priority_pairs": priority_pairs,
            "notes": [
                "Use ranked pairs to focus review, not to infer causation.",
                "Cross-modal correlations should be interpreted with timeline and treatment context.",
            ],
        }

    if "prediction" in payload.analysis_modes:
        fusion = build_fusion_recommendation(session, payload.patient_id)
        out.prediction = _build_prediction(payload.patient_id, used, fusion, weights)

    if "causation" in payload.analysis_modes:
        priority_pairs: list[dict[str, Any]] = []
        if out.correlation and isinstance(out.correlation.get("priority_pairs"), list):
            priority_pairs = out.correlation["priority_pairs"]
        out.causation = _build_causation(used, priority_pairs)

    return out


@brain_twin_router.post("/analyze", response_model=DeeptwinAnalyzeResponse)
def brain_twin_analyze(
    payload: DeeptwinAnalyzeRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> DeeptwinAnalyzeResponse:
    return deeptwin_analyze(payload=payload, _actor=_actor, session=session)


@router.post("/simulate", response_model=DeeptwinSimulateResponse)
def deeptwin_simulate(
    payload: DeeptwinSimulateRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> DeeptwinSimulateResponse:
    _require_clinician_review_actor(_actor)
    _gate_patient_access(_actor, payload.patient_id)
    if not get_settings().enable_deeptwin_simulation:
        raise ApiServiceError(
            code="deeptwin_simulation_disabled",
            message=(
                "DeepTwin simulation is gated off in this environment. "
                "Contact admin to enable."
            ),
            status_code=503,
            details={
                "reason": "deeptwin_simulation_not_enabled_in_environment",
                "env_flag": "DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION",
            },
        )
    inputs = {
        "patient_id": payload.patient_id,
        "protocol_id": payload.protocol_id,
        "horizon_days": payload.horizon_days,
        "modalities": payload.modalities,
        "scenario": payload.scenario or {},
    }

    autoresearch_preview = _try_autoresearch_simulate(inputs)
    governed_outputs = _build_simulation_outputs(
        payload.patient_id,
        payload.protocol_id,
        payload.horizon_days,
        payload.modalities,
        payload.scenario or {},
    )
    sim_provenance = build_provenance(
        surface="legacy_simulate",
        inputs=inputs,
        schema_version=SCHEMA_VERSION,
    )
    if autoresearch_preview is not None:
        return DeeptwinSimulateResponse(
            patient_id=payload.patient_id,
            protocol_id=payload.protocol_id,
            horizon_days=payload.horizon_days,
            engine={"name": "autoresearch", "status": "available"},
            outputs={**governed_outputs, "autoresearch": autoresearch_preview},
            schema_version=SCHEMA_VERSION,
            provenance=sim_provenance,
        )

    return DeeptwinSimulateResponse(
        patient_id=payload.patient_id,
        protocol_id=payload.protocol_id,
        horizon_days=payload.horizon_days,
        engine={"name": "stub", "status": "placeholder", "real_ai": False,
                "notice": "No production simulation model is connected. "
                          "Output is deterministic placeholder data for UI development only."},
        outputs=governed_outputs,
        schema_version=SCHEMA_VERSION,
        provenance=sim_provenance,
    )


@brain_twin_router.post("/simulate", response_model=DeeptwinSimulateResponse)
def brain_twin_simulate(
    payload: DeeptwinSimulateRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> DeeptwinSimulateResponse:
    return deeptwin_simulate(payload=payload, _actor=_actor)


def _snapshot_id_for_research_bundle() -> str | None:
    root = bundle_root_or_none()
    if root is None:
        return None
    manifest = Path(root) / "research_bundle_manifest.json"
    if not manifest.exists():
        return None
    stat = manifest.stat()
    return f"neuromodulation_bundle:{stat.st_mtime_ns}:{stat.st_size}"


@router.post("/evidence", response_model=DeeptwinEvidenceResponse)
def deeptwin_evidence(
    payload: DeeptwinEvidenceRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> DeeptwinEvidenceResponse:
    _require_clinician_review_actor(_actor)
    _gate_patient_access(_actor, payload.patient_id)
    trace_id = str(uuid.uuid4())
    snapshot_id = _snapshot_id_for_research_bundle()

    notes: list[str] = [
        "Evidence results are decision-support context only; they do not directly change predictions at runtime.",
        "Citations must be reviewed by a clinician before being used in care decisions.",
    ]
    if snapshot_id is None:
        notes.append(
            "Neuromodulation research bundle not found. Set DEEPSYNAPS_NEUROMODULATION_RESEARCH_BUNDLE_ROOT to enable 87k-paper evidence search."
        )
        return DeeptwinEvidenceResponse(
            patient_id=payload.patient_id,
            trace_id=trace_id,
            index_snapshot_id=None,
            question=payload.question,
            modalities=payload.modalities,
            analysis_mode=payload.analysis_mode,
            papers=[],
            notes=notes,
        )

    question = (payload.question or "").strip()
    papers = search_ranked_papers(
        q=question,
        ranking_mode=payload.ranking_mode,
        limit=payload.limit,
    )
    return DeeptwinEvidenceResponse(
        patient_id=payload.patient_id,
        trace_id=trace_id,
        index_snapshot_id=snapshot_id,
        question=question,
        modalities=payload.modalities,
        analysis_mode=payload.analysis_mode,
        papers=papers,
        notes=notes,
    )


@brain_twin_router.post("/evidence", response_model=DeeptwinEvidenceResponse)
def brain_twin_evidence(
    payload: DeeptwinEvidenceRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> DeeptwinEvidenceResponse:
    return deeptwin_evidence(payload=payload, _actor=_actor)


# ---------------------------------------------------------------------------
# DeepTwin v1: rich endpoints powering the clinician page.
# These return deterministic synthetic data seeded by patient_id. The shapes
# are stable so the frontend can render fully without real ingestion.
# Every prediction/simulation includes evidence grade, uncertainty band and
# explicit "approval_required" / "decision-support only" labels.
# ---------------------------------------------------------------------------


class TwinSummaryOut(BaseModel):
    patient_id: str
    completeness_pct: float
    risk_status: str
    last_updated: str
    sources_connected: list[dict[str, Any]]
    sources_missing: list[dict[str, Any]]
    review_status: str
    warnings: list[str]
    disclaimer: str


class TwinTimelineOut(BaseModel):
    patient_id: str
    events: list[dict[str, Any]]
    window_days: int


class TwinSignalsOut(BaseModel):
    patient_id: str
    signals: list[dict[str, Any]]


class TwinCorrelationsOut(BaseModel):
    patient_id: str
    method: str
    labels: list[str]
    matrix: list[list[float]]
    cards: list[dict[str, Any]]
    hypotheses: list[dict[str, Any]]
    warnings: list[str]


class TwinPredictionOut(BaseModel):
    patient_id: str
    horizon: str
    horizon_days: int
    traces: list[dict[str, Any]]
    assumptions: list[str]
    evidence_grade: str
    evidence_status: str | None = None
    confidence_tier: str | None = None
    top_drivers: list[dict[str, Any]] = Field(default_factory=list)
    rationale: str | None = None
    uncertainty: dict[str, Any] | None = None
    calibration: dict[str, Any] | None = None
    provenance: dict[str, Any] | None = None
    decision_support_only: bool = True
    uncertainty_widens_with_horizon: bool
    disclaimer: str


class TwinSimulationRequest(BaseModel):
    scenario_id: str | None = None
    modality: Literal["tms", "tdcs", "tacs", "ces", "pbm", "behavioural", "therapy",
                      "medication", "lifestyle"] = "tdcs"
    target: str = "Fp2"
    frequency_hz: float | None = 10.0
    current_ma: float | None = 2.0
    power_w: float | None = None
    duration_min: int = Field(20, ge=1, le=120)
    sessions_per_week: int = Field(5, ge=1, le=14)
    weeks: int = Field(5, ge=1, le=26)
    contraindications: list[str] = Field(default_factory=list)
    adherence_assumption_pct: float = Field(80.0, ge=0.0, le=100.0)
    notes: str | None = None


class TwinSimulationOut(BaseModel):
    patient_id: str
    scenario_id: str
    input: dict[str, Any]
    predicted_curve: dict[str, Any]
    expected_domains: list[str]
    responder_probability: float
    responder_probability_ci95: list[float] | None = None
    non_responder_flag: bool
    safety_concerns: list[str]
    missing_data: list[str]
    monitoring_plan: list[str]
    evidence_support: list[dict[str, Any]] | list[str]
    evidence_grade: str
    evidence_status: str | None = None
    approval_required: bool
    labels: dict[str, bool]
    disclaimer: str
    # New decision-support fields (Stream 3 night-shift upgrade).
    confidence_tier: str | None = None
    top_drivers: list[dict[str, Any]] = Field(default_factory=list)
    feature_attribution: list[dict[str, Any]] | None = None
    rationale: str | None = None
    patient_specific_notes: list[str] = Field(default_factory=list)
    scenario_comparison: dict[str, Any] | None = None
    uncertainty: dict[str, Any] | None = None
    calibration: dict[str, Any] | None = None
    provenance: dict[str, Any] | None = None
    schema_version: str | None = None
    decision_support_only: bool = True


class TwinReportRequest(BaseModel):
    kind: Literal[
        "clinician_deep", "patient_progress", "prediction", "correlation",
        "causal", "simulation", "governance", "data_completeness",
    ]
    horizon: str | None = "6w"
    simulation: dict[str, Any] | None = None


class TwinReportOut(BaseModel):
    patient_id: str
    kind: str
    title: str
    generated_at: str
    data_sources_used: list[str]
    date_range_days: int
    audit_refs: list[str]
    limitations: list[str]
    review_points: list[str]
    evidence_grade: str
    body: dict[str, Any]


class TwinAgentHandoffRequest(BaseModel):
    kind: Literal["send_summary", "draft_protocol_update", "review_risks",
                  "create_followup_tasks"] = "send_summary"
    note: str | None = None


class TwinAgentHandoffOut(BaseModel):
    patient_id: str
    kind: str
    note: str | None
    submitted_at: str
    audit_ref: str
    summary_markdown: str
    approval_required: bool
    disclaimer: str


@router.get("/patients/{patient_id}/summary", response_model=TwinSummaryOut)
def deeptwin_get_summary(
    patient_id: str,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinSummaryOut:
    _require_clinician_review_actor(_actor)
    _gate_patient_access(_actor, patient_id)
    return TwinSummaryOut(**build_twin_summary(patient_id))


@router.get("/patients/{patient_id}/timeline", response_model=TwinTimelineOut)
def deeptwin_get_timeline(
    patient_id: str,
    days: int = 90,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinTimelineOut:
    _require_clinician_review_actor(_actor)
    _gate_patient_access(_actor, patient_id)
    days = max(7, min(365, days))
    return TwinTimelineOut(**align_timeline_events(patient_id, days=days))


@router.get("/patients/{patient_id}/signals", response_model=TwinSignalsOut)
def deeptwin_get_signals(
    patient_id: str,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinSignalsOut:
    _require_clinician_review_actor(_actor)
    _gate_patient_access(_actor, patient_id)
    return TwinSignalsOut(**build_signal_matrix(patient_id))


@router.get("/patients/{patient_id}/correlations", response_model=TwinCorrelationsOut)
def deeptwin_get_correlations(
    patient_id: str,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinCorrelationsOut:
    _require_clinician_review_actor(_actor)
    _gate_patient_access(_actor, patient_id)
    corr = detect_correlations(patient_id)
    caus = generate_causal_hypotheses(patient_id)
    return TwinCorrelationsOut(
        patient_id=patient_id,
        method=corr["method"],
        labels=corr["labels"],
        matrix=corr["matrix"],
        cards=corr["cards"],
        hypotheses=caus["hypotheses"],
        warnings=corr["warnings"],
    )


@router.get("/patients/{patient_id}/predictions", response_model=TwinPredictionOut)
def deeptwin_get_predictions(
    patient_id: str,
    horizon: Literal["2w", "6w", "12w"] = "6w",
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinPredictionOut:
    _require_clinician_review_actor(_actor)
    _gate_patient_access(_actor, patient_id)
    return TwinPredictionOut(**estimate_trajectory(patient_id, horizon=horizon))


@router.post("/patients/{patient_id}/simulations", response_model=TwinSimulationOut)
def deeptwin_post_simulation(
    patient_id: str,
    payload: TwinSimulationRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinSimulationOut:
    _require_clinician_review_actor(_actor)
    _gate_patient_access(_actor, patient_id)
    result = simulate_intervention_scenario(
        patient_id,
        scenario_id=payload.scenario_id,
        modality=payload.modality,
        target=payload.target,
        frequency_hz=payload.frequency_hz,
        current_ma=payload.current_ma,
        power_w=payload.power_w,
        duration_min=payload.duration_min,
        sessions_per_week=payload.sessions_per_week,
        weeks=payload.weeks,
        contraindications=payload.contraindications,
        adherence_assumption_pct=payload.adherence_assumption_pct,
        notes=payload.notes,
    )
    return TwinSimulationOut(**result)


class TwinScenarioCompareRequest(BaseModel):
    scenarios: list[dict[str, Any]] = Field(default_factory=list)


class TwinScenarioCompareOut(BaseModel):
    patient_id: str
    count: int
    items: list[dict[str, Any]]
    deltas: list[dict[str, Any]]
    summary: str
    schema_version: str
    provenance: dict[str, Any]
    decision_support_only: bool = True


@router.post(
    "/patients/{patient_id}/scenarios/compare",
    response_model=TwinScenarioCompareOut,
)
def deeptwin_compare_scenarios(
    patient_id: str,
    payload: TwinScenarioCompareRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinScenarioCompareOut:
    """Structured comparison across N scenarios.

    The clinician page used to overlay simulation curves client-side
    only; this endpoint returns the deltas (endpoint, responder
    probability, confidence tier, recommendation change) so they can
    be audited and rendered as a table.
    """
    _require_clinician_review_actor(_actor)
    _gate_patient_access(_actor, patient_id)
    cmp = build_scenario_comparison(payload.scenarios)
    return TwinScenarioCompareOut(
        patient_id=patient_id,
        count=cmp["count"],
        items=cmp["items"],
        deltas=cmp["deltas"],
        summary=cmp["summary"],
        schema_version=SCHEMA_VERSION,
        provenance=build_provenance(
            surface="scenarios.compare",
            inputs={"scenario_ids": [s.get("scenario_id") for s in payload.scenarios]},
            schema_version=SCHEMA_VERSION,
        ),
    )


@router.post("/patients/{patient_id}/reports", response_model=TwinReportOut)
def deeptwin_post_report(
    patient_id: str,
    payload: TwinReportRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinReportOut:
    _require_clinician_review_actor(_actor)
    _gate_patient_access(_actor, patient_id)
    builder = REPORT_BUILDERS.get(payload.kind)
    if builder is None:
        builder = REPORT_BUILDERS["clinician_deep"]
    body = builder(
        patient_id,
        horizon=payload.horizon or "6w",
        simulation=payload.simulation or {},
    )
    return TwinReportOut(
        patient_id=body["patient_id"],
        kind=body["kind"],
        title=body.get("title", "DeepTwin Report"),
        generated_at=body["generated_at"],
        data_sources_used=body.get("data_sources_used", []),
        date_range_days=body.get("date_range_days", 90),
        audit_refs=body.get("audit_refs", []),
        limitations=body.get("limitations", []),
        review_points=body.get("review_points", []),
        evidence_grade=body.get("evidence_grade", "moderate"),
        body=body,
    )


@router.post("/patients/{patient_id}/agent-handoff", response_model=TwinAgentHandoffOut)
def deeptwin_post_agent_handoff(
    patient_id: str,
    payload: TwinAgentHandoffRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinAgentHandoffOut:
    _require_clinician_review_actor(_actor)
    _gate_patient_access(_actor, patient_id)
    result = create_agent_handoff_summary(patient_id, kind=payload.kind, note=payload.note)
    return TwinAgentHandoffOut(**result)


# ---------------------------------------------------------------------------
# DeepTwin TRIBE-inspired layer (modality encoders → fusion → adapter →
# simulation heads → explanation). Additive: lives alongside the v1
# endpoints above without replacing any existing surface.
# ---------------------------------------------------------------------------

from app.services.deeptwin_tribe import (  # noqa: E402  (intentional late import)
    GENERIC_DISCLAIMER as TRIBE_DISCLAIMER,
    ProtocolSpec as TribeProtocolSpec,
    compare_protocols as tribe_compare_protocols,
    compute_patient_latent as tribe_compute_patient_latent,
    simulate_protocol as tribe_simulate_protocol,
    to_jsonable as tribe_to_jsonable,
)

TRIBE_ENGINE_INFO: dict[str, Any] = {
    "name": "tribe-rule-engine",
    "version": "0.1.0",
    "real_ai": False,
    "method": "rule_based",
    "notice": (
        "All TRIBE outputs are generated by deterministic rule-based "
        "feature engineering and quality-weighted fusion — no trained ML "
        "model is connected. Response probabilities and trajectories are "
        "heuristic estimates for decision-support exploration only."
    ),
}


class TribeProtocolModel(BaseModel):
    protocol_id: str = Field(..., min_length=1)
    label: str | None = None
    modality: Literal[
        "tms", "tdcs", "tacs", "ces", "pbm", "behavioural",
        "therapy", "medication", "lifestyle",
    ] = "tdcs"
    target: str | None = None
    frequency_hz: float | None = None
    current_ma: float | None = None
    duration_min: int | None = None
    sessions_per_week: int | None = None
    weeks: int | None = None
    contraindications: list[str] = Field(default_factory=list)
    adherence_assumption_pct: float = Field(80.0, ge=0.0, le=100.0)
    notes: str | None = None

    def to_spec(self) -> TribeProtocolSpec:
        return TribeProtocolSpec(**self.model_dump())


class TribeSamplesModel(BaseModel):
    """Optional raw modality samples (for callers that want to override demo data)."""

    qeeg: dict[str, Any] | None = None
    mri: dict[str, Any] | None = None
    assessments: dict[str, Any] | None = None
    wearables: dict[str, Any] | None = None
    treatment_history: dict[str, Any] | None = None
    demographics: dict[str, Any] | None = None
    medications: dict[str, Any] | None = None
    text: dict[str, Any] | None = None
    voice: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, dict[str, Any]] | None:
        out = {k: v for k, v in self.model_dump().items() if v is not None}
        return out or None


class TribeSimulateRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    protocol: TribeProtocolModel
    horizon_weeks: int = Field(6, ge=1, le=26)
    samples: TribeSamplesModel | None = None
    profile: dict[str, Any] | None = None
    only_modalities: list[str] | None = None
    include_explanations: bool = True
    include_evidence: bool = True
    include_uncertainty: bool = True


class TribeSimulateResponse(BaseModel):
    patient_id: str
    horizon_weeks: int
    output: dict[str, Any]
    engine_info: dict[str, Any] = Field(default_factory=lambda: dict(TRIBE_ENGINE_INFO))
    disclaimer: str = TRIBE_DISCLAIMER


class TribeCompareRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    protocols: list[TribeProtocolModel] = Field(..., min_length=2, max_length=8)
    horizon_weeks: int = Field(6, ge=1, le=26)
    samples: TribeSamplesModel | None = None
    profile: dict[str, Any] | None = None
    only_modalities: list[str] | None = None


class TribeCompareResponse(BaseModel):
    patient_id: str
    horizon_weeks: int
    comparison: dict[str, Any]
    engine_info: dict[str, Any] = Field(default_factory=lambda: dict(TRIBE_ENGINE_INFO))
    disclaimer: str = TRIBE_DISCLAIMER


class TribeLatentRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    samples: TribeSamplesModel | None = None
    profile: dict[str, Any] | None = None
    only_modalities: list[str] | None = None


class TribeLatentResponse(BaseModel):
    patient_id: str
    embeddings: list[dict[str, Any]]
    latent: dict[str, Any]
    adapted: dict[str, Any]
    engine_info: dict[str, Any] = Field(default_factory=lambda: dict(TRIBE_ENGINE_INFO))
    disclaimer: str = TRIBE_DISCLAIMER


class TribeExplainRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    protocol: TribeProtocolModel
    horizon_weeks: int = Field(6, ge=1, le=26)
    samples: TribeSamplesModel | None = None
    profile: dict[str, Any] | None = None
    only_modalities: list[str] | None = None


class TribeExplainResponse(BaseModel):
    patient_id: str
    protocol_id: str
    explanation: dict[str, Any]
    response_probability: float
    response_confidence: str
    evidence_grade: str
    engine_info: dict[str, Any] = Field(default_factory=lambda: dict(TRIBE_ENGINE_INFO))
    disclaimer: str = TRIBE_DISCLAIMER


class TribeReportPayloadRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    protocol: TribeProtocolModel
    horizon_weeks: int = Field(6, ge=1, le=26)
    samples: TribeSamplesModel | None = None
    profile: dict[str, Any] | None = None
    kind: Literal[
        "clinician_intelligence",
        "patient_progress",
        "protocol_comparison",
        "governance",
    ] = "clinician_intelligence"


class TribeReportPayloadResponse(BaseModel):
    patient_id: str
    kind: str
    title: str
    sections: list[dict[str, Any]]
    audit_ref: str
    generated_at: str
    engine_info: dict[str, Any] = Field(default_factory=lambda: dict(TRIBE_ENGINE_INFO))
    disclaimer: str = TRIBE_DISCLAIMER


@router.post("/simulate-tribe", response_model=TribeSimulateResponse, tags=["deeptwin-tribe"])
def deeptwin_simulate_tribe(
    payload: TribeSimulateRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TribeSimulateResponse:
    _gate_patient_access(_actor, payload.patient_id)
    sim = tribe_simulate_protocol(
        payload.patient_id,
        payload.protocol.to_spec(),
        horizon_weeks=payload.horizon_weeks,
        samples=payload.samples.to_dict() if payload.samples else None,
        profile=payload.profile,
        only=payload.only_modalities,
    )
    out = tribe_to_jsonable(sim)
    if not payload.include_explanations:
        out.pop("explanation", None)
    if not payload.include_uncertainty:
        for traj in out.get("heads", {}).get("symptom_trajectories", []):
            for p in traj.get("points", []):
                p.pop("ci_low", None)
                p.pop("ci_high", None)
    return TribeSimulateResponse(
        patient_id=payload.patient_id,
        horizon_weeks=payload.horizon_weeks,
        output=out,
    )


@router.post("/compare-protocols", response_model=TribeCompareResponse, tags=["deeptwin-tribe"])
def deeptwin_compare_protocols(
    payload: TribeCompareRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TribeCompareResponse:
    _gate_patient_access(_actor, payload.patient_id)
    cmp_obj = tribe_compare_protocols(
        payload.patient_id,
        [p.to_spec() for p in payload.protocols],
        horizon_weeks=payload.horizon_weeks,
        samples=payload.samples.to_dict() if payload.samples else None,
        profile=payload.profile,
        only=payload.only_modalities,
    )
    return TribeCompareResponse(
        patient_id=payload.patient_id,
        horizon_weeks=payload.horizon_weeks,
        comparison=tribe_to_jsonable(cmp_obj),
    )


@router.post("/patient-latent", response_model=TribeLatentResponse, tags=["deeptwin-tribe"])
def deeptwin_patient_latent(
    payload: TribeLatentRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TribeLatentResponse:
    _gate_patient_access(_actor, payload.patient_id)
    embs, latent, adapted = tribe_compute_patient_latent(
        payload.patient_id,
        samples=payload.samples.to_dict() if payload.samples else None,
        profile=payload.profile,
        only=payload.only_modalities,
    )
    return TribeLatentResponse(
        patient_id=payload.patient_id,
        embeddings=[tribe_to_jsonable(e) for e in embs],
        latent=tribe_to_jsonable(latent),
        adapted=tribe_to_jsonable(adapted),
    )


@router.post("/explain", response_model=TribeExplainResponse, tags=["deeptwin-tribe"])
def deeptwin_explain(
    payload: TribeExplainRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TribeExplainResponse:
    _gate_patient_access(_actor, payload.patient_id)
    sim = tribe_simulate_protocol(
        payload.patient_id,
        payload.protocol.to_spec(),
        horizon_weeks=payload.horizon_weeks,
        samples=payload.samples.to_dict() if payload.samples else None,
        profile=payload.profile,
        only=payload.only_modalities,
    )
    out = tribe_to_jsonable(sim)
    return TribeExplainResponse(
        patient_id=payload.patient_id,
        protocol_id=payload.protocol.protocol_id,
        explanation=out.get("explanation", {}),
        response_probability=out["heads"]["response_probability"],
        response_confidence=out["heads"]["response_confidence"],
        evidence_grade=out["explanation"]["evidence_grade"],
    )


@router.post("/report-payload", response_model=TribeReportPayloadResponse, tags=["deeptwin-tribe"])
def deeptwin_report_payload(
    payload: TribeReportPayloadRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TribeReportPayloadResponse:
    _gate_patient_access(_actor, payload.patient_id)
    sim = tribe_simulate_protocol(
        payload.patient_id,
        payload.protocol.to_spec(),
        horizon_weeks=payload.horizon_weeks,
        samples=payload.samples.to_dict() if payload.samples else None,
        profile=payload.profile,
    )
    sim_dict = tribe_to_jsonable(sim)
    audit_ref = f"twin_tribe_report:{payload.patient_id}:{payload.kind}:{payload.protocol.protocol_id}"
    sections: list[dict[str, Any]] = [
        {
            "id": "summary",
            "title": "Patient summary",
            "items": [
                f"Patient {payload.patient_id}",
                f"Modalities used: {len(sim_dict['explanation']['top_modalities'])}",
                f"Coverage ratio: {sim_dict['explanation'].get('evidence_grade', 'low')}",
                f"Horizon: {payload.horizon_weeks} weeks",
            ],
        },
        {
            "id": "scenario",
            "title": "Scenario",
            "items": [
                f"Protocol: {payload.protocol.protocol_id}",
                f"Modality: {payload.protocol.modality}",
                f"Target: {payload.protocol.target or '—'}",
                f"Sessions/week: {payload.protocol.sessions_per_week or '—'}",
                f"Weeks: {payload.protocol.weeks or '—'}",
            ],
        },
        {
            "id": "predictions",
            "title": "Predicted response",
            "items": [
                f"Response probability: {sim_dict['heads']['response_probability']}",
                f"Confidence: {sim_dict['heads']['response_confidence']}",
                f"Latent state change: {sim_dict['heads']['latent_state_change']['direction']}",
            ],
        },
        {
            "id": "drivers",
            "title": "Top drivers",
            "items": [
                f"{d['modality']} · {d['feature']} · {d['direction']}"
                for d in sim_dict["explanation"]["top_drivers"]
            ],
        },
        {
            "id": "risks",
            "title": "Risks and monitoring",
            "items": [
                f"Adverse risk level: {sim_dict['heads']['adverse_risk']['level']}",
                *sim_dict["heads"]["adverse_risk"]["monitoring_plan"],
            ],
        },
        {
            "id": "limitations",
            "title": "Limitations and missing data",
            "items": list(sim_dict["explanation"]["missing_data_notes"])
            or ["No notable missing-modality gaps detected."],
        },
        {
            "id": "review",
            "title": "Recommended clinician review points",
            "items": list(sim_dict["explanation"]["cautions"]),
        },
        {
            "id": "audit",
            "title": "Audit",
            "items": [audit_ref],
        },
    ]
    title_map = {
        "clinician_intelligence": "DeepTwin Clinical Intelligence Report",
        "patient_progress": "DeepTwin Patient Progress Report",
        "protocol_comparison": "DeepTwin Protocol Comparison Report",
        "governance": "DeepTwin Governance Report",
    }
    from datetime import datetime, timezone
    return TribeReportPayloadResponse(
        patient_id=payload.patient_id,
        kind=payload.kind,
        title=title_map.get(payload.kind, "DeepTwin Report"),
        sections=sections,
        audit_ref=audit_ref,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


# ---------------------------------------------------------------------------
# DeepTwin persistence and clinician review layer (migration 063)
# ---------------------------------------------------------------------------


class DataSourceInfo(BaseModel):
    available: bool
    count: int
    last_updated: str | None = None


class DataSourcesOut(BaseModel):
    patient_id: str
    sources: dict[str, DataSourceInfo]
    completeness_score: float


class AnalysisRunIn(BaseModel):
    analysis_type: str = Field(..., min_length=1)
    input_sources_json: dict[str, Any] | None = None
    output_summary_json: dict[str, Any] | None = None
    limitations_json: list[str] | None = None
    confidence: float | None = None
    model_name: str | None = None


class AnalysisRunOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    analysis_type: str
    input_sources_json: dict[str, Any] | None = None
    output_summary_json: dict[str, Any] | None = None
    limitations_json: list[str] | None = None
    confidence: float | None = None
    model_name: str | None = None
    status: str
    created_at: str
    reviewed_at: str | None = None
    reviewed_by: str | None = None


class SimulationRunIn(BaseModel):
    proposed_protocol_json: dict[str, Any] | None = None
    assumptions_json: dict[str, Any] | None = None
    predicted_direction_json: dict[str, Any] | None = None
    evidence_links_json: list[str] | None = None
    confidence: float | None = None
    limitations: str | None = None


class SimulationRunOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    proposed_protocol_json: dict[str, Any] | None = None
    assumptions_json: dict[str, Any] | None = None
    predicted_direction_json: dict[str, Any] | None = None
    evidence_links_json: list[str] | None = None
    confidence: float | None = None
    limitations: str | None = None
    clinician_review_required: bool
    created_at: str
    reviewed_at: str | None = None
    reviewed_by: str | None = None


class ClinicianNoteIn(BaseModel):
    note_text: str = Field(..., min_length=1)
    related_analysis_id: str | None = None
    related_simulation_id: str | None = None


class ClinicianNoteOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: str
    note_text: str
    related_analysis_id: str | None = None
    related_simulation_id: str | None = None
    created_at: str


class ReviewIn(BaseModel):
    pass


def _serialize_dt(dt: Any) -> str | None:
    if dt is None:
        return None
    return dt.isoformat() if hasattr(dt, "isoformat") else str(dt)


@router.get("/patients/{patient_id}/data-sources", response_model=DataSourcesOut)
def deeptwin_get_data_sources(
    patient_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> DataSourcesOut:
    _require_clinician_review_actor(actor)
    _gate_patient_access(actor, patient_id, db)

    assessment_count = db.scalar(
        select(func.count()).where(AssessmentRecord.patient_id == patient_id)
    ) or 0
    qeeg_count = db.scalar(
        select(func.count()).where(QEEGAnalysis.patient_id == patient_id)
    ) or 0
    mri_count = db.scalar(
        select(func.count()).where(MriAnalysis.patient_id == patient_id)
    ) or 0
    session_count = db.scalar(
        select(func.count()).where(ClinicalSession.patient_id == patient_id)
    ) or 0
    wearable_count = db.scalar(
        select(func.count()).where(WearableObservation.patient_id == patient_id)
    ) or 0
    outcome_count = db.scalar(
        select(func.count()).where(OutcomeEvent.patient_id == patient_id)
    ) or 0

    def _last_updated(model_cls) -> str | None:
        ts_col = getattr(model_cls, 'created_at', None) or getattr(model_cls, 'observed_at', None) or getattr(model_cls, 'synced_at', None)
        if ts_col is None:
            return None
        row = db.execute(
            select(ts_col)
            .where(model_cls.patient_id == patient_id)
            .order_by(ts_col.desc())
            .limit(1)
        ).scalar_one_or_none()
        return _serialize_dt(row)

    sources = {
        "assessments": DataSourceInfo(
            available=assessment_count > 0,
            count=assessment_count,
            last_updated=_last_updated(AssessmentRecord),
        ),
        "qeeg": DataSourceInfo(
            available=qeeg_count > 0,
            count=qeeg_count,
            last_updated=_last_updated(QEEGAnalysis),
        ),
        "mri": DataSourceInfo(
            available=mri_count > 0,
            count=mri_count,
            last_updated=_last_updated(MriAnalysis),
        ),
        "sessions": DataSourceInfo(
            available=session_count > 0,
            count=session_count,
            last_updated=_last_updated(ClinicalSession),
        ),
        "wearables": DataSourceInfo(
            available=wearable_count > 0,
            count=wearable_count,
            last_updated=_last_updated(WearableObservation),
        ),
        "outcomes": DataSourceInfo(
            available=outcome_count > 0,
            count=outcome_count,
            last_updated=_last_updated(OutcomeEvent),
        ),
    }

    total_sources = 6
    present = sum(1 for s in sources.values() if s.available)
    completeness = round(present / total_sources, 2)

    create_audit_event(
        db,
        event_id=f"dt-ds-{actor.actor_id}-{uuid.uuid4().hex[:12]}",
        target_id=patient_id,
        target_type="patient",
        action="deeptwin.data_source.opened",
        role=actor.role,
        actor_id=actor.actor_id,
        note=f"completeness={completeness}; sources={present}",
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    return DataSourcesOut(
        patient_id=patient_id,
        sources={k: v.model_dump() for k, v in sources.items()},
        completeness_score=completeness,
    )


@router.post("/patients/{patient_id}/analysis-runs", response_model=AnalysisRunOut)
def deeptwin_create_analysis_run(
    patient_id: str,
    payload: AnalysisRunIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AnalysisRunOut:
    _require_clinician_review_actor(actor)
    _gate_patient_access(actor, patient_id, db)
    run = DeepTwinAnalysisRun(
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        analysis_type=payload.analysis_type,
        input_sources_json=payload.input_sources_json,
        output_summary_json=payload.output_summary_json,
        limitations_json=payload.limitations_json,
        confidence=payload.confidence,
        model_name=payload.model_name,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    create_audit_event(
        db,
        event_id=f"dt-analysis-{actor.actor_id}-{uuid.uuid4().hex[:12]}",
        target_id=patient_id,
        target_type="patient",
        action="deeptwin.ai.analysis.completed",
        role=actor.role,
        actor_id=actor.actor_id,
        note=f"type={payload.analysis_type}; run={run.id}",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    return AnalysisRunOut(
        id=run.id,
        patient_id=run.patient_id,
        clinician_id=run.clinician_id,
        analysis_type=run.analysis_type,
        input_sources_json=run.input_sources_json,
        output_summary_json=run.output_summary_json,
        limitations_json=run.limitations_json,
        confidence=run.confidence,
        model_name=run.model_name,
        status=run.status,
        created_at=_serialize_dt(run.created_at),
        reviewed_at=_serialize_dt(run.reviewed_at),
        reviewed_by=run.reviewed_by,
    )


@router.get("/patients/{patient_id}/analysis-runs", response_model=list[AnalysisRunOut])
def deeptwin_list_analysis_runs(
    patient_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[AnalysisRunOut]:
    _require_clinician_review_actor(actor)
    _gate_patient_access(actor, patient_id, db)
    runs = db.execute(
        select(DeepTwinAnalysisRun)
        .where(DeepTwinAnalysisRun.patient_id == patient_id)
        .order_by(DeepTwinAnalysisRun.created_at.desc())
    ).scalars().all()
    return [
        AnalysisRunOut(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            analysis_type=r.analysis_type,
            input_sources_json=r.input_sources_json,
            output_summary_json=r.output_summary_json,
            limitations_json=r.limitations_json,
            confidence=r.confidence,
            model_name=r.model_name,
            status=r.status,
            created_at=_serialize_dt(r.created_at),
            reviewed_at=_serialize_dt(r.reviewed_at),
            reviewed_by=r.reviewed_by,
        )
        for r in runs
    ]


@router.post("/analysis-runs/{run_id}/review", response_model=AnalysisRunOut)
def deeptwin_review_analysis_run(
    run_id: str,
    _payload: ReviewIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AnalysisRunOut:
    _require_clinician_review_actor(actor)
    run = db.get(DeepTwinAnalysisRun, run_id)
    if run is None:
        raise ApiServiceError(status_code=404, message="Analysis run not found")
    _gate_patient_access(actor, run.patient_id, db)
    from datetime import datetime, timezone
    run.reviewed_at = datetime.now(timezone.utc)
    run.reviewed_by = actor.actor_id
    db.commit()
    db.refresh(run)
    create_audit_event(
        db,
        event_id=f"dt-review-{actor.actor_id}-{uuid.uuid4().hex[:12]}",
        target_id=run.patient_id,
        target_type="patient",
        action="deeptwin.analysis.reviewed",
        role=actor.role,
        actor_id=actor.actor_id,
        note=f"run={run_id}; type={run.analysis_type}",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    return AnalysisRunOut(
        id=run.id,
        patient_id=run.patient_id,
        clinician_id=run.clinician_id,
        analysis_type=run.analysis_type,
        input_sources_json=run.input_sources_json,
        output_summary_json=run.output_summary_json,
        limitations_json=run.limitations_json,
        confidence=run.confidence,
        model_name=run.model_name,
        status=run.status,
        created_at=_serialize_dt(run.created_at),
        reviewed_at=_serialize_dt(run.reviewed_at),
        reviewed_by=run.reviewed_by,
    )


@router.post("/patients/{patient_id}/simulation-runs", response_model=SimulationRunOut)
def deeptwin_create_simulation_run(
    patient_id: str,
    payload: SimulationRunIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SimulationRunOut:
    _require_clinician_review_actor(actor)
    _gate_patient_access(actor, patient_id, db)
    run = DeepTwinSimulationRun(
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        proposed_protocol_json=payload.proposed_protocol_json,
        assumptions_json=payload.assumptions_json,
        predicted_direction_json=payload.predicted_direction_json,
        evidence_links_json=payload.evidence_links_json,
        confidence=payload.confidence,
        limitations=payload.limitations,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    create_audit_event(
        db,
        event_id=f"dt-sim-{actor.actor_id}-{uuid.uuid4().hex[:12]}",
        target_id=patient_id,
        target_type="patient",
        action="deeptwin.simulation.completed",
        role=actor.role,
        actor_id=actor.actor_id,
        note=f"run={run.id}",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    return SimulationRunOut(
        id=run.id,
        patient_id=run.patient_id,
        clinician_id=run.clinician_id,
        proposed_protocol_json=run.proposed_protocol_json,
        assumptions_json=run.assumptions_json,
        predicted_direction_json=run.predicted_direction_json,
        evidence_links_json=run.evidence_links_json,
        confidence=run.confidence,
        limitations=run.limitations,
        clinician_review_required=run.clinician_review_required,
        created_at=_serialize_dt(run.created_at),
        reviewed_at=_serialize_dt(run.reviewed_at),
        reviewed_by=run.reviewed_by,
    )


@router.get("/patients/{patient_id}/simulation-runs", response_model=list[SimulationRunOut])
def deeptwin_list_simulation_runs(
    patient_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[SimulationRunOut]:
    _require_clinician_review_actor(actor)
    _gate_patient_access(actor, patient_id, db)
    runs = db.execute(
        select(DeepTwinSimulationRun)
        .where(DeepTwinSimulationRun.patient_id == patient_id)
        .order_by(DeepTwinSimulationRun.created_at.desc())
    ).scalars().all()
    return [
        SimulationRunOut(
            id=r.id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            proposed_protocol_json=r.proposed_protocol_json,
            assumptions_json=r.assumptions_json,
            predicted_direction_json=r.predicted_direction_json,
            evidence_links_json=r.evidence_links_json,
            confidence=r.confidence,
            limitations=r.limitations,
            clinician_review_required=r.clinician_review_required,
            created_at=_serialize_dt(r.created_at),
            reviewed_at=_serialize_dt(r.reviewed_at),
            reviewed_by=r.reviewed_by,
        )
        for r in runs
    ]


@router.post("/simulation-runs/{run_id}/review", response_model=SimulationRunOut)
def deeptwin_review_simulation_run(
    run_id: str,
    _payload: ReviewIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SimulationRunOut:
    _require_clinician_review_actor(actor)
    run = db.get(DeepTwinSimulationRun, run_id)
    if run is None:
        raise ApiServiceError(status_code=404, message="Simulation run not found")
    _gate_patient_access(actor, run.patient_id, db)
    from datetime import datetime, timezone
    run.reviewed_at = datetime.now(timezone.utc)
    run.reviewed_by = actor.actor_id
    db.commit()
    db.refresh(run)
    create_audit_event(
        db,
        event_id=f"dt-sim-review-{actor.actor_id}-{uuid.uuid4().hex[:12]}",
        target_id=run.patient_id,
        target_type="patient",
        action="deeptwin.simulation.reviewed",
        role=actor.role,
        actor_id=actor.actor_id,
        note=f"run={run_id}",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    return SimulationRunOut(
        id=run.id,
        patient_id=run.patient_id,
        clinician_id=run.clinician_id,
        proposed_protocol_json=run.proposed_protocol_json,
        assumptions_json=run.assumptions_json,
        predicted_direction_json=run.predicted_direction_json,
        evidence_links_json=run.evidence_links_json,
        confidence=run.confidence,
        limitations=run.limitations,
        clinician_review_required=run.clinician_review_required,
        created_at=_serialize_dt(run.created_at),
        reviewed_at=_serialize_dt(run.reviewed_at),
        reviewed_by=run.reviewed_by,
    )


@router.post("/patients/{patient_id}/clinician-notes", response_model=ClinicianNoteOut)
def deeptwin_create_clinician_note(
    patient_id: str,
    payload: ClinicianNoteIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ClinicianNoteOut:
    _require_clinician_review_actor(actor)
    _gate_patient_access(actor, patient_id, db)
    note = DeepTwinClinicianNote(
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        note_text=payload.note_text,
        related_analysis_id=payload.related_analysis_id,
        related_simulation_id=payload.related_simulation_id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    create_audit_event(
        db,
        event_id=f"dt-note-{actor.actor_id}-{uuid.uuid4().hex[:12]}",
        target_id=patient_id,
        target_type="patient",
        action="deeptwin.clinician_note.created",
        role=actor.role,
        actor_id=actor.actor_id,
        note=f"note={note.id}",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    return ClinicianNoteOut(
        id=note.id,
        patient_id=note.patient_id,
        clinician_id=note.clinician_id,
        note_text=note.note_text,
        related_analysis_id=note.related_analysis_id,
        related_simulation_id=note.related_simulation_id,
        created_at=_serialize_dt(note.created_at),
    )


@router.get("/patients/{patient_id}/clinician-notes", response_model=list[ClinicianNoteOut])
def deeptwin_list_clinician_notes(
    patient_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[ClinicianNoteOut]:
    _require_clinician_review_actor(actor)
    _gate_patient_access(actor, patient_id, db)
    notes = db.execute(
        select(DeepTwinClinicianNote)
        .where(DeepTwinClinicianNote.patient_id == patient_id)
        .order_by(DeepTwinClinicianNote.created_at.desc())
    ).scalars().all()
    return [
        ClinicianNoteOut(
            id=n.id,
            patient_id=n.patient_id,
            clinician_id=n.clinician_id,
            note_text=n.note_text,
            related_analysis_id=n.related_analysis_id,
            related_simulation_id=n.related_simulation_id,
            created_at=_serialize_dt(n.created_at),
        )
        for n in notes
    ]
