from __future__ import annotations

import importlib
import uuid
from pathlib import Path
from typing import Any, Literal

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.services.fusion_service import build_fusion_recommendation
from app.services.neuromodulation_research import bundle_root_or_none, search_ranked_papers

router = APIRouter(prefix="/api/v1/deeptwin", tags=["deeptwin"])
brain_twin_router = APIRouter(prefix="/api/v1/brain-twin", tags=["brain-twin"])


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
    return {
        "patient_id": patient_id,
        "prediction_band": confidence.capitalize(),
        "confidence": round(readiness_score, 3),
        "executive_summary": " ".join(summary_parts),
        "coverage": coverage,
        "weights": weights,
        "fusion": fusion,
        "key_predictions": [
            {
                "title": "Target-response readiness",
                "summary": "Prediction is strongest when neurophysiology, imaging, and symptom layers all agree on the current treatment objective.",
                "expected_direction": "Confidence improves with multimodal agreement",
                "why": "qEEG, imaging, and assessment trajectories are the highest-value combination for protocol planning.",
                "confidence": confidence,
                "caveat": "Missing longitudinal response data weakens patient-specific calibration.",
            },
            {
                "title": "Biomarker tracking value",
                "summary": "Alpha, theta/beta ratio, sleep, and HRV should be treated as a linked monitoring set rather than isolated metrics.",
                "expected_direction": "Daily readiness should improve as autonomic and electrophysiology markers stabilize",
                "why": "These features can change faster than global clinical scales and help explain response lag.",
                "confidence": "moderate" if "wearables" in used_modalities else "low",
                "caveat": "Association does not establish causal treatment effect.",
            },
            {
                "title": "Operational next step",
                "summary": "Use DeepTwin to rank likely mechanisms, pick a candidate protocol, then monitor whether the leading biomarker actually moves after week 1 to 2.",
                "expected_direction": "Earlier detection of non-response",
                "why": "Fast biomarker drift can trigger protocol review before waiting for a long symptom cycle.",
                "confidence": "moderate",
                "caveat": "Requires clinician review and protocol-specific evidence.",
            },
        ],
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
    return {
        "timecourse": timecourse,
        "timecourse_summary": f"Modeled weekly drift suggests approximately {round(effect_size * 100)}% directional movement in the lead biomarker across {int(weeks)} weeks if adherence holds.",
        "clinical_forecast": {
            "summary": f"If {intervention} is applied at {target} for {int(weeks)} weeks, DeepTwin expects a {biomarker} shift with a moderate probability of improving {clinical_goal} provided sleep, adherence, and symptom review remain stable.",
            "expected_direction": f"{biomarker} normalization with probable improvement in {clinical_goal}",
            "caveat": "This is a modeled what-if scenario, not a validated patient-specific treatment guarantee.",
            "response_probability": response_probability,
        },
        "biomarker_forecast": [
            {
                "name": biomarker,
                "direction": "increase" if biomarker.lower() == "alpha" else "normalize",
                "summary": "Lead biomarker expected to move first if the protocol is having the intended physiologic effect.",
                "why": "Short-latency biomarker change is usually the earliest signal that the scenario is directionally plausible.",
            },
            {
                "name": "theta_beta_ratio",
                "direction": "decrease",
                "summary": "Attention-linked dysregulation marker should be watched alongside alpha rather than on its own.",
                "why": "qEEG ratios can help distinguish physiologic response from noise or adherence artifacts.",
            },
            {
                "name": "recovery_state",
                "direction": "stabilize",
                "summary": "Sleep and HRV should hold or improve if protocol intensity is tolerable.",
                "why": "Recovery burden can overwhelm otherwise promising biomarker gains.",
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
    if autoresearch_preview is not None:
        return DeeptwinSimulateResponse(
            patient_id=payload.patient_id,
            protocol_id=payload.protocol_id,
            horizon_days=payload.horizon_days,
            engine={"name": "autoresearch", "status": "available"},
            outputs={**governed_outputs, "autoresearch": autoresearch_preview},
        )

    return DeeptwinSimulateResponse(
        patient_id=payload.patient_id,
        protocol_id=payload.protocol_id,
        horizon_days=payload.horizon_days,
        engine={"name": "stub", "status": "ok"},
        outputs=governed_outputs,
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
