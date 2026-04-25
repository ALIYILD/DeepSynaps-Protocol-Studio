from __future__ import annotations

import importlib
import os
import uuid
from pathlib import Path
from typing import Any, Literal

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
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


def _safe_weights(
    modalities: list[ModalityKey],
    combine: str,
    custom_weights: dict[ModalityKey, float] | None,
) -> dict[ModalityKey, float]:
    if not modalities:
        return {}
    if combine != "custom_weights" or not custom_weights:
        w = 1.0 / float(len(modalities))
        return {m: w for m in modalities}
    weights = {m: float(custom_weights.get(m, 0.0)) for m in modalities}
    s = sum(max(v, 0.0) for v in weights.values())
    if s <= 0:
        w = 1.0 / float(len(modalities))
        return {m: w for m in modalities}
    return {m: max(v, 0.0) / s for m, v in weights.items()}


def _try_autoresearch_simulate(inputs: dict[str, Any]) -> dict[str, Any] | None:
    try:
        importlib.import_module("autoresearch")
    except Exception:
        return None
    return {
        "status": "not_implemented",
        "reason": "autoresearch is available but a domain-specific simulator wrapper is not wired yet",
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
        labels = ["sleep_total_min", "hrv_rmssd_ms", "phq9_total", "qeeg_zscore_global", "tbr_fz"]
        seed = abs(hash((payload.patient_id, payload.as_of or "", "corr"))) % (2**31 - 1)
        rng = np.random.default_rng(seed)
        x = rng.normal(size=(max(6, len(labels)), len(labels)))
        c = np.corrcoef(x, rowvar=False)
        c = np.nan_to_num(c, nan=0.0, posinf=0.0, neginf=0.0)
        c = np.clip(c, -1.0, 1.0)
        out.correlation = {"method": "pearson", "labels": labels, "matrix": c.round(4).tolist()}

    if "prediction" in payload.analysis_modes:
        out.prediction = {"fusion": build_fusion_recommendation(session, payload.patient_id)}

    if "causation" in payload.analysis_modes:
        out.causation = {
            "algorithm": "pc_stub",
            "nodes": ["wearables", "assessments", "qeeg", "therapy", "symptoms"],
            "edges": [
                {"from": "therapy", "to": "symptoms", "kind": "hypothesis", "confidence": 0.55},
                {"from": "wearables", "to": "symptoms", "kind": "hypothesis", "confidence": 0.45},
                {"from": "qeeg", "to": "symptoms", "kind": "hypothesis", "confidence": 0.50},
            ],
        }

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

    ar = _try_autoresearch_simulate(inputs)
    if ar is not None:
        return DeeptwinSimulateResponse(
            patient_id=payload.patient_id,
            protocol_id=payload.protocol_id,
            horizon_days=payload.horizon_days,
            engine={"name": "autoresearch", "status": "available"},
            outputs=ar,
        )

    base = abs(hash((payload.patient_id, payload.protocol_id))) % 1000
    rng = np.random.default_rng(base)
    days = list(range(0, payload.horizon_days + 1, 7))
    v = 0.0
    curve = []
    for d in days:
        v += float(rng.normal(loc=-0.15, scale=0.05))
        curve.append({"day": d, "delta_symptom_score": round(v, 3)})

    return DeeptwinSimulateResponse(
        patient_id=payload.patient_id,
        protocol_id=payload.protocol_id,
        horizon_days=payload.horizon_days,
        engine={"name": "stub", "status": "ok"},
        outputs={"timecourse": curve},
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
    st = manifest.stat()
    return f"neuromodulation_bundle:{st.st_mtime_ns}:{st.st_size}"


@router.post("/evidence", response_model=DeeptwinEvidenceResponse)
def deeptwin_evidence(
    payload: DeeptwinEvidenceRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> DeeptwinEvidenceResponse:
    trace_id = str(uuid.uuid4())
    snap = _snapshot_id_for_research_bundle()

    notes: list[str] = [
        "Evidence results are decision-support context only; they do not directly change predictions at runtime.",
        "Citations must be reviewed by a clinician before being used in care decisions.",
    ]
    if snap is None:
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

    q = (payload.question or "").strip()
    # v1: query only by free-text + ranking mode. Future: infer modality/indication filters from patient context.
    papers = search_ranked_papers(q=q, ranking_mode=payload.ranking_mode, limit=payload.limit)

    # PHI boundary: this endpoint returns research metadata only; no patient identifiers beyond patient_id echo.
    return DeeptwinEvidenceResponse(
        patient_id=payload.patient_id,
        trace_id=trace_id,
        index_snapshot_id=snap,
        question=q,
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
    non_responder_flag: bool
    safety_concerns: list[str]
    missing_data: list[str]
    monitoring_plan: list[str]
    evidence_support: list[str]
    evidence_grade: str
    approval_required: bool
    labels: dict[str, bool]
    disclaimer: str


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
    return TwinSummaryOut(**build_twin_summary(patient_id))


@router.get("/patients/{patient_id}/timeline", response_model=TwinTimelineOut)
def deeptwin_get_timeline(
    patient_id: str,
    days: int = 90,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinTimelineOut:
    days = max(7, min(365, days))
    return TwinTimelineOut(**align_timeline_events(patient_id, days=days))


@router.get("/patients/{patient_id}/signals", response_model=TwinSignalsOut)
def deeptwin_get_signals(
    patient_id: str,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinSignalsOut:
    return TwinSignalsOut(**build_signal_matrix(patient_id))


@router.get("/patients/{patient_id}/correlations", response_model=TwinCorrelationsOut)
def deeptwin_get_correlations(
    patient_id: str,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinCorrelationsOut:
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
    return TwinPredictionOut(**estimate_trajectory(patient_id, horizon=horizon))


@router.post("/patients/{patient_id}/simulations", response_model=TwinSimulationOut)
def deeptwin_post_simulation(
    patient_id: str,
    payload: TwinSimulationRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinSimulationOut:
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


@router.post("/patients/{patient_id}/reports", response_model=TwinReportOut)
def deeptwin_post_report(
    patient_id: str,
    payload: TwinReportRequest,
    _actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> TwinReportOut:
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
    result = create_agent_handoff_summary(patient_id, kind=payload.kind, note=payload.note)
    return TwinAgentHandoffOut(**result)

