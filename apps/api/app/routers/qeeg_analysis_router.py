"""qEEG Analysis Pipeline — API endpoints.

Handles EDF file upload, spectral analysis, AI interpretation,
pre/post comparison, prediction, and correlation.
"""
import hashlib
import html as html_mod
import json
import logging
import math
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Form, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.services.consent_enforcement import (
    require_ai_analysis_consent,
    ConsentMissingError,
)
from app.limiter import limiter
from app.persistence.models import (
    AiSummaryAudit,
    Patient,
    QEEGAnalysis,
    QEEGAIReport,
    QEEGComparison,
    QEEGProtocolFit,
    QEEGRecord,
    QEEGReportFinding,
)
from app.repositories.patients import resolve_patient_clinic_id
from app.services.evidence_intelligence import list_saved_citations
from app.settings import get_settings

# ── Phase 3: AI Analysis + Connectivity Engine imports ────────────────────────
from app.services.qeeg_spectral_analysis import (
    FREQUENCY_BANDS,
    full_spectral_analysis,
)
from app.services.qeeg_connectivity import full_connectivity_analysis
from app.services.qeeg_source_localization import full_source_localization
from app.services.qeeg_biomarker_engine import (
    evaluate_biomarkers,
    generate_safe_interpretation,
    get_biomarker_summary,
)
from app.services.mri_qeeg_fusion import (
    get_fusion_summary,
    get_neuromodulation_targets_fused,
)

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/qeeg-analysis", tags=["qeeg-analysis"])


def _gate_patient_access(
    actor: AuthenticatedActor, patient_id: str, db: Session
) -> None:
    """Cross-clinic ownership gate. Real (DB-existing) patients only.

    See ``deeptwin_router._gate_patient_access`` for the rationale on why
    non-existent patient_ids are allowed through (synthetic / demo flows).
    """
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _verify_qeeg_export_governance(db: Session, analysis_id: str) -> QEEGAIReport:
    """Verify the latest report for *analysis_id* is approved and signed.

    Returns the report row on success so callers can reuse it.
    Raises ApiServiceError(409) when the report is not exportable.
    """
    from app.services.qeeg_clinician_review import can_export

    report = (
        db.query(QEEGAIReport)
        .filter_by(analysis_id=analysis_id)
        .order_by(QEEGAIReport.created_at.desc())
        .first()
    )
    if report is None or not can_export(report):
        report_state = getattr(report, "report_state", None) or "MISSING"
        signed_by = getattr(report, "signed_by", None)
        _log.warning(
            "qeeg_export_governance_denied",
            extra={
                "event": "qeeg_export_governance_denied",
                "analysis_id": analysis_id,
                "report_id": getattr(report, "id", None),
                "report_state": report_state,
                "signed_by": signed_by is not None,
            },
        )
        raise ApiServiceError(
            code="export_not_allowed",
            message=(
                f"Report must be approved and signed before export. "
                f"Current state: {report_state}; signed: {bool(signed_by)}"
            ),
            status_code=409,
        )
    return report

# New local recommender (qeeg-pipeline package).
try:  # optional import guard for older deployments
    from deepsynaps_qeeg.recommender import recommend_protocols, summarize_for_recommender
    from deepsynaps_qeeg.recommender.protocols import ProtocolLibrary
except Exception:  # pragma: no cover
    recommend_protocols = None  # type: ignore[assignment]
    summarize_for_recommender = None  # type: ignore[assignment]
    ProtocolLibrary = None  # type: ignore[assignment]
    _log.warning(
        "deepsynaps_qeeg.recommender not available — "
        "qEEG protocol recommendation endpoints will return 503"
    )

# ── Max upload size for EDF files (100 MB) ───────────────────────────────────
_MAX_EDF_BYTES = 100 * 1024 * 1024

# ── Allowed extensions ───────────────────────────────────────────────────────
_ALLOWED_EXTENSIONS = {".edf", ".edf+", ".bdf", ".bdf+", ".eeg"}

# ── Max clinical-context survey JSON size ────────────────────────────────────
# The survey is later inlined verbatim into the LLM prompt by /ai-report, so
# this cap is effectively a per-upload LLM-cost cap. 16 KB is well above any
# realistic v1-schema submission while staying inside Anthropic's prompt
# budget for the rest of the report.
_MAX_SURVEY_JSON_BYTES = 16 * 1024

# ── EDF magic bytes check ────────────────────────────────────────────────────
_EDF_MAGIC = b"0       "  # EDF files start with "0" followed by 7 spaces


# ── Response Models ──────────────────────────────────────────────────────────

def _maybe_json_loads(raw: Optional[str]) -> Optional[object]:
    """Best-effort JSON decode. Returns None on missing / malformed input.

    Used by :meth:`AnalysisOut.from_record` to tolerate rows written by older
    pipeline versions (or manually-edited rows) without blowing up the whole
    analysis fetch.
    """
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        _log.warning("Failed to JSON-decode analysis column; returning None")
        return None


def _maybe_ai_embedding_loads(raw: Optional[str]) -> Optional[list[float]]:
    """Decode ``embedding_json`` into a ``list[float]`` or return None."""
    decoded = _maybe_json_loads(raw)
    if decoded is None:
        return None
    # Accept either a raw list or ``{"embedding": [...]}`` wrapper from the
    # LaBraM encoder façade.
    candidate: object
    if isinstance(decoded, dict):
        candidate = decoded.get("embedding")
    else:
        candidate = decoded
    if not isinstance(candidate, list):
        return None
    try:
        return [float(v) for v in candidate]
    except (TypeError, ValueError):
        return None


def _maybe_ai_list_loads(raw: Optional[str]) -> Optional[list[dict]]:
    """Decode ``similar_cases_json`` into a ``list[dict]`` or return None."""
    decoded = _maybe_json_loads(raw)
    if isinstance(decoded, list):
        return [d for d in decoded if isinstance(d, dict)]
    return None


class AnalysisOut(BaseModel):
    id: str
    qeeg_record_id: Optional[str] = None
    patient_id: str
    clinician_id: str
    original_filename: Optional[str] = None
    file_size_bytes: Optional[int] = None
    recording_duration_sec: Optional[float] = None
    sample_rate_hz: Optional[float] = None
    channels: Optional[list[str]] = None
    channel_count: Optional[int] = None
    recording_date: Optional[str] = None
    eyes_condition: Optional[str] = None
    equipment: Optional[str] = None
    analysis_status: str
    analysis_error: Optional[str] = None
    band_powers: Optional[dict] = None
    artifact_rejection: Optional[dict] = None
    advanced_analyses: Optional[dict] = None
    # ── MNE pipeline outputs (CONTRACT.md §3) ──────────────────────────────
    aperiodic: Optional[dict] = None
    peak_alpha_freq: Optional[dict] = None
    connectivity: Optional[dict] = None
    asymmetry: Optional[dict] = None
    graph_metrics: Optional[dict] = None
    source_roi: Optional[dict] = None
    normative_zscores: Optional[dict] = None
    flagged_conditions: Optional[list[str]] = None
    quality_metrics: Optional[dict] = None
    pipeline_version: Optional[str] = None
    norm_db_version: Optional[str] = None
    # ── AI upgrades (CONTRACT_V2.md §3) ────────────────────────────────────
    embedding: Optional[list[float]] = None
    brain_age: Optional[dict] = None
    risk_scores: Optional[dict] = None
    centiles: Optional[dict] = None
    explainability: Optional[dict] = None
    similar_cases: Optional[list[dict]] = None
    protocol_recommendation: Optional[dict] = None
    longitudinal: Optional[dict] = None
    session_number: Optional[int] = None
    days_from_baseline: Optional[int] = None
    execution_mode: Optional[str] = None
    queue_job_id: Optional[str] = None
    analyzed_at: Optional[str] = None
    created_at: str

    @classmethod
    def from_record(cls, r: QEEGAnalysis) -> "AnalysisOut":
        # The new MNE columns were added in migration 037. Rows persisted
        # before the migration ran (or by the legacy analyze endpoint) will
        # simply have NULL values — decode them defensively.
        flagged_raw = _maybe_json_loads(getattr(r, "flagged_conditions", None))
        flagged_list: Optional[list[str]]
        if isinstance(flagged_raw, list):
            flagged_list = [str(x) for x in flagged_raw]
        else:
            flagged_list = None
        params = _maybe_json_loads(getattr(r, "analysis_params_json", None))
        queue_meta = params if isinstance(params, dict) else {}

        return cls(
            id=r.id,
            qeeg_record_id=r.qeeg_record_id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            original_filename=r.original_filename,
            file_size_bytes=r.file_size_bytes,
            recording_duration_sec=r.recording_duration_sec,
            sample_rate_hz=r.sample_rate_hz,
            channels=_maybe_json_loads(r.channels_json),
            channel_count=r.channel_count,
            recording_date=r.recording_date,
            eyes_condition=r.eyes_condition,
            equipment=r.equipment,
            analysis_status=r.analysis_status,
            analysis_error=r.analysis_error,
            band_powers=_maybe_json_loads(r.band_powers_json),
            artifact_rejection=_maybe_json_loads(r.artifact_rejection_json),
            advanced_analyses=_maybe_json_loads(getattr(r, "advanced_analyses_json", None)),
            aperiodic=_maybe_json_loads(getattr(r, "aperiodic_json", None)),
            peak_alpha_freq=_maybe_json_loads(getattr(r, "peak_alpha_freq_json", None)),
            connectivity=_maybe_json_loads(getattr(r, "connectivity_json", None)),
            asymmetry=_maybe_json_loads(getattr(r, "asymmetry_json", None)),
            graph_metrics=_maybe_json_loads(getattr(r, "graph_metrics_json", None)),
            source_roi=_maybe_json_loads(getattr(r, "source_roi_json", None)),
            normative_zscores=_maybe_json_loads(getattr(r, "normative_zscores_json", None)),
            flagged_conditions=flagged_list,
            quality_metrics=_maybe_json_loads(getattr(r, "quality_metrics_json", None)),
            pipeline_version=getattr(r, "pipeline_version", None),
            norm_db_version=getattr(r, "norm_db_version", None),
            # ── Migration 038 AI upgrades (CONTRACT_V2 §3) ──────────────
            # All nullable; legacy rows will surface None for each field.
            embedding=_maybe_ai_embedding_loads(getattr(r, "embedding_json", None)),
            brain_age=_maybe_json_loads(getattr(r, "brain_age_json", None)),
            risk_scores=_maybe_json_loads(getattr(r, "risk_scores_json", None)),
            centiles=_maybe_json_loads(getattr(r, "centiles_json", None)),
            explainability=_maybe_json_loads(getattr(r, "explainability_json", None)),
            similar_cases=_maybe_ai_list_loads(getattr(r, "similar_cases_json", None)),
            protocol_recommendation=_maybe_json_loads(
                getattr(r, "protocol_recommendation_json", None)
            ),
            longitudinal=_maybe_json_loads(getattr(r, "longitudinal_json", None)),
            session_number=getattr(r, "session_number", None),
            days_from_baseline=getattr(r, "days_from_baseline", None),
            execution_mode=queue_meta.get("execution_mode"),
            queue_job_id=queue_meta.get("job_id"),
            analyzed_at=r.analyzed_at.isoformat() if r.analyzed_at else None,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )


class AnalysisListResponse(BaseModel):
    items: list[AnalysisOut]
    total: int


class AIReportOut(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    id: str
    analysis_id: str
    report_type: str
    ai_narrative: Optional[dict] = None
    clinical_impressions: Optional[str] = None
    condition_matches: Optional[list] = None
    protocol_suggestions: Optional[list] = None
    literature_refs: Optional[list] = None
    model_used: Optional[str] = None
    confidence_note: Optional[str] = None
    clinician_reviewed: bool
    clinician_amendments: Optional[str] = None
    report_state: Optional[str] = None
    reviewer_id: Optional[str] = None
    model_version: Optional[str] = None
    prompt_version: Optional[str] = None
    report_version: Optional[str] = None
    claim_governance: Optional[list] = None
    signed_by: Optional[str] = None
    signed_at: Optional[str] = None
    created_at: str

    @classmethod
    def from_record(cls, r: QEEGAIReport) -> "AIReportOut":
        return cls(
            id=r.id,
            analysis_id=r.analysis_id,
            report_type=r.report_type,
            ai_narrative=json.loads(r.ai_narrative_json) if r.ai_narrative_json else None,
            clinical_impressions=r.clinical_impressions,
            condition_matches=json.loads(r.condition_matches_json) if r.condition_matches_json else None,
            protocol_suggestions=json.loads(r.protocol_suggestions_json) if r.protocol_suggestions_json else None,
            literature_refs=json.loads(r.literature_refs_json) if r.literature_refs_json else None,
            model_used=r.model_used,
            confidence_note=r.confidence_note,
            clinician_reviewed=r.clinician_reviewed,
            clinician_amendments=r.clinician_amendments,
            report_state=r.report_state,
            reviewer_id=r.reviewer_id,
            model_version=r.model_version,
            prompt_version=r.prompt_version,
            report_version=r.report_version,
            claim_governance=json.loads(r.claim_governance_json) if r.claim_governance_json else None,
            signed_by=r.signed_by,
            signed_at=r.signed_at.isoformat() if r.signed_at else None,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )


class ReportStateTransitionIn(BaseModel):
    action: str
    note: Optional[str] = None


class ReportFindingUpdateIn(BaseModel):
    status: str
    clinician_note: Optional[str] = None
    amended_text: Optional[str] = None


class SafetyCockpitOut(BaseModel):
    checks: list[dict]
    red_flags: list[dict]
    overall_status: str
    disclaimer: str


class RedFlagsOut(BaseModel):
    flags: list[dict]
    flag_count: int
    high_severity_count: int
    disclaimer: str


class NormativeModelCardOut(BaseModel):
    status: Optional[str] = None
    normative_db_name: Optional[str] = None
    normative_db_version: Optional[str] = None
    age_range: Optional[str] = None
    eyes_condition_compatible: Optional[bool] = None
    montage_compatible: Optional[bool] = None
    zscore_method: Optional[str] = None
    confidence_interval: Optional[str] = None
    ood_warning: Optional[str] = None
    clinical_caveat: Optional[str] = None
    limitations: list[str] = Field(default_factory=list)
    complete: bool = False
    # Canonical recording state for normative matching (UI + API contract; PR2 scaffold).
    recording_condition: Optional[str] = Field(
        default=None,
        description="eyes_closed | eyes_open | task | unknown — resolved from analysis.eyes_condition",
    )
    # Provider identity for transparency; never implies licensed clinical normative clearance.
    normative_provider: Optional[dict] = Field(
        default=None,
        description="Metadata: type (demo|licensed|research|unavailable), name, version, clinical_use, disclaimer",
    )


def _resolve_recording_condition(eyes: Optional[str]) -> str:
    """Map persisted eyes_condition strings to a small canonical vocabulary."""
    if not eyes:
        return "unknown"
    s = str(eyes).strip().lower()
    if s in ("closed", "eyes_closed", "ec", "eye_closed", "eyes closed"):
        return "eyes_closed"
    if s in ("open", "eyes_open", "eo", "eye_open", "eyes open"):
        return "eyes_open"
    if s in ("task", "other", "mixed", "both", "eyes_mixed"):
        return "task"
    return "unknown"


def _normative_provider_payload(norm_db: Optional[str], status: Optional[str]) -> dict:
    key = (norm_db or "unknown").strip().lower()
    st = (status or "").strip().lower()
    if st == "unavailable" or key == "unknown":
        return {
            "type": "unavailable",
            "name": "No normative provider configured",
            "version": "n/a",
            "clinical_use": False,
            "disclaimer": (
                "Normative scoring metadata unavailable; treat quantitative outputs as "
                "analysis-only until a disclosed provider is configured. Decision-support only."
            ),
        }
    if st == "toy" or "toy" in key:
        return {
            "type": "demo",
            "name": "Demo synthetic model",
            "version": norm_db or "toy",
            "clinical_use": False,
            "disclaimer": "Synthetic demo reference only; not clinical normative scoring.",
        }
    return {
        "type": "research",
        "name": "Configured normative reference",
        "version": norm_db or "unspecified",
        "clinical_use": False,
        "disclaimer": (
            "Decision-support only; verify database provenance, eyes-state match, and local policy "
            "before clinical use."
        ),
    }


def _normative_card_defaults(norm_db: str) -> NormativeModelCardOut:
    norm_key = (norm_db or "unknown").strip().lower()
    if norm_key == "toy-0.1" or "toy" in norm_key:
        return NormativeModelCardOut(
            status="toy",
            normative_db_name="DeepSynaps Toy Normative",
            normative_db_version=norm_db or "toy-0.1",
            age_range="Fixture / preview dataset",
            eyes_condition_compatible=None,
            montage_compatible=True,
            zscore_method="Preview z-score reference fixture",
            confidence_interval="95%",
            ood_warning="Out-of-distribution detection not configured for this preview normative database.",
            clinical_caveat=(
                "Toy normative database only. Decision-support only. Do not treat these z-scores "
                "or percentile-style comparisons as clinically validated reference values."
            ),
            limitations=[
                "Preview/toy normative data only; not validated for clinical normative interpretation.",
                "Z-scores are descriptive, not diagnostic.",
            ],
            complete=False,
        )
    if norm_key == "unknown":
        return NormativeModelCardOut(
            status="unavailable",
            normative_db_name="DeepSynaps Normative",
            normative_db_version="unknown",
            age_range="Not available",
            eyes_condition_compatible=None,
            montage_compatible=True,
            zscore_method="Unavailable",
            confidence_interval="—",
            ood_warning="Normative database metadata not available for this analysis.",
            clinical_caveat=(
                "No normative database detected for this analysis. Decision-support only. "
                "Clinician review required."
            ),
            limitations=[
                "Normative database metadata is unavailable for this analysis.",
                "Z-scores are descriptive, not diagnostic.",
            ],
            complete=False,
        )
    return NormativeModelCardOut(
        status="configured",
        normative_db_name="DeepSynaps Normative",
        normative_db_version=norm_db,
        age_range="18–65 years (default)",
        eyes_condition_compatible=None,
        montage_compatible=True,
        zscore_method="Configured deployment normative model",
        confidence_interval="95%",
        ood_warning="Out-of-distribution detection not configured for this normative database.",
        clinical_caveat=(
            "Decision-support only. Normative outputs depend on the configured reference database "
            "and require clinician review."
        ),
        limitations=[
            "Normative data may not represent the patient's specific demographic.",
            "Z-scores are descriptive, not diagnostic.",
        ],
        complete=False,
    )


class ProtocolFitOut(BaseModel):
    id: str
    analysis_id: str
    pattern_summary: str
    symptom_linkage: Optional[dict] = None
    contraindications: list[str] = Field(default_factory=list)
    evidence_grade: Optional[str] = None
    off_label_flag: bool = False
    candidate_protocol: Optional[dict] = None
    alternative_protocols: list[dict] = Field(default_factory=list)
    match_rationale: Optional[str] = None
    caution_rationale: Optional[str] = None
    required_checks: list[str] = Field(default_factory=list)
    clinician_reviewed: bool = False


class TimelineEventOut(BaseModel):
    date: str
    event_type: str
    title: str
    summary: str
    status: str
    rci: Optional[float] = None
    confounders: list[str] = Field(default_factory=list)
    ai_explanation: Optional[str] = None
    confidence: Optional[str] = None
    source: str


class ComparisonOut(BaseModel):
    id: str
    patient_id: str
    baseline_analysis_id: str
    followup_analysis_id: str
    comparison_type: str
    delta_powers: Optional[dict] = None
    improvement_summary: Optional[dict] = None
    ai_comparison_narrative: Optional[str] = None
    baseline_analyzed_at: Optional[str] = None
    followup_analyzed_at: Optional[str] = None
    baseline_band_powers: Optional[dict] = None
    followup_band_powers: Optional[dict] = None
    ratio_changes: Optional[dict] = None
    rci_summary: Optional[dict] = None
    highlighted_changes: list[dict] = Field(default_factory=list)
    created_at: str

    @classmethod
    def from_record(cls, r: QEEGComparison) -> "ComparisonOut":
        return cls(
            id=r.id,
            patient_id=r.patient_id,
            baseline_analysis_id=r.baseline_analysis_id,
            followup_analysis_id=r.followup_analysis_id,
            comparison_type=r.comparison_type,
            delta_powers=json.loads(r.delta_powers_json) if r.delta_powers_json else None,
            improvement_summary=json.loads(r.improvement_summary_json) if r.improvement_summary_json else None,
            ai_comparison_narrative=r.ai_comparison_narrative,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )


def _extract_ratio_changes(
    baseline: Optional[dict],
    followup: Optional[dict],
) -> dict[str, dict[str, float]]:
    baseline = baseline or {}
    followup = followup or {}
    bands_a = (baseline.get("bands") or {}) if isinstance(baseline, dict) else {}
    bands_b = (followup.get("bands") or {}) if isinstance(followup, dict) else {}

    def _mean_relative(bands: dict, band_name: str) -> Optional[float]:
        channels = ((bands.get(band_name) or {}).get("channels") or {}) if isinstance(bands, dict) else {}
        values = []
        for payload in channels.values():
            if isinstance(payload, dict) and payload.get("relative_pct") is not None:
                try:
                    values.append(float(payload["relative_pct"]))
                except (TypeError, ValueError):
                    continue
        if not values:
            return None
        return sum(values) / len(values)

    def _ratio(theta: Optional[float], beta: Optional[float]) -> Optional[float]:
        if theta is None or beta in (None, 0):
            return None
        try:
            return float(theta) / float(beta)
        except (TypeError, ValueError, ZeroDivisionError):
            return None

    ratios: dict[str, dict[str, float]] = {}
    theta_a = _mean_relative(bands_a, "theta")
    beta_a = _mean_relative(bands_a, "beta")
    theta_b = _mean_relative(bands_b, "theta")
    beta_b = _mean_relative(bands_b, "beta")
    tbr_a = _ratio(theta_a, beta_a)
    tbr_b = _ratio(theta_b, beta_b)
    if tbr_a is not None and tbr_b is not None:
        ratios["theta_beta_ratio"] = {"baseline": round(tbr_a, 4), "followup": round(tbr_b, 4)}

    delta_a = _mean_relative(bands_a, "delta")
    alpha_a = _mean_relative(bands_a, "alpha")
    delta_b = _mean_relative(bands_b, "delta")
    alpha_b = _mean_relative(bands_b, "alpha")
    dar_a = _ratio(delta_a, alpha_a)
    dar_b = _ratio(delta_b, alpha_b)
    if dar_a is not None and dar_b is not None:
        ratios["delta_alpha_ratio"] = {"baseline": round(dar_a, 4), "followup": round(dar_b, 4)}

    return ratios


def _band_powers_relative_map(band_powers: Optional[dict]) -> dict[str, dict[str, float]]:
    """Best-effort conversion of legacy band_powers_json into per-channel relative maps.

    Returns
    -------
    dict
        band -> {channel -> relative_fraction}
    """
    if not isinstance(band_powers, dict):
        return {}
    bands = band_powers.get("bands")
    if not isinstance(bands, dict):
        return {}
    out: dict[str, dict[str, float]] = {}
    for band, payload in bands.items():
        if not isinstance(payload, dict):
            continue
        channels = payload.get("channels")
        if not isinstance(channels, dict):
            continue
        rel_map: dict[str, float] = {}
        for ch, ch_payload in channels.items():
            if not isinstance(ch_payload, dict):
                continue
            # apps/api band_powers store relative_pct on each channel.
            rel_pct = ch_payload.get("relative_pct")
            try:
                if rel_pct is None:
                    continue
                rel_map[str(ch)] = float(rel_pct) / 100.0
            except (TypeError, ValueError):
                continue
        if rel_map:
            out[str(band)] = rel_map
    return out


def _build_rci_summary(improvement_summary: Optional[dict]) -> Optional[dict]:
    if not isinstance(improvement_summary, dict):
        return None
    improved = int(improvement_summary.get("improved") or 0)
    worsened = int(improvement_summary.get("worsened") or 0)
    unchanged = int(improvement_summary.get("unchanged") or 0)
    total = improved + worsened + unchanged
    if total <= 0:
        # Legacy comparisons can omit RCI tallies. Return a well-shaped
        # "stable" envelope so clients don't have to null-check.
        return {
            "label": "largely stable",
            "net_response_index": 0.0,
            "improved_share": 0.0,
            "worsened_share": 0.0,
        }
    net = (improved - worsened) / total
    if net >= 0.2:
        label = "meaningful improvement"
    elif net <= -0.2:
        label = "possible worsening"
    else:
        label = "largely stable"
    return {
        "label": label,
        "net_response_index": round(net, 3),
        "improved_share": round(improved / total, 3),
        "worsened_share": round(worsened / total, 3),
    }


def _build_highlighted_changes(delta_payload: Optional[dict]) -> list[dict]:
    bands = (delta_payload or {}).get("bands") if isinstance(delta_payload, dict) else None
    if not isinstance(bands, dict):
        return []
    changes: list[dict] = []
    for band_name, channels in bands.items():
        if not isinstance(channels, dict):
            continue
        for channel, payload in channels.items():
            if not isinstance(payload, dict):
                continue
            pct_change = payload.get("pct_change")
            if pct_change is None:
                continue
            try:
                pct_val = float(pct_change)
            except (TypeError, ValueError):
                continue
            changes.append({
                "band": band_name,
                "channel": channel,
                "pct_change": round(pct_val, 2),
                "absolute_change": payload.get("absolute_change"),
            })
    changes.sort(key=lambda item: abs(item["pct_change"]), reverse=True)
    return changes[:8]


def _enrich_comparison_payload(
    comp: QEEGComparison,
    baseline: Optional[QEEGAnalysis],
    followup: Optional[QEEGAnalysis],
) -> ComparisonOut:
    payload = ComparisonOut.from_record(comp)
    delta = payload.delta_powers or {}
    summary = payload.improvement_summary or {}
    base_bp = _maybe_json_loads(getattr(baseline, "band_powers_json", None)) if baseline else None
    follow_bp = _maybe_json_loads(getattr(followup, "band_powers_json", None)) if followup else None
    return payload.model_copy(update={
        "baseline_analyzed_at": baseline.analyzed_at.isoformat() if baseline and baseline.analyzed_at else None,
        "followup_analyzed_at": followup.analyzed_at.isoformat() if followup and followup.analyzed_at else None,
        "baseline_band_powers": base_bp,
        "followup_band_powers": follow_bp,
        "ratio_changes": _extract_ratio_changes(base_bp, follow_bp),
        "rci_summary": _build_rci_summary(summary),
        "highlighted_changes": _build_highlighted_changes(delta),
    })


# ── Channel anatomy lookup ───────────────────────────────────────────────────
try:
    from deepsynaps_qeeg.knowledge.channel_anatomy import explain_channel
except Exception:  # pragma: no cover
    explain_channel = None  # type: ignore[assignment]

_LEGACY_CHANNEL_MAP = {"T3": "T7", "T4": "T8", "T5": "P7", "T6": "P8"}

def _normalize_channel_name(name: str) -> str:
    """Strip reference suffixes (-Av, -Ref, -Cz, etc.), title-case, and map legacy 10-20 names."""
    base = name.strip()
    for suffix in ("-Av", "-Ref", "-Cz", "-A1", "-A2", "-M1", "-M2", "-Avg", "-Average"):
        if base.upper().endswith(suffix.upper()):
            base = base[: -len(suffix)]
            break
    # Title-case: FP1 → Fp1, CZ → Cz
    base = base[:1].upper() + base[1:].lower() if len(base) > 1 else base.upper()
    # Map legacy T3/T4/T5/T6 → modern T7/T8/P7/P8
    return _LEGACY_CHANNEL_MAP.get(base, base)

class ChannelAnatomyResponse(BaseModel):
    channel: str
    cortical_region: str
    brodmann_areas: str
    functional_networks: str
    common_artifacts: str
    clinical_relevance: str
    notes: str

@router.get("/channel-anatomy/{channel_name}", response_model=ChannelAnatomyResponse)
async def channel_anatomy(
    channel_name: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ChannelAnatomyResponse:
    """Return functional anatomy, Brodmann areas, networks and artifacts for a 10-20 channel."""
    if explain_channel is None:
        raise ApiServiceError("Channel anatomy knowledge module not available", status_code=503)
    normalized = _normalize_channel_name(channel_name)
    data = explain_channel(normalized)
    if data is None:
        raise ApiServiceError(f"Unknown channel: {channel_name}", status_code=404)
    return ChannelAnatomyResponse(**data)


# ── Upload EDF File ──────────────────────────────────────────────────────────

@router.post("/upload", response_model=AnalysisOut, status_code=201)
async def upload_edf(
    file: UploadFile,
    patient_id: str = Form(...),
    recording_date: Optional[str] = Form(default=None),
    eyes_condition: Optional[str] = Form(default=None),
    equipment: Optional[str] = Form(default=None),
    course_id: Optional[str] = Form(default=None),
    survey_json: Optional[str] = Form(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnalysisOut:
    """Upload an EDF/BDF/EEG file for qEEG analysis.

    Optional ``survey_json`` carries the frontend clinical-context survey
    (schema ``deepsynaps.qeeg_clinical_context.v1``). When supplied, it is
    wrapped in stable delimiters and stored on the linked QEEGRecord so
    :func:`generate_ai_report_endpoint` can surface it to the LLM.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    # Validate file extension
    filename = file.filename or "recording.edf"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise ApiServiceError(
            code="invalid_file_type",
            message=f"Unsupported file type '{ext}'. Accepted: {', '.join(sorted(_ALLOWED_EXTENSIONS))}",
            status_code=422,
        )

    # Read file
    file_bytes = await file.read()
    if len(file_bytes) > _MAX_EDF_BYTES:
        raise ApiServiceError(
            code="file_too_large",
            message=f"File exceeds maximum size of {_MAX_EDF_BYTES // (1024*1024)} MB",
            status_code=422,
        )

    if len(file_bytes) < 256:
        raise ApiServiceError(
            code="file_too_small",
            message="File appears to be empty or corrupt",
            status_code=422,
        )

    # Validate EDF magic bytes (for .edf files)
    if ext in (".edf", ".edf+") and not file_bytes[:8].startswith(b"0"):
        raise ApiServiceError(
            code="invalid_edf",
            message="File does not appear to be a valid EDF file (bad header)",
            status_code=422,
        )

    # Save file
    settings = get_settings()
    from app.services import media_storage

    upload_id = str(uuid.uuid4())
    file_ref = await media_storage.save_upload(
        patient_id=patient_id,
        upload_id=upload_id,
        file_bytes=file_bytes,
        extension=ext.lstrip("."),
        settings=settings,
    )

    # If the caller supplied a clinical-context survey, validate and wrap it
    # in stable delimiters so /ai-report can recover it verbatim later.
    wrapped_survey_notes: Optional[str] = None
    if survey_json:
        # Hard cap on survey size — the field is later inlined verbatim into
        # the LLM prompt by /ai-report, so an attacker who can submit a
        # 5 MB survey blob can drive arbitrary token spend per analysis.
        # 16 KB is well above any realistic clinical-context survey.
        if len(survey_json) > _MAX_SURVEY_JSON_BYTES:
            raise ApiServiceError(
                code="survey_too_large",
                message=(
                    f"survey_json exceeds {_MAX_SURVEY_JSON_BYTES} bytes; "
                    "trim non-essential free-text before resubmitting."
                ),
                status_code=422,
            )

        from app.services.qeeg_context_extractor import wrap_qeeg_context

        try:
            wrapped_survey_notes = wrap_qeeg_context(survey_json)
        except ValueError as exc:
            raise ApiServiceError(
                code="invalid_survey_json",
                message=f"survey_json is not valid JSON: {exc}",
                status_code=422,
            )

    # Create a linked QEEGRecord (for backward compatibility)
    qeeg_record = QEEGRecord(
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        course_id=course_id,
        recording_type="resting",
        recording_date=recording_date,
        equipment=equipment,
        eyes_condition=eyes_condition,
        raw_data_ref=file_ref,
        summary_notes=wrapped_survey_notes,
    )
    db.add(qeeg_record)
    db.flush()

    # Create analysis record
    analysis = QEEGAnalysis(
        id=upload_id,
        qeeg_record_id=qeeg_record.id,
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        file_ref=file_ref,
        original_filename=filename,
        file_size_bytes=len(file_bytes),
        recording_date=recording_date,
        eyes_condition=eyes_condition,
        equipment=equipment,
        course_id=course_id,
        analysis_status="pending",
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    # Log without raw patient_id — short SHA prefix lets ops correlate
    # records via the audit table without writing PHI to disk.
    _log.info(
        "EDF uploaded: %s (%d bytes) patient=%s",
        filename,
        len(file_bytes),
        hashlib.sha256(patient_id.encode("utf-8")).hexdigest()[:12],
    )
    return AnalysisOut.from_record(analysis)


# ── Trigger Analysis ─────────────────────────────────────────────────────────

@router.post("/{analysis_id}/analyze", response_model=AnalysisOut)
async def analyze_edf(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnalysisOut:
    """Trigger spectral analysis on an uploaded EDF file."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    _gate_patient_access(actor, analysis.patient_id, db)

    if analysis.analysis_status == "completed":
        return AnalysisOut.from_record(analysis)

    # Enforce ai_analysis consent
    try:
        require_ai_analysis_consent(db, analysis.patient_id, actor, ai_modality="qeeg")
    except ConsentMissingError:
        raise ApiServiceError(code="consent_missing", message="ai_analysis consent required", status_code=403)

    # Update status with step indicator
    analysis.analysis_status = "processing:loading"
    db.commit()

    try:
        # Step 1: Load file
        settings = get_settings()
        from app.services import media_storage

        file_bytes = await media_storage.read_upload(analysis.file_ref, settings)

        # Step 2: Parse EDF
        analysis.analysis_status = "processing:parsing"
        db.commit()

        from app.services.edf_parser import parse_edf_file, extract_eeg_channels

        parse_result = parse_edf_file(file_bytes, analysis.original_filename or "recording.edf")

        if not parse_result["success"]:
            analysis.analysis_status = "failed"
            analysis.analysis_error = parse_result["error"]
            db.commit()
            return AnalysisOut.from_record(analysis)

        raw = parse_result["raw"]
        channel_map = parse_result["channel_map"]

        # Update metadata
        analysis.sample_rate_hz = parse_result["sample_rate_hz"]
        analysis.recording_duration_sec = parse_result["duration_sec"]
        analysis.channels_json = json.dumps(parse_result["standard_channels"])
        analysis.channel_count = len(parse_result["standard_channels"])

        # Step 3: Extract standard 10-20 channels
        raw_eeg = extract_eeg_channels(raw, channel_map)

        # Step 4: Artifact rejection
        analysis.analysis_status = "processing:artifact_rejection"
        db.commit()

        from app.services.spectral_analysis import apply_artifact_rejection, compute_band_powers

        cleaned_raw, artifact_stats = apply_artifact_rejection(raw_eeg)
        analysis.artifact_rejection_json = json.dumps(artifact_stats)

        # Step 5: Compute band powers
        analysis.analysis_status = "processing:spectral_analysis"
        db.commit()

        band_powers = compute_band_powers(cleaned_raw)
        analysis.band_powers_json = json.dumps(band_powers)
        analysis.analysis_params_json = json.dumps({
            "epoch_length_sec": 2.0,
            "artifact_threshold_uv": 100.0,
            "bands": {"delta": [0.5, 4], "theta": [4, 8], "alpha": [8, 12], "beta": [12, 30], "gamma": [30, 45]},
        })

        # Step 6: Update linked QEEGRecord findings
        analysis.analysis_status = "processing:finalizing"
        db.commit()

        if analysis.qeeg_record_id:
            qeeg_record = db.query(QEEGRecord).filter_by(id=analysis.qeeg_record_id).first()
            if qeeg_record:
                # Store a compact summary in the existing findings_json
                summary = {
                    "source": "edf_analysis",
                    "analysis_id": analysis.id,
                    "global_summary": band_powers.get("global_summary", {}),
                    "derived_ratios": band_powers.get("derived_ratios", {}),
                }
                qeeg_record.findings_json = json.dumps(summary)

        analysis.analysis_status = "completed"
        analysis.analyzed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(analysis)

        _log.info(
            "Analysis completed: %s, %d channels, %.1fs duration",
            analysis_id,
            analysis.channel_count or 0,
            analysis.recording_duration_sec or 0,
        )
        return AnalysisOut.from_record(analysis)

    except Exception as exc:
        _log.exception("Analysis failed for %s", analysis_id)
        analysis.analysis_status = "failed"
        analysis.analysis_error = str(exc)[:500]
        db.commit()
        return AnalysisOut.from_record(analysis)


# ── Run Advanced Analyses ────────────────────────────────────────────────────

@router.post("/{analysis_id}/run-advanced", response_model=AnalysisOut)
async def run_advanced_analyses_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnalysisOut:
    """Run all 25 advanced analyses on a completed qEEG analysis.

    Requires the basic spectral analysis to be completed first.
    Results are stored in the advanced_analyses_json column.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    if analysis.analysis_status != "completed" or not analysis.band_powers_json:
        raise ApiServiceError(
            code="analysis_not_ready",
            message="Basic spectral analysis must be completed before running advanced analyses",
            status_code=400,
        )

    try:
        # Load file
        settings = get_settings()
        from app.services import media_storage

        file_bytes = await media_storage.read_upload(analysis.file_ref, settings)

        # Parse EDF
        from app.services.edf_parser import parse_edf_file, extract_eeg_channels

        parse_result = parse_edf_file(file_bytes, analysis.original_filename or "recording.edf")
        if not parse_result["success"]:
            raise ApiServiceError(
                code="parse_failed",
                message=f"EDF re-parse failed: {parse_result.get('error', 'unknown')}",
                status_code=500,
            )

        raw = parse_result["raw"]
        channel_map = parse_result["channel_map"]
        raw_eeg = extract_eeg_channels(raw, channel_map)

        # Apply artifact rejection (same as basic analysis)
        from app.services.spectral_analysis import apply_artifact_rejection

        cleaned_raw, _ = apply_artifact_rejection(raw_eeg)

        # Load existing band powers
        band_powers = json.loads(analysis.band_powers_json)

        # Run advanced analyses
        from app.services.analyses import run_advanced_analyses

        advanced_result = run_advanced_analyses(cleaned_raw, band_powers)

        # Store results
        analysis.advanced_analyses_json = json.dumps(advanced_result)
        db.commit()
        db.refresh(analysis)

        _log.info(
            "Advanced analyses completed for %s: %d/%d ok in %.1fs",
            analysis_id,
            advanced_result["meta"]["completed"],
            advanced_result["meta"]["total"],
            advanced_result["meta"]["duration_sec"],
        )
        return AnalysisOut.from_record(analysis)

    except ApiServiceError:
        raise
    except Exception as exc:
        _log.exception("Advanced analyses failed for %s", analysis_id)
        raise ApiServiceError(
            code="advanced_analysis_failed",
            message=f"Advanced analyses failed: {str(exc)[:300]}",
            status_code=500,
        )


# ── MNE Pipeline (sibling deepsynaps_qeeg package) ───────────────────────────


@router.post("/{analysis_id}/analyze-mne", response_model=AnalysisOut)
async def analyze_edf_mne(
    analysis_id: str,
    background_tasks: BackgroundTasks,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnalysisOut:
    """Queue the MNE-backed qEEG pipeline and return the processing row."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    _gate_patient_access(actor, analysis.patient_id, db)

    # Enforce ai_analysis consent
    try:
        require_ai_analysis_consent(db, analysis.patient_id, actor, ai_modality="qeeg")
    except ConsentMissingError:
        raise ApiServiceError(code="consent_missing", message="ai_analysis consent required", status_code=403)

    analysis.analysis_status = "processing:mne_pipeline"
    analysis.analysis_error = None
    queue_meta: dict[str, object] = {}

    try:
        from app.services.qeeg_pipeline_job import run_mne_pipeline_job_sync
    except Exception as exc:
        _log.exception("MNE pipeline job import failed for %s", analysis_id)
        analysis.analysis_status = "failed"
        analysis.analysis_error = str(exc)[:500]
        db.commit()
        db.refresh(analysis)
        return AnalysisOut.from_record(analysis)

    run_mne_pipeline_job = None
    try:
        from app.jobs import run_mne_pipeline_job as _run_mne_pipeline_job

        run_mne_pipeline_job = _run_mne_pipeline_job
    except Exception as exc:
        _log.info(
            "Worker queue unavailable for %s, using background task fallback: %s",
            analysis_id,
            exc,
        )

    if run_mne_pipeline_job is not None and hasattr(run_mne_pipeline_job, "delay"):
        try:
            queued = run_mne_pipeline_job.delay(analysis_id)
            queue_meta = {
                "execution_mode": "celery",
                "job_id": getattr(queued, "id", None),
            }
        except Exception as exc:
            _log.warning("Celery enqueue failed for %s, falling back to background task: %s", analysis_id, exc)
            queue_meta = {
                "execution_mode": "background",
                "job_id": None,
            }
            background_tasks.add_task(run_mne_pipeline_job_sync, analysis_id)
    else:
        queue_meta = {
            "execution_mode": "background",
            "job_id": None,
        }
        background_tasks.add_task(run_mne_pipeline_job_sync, analysis_id)

    existing_params = _maybe_json_loads(analysis.analysis_params_json)
    params_dict = existing_params if isinstance(existing_params, dict) else {}
    params_dict.update(queue_meta)
    analysis.analysis_params_json = json.dumps(params_dict)
    db.commit()
    db.refresh(analysis)
    return AnalysisOut.from_record(analysis)

@router.get("/{analysis_id}", response_model=AnalysisOut)
def get_analysis(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnalysisOut:
    """Get a specific qEEG analysis by ID."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    _gate_patient_access(actor, analysis.patient_id, db)
    return AnalysisOut.from_record(analysis)


@router.get("/{analysis_id}/brain.json")
def get_analysis_brain_payload(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Return a compact 3D brain surface payload for the qEEG web viewer."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    # Cross-clinic gate — the brain payload contains source-localised
    # per-ROI band power and within-subject z-scores for the patient
    # (PHI). Without this, any authenticated clinician can fetch any
    # other clinic's analysis by guessing or scraping ids. Mirrors the
    # canonical gate in get_analysis above.
    _gate_patient_access(actor, analysis.patient_id, db)

    if analysis.analysis_status != "completed":
        raise ApiServiceError(code="analysis_not_ready", message="Analysis not completed", status_code=400)

    source_raw = getattr(analysis, "source_roi_json", None)
    if not source_raw:
        raise ApiServiceError(
            code="source_unavailable",
            message="Source localization output unavailable for this analysis",
            status_code=404,
        )
    try:
        source_payload = json.loads(source_raw)
    except (TypeError, ValueError):
        raise ApiServiceError(code="source_unavailable", message="Malformed source payload", status_code=500)

    roi_band_power = (source_payload or {}).get("roi_band_power") if isinstance(source_payload, dict) else None
    if not isinstance(roi_band_power, dict) or not roi_band_power:
        raise ApiServiceError(
            code="source_unavailable",
            message="Source localization payload missing roi_band_power",
            status_code=404,
        )

    try:
        from deepsynaps_qeeg.viz.web_payload import build_brain_payload
    except Exception as exc:
        raise ApiServiceError(
            code="qeeg_web_viewer_unavailable",
            message=f"Web viewer payload builder unavailable: {str(exc)[:200]}",
            status_code=503,
        )

    subjects_dir = os.getenv("MNE_SUBJECTS_DIR") or None
    return build_brain_payload(roi_band_power, subjects_dir=subjects_dir, subject="fsaverage")


@router.get("/{analysis_id}/source-localization.json")
def get_source_localization_meta(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Provenance and availability for the Source Localization viewer (scaffold).

    This does **not** ship or invoke any proprietary LORETA product. It
    describes the **DeepSynaps / MNE-Python** minimum-norm pipeline outputs
    stored on the analysis row.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    _gate_patient_access(actor, analysis.patient_id, db)

    source_raw = getattr(analysis, "source_roi_json", None)
    source_payload: dict = {}
    if source_raw:
        try:
            parsed = json.loads(source_raw)
            if isinstance(parsed, dict):
                source_payload = parsed
        except (TypeError, ValueError):
            source_payload = {}

    roi_band_power = source_payload.get("roi_band_power") if isinstance(source_payload, dict) else None
    method = (source_payload or {}).get("method") if isinstance(source_payload, dict) else None
    if not isinstance(method, str) or not method.strip():
        method = None

    source_available = (
        analysis.analysis_status == "completed"
        and isinstance(roi_band_power, dict)
        and bool(roi_band_power)
    )

    quality = None
    qraw = getattr(analysis, "quality_metrics_json", None)
    if qraw:
        try:
            qd = json.loads(qraw)
            if isinstance(qd, dict):
                quality = {
                    "overall": qd.get("overall"),
                    "notes": qd.get("notes") or qd.get("message"),
                }
        except (TypeError, ValueError):
            quality = None

    return {
        "analysis_id": analysis_id,
        "patient_id": analysis.patient_id,
        "analysis_status": analysis.analysis_status,
        "analyzed_at": analysis.analyzed_at.isoformat() if analysis.analyzed_at else None,
        "pipeline_version": getattr(analysis, "pipeline_version", None),
        "source_available": source_available,
        "method": method,
        "method_description": (
            f"MNE-Python minimum-norm estimate ({method})"
            if method
            else "Not computed for this analysis"
        ),
        "atlas": "Desikan–Killiany (FreeSurfer aparc), 68 cortical labels",
        "head_model": (
            "fsaverage template; 3-layer BEM; "
            "MNE `make_forward_solution` (EEG-only in pipeline)"
        ),
        "ui_product_name": "Source localization (cortical source estimate)",
        "disclaimer": (
            "Cortical maps are model-derived estimates on a template surface, "
            "not direct measurements of neural activity. Spatial resolution is "
            "limited; do not over-interpret sub-regional detail."
        ),
        "endpoints": {
            "analysis": f"/api/v1/qeeg-analysis/{analysis_id}",
            "brain_surface_payload": f"/api/v1/qeeg-analysis/{analysis_id}/brain.json",
        },
        "quality": quality,
    }


# ── List Analyses for Patient ────────────────────────────────────────────────

@router.get("/patient/{patient_id}", response_model=AnalysisListResponse)
def list_patient_analyses(
    patient_id: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnalysisListResponse:
    """List qEEG analyses for a patient with pagination.

    `total` is the full filter match so the UI can paginate; `items` is the
    requested window. Default page is 50; previous behaviour silently capped
    at 100 which masked overflow on high-volume patients.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    base = (
        db.query(QEEGAnalysis)
        .filter_by(patient_id=patient_id)
        .order_by(QEEGAnalysis.created_at.desc())
    )
    total = base.count()
    analyses = list(base.offset(offset).limit(limit).all())

    return AnalysisListResponse(
        items=[AnalysisOut.from_record(a) for a in analyses],
        total=total,
    )


# ── Generate AI Report ───────────────────────────────────────────────────────

class AIReportRequest(BaseModel):
    report_type: str = Field(default="standard", pattern="^(standard|prediction)$")
    patient_context: Optional[str] = None


# core-schema-exempt: qEEG RAG draft DTO is a router-local contract pending broader API-client adoption.
class QEEGRAGReportRequest(BaseModel):
    output_mode: str = Field(
        default="clinician_draft",
        pattern="^(clinician_draft|patient_friendly_draft)$",
    )
    recording_condition: str = Field(
        default="unknown",
        pattern="^(eyes_closed|eyes_open|task|unknown)$",
    )
    include_evidence: bool = True
    patient_context: Optional[str] = None


# core-schema-exempt: qEEG RAG draft section shape is currently only emitted by this router.
class QEEGRAGReportSectionOut(BaseModel):
    title: str
    body: str
    source: str = Field(pattern="^(measured|generated|evidence_grounded|clinician_entered)$")
    evidence_refs: list[int] = Field(default_factory=list)


# core-schema-exempt: qEEG RAG evidence rows are router-local response objects for the draft endpoint.
class QEEGRAGEvidenceOut(BaseModel):
    title: str
    pmid: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    relevance: float = 0.0


# core-schema-exempt: qEEG RAG draft response is a router-local contract until shared clients consume it.
class QEEGRAGReportOut(BaseModel):
    report_id: str
    analysis_id: str
    status: str = Field(default="clinician_review_required", pattern="^clinician_review_required$")
    clinical_use: str = Field(default="decision_support_only", pattern="^decision_support_only$")
    sections: list[QEEGRAGReportSectionOut]
    evidence: list[QEEGRAGEvidenceOut]
    disclaimer: str
    report_state: str
    evidence_status: str
    output_mode: str
    created_at: str


_RAG_CITATION_RE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")


def _extract_rag_citation_numbers(text: Optional[str], valid_numbers: set[int]) -> list[int]:
    if not text:
        return []
    seen: set[int] = set()
    ordered: list[int] = []
    for raw in _RAG_CITATION_RE.findall(text):
        for raw_number in raw.split(","):
            try:
                number = int(raw_number.strip())
            except (TypeError, ValueError):
                continue
            if number not in valid_numbers or number in seen:
                continue
            seen.add(number)
            ordered.append(number)
    return ordered


def _build_qeeg_rag_evidence(
    literature_refs: list[dict],
    *,
    include_evidence: bool,
) -> list[QEEGRAGEvidenceOut]:
    if not include_evidence:
        return []
    evidence: list[QEEGRAGEvidenceOut] = []
    total = max(len(literature_refs or []), 1)
    for index, ref in enumerate(literature_refs or [], start=1):
        title = str(ref.get("title") or ref.get("pmid") or ref.get("doi") or "Evidence reference")
        try:
            relevance = float(ref.get("relevance_score") or ref.get("relevance") or 0.0)
        except (TypeError, ValueError):
            relevance = 0.0
        if relevance <= 0.0:
            relevance = round((total - index + 1) / total, 4)
        evidence.append(
            QEEGRAGEvidenceOut(
                title=title,
                pmid=ref.get("pmid"),
                doi=ref.get("doi"),
                url=ref.get("url"),
                relevance=relevance,
            )
        )
    return evidence


def _build_qeeg_rag_sections(
    *,
    analysis: QEEGAnalysis,
    report_data: dict,
    patient_report: dict,
    literature_refs: list[dict],
    output_mode: str,
    recording_condition: str,
) -> list[QEEGRAGReportSectionOut]:
    valid_numbers = {
        int(ref["n"])
        for ref in (literature_refs or [])
        if isinstance(ref, dict) and str(ref.get("n", "")).isdigit()
    }
    payload = patient_report if output_mode == "patient_friendly_draft" else report_data
    sections: list[QEEGRAGReportSectionOut] = []

    measured_bits: list[str] = []
    resolved_condition = (
        recording_condition
        if recording_condition != "unknown"
        else _resolve_recording_condition(analysis.eyes_condition)
    )
    if resolved_condition:
        measured_bits.append(
            f"Recording condition: {resolved_condition.replace('_', ' ')}."
        )
    quality = _maybe_json_loads(getattr(analysis, "quality_metrics_json", None)) or {}
    retained = quality.get("n_epochs_retained")
    total = quality.get("n_epochs_total")
    if retained is not None and total is not None:
        measured_bits.append(f"Retained epochs: {retained}/{total}.")
    if analysis.norm_db_version:
        measured_bits.append(f"Normative database: {analysis.norm_db_version}.")
    flagged = _maybe_json_loads(getattr(analysis, "flagged_conditions", None)) or []
    if isinstance(flagged, list) and flagged:
        measured_bits.append(
            "Pipeline-flagged patterns: " + ", ".join(str(item) for item in flagged[:4]) + "."
        )
    sections.append(
        QEEGRAGReportSectionOut(
            title="Measured qEEG context",
            body=" ".join(measured_bits)
            or "Quantitative qEEG review generated from the completed analysis record.",
            source="measured",
            evidence_refs=[],
        )
    )

    executive_summary = payload.get("executive_summary")
    if isinstance(executive_summary, str) and executive_summary.strip():
        evidence_refs = _extract_rag_citation_numbers(executive_summary, valid_numbers)
        sections.append(
            QEEGRAGReportSectionOut(
                title="Executive Summary",
                body=executive_summary.strip(),
                source="evidence_grounded" if evidence_refs else "generated",
                evidence_refs=evidence_refs,
            )
        )

    findings = payload.get("findings") or []
    if isinstance(findings, list):
        for index, finding in enumerate(findings, start=1):
            if not isinstance(finding, dict):
                continue
            body = finding.get("observation") or finding.get("description") or finding.get("statement") or ""
            if not isinstance(body, str) or not body.strip():
                continue
            evidence_refs: list[int] = []
            for raw in finding.get("citations") or []:
                try:
                    number = int(raw)
                except (TypeError, ValueError):
                    continue
                if number in valid_numbers and number not in evidence_refs:
                    evidence_refs.append(number)
            if not evidence_refs:
                evidence_refs = _extract_rag_citation_numbers(body, valid_numbers)
            region = str(finding.get("region") or "").strip()
            band = str(finding.get("band") or "").strip()
            title_bits = [bit for bit in (region.title() if region else "", band if band else "") if bit]
            title = " / ".join(title_bits) if title_bits else f"Finding {index}"
            sections.append(
                QEEGRAGReportSectionOut(
                    title=title,
                    body=body.strip(),
                    source="evidence_grounded" if evidence_refs else "generated",
                    evidence_refs=evidence_refs,
                )
            )

    recommendations = payload.get("protocol_recommendations") or []
    if isinstance(recommendations, list) and recommendations:
        lines: list[str] = []
        for item in recommendations:
            if isinstance(item, str) and item.strip():
                lines.append(item.strip())
                continue
            if not isinstance(item, dict):
                continue
            modality = str(item.get("modality") or "").strip()
            target = str(item.get("target") or "").strip()
            rationale = str(item.get("rationale") or "").strip()
            header = " — ".join(bit for bit in (modality, target) if bit)
            line = ": ".join(bit for bit in (header, rationale) if bit)
            if line:
                lines.append(line)
        if lines:
            sections.append(
                QEEGRAGReportSectionOut(
                    title="Protocol Considerations",
                    body="\n".join(lines),
                    source="generated",
                    evidence_refs=[],
                )
            )

    return sections


def _record_qeeg_backend_audit_event(
    db: Session,
    *,
    actor: AuthenticatedActor,
    analysis_id: str,
    patient_id: str,
    event: str,
    note: str,
) -> None:
    from app.repositories.audit import create_audit_event

    now = datetime.now(timezone.utc)
    event_id = f"qeeg-{event}-{actor.actor_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(analysis_id),
            target_type="qeeg",
            action=f"qeeg.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=f"patient={patient_id}; analysis={analysis_id}; {note}"[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block report generation
        _log.exception("qeeg backend audit persistence failed for %s", event)


@router.post("/{analysis_id}/ai-report", response_model=AIReportOut, status_code=201)
@limiter.limit("20/minute")
async def generate_ai_report_endpoint(
    request: Request,
    analysis_id: str,
    body: AIReportRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AIReportOut:
    """Generate an AI interpretation report for a completed analysis."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    # Cross-clinic gate — the AI report inlines the linked QEEGRecord's
    # clinical-context survey (PR #166) plus full band-power features
    # into the LLM prompt. Without this gate any clinician could fan
    # out arbitrary analysis_id values and exfiltrate another clinic's
    # PHI-rich survey + AI narrative.
    _gate_patient_access(actor, analysis.patient_id, db)

    _enforce_qeeg_ai_consent_for_patient_derived_endpoint(
        db, actor, analysis_id, analysis.patient_id, endpoint="ai-report",
    )

    if analysis.analysis_status != "completed" or not analysis.band_powers_json:
        raise ApiServiceError(
            code="analysis_not_ready",
            message="Analysis must be completed before generating an AI report",
            status_code=400,
        )

    band_powers = json.loads(analysis.band_powers_json)

    # Deterministic condition matching
    from app.services.qeeg_ai_interpreter import match_condition_patterns, generate_ai_report
    from app.services.qeeg_context_extractor import (
        extract_qeeg_context,
        format_context_for_prompt,
    )

    # ── Load the new CONTRACT §1.1 feature dict if Agent B's pipeline wrote it.
    # Every column is nullable; when all are None we fall back to the legacy
    # band_powers path so existing analyses keep working.
    def _maybe_load(col_value: Optional[str]) -> Optional[dict]:
        if not col_value:
            return None
        try:
            return json.loads(col_value)
        except (ValueError, TypeError):
            return None

    aperiodic       = _maybe_load(getattr(analysis, "aperiodic_json", None))
    peak_alpha_freq = _maybe_load(getattr(analysis, "peak_alpha_freq_json", None))
    connectivity    = _maybe_load(getattr(analysis, "connectivity_json", None))
    asymmetry       = _maybe_load(getattr(analysis, "asymmetry_json", None))
    graph_metrics   = _maybe_load(getattr(analysis, "graph_metrics_json", None))
    source_roi      = _maybe_load(getattr(analysis, "source_roi_json", None))

    zscores   = _maybe_load(getattr(analysis, "normative_zscores_json", None))
    quality   = _maybe_load(getattr(analysis, "quality_metrics_json", None))

    flagged_raw = getattr(analysis, "flagged_conditions", None)
    flagged_conditions: Optional[list[str]] = None
    if flagged_raw:
        parsed_flagged = _maybe_load(flagged_raw)
        if isinstance(parsed_flagged, list):
            flagged_conditions = [str(c).strip().lower() for c in parsed_flagged if c]

    # Build the CONTRACT §1.1 features dict from the new columns when at least
    # one of them is populated. Otherwise pass features=None and rely on the
    # legacy band_powers path inside generate_ai_report.
    features: Optional[dict] = None
    has_new_features = any([
        aperiodic, peak_alpha_freq, connectivity, asymmetry, graph_metrics, source_roi,
    ])
    if has_new_features:
        # Synthesise spectral.bands from the legacy band_powers payload so the
        # feature dict is self-contained (CONTRACT §1.1 shape).
        spectral_bands: dict = {}
        legacy_bands = (band_powers or {}).get("bands") or {}
        for band, info in legacy_bands.items():
            channels = (info or {}).get("channels") or {}
            spectral_bands[band] = {
                "absolute_uv2": {
                    ch: float(v.get("absolute_uv2", 0.0) or 0.0) for ch, v in channels.items()
                },
                "relative": {
                    ch: float(v.get("relative_pct", 0.0) or 0.0) / 100.0
                    for ch, v in channels.items()
                },
            }
        features = {
            "spectral": {
                "bands": spectral_bands,
                "aperiodic": aperiodic or {},
                "peak_alpha_freq": peak_alpha_freq or {},
            },
            "connectivity": connectivity or {},
            "asymmetry": asymmetry or {},
            "graph": graph_metrics or {},
            "source": (
                {
                    "roi_band_power": source_roi or {},
                    "method": (source_roi or {}).get("method", "eLORETA"),
                }
                if source_roi
                else {}
            ),
        }

    # Pattern matching takes either shape; prefer features when available.
    condition_matches = match_condition_patterns(
        features if features is not None else band_powers
    )

    # Auto-surface any clinician-supplied clinical-context survey that was
    # embedded in the linked QEEGRecord's notes. Lets the LLM see recording
    # confounders (caffeine, sleep, meds), prior neuromodulation history,
    # and red-flag screen results alongside the band powers.
    merged_patient_context = body.patient_context or None
    survey_sources_used: list[str] = []
    if analysis.qeeg_record_id:
        linked_record = (
            db.query(QEEGRecord).filter_by(id=analysis.qeeg_record_id).first()
        )
        if linked_record is not None:
            survey_ctx = extract_qeeg_context(linked_record.summary_notes)
            if survey_ctx:
                survey_block = format_context_for_prompt(survey_ctx)
                merged_patient_context = (
                    f"{survey_block}\n\n{body.patient_context}"
                    if body.patient_context
                    else survey_block
                )
                survey_sources_used.append("qeeg_clinical_context_survey_v1")

    # Generate AI report (RAG-grounded when pipeline features are present).
    report_result = await generate_ai_report(
        band_powers=band_powers,
        features=features,
        zscores=zscores,
        flagged_conditions=flagged_conditions,
        quality=quality,
        patient_context=merged_patient_context,
        condition_matches=condition_matches,
        report_type=body.report_type,
        db_session=db,
    )

    report_data = report_result.get("data", {})
    literature_refs = report_result.get("literature_refs") or []

    # ── Clinical Safety Cockpit (CONTRACT §1.2) ──────────────────────────
    from app.services.qeeg_safety_engine import compute_safety_cockpit, compute_interpretability_status

    cockpit = compute_safety_cockpit(analysis)
    analysis.safety_cockpit_json = json.dumps(cockpit)
    analysis.interpretability_status = compute_interpretability_status(cockpit)

    # ── Claim Governance (CONTRACT §1.3) ─────────────────────────────────
    from app.services.qeeg_claim_governance import classify_claims, sanitize_for_patient

    # Pass the full report dict to classify_claims (it expects a dict, not a string)
    governance = classify_claims(report_data)

    # ── Patient-facing report ──────────────────────────────────────────────
    patient_report = sanitize_for_patient(report_data)

    # Save report — persist literature_refs so the frontend can render
    # numbered citations alongside the narrative (CONTRACT §5.5).
    report = QEEGAIReport(
        analysis_id=analysis_id,
        patient_id=analysis.patient_id,
        clinician_id=actor.actor_id,
        report_type=body.report_type,
        ai_narrative_json=json.dumps(report_data),
        clinical_impressions=report_data.get("executive_summary", ""),
        condition_matches_json=json.dumps(condition_matches),
        protocol_suggestions_json=json.dumps(report_data.get("protocol_recommendations", [])),
        literature_refs_json=json.dumps(literature_refs) if literature_refs else None,
        model_used=report_result.get("model_used"),
        prompt_hash=report_result.get("prompt_hash"),
        confidence_note=report_data.get("confidence_level"),
        report_state="DRAFT_AI",
        model_version=report_result.get("model_used"),
        prompt_version=report_result.get("prompt_hash"),
        report_version="1.0.0",
        claim_governance_json=json.dumps(governance),
        patient_facing_report_json=json.dumps(patient_report),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    # ── Per-finding records (CONTRACT §1.4) ──────────────────────────────
    for idx, finding in enumerate(report_data.get("findings", [])):
        finding_text = finding.get("description", "")
        # Build a minimal report-shaped dict so classify_claims can process the finding
        finding_gov = classify_claims({"findings": [{"observation": finding_text}]})
        # classify_claims returns a list of classified findings
        claim_type = "INFERRED"
        if finding_gov and len(finding_gov) > 0:
            claim_type = finding_gov[0].get("claim_type", "INFERRED")

        rf = QEEGReportFinding(
            report_id=report.id,
            finding_text=finding_text,
            claim_type=claim_type,
            evidence_grade="C" if claim_type in ("INFERRED", "UNSUPPORTED") else "B",
        )
        db.add(rf)

    db.commit()

    # Audit log — include qeeg_rag_literature in sources_used when RAG
    # actually returned references (CONTRACT §5.6).
    sources_used = ["edf_analysis", "qeeg_condition_map"]
    if literature_refs:
        sources_used.append("qeeg_rag_literature")

    audit = AiSummaryAudit(
        patient_id=analysis.patient_id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        summary_type="qeeg_analysis",
        prompt_hash=report_result.get("prompt_hash"),
        response_preview=str(report_data.get("executive_summary", ""))[:200],
        sources_used=json.dumps([*sources_used, *survey_sources_used]),
        model_used=report_result.get("model_used"),
    )
    db.add(audit)
    db.commit()

    return AIReportOut.from_record(report)


@router.post("/{analysis_id}/rag-report", response_model=QEEGRAGReportOut, status_code=201)
@limiter.limit("20/minute")
async def generate_qeeg_rag_report_endpoint(
    request: Request,
    analysis_id: str,
    body: QEEGRAGReportRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QEEGRAGReportOut:
    """Generate an evidence-grounded qEEG draft report for clinician review."""
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    _gate_patient_access(actor, analysis.patient_id, db)
    _enforce_qeeg_ai_consent_for_patient_derived_endpoint(
        db, actor, analysis_id, analysis.patient_id, endpoint="rag-report",
    )
    require_minimum_role(actor, "clinician")

    if analysis.analysis_status != "completed" or not analysis.band_powers_json:
        raise ApiServiceError(
            code="analysis_not_ready",
            message="Analysis must be completed before generating a RAG draft report",
            status_code=400,
        )

    _record_qeeg_backend_audit_event(
        db,
        actor=actor,
        analysis_id=analysis_id,
        patient_id=analysis.patient_id,
        event="rag_report_requested",
        note=f"output_mode={body.output_mode}; include_evidence={body.include_evidence}",
    )

    band_powers = json.loads(analysis.band_powers_json)

    from app.services.qeeg_ai_interpreter import match_condition_patterns, generate_ai_report
    from app.services.qeeg_context_extractor import (
        extract_qeeg_context,
        format_context_for_prompt,
    )
    from app.services.qeeg_claim_governance import classify_claims, sanitize_for_patient
    from app.services.qeeg_safety_engine import compute_safety_cockpit, compute_interpretability_status

    def _maybe_load(col_value: Optional[str]) -> Optional[dict]:
        if not col_value:
            return None
        try:
            return json.loads(col_value)
        except (ValueError, TypeError):
            return None

    aperiodic = _maybe_load(getattr(analysis, "aperiodic_json", None))
    peak_alpha_freq = _maybe_load(getattr(analysis, "peak_alpha_freq_json", None))
    connectivity = _maybe_load(getattr(analysis, "connectivity_json", None))
    asymmetry = _maybe_load(getattr(analysis, "asymmetry_json", None))
    graph_metrics = _maybe_load(getattr(analysis, "graph_metrics_json", None))
    source_roi = _maybe_load(getattr(analysis, "source_roi_json", None))
    zscores = _maybe_load(getattr(analysis, "normative_zscores_json", None))
    quality = _maybe_load(getattr(analysis, "quality_metrics_json", None))

    flagged_raw = getattr(analysis, "flagged_conditions", None)
    flagged_conditions: Optional[list[str]] = None
    if flagged_raw:
        parsed_flagged = _maybe_load(flagged_raw)
        if isinstance(parsed_flagged, list):
            flagged_conditions = [str(c).strip().lower() for c in parsed_flagged if c]

    features: Optional[dict] = None
    if any([aperiodic, peak_alpha_freq, connectivity, asymmetry, graph_metrics, source_roi]):
        spectral_bands: dict = {}
        legacy_bands = (band_powers or {}).get("bands") or {}
        for band, info in legacy_bands.items():
            channels = (info or {}).get("channels") or {}
            spectral_bands[band] = {
                "absolute_uv2": {
                    ch: float(v.get("absolute_uv2", 0.0) or 0.0) for ch, v in channels.items()
                },
                "relative": {
                    ch: float(v.get("relative_pct", 0.0) or 0.0) / 100.0
                    for ch, v in channels.items()
                },
            }
        features = {
            "spectral": {
                "bands": spectral_bands,
                "aperiodic": aperiodic or {},
                "peak_alpha_freq": peak_alpha_freq or {},
            },
            "connectivity": connectivity or {},
            "asymmetry": asymmetry or {},
            "graph": graph_metrics or {},
            "source": (
                {
                    "roi_band_power": source_roi or {},
                    "method": (source_roi or {}).get("method", "eLORETA"),
                }
                if source_roi
                else {}
            ),
        }

    condition_matches = match_condition_patterns(
        features if features is not None else band_powers
    )

    merged_patient_context = None
    survey_sources_used: list[str] = []
    if analysis.qeeg_record_id:
        linked_record = db.query(QEEGRecord).filter_by(id=analysis.qeeg_record_id).first()
        if linked_record is not None:
            survey_ctx = extract_qeeg_context(linked_record.summary_notes)
            if survey_ctx:
                survey_block = format_context_for_prompt(survey_ctx)
                merged_patient_context = survey_block
                survey_sources_used.append("qeeg_clinical_context_survey_v1")

    if body.recording_condition and body.recording_condition != "unknown":
        recording_line = f"Recording condition: {body.recording_condition.replace('_', ' ')}."
        merged_patient_context = (
            f"{merged_patient_context}\n\n{recording_line}"
            if merged_patient_context
            else recording_line
        )

    try:
        report_result = await generate_ai_report(
            band_powers=band_powers,
            features=features,
            zscores=zscores,
            flagged_conditions=flagged_conditions,
            quality=quality,
            patient_context=merged_patient_context,
            condition_matches=condition_matches,
            report_type="standard",
            require_real_citations=body.include_evidence,
            db_session=db,
        )
    except Exception as exc:
        _record_qeeg_backend_audit_event(
            db,
            actor=actor,
            analysis_id=analysis_id,
            patient_id=analysis.patient_id,
            event="rag_report_failed",
            note=f"output_mode={body.output_mode}; reason={exc.__class__.__name__}",
        )
        raise

    report_data = report_result.get("data", {})
    literature_refs = report_result.get("literature_refs") or []
    evidence_status = (
        "available"
        if body.include_evidence and literature_refs
        else "unavailable"
        if body.include_evidence
        else "disabled"
    )

    cockpit = compute_safety_cockpit(analysis)
    analysis.safety_cockpit_json = json.dumps(cockpit)
    analysis.interpretability_status = compute_interpretability_status(cockpit)

    governance = classify_claims(report_data)
    patient_report = sanitize_for_patient(report_data)

    sections = _build_qeeg_rag_sections(
        analysis=analysis,
        report_data=report_data,
        patient_report=patient_report,
        literature_refs=literature_refs if body.include_evidence else [],
        output_mode=body.output_mode,
        recording_condition=body.recording_condition,
    )
    evidence = _build_qeeg_rag_evidence(
        literature_refs,
        include_evidence=body.include_evidence,
    )
    stored_payload = dict(report_data)
    stored_payload["sections"] = [section.model_dump() for section in sections]
    stored_payload["clinical_use"] = "decision_support_only"
    stored_payload["status"] = "clinician_review_required"
    stored_payload["evidence_status"] = evidence_status
    stored_payload["output_mode"] = body.output_mode
    stored_payload["disclaimer"] = (
        "Decision-support only. Not diagnostic. Clinician review required."
    )

    report = QEEGAIReport(
        analysis_id=analysis_id,
        patient_id=analysis.patient_id,
        clinician_id=actor.actor_id,
        report_type="rag_draft",
        ai_narrative_json=json.dumps(stored_payload),
        clinical_impressions=stored_payload.get("executive_summary", ""),
        condition_matches_json=json.dumps(condition_matches),
        protocol_suggestions_json=json.dumps(stored_payload.get("protocol_recommendations", [])),
        literature_refs_json=json.dumps(literature_refs) if literature_refs else None,
        model_used=report_result.get("model_used"),
        prompt_hash=report_result.get("prompt_hash"),
        confidence_note=stored_payload.get("confidence_level"),
        report_state="NEEDS_REVIEW",
        model_version=report_result.get("model_used"),
        prompt_version=report_result.get("prompt_hash"),
        report_version="1.0.0",
        claim_governance_json=json.dumps(governance),
        patient_facing_report_json=json.dumps(patient_report),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    for finding in report_data.get("findings", []):
        finding_text = finding.get("description") or finding.get("observation") or ""
        finding_gov = classify_claims({"findings": [{"observation": finding_text}]})
        claim_type = "INFERRED"
        if finding_gov and len(finding_gov) > 0:
            claim_type = finding_gov[0].get("claim_type", "INFERRED")
        db.add(
            QEEGReportFinding(
                report_id=report.id,
                finding_text=finding_text,
                claim_type=claim_type,
                evidence_grade="C" if claim_type in ("INFERRED", "UNSUPPORTED") else "B",
            )
        )
    db.commit()

    sources_used = ["edf_analysis", "qeeg_condition_map", "qeeg_rag_draft_report"]
    if literature_refs and body.include_evidence:
        sources_used.append("qeeg_rag_literature")
    elif body.include_evidence:
        sources_used.append("qeeg_rag_unavailable")
    audit = AiSummaryAudit(
        patient_id=analysis.patient_id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        summary_type="qeeg_rag_draft_report",
        prompt_hash=report_result.get("prompt_hash"),
        response_preview=str(stored_payload.get("executive_summary", ""))[:200],
        sources_used=json.dumps([*sources_used, *survey_sources_used]),
        model_used=report_result.get("model_used"),
    )
    db.add(audit)
    db.commit()

    _record_qeeg_backend_audit_event(
        db,
        actor=actor,
        analysis_id=analysis_id,
        patient_id=analysis.patient_id,
        event="rag_report_generated",
        note=(
            f"output_mode={body.output_mode}; refs={len(evidence)}; "
            f"evidence_status={evidence_status}; report_id={report.id}"
        ),
    )

    return QEEGRAGReportOut(
        report_id=report.id,
        analysis_id=analysis_id,
        sections=sections,
        evidence=evidence,
        disclaimer="Decision-support only. Not diagnostic. Clinician review required.",
        report_state=report.report_state,
        evidence_status=evidence_status,
        output_mode=body.output_mode,
        created_at=report.created_at.isoformat() if report.created_at else "",
    )


# ── List Reports for Analysis ────────────────────────────────────────────────

@router.get("/{analysis_id}/reports", response_model=list[AIReportOut])
def list_analysis_reports(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[AIReportOut]:
    """List all AI reports for a specific analysis."""
    require_minimum_role(actor, "clinician")

    reports = (
        db.query(QEEGAIReport)
        .filter_by(analysis_id=analysis_id)
        .order_by(QEEGAIReport.created_at.desc())
        .all()
    )

    return [AIReportOut.from_record(r) for r in reports]


# ── Clinician Review/Amend Report ────────────────────────────────────────────

class ReportAmendRequest(BaseModel):
    clinician_amendments: Optional[str] = None
    reviewed: bool = True


@router.patch("/reports/{report_id}", response_model=AIReportOut)
def amend_report(
    report_id: str,
    body: ReportAmendRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AIReportOut:
    """Clinician reviews and optionally amends an AI report."""
    require_minimum_role(actor, "clinician")

    report = db.query(QEEGAIReport).filter_by(id=report_id).first()
    if not report:
        raise ApiServiceError(code="not_found", message="Report not found", status_code=404)

    if body.reviewed:
        report.clinician_reviewed = True
        report.reviewed_at = datetime.now(timezone.utc)
        # Unify with canonical state machine
        if not report.report_state or report.report_state == "DRAFT_AI":
            report.report_state = "NEEDS_REVIEW"

    if body.clinician_amendments is not None:
        report.clinician_amendments = body.clinician_amendments

    db.commit()
    db.refresh(report)

    return AIReportOut.from_record(report)


# ── Create Comparison ────────────────────────────────────────────────────────

class ComparisonRequest(BaseModel):
    baseline_id: str
    followup_id: str
    comparison_type: str = Field(default="pre_post", pattern="^(pre_post|longitudinal)$")
    course_id: Optional[str] = None


@router.post("/compare", response_model=ComparisonOut, status_code=201)
async def create_comparison(
    body: ComparisonRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ComparisonOut:
    """Create a pre/post comparison between two qEEG analyses."""
    require_minimum_role(actor, "clinician")

    baseline = db.query(QEEGAnalysis).filter_by(id=body.baseline_id).first()
    followup = db.query(QEEGAnalysis).filter_by(id=body.followup_id).first()

    if not baseline or not followup:
        raise ApiServiceError(code="not_found", message="One or both analyses not found", status_code=404)

    if baseline.analysis_status != "completed" or followup.analysis_status != "completed":
        raise ApiServiceError(
            code="analysis_not_ready",
            message="Both analyses must be completed before comparison",
            status_code=400,
        )

    if baseline.patient_id != followup.patient_id:
        raise ApiServiceError(
            code="patient_mismatch",
            message="Both analyses must belong to the same patient",
            status_code=400,
        )

    baseline_powers = json.loads(baseline.band_powers_json or "{}")
    followup_powers = json.loads(followup.band_powers_json or "{}")

    from app.services.qeeg_comparison import compute_comparison

    comparison_data = compute_comparison(baseline_powers, followup_powers)

    # Generate AI comparison narrative
    ai_narrative = None
    try:
        from app.services.qeeg_ai_interpreter import generate_ai_report

        comparison_context = json.dumps({
            "baseline_date": baseline.recording_date,
            "followup_date": followup.recording_date,
            "delta_summary": comparison_data.get("improvement_summary", {}),
        })
        result = await generate_ai_report(
            band_powers=followup_powers,
            patient_context=f"COMPARISON MODE - Baseline vs Follow-up.\n{comparison_context}",
            report_type="comparison",
        )
        if result.get("success"):
            ai_narrative = result["data"].get("comparison_summary", "")
    except Exception as exc:
        _log.warning("AI comparison narrative failed: %s", exc)

    comp = QEEGComparison(
        patient_id=baseline.patient_id,
        clinician_id=actor.actor_id,
        baseline_analysis_id=body.baseline_id,
        followup_analysis_id=body.followup_id,
        comparison_type=body.comparison_type,
        delta_powers_json=json.dumps(comparison_data.get("delta_matrix", {})),
        improvement_summary_json=json.dumps(comparison_data.get("improvement_summary", {})),
        ai_comparison_narrative=ai_narrative,
        course_id=body.course_id,
    )
    db.add(comp)
    db.commit()
    db.refresh(comp)

    return _enrich_comparison_payload(comp, baseline, followup)


# ── Get Comparison ───────────────────────────────────────────────────────────

@router.get("/compare/{comparison_id}", response_model=ComparisonOut)
def get_comparison(
    comparison_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ComparisonOut:
    """Get a specific comparison by ID."""
    require_minimum_role(actor, "clinician")

    comp = db.query(QEEGComparison).filter_by(id=comparison_id).first()
    if not comp:
        raise ApiServiceError(code="not_found", message="Comparison not found", status_code=404)

    baseline = db.query(QEEGAnalysis).filter_by(id=comp.baseline_analysis_id).first()
    followup = db.query(QEEGAnalysis).filter_by(id=comp.followup_analysis_id).first()
    return _enrich_comparison_payload(comp, baseline, followup)


# ── Correlation with Assessments ─────────────────────────────────────────────

@router.post("/{analysis_id}/correlate")
def correlate_with_assessments_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Correlate qEEG changes with clinical assessment scores."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    # Get all analyses for this patient
    all_analyses = (
        db.query(QEEGAnalysis)
        .filter_by(patient_id=analysis.patient_id, analysis_status="completed")
        .order_by(QEEGAnalysis.created_at)
        .all()
    )

    analyses_data = []
    for a in all_analyses:
        analyses_data.append({
            "id": a.id,
            "recording_date": a.recording_date,
            "band_powers_json": a.band_powers_json,
        })

    from app.services.qeeg_comparison import correlate_with_assessments

    return correlate_with_assessments(analysis.patient_id, analyses_data, db)


# ── Processing Status ────────────────────────────────────────────────────────

class StatusResponse(BaseModel):
    status: str
    step: Optional[str] = None
    progress_pct: int
    completed_analyses: int
    total_analyses: int
    error: Optional[str] = None
    execution_mode: Optional[str] = None
    queue_job_id: Optional[str] = None
    analyzed_at: Optional[str] = None


def _analysis_status_payload(analysis: QEEGAnalysis) -> StatusResponse:
    raw_status = analysis.analysis_status or "pending"
    step: Optional[str] = None
    progress_pct = 0
    completed_adv = 0
    total_adv = 0

    if raw_status == "pending":
        progress_pct = 0
    elif raw_status.startswith("processing"):
        parts = raw_status.split(":", 1)
        step = parts[1] if len(parts) > 1 else None
        step_progress = {
            "loading": 10,
            "parsing": 25,
            "artifact_rejection": 45,
            "spectral_analysis": 65,
            "finalizing": 85,
        }
        progress_pct = step_progress.get(step or "", 15)
    elif raw_status == "completed":
        progress_pct = 100
        if analysis.advanced_analyses_json:
            try:
                adv_data = json.loads(analysis.advanced_analyses_json)
                meta = adv_data.get("meta", {})
                completed_adv = meta.get("completed", 0)
                total_adv = meta.get("total", 0)
            except (json.JSONDecodeError, TypeError):
                pass
    elif raw_status == "failed":
        progress_pct = 0

    params = _maybe_json_loads(getattr(analysis, "analysis_params_json", None))
    queue_meta = params if isinstance(params, dict) else {}

    return StatusResponse(
        status=raw_status.split(":")[0],
        step=step,
        progress_pct=progress_pct,
        completed_analyses=completed_adv,
        total_analyses=total_adv,
        error=analysis.analysis_error,
        execution_mode=queue_meta.get("execution_mode"),
        queue_job_id=queue_meta.get("job_id"),
        analyzed_at=analysis.analyzed_at.isoformat() if analysis.analyzed_at else None,
    )


@router.get("/{analysis_id}/status", response_model=StatusResponse)
def get_analysis_status(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StatusResponse:
    """Lightweight status polling endpoint for an in-progress analysis.

    Returns the current processing status, step indicator, and progress
    percentage. When advanced analyses are running, progress is based on
    how many of the 25 sub-analyses have completed.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    return _analysis_status_payload(analysis)


@router.get("/{analysis_id}/events")
async def stream_analysis_events(
    analysis_id: str,
    request: Request,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    """SSE stream for qEEG analysis progress.

    This is intentionally additive and read-only: existing polling clients can
    ignore it, while newer clients can subscribe for lighter-weight updates.
    """
    require_minimum_role(actor, "clinician")

    # Cross-clinic ownership gate — analysis.patient_id must belong to actor's clinic.
    _ownership_row = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if _ownership_row is not None:
        _gate_patient_access(actor, _ownership_row.patient_id, db)

    # In test runs, keep the SSE endpoint deterministic and single-shot to
    # avoid TestClient streaming quirks and SQLite connection-scope surprises.
    try:
        from app.settings import get_settings

        if (get_settings().app_env or "").lower() == "test":
            analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
            if not analysis:
                raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
            payload = _analysis_status_payload(analysis).model_dump()
            payload["analysis_id"] = analysis.id
            payload["raw_status"] = analysis.analysis_status
            encoded = json.dumps(payload)
            event_name = "complete" if payload["status"] in {"completed", "failed"} else "progress"
            first = f"event: {event_name}\ndata: {encoded}\n\n".encode("utf-8")
            return StreamingResponse(
                iter([first]),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )
    except Exception:
        # Fall back to the full streaming generator in non-test environments.
        pass

    def event_generator():
        """SSE generator (sync) for TestClient compatibility.

        Starlette's TestClient streaming can behave unexpectedly with async
        generators + request-scoped dependencies. A sync generator yields the
        first snapshot immediately (so tests can assert) and then continues
        polling best-effort until completion or disconnect.
        """
        import time

        from app.database import SessionLocal

        last_payload: str | None = None
        while True:
            session = SessionLocal()
            try:
                analysis = session.query(QEEGAnalysis).filter_by(id=analysis_id).first()
                if analysis is None:
                    encoded = json.dumps(
                        {
                            "analysis_id": analysis_id,
                            "status": "failed",
                            "step": None,
                            "progress_pct": 0,
                            "completed_analyses": 0,
                            "total_analyses": 0,
                            "error": "analysis_not_found",
                            "analyzed_at": None,
                            "raw_status": "failed",
                        }
                    )
                    yield f"event: complete\ndata: {encoded}\n\n".encode("utf-8")
                    return

                payload = _analysis_status_payload(analysis).model_dump()
                payload["analysis_id"] = analysis.id
                payload["raw_status"] = analysis.analysis_status
                encoded = json.dumps(payload)
            finally:
                session.close()

            if encoded != last_payload:
                event_name = "complete" if payload["status"] in {"completed", "failed"} else "progress"
                yield f"event: {event_name}\ndata: {encoded}\n\n".encode("utf-8")
                last_payload = encoded
                if payload["status"] in {"completed", "failed"}:
                    return
            else:
                heartbeat = json.dumps({"analysis_id": analysis_id, "type": "heartbeat"})
                yield f"event: heartbeat\ndata: {heartbeat}\n\n".encode("utf-8")

            time.sleep(2.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Data Quality Check ───────────────────────────────────────────────────────

_STANDARD_1020_CHANNELS = 19  # Standard 10-20 montage channel count


class QualityMetric(BaseModel):
    metric: str
    value: float | int | str
    rating: str  # excellent, good, fair, poor
    detail: str


class QualityCheckResponse(BaseModel):
    analysis_id: str
    overall_grade: str  # excellent, good, fair, poor
    overall_score: float  # 0-100
    metrics: list[QualityMetric]
    recommendations: list[str]


@router.post("/{analysis_id}/quality-check", response_model=QualityCheckResponse)
def run_quality_check(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QualityCheckResponse:
    """Compute data quality metrics from the uploaded EDF metadata.

    Evaluates channel completeness, sample rate adequacy, and recording
    duration to produce a composite quality grade. Should be called after
    upload and before triggering full analysis so clinicians can decide
    whether to proceed.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    metrics: list[QualityMetric] = []
    recommendations: list[str] = []
    scores: list[float] = []

    # ── 1. Channel completeness ──────────────────────────────────────────
    channel_count = analysis.channel_count or 0
    if channel_count >= _STANDARD_1020_CHANNELS:
        ch_rating = "excellent"
        ch_score = 100.0
    elif channel_count >= 14:
        ch_rating = "good"
        ch_score = 75.0
    elif channel_count >= 8:
        ch_rating = "fair"
        ch_score = 50.0
        recommendations.append(
            f"Only {channel_count} channels detected. Full 10-20 montage (19 channels) "
            "recommended for comprehensive qEEG analysis."
        )
    else:
        ch_rating = "poor"
        ch_score = max(25.0, (channel_count / _STANDARD_1020_CHANNELS) * 100.0)
        recommendations.append(
            f"Only {channel_count} channels detected. This is insufficient for reliable "
            "qEEG analysis. At least 8 channels are recommended."
        )

    metrics.append(QualityMetric(
        metric="channel_completeness",
        value=channel_count,
        rating=ch_rating,
        detail=f"{channel_count}/{_STANDARD_1020_CHANNELS} standard 10-20 channels present",
    ))
    scores.append(ch_score)

    # ── 2. Sample rate assessment ────────────────────────────────────────
    sample_rate = analysis.sample_rate_hz or 0.0
    if sample_rate >= 256:
        sr_rating = "excellent"
        sr_score = 100.0
    elif sample_rate >= 128:
        sr_rating = "good"
        sr_score = 75.0
    elif sample_rate >= 64:
        sr_rating = "fair"
        sr_score = 40.0
        recommendations.append(
            f"Sample rate is {sample_rate:.0f} Hz. A rate of 256 Hz or higher is recommended "
            "for accurate high-frequency (beta/gamma) analysis."
        )
    else:
        sr_rating = "poor"
        sr_score = 15.0
        recommendations.append(
            f"Sample rate is {sample_rate:.0f} Hz, which is too low for reliable spectral "
            "analysis. Minimum 128 Hz required; 256+ Hz recommended."
        )

    metrics.append(QualityMetric(
        metric="sample_rate",
        value=round(sample_rate, 1),
        rating=sr_rating,
        detail=f"{sample_rate:.0f} Hz (256+ Hz recommended)",
    ))
    scores.append(sr_score)

    # ── 3. Recording duration assessment ─────────────────────────────────
    duration = analysis.recording_duration_sec or 0.0
    if duration >= 120:
        dur_rating = "excellent"
        dur_score = 100.0
    elif duration >= 60:
        dur_rating = "good"
        dur_score = 75.0
    elif duration >= 30:
        dur_rating = "fair"
        dur_score = 45.0
        recommendations.append(
            f"Recording duration is {duration:.0f}s. At least 120s (2 minutes) of artifact-free "
            "data is recommended for stable spectral estimates."
        )
    else:
        dur_rating = "poor"
        dur_score = 15.0
        recommendations.append(
            f"Recording duration is only {duration:.0f}s. This is too short for reliable "
            "qEEG analysis. Minimum 60s required; 120+ s recommended."
        )

    metrics.append(QualityMetric(
        metric="recording_duration",
        value=round(duration, 1),
        rating=dur_rating,
        detail=f"{duration:.0f}s recorded (120+ s recommended)",
    ))
    scores.append(dur_score)

    # ── Overall grade ────────────────────────────────────────────────────
    # Weighted: channels 40%, sample rate 30%, duration 30%
    overall_score = (scores[0] * 0.40) + (scores[1] * 0.30) + (scores[2] * 0.30)

    if overall_score >= 85:
        overall_grade = "excellent"
    elif overall_score >= 65:
        overall_grade = "good"
    elif overall_score >= 40:
        overall_grade = "fair"
    else:
        overall_grade = "poor"

    if not recommendations:
        recommendations.append("Data quality looks good. Ready for analysis.")

    return QualityCheckResponse(
        analysis_id=analysis_id,
        overall_grade=overall_grade,
        overall_score=round(overall_score, 1),
        metrics=metrics,
        recommendations=recommendations,
    )


# ── PDF / HTML Report Export ─────────────────────────────────────────────────

def _esc(text: str | None) -> str:
    """HTML-escape a string, returning empty string for None."""
    return html_mod.escape(str(text)) if text else ""


def _build_confidence_bar(confidence: float) -> str:
    """Return an inline HTML bar for a 0-100 confidence value."""
    pct = max(0, min(100, int(confidence)))
    if pct >= 70:
        color = "#22c55e"
    elif pct >= 40:
        color = "#f59e0b"
    else:
        color = "#ef4444"
    return (
        f'<div style="background:#e5e7eb;border-radius:4px;height:12px;width:200px;display:inline-block;">'
        f'<div style="background:{color};height:12px;border-radius:4px;width:{pct}%;"></div>'
        f'</div> <span style="font-size:0.85em;">{pct}%</span>'
    )


def _render_report_html(
    report: QEEGAIReport,
    analysis: QEEGAnalysis,
    saved_citations: Optional[list[dict]] = None,
) -> str:
    """Build a print-optimized HTML page from a qEEG AI report."""
    narrative = json.loads(report.ai_narrative_json) if report.ai_narrative_json else {}
    conditions = json.loads(report.condition_matches_json) if report.condition_matches_json else []
    protocols = json.loads(report.protocol_suggestions_json) if report.protocol_suggestions_json else []
    lit_refs = json.loads(report.literature_refs_json) if report.literature_refs_json else []

    exec_summary = _esc(narrative.get("executive_summary", ""))
    detailed_findings = narrative.get("detailed_findings", "")
    if isinstance(detailed_findings, dict):
        # Render dict keys/values
        findings_html_parts = []
        for key, val in detailed_findings.items():
            findings_html_parts.append(f"<li><strong>{_esc(key)}:</strong> {_esc(str(val))}</li>")
        findings_html = "<ul>" + "".join(findings_html_parts) + "</ul>"
    elif isinstance(detailed_findings, list):
        findings_html = "<ul>" + "".join(f"<li>{_esc(str(f))}</li>" for f in detailed_findings) + "</ul>"
    else:
        findings_html = f"<p>{_esc(str(detailed_findings))}</p>"

    # Condition matches section
    conditions_html = ""
    if conditions:
        rows = []
        for c in conditions:
            name = _esc(c.get("condition", c.get("name", "Unknown")))
            conf = c.get("confidence", c.get("match_pct", 0))
            if isinstance(conf, str):
                try:
                    conf = float(conf.rstrip("%"))
                except ValueError:
                    conf = 0
            bar = _build_confidence_bar(conf)
            note = _esc(c.get("note", c.get("rationale", "")))
            rows.append(f"<tr><td>{name}</td><td>{bar}</td><td>{note}</td></tr>")
        conditions_html = (
            '<h2>Condition Matches</h2>'
            '<table class="data-table"><thead><tr>'
            "<th>Condition</th><th>Confidence</th><th>Notes</th>"
            "</tr></thead><tbody>" + "".join(rows) + "</tbody></table>"
        )

    # Protocol suggestions section
    protocols_html = ""
    if protocols:
        items = []
        for p in protocols:
            if isinstance(p, dict):
                title = _esc(p.get("name", p.get("protocol", "")))
                desc = _esc(p.get("description", p.get("rationale", "")))
                items.append(f"<li><strong>{title}</strong>: {desc}</li>")
            else:
                items.append(f"<li>{_esc(str(p))}</li>")
        protocols_html = "<h2>Protocol Suggestions</h2><ul>" + "".join(items) + "</ul>"

    # Literature references section
    refs_html = ""
    if lit_refs:
        ref_items = []
        for ref in lit_refs:
            if isinstance(ref, dict):
                ref_items.append(f"<li>{_esc(ref.get('citation', str(ref)))}</li>")
            else:
                ref_items.append(f"<li>{_esc(str(ref))}</li>")
        refs_html = "<h2>Literature References</h2><ol>" + "".join(ref_items) + "</ol>"

    saved_refs_html = ""
    if saved_citations:
        ref_items = []
        for citation in saved_citations:
            payload = citation.get("citation_payload") if isinstance(citation, dict) else {}
            payload = payload if isinstance(payload, dict) else {}
            title = _esc(
                payload.get("title")
                or citation.get("title")
                or payload.get("citation")
                or "Untitled citation"
            )
            source = _esc(payload.get("journal") or payload.get("source") or "")
            year = _esc(payload.get("year") or "")
            url = _esc(payload.get("url") or payload.get("record_url") or payload.get("doi_url") or "")
            summary = _esc(payload.get("abstract") or payload.get("summary") or "")
            parts = [title]
            meta = " · ".join(part for part in [source, year] if part)
            if meta:
                parts.append(f"<span style=\"color:#6b7280;\">{meta}</span>")
            if url:
                parts.append(f'<div><a href="{url}">{url}</a></div>')
            if summary:
                parts.append(f"<div>{summary}</div>")
            ref_items.append("<li>" + "".join(parts) + "</li>")
        saved_refs_html = "<h2>Saved Evidence Citations</h2><ol>" + "".join(ref_items) + "</ol>"

    # Metadata
    report_date = report.created_at.strftime("%Y-%m-%d %H:%M UTC") if report.created_at else "N/A"
    analyzed_date = analysis.analyzed_at.strftime("%Y-%m-%d %H:%M UTC") if analysis.analyzed_at else "N/A"
    channels_list = json.loads(analysis.channels_json) if analysis.channels_json else []
    channels_str = _esc(", ".join(channels_list)) if channels_list else "N/A"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>qEEG Report - {_esc(report.id[:8])}</title>
<style>
  @media print {{
    body {{ margin: 0; padding: 20px; }}
    .no-print {{ display: none; }}
  }}
  body {{
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.6;
    color: #1a1a1a;
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 24px;
    background: #fff;
  }}
  .header {{
    border-bottom: 3px solid #2563eb;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }}
  .header h1 {{
    color: #2563eb;
    margin: 0 0 4px 0;
    font-size: 1.6em;
  }}
  .header .subtitle {{
    color: #6b7280;
    font-size: 0.95em;
  }}
  .meta-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 24px;
    background: #f8fafc;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 24px;
    font-size: 0.9em;
  }}
  .meta-grid dt {{ font-weight: 600; color: #4b5563; margin: 0; }}
  .meta-grid dd {{ margin: 0 0 8px 0; }}
  h2 {{
    color: #1e40af;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 6px;
    margin-top: 32px;
    font-size: 1.2em;
  }}
  .data-table {{
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
  }}
  .data-table th, .data-table td {{
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid #e5e7eb;
  }}
  .data-table th {{
    background: #f1f5f9;
    font-weight: 600;
    font-size: 0.9em;
    color: #374151;
  }}
  .disclaimer {{
    margin-top: 40px;
    padding: 12px 16px;
    background: #fef3c7;
    border-left: 4px solid #f59e0b;
    font-size: 0.85em;
    color: #92400e;
    border-radius: 0 4px 4px 0;
  }}
  .footer {{
    margin-top: 32px;
    text-align: center;
    font-size: 0.8em;
    color: #9ca3af;
  }}
  ul, ol {{ margin: 8px 0; padding-left: 24px; }}
  li {{ margin-bottom: 6px; }}
</style>
</head>
<body>
  <div class="header">
    <h1>Quantitative EEG Analysis Report</h1>
    <div class="subtitle">
      Report ID: {_esc(report.id)} &middot; Type: {_esc(report.report_type)}
    </div>
  </div>

  <dl class="meta-grid">
    <dt>Patient ID</dt>
    <dd>{_esc(analysis.patient_id)}</dd>
    <dt>Analysis ID</dt>
    <dd>{_esc(analysis.id)}</dd>
    <dt>Recording Date</dt>
    <dd>{_esc(analysis.recording_date) or "N/A"}</dd>
    <dt>Analysis Date</dt>
    <dd>{analyzed_date}</dd>
    <dt>Report Generated</dt>
    <dd>{report_date}</dd>
    <dt>Eyes Condition</dt>
    <dd>{_esc(analysis.eyes_condition) or "N/A"}</dd>
    <dt>Channels</dt>
    <dd>{channels_str} ({analysis.channel_count or 0} ch)</dd>
    <dt>Duration / Sample Rate</dt>
    <dd>{analysis.recording_duration_sec or 0:.1f}s / {analysis.sample_rate_hz or 0:.0f} Hz</dd>
    <dt>Model Used</dt>
    <dd>{_esc(report.model_used) or "N/A"}</dd>
    <dt>Confidence</dt>
    <dd>{_esc(report.confidence_note) or "N/A"}</dd>
  </dl>

  <h2>Executive Summary</h2>
  <p>{exec_summary or "<em>No executive summary available.</em>"}</p>

  <h2>Detailed Findings</h2>
  {findings_html}

  {conditions_html}
  {protocols_html}
  {refs_html}
  {saved_refs_html}

  {"<h2>Clinician Amendments</h2><p>" + _esc(report.clinician_amendments) + "</p>" if report.clinician_amendments else ""}

  <div class="disclaimer">
    <strong>Disclaimer:</strong> Research and wellness use only. This report was generated by an AI
    system to assist qualified clinicians in their assessment. It is informational and is not a
    medical diagnosis or treatment recommendation. Discuss any findings with a qualified clinician.
    All findings should be reviewed and validated by a licensed healthcare professional in the
    context of the patient&rsquo;s full clinical history.
    {"<br><em>This report has been reviewed by the attending clinician.</em>" if report.clinician_reviewed else "<br><em>This report has NOT yet been reviewed by a clinician.</em>"}
  </div>

  <div class="footer">
    DeepSynaps Protocol Studio &mdash; qEEG Analysis Report &mdash; Generated {report_date}
  </div>
</body>
</html>"""


@router.get("/{analysis_id}/reports/{report_id}/pdf")
def export_report_html(
    analysis_id: str,
    report_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HTMLResponse:
    """Export an AI report as a downloadable, print-optimized HTML document.

    Returns an HTML page with inline CSS formatted for clinical printing.
    The Content-Disposition header triggers a file download in the browser.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    # Cross-clinic ownership gate. Without this, a clinician at clinic A
    # who guesses or harvests an analysis_id from clinic B can pull the
    # PDF directly. Every other report-fetching endpoint in this router
    # already calls _gate_patient_access; this one was missed in Phase 2.
    _gate_patient_access(actor, analysis.patient_id, db)

    report = db.query(QEEGAIReport).filter_by(id=report_id, analysis_id=analysis_id).first()
    if not report:
        raise ApiServiceError(code="not_found", message="Report not found", status_code=404)

    saved_citations = list_saved_citations(
        analysis.patient_id,
        db,
        context_kind="qeeg",
        analysis_id=analysis_id,
        report_id=report_id,
        include_pending_review=False,
    )
    html_content = _render_report_html(report, analysis, saved_citations=saved_citations)
    short_id = report_id[:8]

    return HTMLResponse(
        content=html_content,
        headers={
            "Content-Disposition": f'attachment; filename="qeeg_report_{short_id}.html"',
        },
    )


# ── Longitudinal Trending ────────────────────────────────────────────────────

# Metrics where a *decrease* in value indicates clinical improvement.
_LOWER_IS_BETTER: set[str] = {"theta_beta_ratio", "delta_alpha_ratio"}

# All other tracked metrics: an *increase* is considered improvement.
_TRACKED_METRICS: list[str] = [
    "theta_beta_ratio",
    "delta_alpha_ratio",
    "alpha_peak_frequency",
    "frontal_asymmetry",
    "entropy",
    "small_world_index",
    "iapf",
    "spectral_edge_frequency",
]

# Synthetic identifiers that may bypass patient-linked consent checks in this
# router. Intentionally **not** a broad ``startswith("demo")`` rule: substrings
# such as "demographic" or "demoed" must not match, and arbitrary ``demo-*``
# hospital IDs must not receive a silent bypass.
_DEMO_ID_EXACT = frozenset({"demo", "mock", "test"})


def _is_demo_id(value: str) -> bool:
    """Return True only for known synthetic/demo identifiers used by fixtures/SPA.

    Allowed shapes:
    - Exact SPA / harness tokens: ``demo``, ``mock``, ``test``
    - Canonical fixture roster: ``demo-pt-*`` (see ``demo-fixtures-analyzers.js``)
    - Launcher defaults: ``demo-patient``, ``demo-patient-*``, ``demo-patient-synthetic``
    """
    if not value or not isinstance(value, str):
        return False
    lower = value.strip().lower()
    if lower in _DEMO_ID_EXACT:
        return True
    if lower.startswith("demo-pt-"):
        return True
    if lower == "demo-patient" or lower.startswith("demo-patient-"):
        return True
    return False


def _enforce_qeeg_ai_consent_for_patient_derived_endpoint(
    db: Session,
    actor: AuthenticatedActor,
    analysis_id: str,
    patient_id: str,
    *,
    endpoint: str,
) -> None:
    """Require ``ai_analysis`` consent before live patient qEEG normative / AI outputs.

    Uses the shared :func:`require_ai_analysis_consent` helper (denials already
    emit ``AuditEventRecord`` + ``SafetyFlag`` via ``_log_consent_denial``).
    Synthetic bypass uses strict :func:`_is_demo_id` (fixture/SPA allowlist only).

    Router adds a PHI-safe ``qeeg.consent_denied`` log line for ops correlation
    (analysis id hashed; no patient_id in log).
    """
    if _is_demo_id(analysis_id) or _is_demo_id(patient_id):
        return
    try:
        require_ai_analysis_consent(db, patient_id, actor, ai_modality="qeeg")
    except ConsentMissingError:
        _log.warning(
            "qeeg.consent_denied endpoint=%s analysis_sha=%s",
            endpoint,
            hashlib.sha256(analysis_id.encode("utf-8")).hexdigest()[:12],
        )
        raise ApiServiceError(
            code="consent_missing",
            message="ai_analysis consent required",
            status_code=403,
        ) from None


class LongitudinalRequest(BaseModel):
    patient_id: str
    metric: str = "all"  # or specific: "theta_beta_ratio", "alpha_peak", etc.


class LongitudinalDataPoint(BaseModel):
    date: str
    value: float
    session_id: str


class MetricTrend(BaseModel):
    metric: str
    data_points: list[LongitudinalDataPoint]
    trend_direction: str  # "improving", "stable", "declining"
    slope: float
    num_sessions: int


class LongitudinalResponse(BaseModel):
    patient_id: str
    total_sessions: int
    date_range: Optional[dict] = None  # {start, end}
    metrics: list[MetricTrend]
    demo_mode: bool = False


def _linear_slope(values: list[float]) -> float:
    """Compute least-squares linear regression slope over an index axis."""
    n = len(values)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2.0
    y_mean = sum(values) / n
    num = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
    den = sum((i - x_mean) ** 2 for i in range(n))
    if den == 0:
        return 0.0
    return num / den


def _classify_trend(metric: str, slope: float) -> str:
    """Classify trend as improving / stable / declining using clinical direction."""
    threshold = 0.01  # slopes within +/- threshold are considered stable
    if abs(slope) < threshold:
        return "stable"
    if metric in _LOWER_IS_BETTER:
        return "improving" if slope < 0 else "declining"
    # For all other metrics, higher is better.
    return "improving" if slope > 0 else "declining"


def _extract_metric_value(analysis_row: QEEGAnalysis, metric: str) -> Optional[float]:
    """Pull a single metric value from band_powers / advanced_analyses JSON."""
    # Try band_powers first (derived_ratios, global_summary)
    if analysis_row.band_powers_json:
        bp = json.loads(analysis_row.band_powers_json)
        ratios = bp.get("derived_ratios", {})
        summary = bp.get("global_summary", {})
        if metric in ratios:
            return float(ratios[metric])
        if metric in summary:
            return float(summary[metric])

    # Try advanced_analyses
    if analysis_row.advanced_analyses_json:
        adv = json.loads(analysis_row.advanced_analyses_json)
        results = adv.get("results", {})
        for _key, block in results.items():
            if isinstance(block, dict):
                if metric in block:
                    val = block[metric]
                    if isinstance(val, (int, float)):
                        return float(val)
                # Check nested "value" key
                inner = block.get("value")
                if isinstance(inner, dict) and metric in inner:
                    val = inner[metric]
                    if isinstance(val, (int, float)):
                        return float(val)

    return None


def _generate_demo_longitudinal(patient_id: str, metric_filter: str) -> LongitudinalResponse:
    """Return synthetic longitudinal data for demo / preview purposes."""
    import random

    random.seed(hash(patient_id) % 2**32)
    num_sessions = 5
    base_date = datetime.now(timezone.utc) - timedelta(days=120)

    demo_baselines: dict[str, float] = {
        "theta_beta_ratio": 3.8,
        "delta_alpha_ratio": 2.1,
        "alpha_peak_frequency": 9.5,
        "frontal_asymmetry": -0.12,
        "entropy": 1.45,
        "small_world_index": 1.8,
        "iapf": 10.0,
        "spectral_edge_frequency": 22.0,
    }

    metrics_to_use = _TRACKED_METRICS
    if metric_filter != "all" and metric_filter in demo_baselines:
        metrics_to_use = [metric_filter]

    trends: list[MetricTrend] = []
    first_date = base_date.strftime("%Y-%m-%d")
    last_date = (base_date + timedelta(days=30 * (num_sessions - 1))).strftime("%Y-%m-%d")

    for m in metrics_to_use:
        base = demo_baselines.get(m, 1.0)
        # Simulate gradual improvement
        direction = -1 if m in _LOWER_IS_BETTER else 1
        step = abs(base) * 0.04 * direction
        points: list[LongitudinalDataPoint] = []
        values: list[float] = []
        for i in range(num_sessions):
            val = round(base + step * i + random.uniform(-0.05, 0.05), 4)
            values.append(val)
            dt = (base_date + timedelta(days=30 * i)).strftime("%Y-%m-%d")
            points.append(LongitudinalDataPoint(
                date=dt,
                value=val,
                session_id=f"demo-session-{i + 1}",
            ))
        slope = _linear_slope(values)
        trends.append(MetricTrend(
            metric=m,
            data_points=points,
            trend_direction=_classify_trend(m, slope),
            slope=round(slope, 6),
            num_sessions=num_sessions,
        ))

    return LongitudinalResponse(
        patient_id=patient_id,
        total_sessions=num_sessions,
        date_range={"start": first_date, "end": last_date},
        metrics=trends,
        demo_mode=True,
    )


@router.post("/longitudinal", response_model=LongitudinalResponse)
def longitudinal_trending(
    body: LongitudinalRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> LongitudinalResponse:
    """Compute metric trends over time for a patient with 3+ completed analyses.

    For each tracked metric, returns an array of {date, value, session_id}
    data-points together with a linear regression slope and a clinical trend
    classification (improving / stable / declining).
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, body.patient_id, db)

    # ── Demo mode fallback ────────────────────────────────────────────────
    if _is_demo_id(body.patient_id):
        return _generate_demo_longitudinal(body.patient_id, body.metric)

    # ── Query completed analyses ──────────────────────────────────────────
    analyses = (
        db.query(QEEGAnalysis)
        .filter_by(patient_id=body.patient_id, analysis_status="completed")
        .order_by(QEEGAnalysis.created_at)
        .all()
    )

    if len(analyses) < 3:
        raise ApiServiceError(
            code="insufficient_data",
            message="Minimum 3 completed analyses required for longitudinal trending",
            status_code=400,
        )

    # ── Determine which metrics to report ─────────────────────────────────
    metrics_to_report = _TRACKED_METRICS
    if body.metric != "all":
        if body.metric not in _TRACKED_METRICS:
            raise ApiServiceError(
                code="invalid_metric",
                message=f"Unknown metric '{body.metric}'. Valid options: {', '.join(_TRACKED_METRICS)}",
                status_code=422,
            )
        metrics_to_report = [body.metric]

    # ── Extract data points for each metric ───────────────────────────────
    trends: list[MetricTrend] = []
    for m in metrics_to_report:
        points: list[LongitudinalDataPoint] = []
        values: list[float] = []
        for a in analyses:
            val = _extract_metric_value(a, m)
            if val is None:
                continue
            values.append(val)
            dt = a.recording_date or (a.analyzed_at.strftime("%Y-%m-%d") if a.analyzed_at else a.created_at.strftime("%Y-%m-%d"))
            points.append(LongitudinalDataPoint(date=dt, value=val, session_id=a.id))

        if len(points) < 2:
            # Not enough data for this metric — skip it.
            continue

        slope = _linear_slope(values)
        trends.append(MetricTrend(
            metric=m,
            data_points=points,
            trend_direction=_classify_trend(m, slope),
            slope=round(slope, 6),
            num_sessions=len(points),
        ))

    # ── Compute date range ────────────────────────────────────────────────
    first_date = analyses[0].recording_date or (
        analyses[0].created_at.strftime("%Y-%m-%d") if analyses[0].created_at else None
    )
    last_date = analyses[-1].recording_date or (
        analyses[-1].created_at.strftime("%Y-%m-%d") if analyses[-1].created_at else None
    )

    return LongitudinalResponse(
        patient_id=body.patient_id,
        total_sessions=len(analyses),
        date_range={"start": first_date, "end": last_date} if first_date and last_date else None,
        metrics=trends,
        demo_mode=False,
    )


# ── Assessment Correlation ───────────────────────────────────────────────────

class AssessmentScore(BaseModel):
    date: str
    value: float


class AssessmentInput(BaseModel):
    name: str
    scores: list[AssessmentScore]


class AssessmentCorrelationRequest(BaseModel):
    assessments: list[AssessmentInput]


class MetricCorrelation(BaseModel):
    metric: str
    r: float
    p_value: float
    direction: str  # "positive", "negative", "none"
    interpretation: str


class AssessmentCorrelationResult(BaseModel):
    assessment_name: str
    n_matched: int
    correlations: list[MetricCorrelation]


class AssessmentCorrelationResponse(BaseModel):
    analysis_id: str
    patient_id: str
    results: list[AssessmentCorrelationResult]
    demo_mode: bool = False


def _pearson_r(x: list[float], y: list[float]) -> tuple[float, float]:
    """Compute Pearson r and approximate two-tailed p-value.

    Uses scipy when available; falls back to a manual implementation with
    a t-distribution approximation for the p-value.
    """
    n = len(x)
    if n < 3:
        return 0.0, 1.0

    try:
        from scipy.stats import pearsonr  # type: ignore[import-untyped]
        r, p = pearsonr(x, y)
        if math.isnan(r):
            return 0.0, 1.0
        return float(r), float(p)
    except ImportError:
        pass

    # Manual Pearson
    x_mean = sum(x) / n
    y_mean = sum(y) / n
    num = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y))
    den_x = math.sqrt(sum((xi - x_mean) ** 2 for xi in x))
    den_y = math.sqrt(sum((yi - y_mean) ** 2 for yi in y))
    if den_x == 0 or den_y == 0:
        return 0.0, 1.0
    r = num / (den_x * den_y)
    r = max(-1.0, min(1.0, r))  # clamp for floating-point edge cases

    # Approximate p-value via t-distribution (two-tailed)
    if abs(r) >= 1.0:
        p = 0.0
    else:
        t_stat = r * math.sqrt((n - 2) / (1 - r * r))
        # Rough two-tailed p from |t| using a large-sample normal approximation
        # (adequate for trend display; not intended for publication-grade stats)
        try:
            from scipy.stats import t as t_dist  # type: ignore[import-untyped]
            p = float(2 * t_dist.sf(abs(t_stat), n - 2))
        except ImportError:
            # Fallback: very rough approximation
            p = 2.0 * math.exp(-0.717 * abs(t_stat) - 0.416 * t_stat * t_stat)
            p = max(0.0, min(1.0, p))

    return r, p


def _parse_date(date_str: str) -> Optional[datetime]:
    """Best-effort ISO date parsing."""
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None


def _nearest_analysis_value(
    assessment_date: datetime,
    analyses_sorted: list[QEEGAnalysis],
    metric: str,
    max_days: int = 14,
) -> Optional[float]:
    """Find the nearest analysis within *max_days* and extract *metric*."""
    best: Optional[QEEGAnalysis] = None
    best_delta = timedelta(days=max_days + 1)
    for a in analyses_sorted:
        a_date_str = a.recording_date or (a.analyzed_at.strftime("%Y-%m-%d") if a.analyzed_at else None)
        if not a_date_str:
            continue
        a_date = _parse_date(a_date_str)
        if a_date is None:
            continue
        delta = abs(assessment_date - a_date)
        if delta < best_delta:
            best_delta = delta
            best = a
    if best is None or best_delta > timedelta(days=max_days):
        return None
    return _extract_metric_value(best, metric)


# ── Clinical interpretation templates ─────────────────────────────────────────

_INTERPRETATION_MAP: dict[tuple[str, str], str] = {
    # PHQ-9 (depression)
    ("PHQ-9", "alpha_peak_frequency"): (
        "PHQ-9 scores show {direction} correlation with alpha peak frequency "
        "(r={r:.2f}), suggesting depression severity may track with altered "
        "alpha rhythm."
    ),
    ("PHQ-9", "frontal_asymmetry"): (
        "PHQ-9 scores show {direction} correlation with frontal asymmetry "
        "(r={r:.2f}), consistent with the frontal alpha asymmetry model of "
        "depression."
    ),
    ("PHQ-9", "theta_beta_ratio"): (
        "PHQ-9 scores show {direction} correlation with theta/beta ratio "
        "(r={r:.2f}), suggesting comorbid attentional changes may accompany "
        "depression severity."
    ),
    # GAD-7 (anxiety)
    ("GAD-7", "theta_beta_ratio"): (
        "GAD-7 scores show {direction} correlation with theta/beta ratio "
        "(r={r:.2f}), which may reflect anxiety-related cortical arousal changes."
    ),
    ("GAD-7", "spectral_edge_frequency"): (
        "GAD-7 scores show {direction} correlation with spectral edge frequency "
        "(r={r:.2f}), potentially indicating high-frequency EEG shifts under anxiety."
    ),
    # PSQI (sleep quality — higher = worse)
    ("PSQI", "delta_alpha_ratio"): (
        "PSQI scores show {direction} correlation with delta/alpha ratio "
        "(r={r:.2f}), suggesting poorer sleep quality tracks with increased "
        "slow-wave intrusion in the waking EEG."
    ),
    ("PSQI", "entropy"): (
        "PSQI scores show {direction} correlation with signal entropy "
        "(r={r:.2f}), potentially reflecting reduced cortical complexity "
        "associated with sleep disruption."
    ),
}


def _build_interpretation(assessment_name: str, metric: str, r: float, direction: str) -> str:
    """Return a clinical interpretation string, using a template if available."""
    key = (assessment_name.upper(), metric)
    template = _INTERPRETATION_MAP.get(key)
    if template:
        return template.format(direction=direction, r=r)

    # Generic fallback
    strength = "strong" if abs(r) >= 0.7 else "moderate" if abs(r) >= 0.4 else "weak"
    return (
        f"{assessment_name} scores show a {strength} {direction} correlation with "
        f"{metric.replace('_', ' ')} (r={r:.2f})."
    )


def _generate_demo_assessment_correlation(
    analysis_id: str,
    assessments: list[AssessmentInput],
) -> AssessmentCorrelationResponse:
    """Return synthetic correlation data for demo / preview purposes."""
    import random

    random.seed(hash(analysis_id) % 2**32)

    results: list[AssessmentCorrelationResult] = []
    for asmt in assessments:
        correlations: list[MetricCorrelation] = []
        n_matched = max(len(asmt.scores), 3)
        for m in _TRACKED_METRICS:
            r_val = round(random.uniform(-0.85, 0.85), 4)
            p_val = round(random.uniform(0.001, 0.15), 4)
            direction = "positive" if r_val > 0.1 else "negative" if r_val < -0.1 else "none"
            correlations.append(MetricCorrelation(
                metric=m,
                r=r_val,
                p_value=p_val,
                direction=direction,
                interpretation=_build_interpretation(asmt.name, m, r_val, direction),
            ))
        results.append(AssessmentCorrelationResult(
            assessment_name=asmt.name,
            n_matched=n_matched,
            correlations=correlations,
        ))

    return AssessmentCorrelationResponse(
        analysis_id=analysis_id,
        patient_id="demo-patient",
        results=results,
        demo_mode=True,
    )


@router.post("/{analysis_id}/assessment-correlation", response_model=AssessmentCorrelationResponse)
def assessment_correlation(
    analysis_id: str,
    body: AssessmentCorrelationRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AssessmentCorrelationResponse:
    """Correlate qEEG metrics with clinical assessment scores.

    For each assessment supplied in the request body, computes Pearson
    correlation between the assessment time-series and the nearest qEEG
    session metrics.  Returns correlation coefficient, p-value, direction,
    and a clinical interpretation string.
    """
    require_minimum_role(actor, "clinician")

    # ── Demo mode fallback ────────────────────────────────────────────────
    if _is_demo_id(analysis_id):
        return _generate_demo_assessment_correlation(analysis_id, body.assessments)

    # ── Load anchor analysis ──────────────────────────────────────────────
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    # ── Retrieve all completed analyses for the patient ───────────────────
    all_analyses = (
        db.query(QEEGAnalysis)
        .filter_by(patient_id=analysis.patient_id, analysis_status="completed")
        .order_by(QEEGAnalysis.created_at)
        .all()
    )

    if not body.assessments:
        raise ApiServiceError(
            code="no_assessments",
            message="At least one assessment with scores is required",
            status_code=422,
        )

    # ── Compute correlations ──────────────────────────────────────────────
    results: list[AssessmentCorrelationResult] = []

    for asmt in body.assessments:
        if not asmt.scores:
            continue

        correlations: list[MetricCorrelation] = []
        for m in _TRACKED_METRICS:
            qeeg_values: list[float] = []
            asmt_values: list[float] = []

            for score_entry in asmt.scores:
                asmt_date = _parse_date(score_entry.date)
                if asmt_date is None:
                    continue
                qeeg_val = _nearest_analysis_value(asmt_date, all_analyses, m)
                if qeeg_val is not None:
                    qeeg_values.append(qeeg_val)
                    asmt_values.append(score_entry.value)

            if len(qeeg_values) < 3:
                # Not enough matched pairs for meaningful correlation
                continue

            r_val, p_val = _pearson_r(asmt_values, qeeg_values)
            r_val = round(r_val, 4)
            p_val = round(p_val, 4)

            if r_val > 0.1:
                direction = "positive"
            elif r_val < -0.1:
                direction = "negative"
            else:
                direction = "none"

            correlations.append(MetricCorrelation(
                metric=m,
                r=r_val,
                p_value=p_val,
                direction=direction,
                interpretation=_build_interpretation(asmt.name, m, r_val, direction),
            ))

        results.append(AssessmentCorrelationResult(
            assessment_name=asmt.name,
            n_matched=len(correlations),
            correlations=correlations,
        ))

    return AssessmentCorrelationResponse(
        analysis_id=analysis_id,
        patient_id=analysis.patient_id,
        results=results,
        demo_mode=False,
    )


# ── AI upgrades (CONTRACT_V2.md §4) ──────────────────────────────────────────
#
# Eight additive endpoints (seven POSTs + one GET) that populate the ten
# columns added by migration 038. Every handler routes through the
# :mod:`app.services.qeeg_ai_bridge` façade so a missing scaffold module
# never crashes the worker — it simply surfaces a ``success=False`` envelope
# with a HTTP 200 response.


class AIUpgradeResult(BaseModel):
    """Generic envelope returned by every AI-upgrade endpoint.

    Mirrors the bridge envelope but adds ``analysis_id`` for clients that
    want to correlate the response with a request.
    """

    analysis_id: str
    success: bool
    error: Optional[str] = None
    is_stub: bool = False
    data: Optional[dict] = None
    # Included so clients do not need to re-fetch after a successful
    # upgrade. All fields mirror :class:`AnalysisOut`.
    analysis: Optional[AnalysisOut] = None


def _load_features_for_ai(analysis: QEEGAnalysis) -> dict:
    """Assemble a CONTRACT §1.1 feature dict from the current row.

    Uses the MNE-pipeline columns when present, falling back to the
    legacy band-powers shape. This keeps the AI upgrades usable even
    before the full MNE pipeline has been run against a given upload.
    """
    aperiodic = _maybe_json_loads(analysis.aperiodic_json) or {}
    paf = _maybe_json_loads(analysis.peak_alpha_freq_json) or {}
    connectivity = _maybe_json_loads(analysis.connectivity_json) or {}
    asymmetry = _maybe_json_loads(analysis.asymmetry_json) or {}
    graph = _maybe_json_loads(analysis.graph_metrics_json) or {}
    source = _maybe_json_loads(analysis.source_roi_json) or {}
    legacy = _maybe_json_loads(analysis.band_powers_json) or {}

    # Normalise legacy bands into §1.1 shape when the MNE columns are bare.
    bands: dict = {}
    legacy_bands = (legacy or {}).get("bands") or {}
    for band, info in legacy_bands.items():
        chans = (info or {}).get("channels") or {}
        bands[band] = {
            "absolute_uv2": {
                ch: float(v.get("absolute_uv2", 0.0) or 0.0) for ch, v in chans.items()
            },
            "relative": {
                ch: float(v.get("relative_pct", 0.0) or 0.0) / 100.0
                for ch, v in chans.items()
            },
        }

    return {
        "spectral": {
            "bands": bands,
            "aperiodic": aperiodic,
            "peak_alpha_freq": paf,
        },
        "connectivity": connectivity,
        "asymmetry": asymmetry,
        "graph": graph,
        "source": source,
    }


def _persist_envelope_data_with_stub(envelope: dict) -> str:
    """Serialise a bridge envelope's ``data`` dict for JSON-column persistence
    with the envelope-level ``is_stub`` flag folded into the payload, so the
    frontend can render a "MODEL NOT AVAILABLE — DO NOT CLINICALLY USE" badge
    without a separate column. Reference: AI go-live audit 2026-05-08 (#9).
    """
    data = envelope.get("data")
    if not isinstance(data, dict):
        return json.dumps(data)
    return json.dumps({**data, "is_stub": bool(envelope.get("is_stub", False))})


def _build_upgrade_response(
    analysis: QEEGAnalysis,
    envelope: dict,
) -> AIUpgradeResult:
    """Coerce a bridge envelope into an :class:`AIUpgradeResult`."""
    data = envelope.get("data") if isinstance(envelope.get("data"), dict) else None
    return AIUpgradeResult(
        analysis_id=analysis.id,
        success=bool(envelope.get("success", False)),
        error=envelope.get("error"),
        is_stub=bool(envelope.get("is_stub", False)),
        data=data,
        analysis=AnalysisOut.from_record(analysis),
    )


@router.post("/{analysis_id}/compute-embedding", response_model=AIUpgradeResult)
def compute_embedding_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AIUpgradeResult:
    """Compute a LaBraM-style foundation embedding for a completed analysis.

    Persists the resulting 200-dim vector into ``embedding_json``. Returns a
    structured envelope with ``success=False`` (not HTTP 500) when the
    foundation-model dependency is missing.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    try:
        from app.services import qeeg_ai_bridge

        # The embedding path needs an ``mne.Epochs`` object. We don't want to
        # re-run preprocessing here, so pass a lightweight placeholder whose
        # ``info`` attribute gives the stub a deterministic seed. The stub
        # path in foundation_embedding hashes this — no heavy deps touched.
        class _EpochsStub:
            analysis_id = analysis.id
            info = {"analysis_id": analysis.id}

        envelope = qeeg_ai_bridge.run_compute_embedding_safe(
            _EpochsStub(),
            deterministic_seed=hash(analysis.id) & 0xFFFFFFFF,
        )
        if envelope.get("success") and isinstance(envelope.get("data"), dict):
            # Persist only the bare vector (easier for SQL consumers).
            vec = envelope["data"].get("embedding")
            if isinstance(vec, list):
                analysis.embedding_json = json.dumps(vec)
                db.commit()
                db.refresh(analysis)
    except Exception as exc:  # pragma: no cover — bridge is safe, but belt & braces
        _log.exception("compute-embedding endpoint failed for %s", analysis_id)
        envelope = {
            "success": False,
            "data": None,
            "error": f"{type(exc).__name__}: {exc}",
            "is_stub": True,
        }

    return _build_upgrade_response(analysis, envelope)


@router.post("/{analysis_id}/predict-brain-age", response_model=AIUpgradeResult)
def predict_brain_age_endpoint(
    analysis_id: str,
    chronological_age: Optional[int] = Query(default=None, ge=0, le=120),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AIUpgradeResult:
    """Predict brain age and persist the full ``brain_age`` dict."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    try:
        from app.services import qeeg_ai_bridge

        features = _load_features_for_ai(analysis)
        envelope = qeeg_ai_bridge.run_predict_brain_age_safe(
            features,
            chronological_age=chronological_age,
            deterministic_seed=hash(analysis.id) & 0xFFFFFFFF,
        )
        if envelope.get("success") and isinstance(envelope.get("data"), dict):
            analysis.brain_age_json = _persist_envelope_data_with_stub(envelope)
            db.commit()
            db.refresh(analysis)
    except Exception as exc:  # pragma: no cover
        _log.exception("predict-brain-age endpoint failed for %s", analysis_id)
        envelope = {
            "success": False,
            "data": None,
            "error": f"{type(exc).__name__}: {exc}",
            "is_stub": True,
        }

    return _build_upgrade_response(analysis, envelope)


@router.post("/{analysis_id}/score-conditions", response_model=AIUpgradeResult)
def score_conditions_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AIUpgradeResult:
    """Compute neurophysiological similarity indices (CONTRACT_V2 §1 risk_scores)."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    try:
        from app.services import qeeg_ai_bridge

        features = _load_features_for_ai(analysis)
        envelope = qeeg_ai_bridge.run_score_conditions_safe(features)
        if envelope.get("success") and isinstance(envelope.get("data"), dict):
            analysis.risk_scores_json = _persist_envelope_data_with_stub(envelope)
            db.commit()
            db.refresh(analysis)
    except Exception as exc:  # pragma: no cover
        _log.exception("score-conditions endpoint failed for %s", analysis_id)
        envelope = {
            "success": False,
            "data": None,
            "error": f"{type(exc).__name__}: {exc}",
            "is_stub": True,
        }

    return _build_upgrade_response(analysis, envelope)


@router.post("/{analysis_id}/fit-centiles", response_model=AIUpgradeResult)
def fit_centiles_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AIUpgradeResult:
    """Compute GAMLSS centile curves and persist to ``centiles_json``."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    try:
        from app.services import qeeg_ai_bridge

        features = _load_features_for_ai(analysis)
        envelope = qeeg_ai_bridge.run_fit_centiles_safe(features)
        if envelope.get("success") and isinstance(envelope.get("data"), dict):
            analysis.centiles_json = _persist_envelope_data_with_stub(envelope)
            db.commit()
            db.refresh(analysis)
    except Exception as exc:  # pragma: no cover
        _log.exception("fit-centiles endpoint failed for %s", analysis_id)
        envelope = {
            "success": False,
            "data": None,
            "error": f"{type(exc).__name__}: {exc}",
            "is_stub": True,
        }

    return _build_upgrade_response(analysis, envelope)


@router.post("/{analysis_id}/explain", response_model=AIUpgradeResult)
def explain_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AIUpgradeResult:
    """Run attribution / OOD / Adebayo sanity and persist to ``explainability_json``."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    try:
        from app.services import qeeg_ai_bridge

        features = _load_features_for_ai(analysis)
        risk_scores = _maybe_json_loads(analysis.risk_scores_json) or {}
        envelope = qeeg_ai_bridge.run_explain_safe(features, risk_scores)
        if envelope.get("success") and isinstance(envelope.get("data"), dict):
            analysis.explainability_json = _persist_envelope_data_with_stub(envelope)
            db.commit()
            db.refresh(analysis)
    except Exception as exc:  # pragma: no cover
        _log.exception("explain endpoint failed for %s", analysis_id)
        envelope = {
            "success": False,
            "data": None,
            "error": f"{type(exc).__name__}: {exc}",
            "is_stub": True,
        }

    return _build_upgrade_response(analysis, envelope)


class SimilarCasesResponse(BaseModel):
    """Response shape for :func:`get_similar_cases_endpoint`."""

    analysis_id: str
    success: bool
    k: int
    cases: list[dict] = Field(default_factory=list)
    error: Optional[str] = None
    is_stub: bool = False
    cached: bool = False


@router.get("/{analysis_id}/similar-cases", response_model=SimilarCasesResponse)
def get_similar_cases_endpoint(
    analysis_id: str,
    k: int = Query(default=10, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SimilarCasesResponse:
    """Return top-K similar cases for an analysis.

    When the column is already populated we short-circuit and return the
    cached list; otherwise we compute on-the-fly via the bridge.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    cached = _maybe_ai_list_loads(analysis.similar_cases_json)
    if cached:
        return SimilarCasesResponse(
            analysis_id=analysis_id,
            success=True,
            k=min(k, len(cached)),
            cases=cached[:k],
            cached=True,
        )

    try:
        from app.services import qeeg_ai_bridge

        embedding = _maybe_ai_embedding_loads(analysis.embedding_json) or []
        envelope = qeeg_ai_bridge.run_similar_cases_safe(
            embedding,
            k=k,
            db_session=db,
        )
        if envelope.get("success"):
            raw = envelope.get("data")
            if isinstance(raw, dict):
                raw = raw.get("cases") or raw.get("similar_cases") or []
            if isinstance(raw, list):
                cases = [c for c in raw if isinstance(c, dict)]
                analysis.similar_cases_json = json.dumps(cases)
                db.commit()
                db.refresh(analysis)
                return SimilarCasesResponse(
                    analysis_id=analysis_id,
                    success=True,
                    k=min(k, len(cases)),
                    cases=cases[:k],
                    is_stub=bool(envelope.get("is_stub", False)),
                )
        return SimilarCasesResponse(
            analysis_id=analysis_id,
            success=False,
            k=k,
            cases=[],
            error=envelope.get("error") or "similar-cases service unavailable",
            is_stub=bool(envelope.get("is_stub", True)),
        )
    except Exception as exc:  # pragma: no cover
        _log.exception("similar-cases endpoint failed for %s", analysis_id)
        return SimilarCasesResponse(
            analysis_id=analysis_id,
            success=False,
            k=k,
            cases=[],
            error=f"{type(exc).__name__}: {exc}",
            is_stub=True,
        )


@router.post("/{analysis_id}/recommend-protocol", response_model=AIUpgradeResult)
def recommend_protocol_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AIUpgradeResult:
    """Generate a :class:`ProtocolRecommendation` and persist it."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    try:
        from app.services import qeeg_ai_bridge
        from app.services.feature_store_client import (
            attach_feature_store_metadata,
            build_feature_store_client,
        )
        from app.settings import get_settings

        features = _load_features_for_ai(analysis)
        risk_scores = _maybe_json_loads(analysis.risk_scores_json) or {}

        # Layer 2 integration point: fetch feature-store lineage metadata and
        # persist it alongside model outputs. This is intentionally a minimal
        # abstraction (no Feast details leak past FeatureStoreClient).
        settings = get_settings()
        tenant_id = settings.feature_store_default_tenant_id
        fs_client = build_feature_store_client(settings)
        fs_result = fs_client.fetch_patient_features(
            tenant_id=tenant_id,
            patient_id=analysis.patient_id,
            feature_set="qeeg_recommend_protocol_v1",
        )

        # Gather supporting papers for the recommender (best-effort).
        papers_env = qeeg_ai_bridge.run_retrieve_papers_safe(
            features,
            {"patient_id": analysis.patient_id},
            k=10,
            db_session=db,
        )
        papers: list[dict] = []
        if papers_env.get("success") and isinstance(papers_env.get("data"), list):
            papers = [p for p in papers_env["data"] if isinstance(p, dict)]

        envelope = qeeg_ai_bridge.run_recommend_protocol_safe(
            features,
            risk_scores,
            papers=papers,
            db_session=db,
        )
        if envelope.get("success") and isinstance(envelope.get("data"), dict):
            persisted = attach_feature_store_metadata(envelope["data"], fs_result.metadata)
            analysis.protocol_recommendation_json = json.dumps(persisted)
            db.commit()
            db.refresh(analysis)
    except Exception as exc:  # pragma: no cover
        _log.exception("recommend-protocol endpoint failed for %s", analysis_id)
        envelope = {
            "success": False,
            "data": None,
            "error": f"{type(exc).__name__}: {exc}",
            "is_stub": True,
        }

    return _build_upgrade_response(analysis, envelope)


class ProtocolRecommendationOut(BaseModel):
    protocol_id: str
    protocol_name: str
    score: float
    condition_id: str
    modality_id: str
    target_region: Optional[str] = None
    evidence_urls: list[str] = Field(default_factory=list)
    disclaimer: str


class RecommendationsResponse(BaseModel):
    analysis_id: str
    success: bool
    recommendations: list[ProtocolRecommendationOut] = Field(default_factory=list)
    contraindications: list[dict] = Field(default_factory=list)
    rules_fired: list[dict] = Field(default_factory=list)
    disclaimer: str = (
        "Research and wellness use only. Decision-support output requires clinician supervision and "
        "is not a medical diagnosis or treatment recommendation. Discuss any findings with a qualified clinician."
    )


@router.get("/{analysis_id}/recommendations", response_model=RecommendationsResponse)
def get_recommendations_endpoint(
    analysis_id: str,
    k: int = Query(default=5, ge=1, le=10),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> RecommendationsResponse:
    """Return ranked protocol candidates (decision support)."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    if recommend_protocols is None or summarize_for_recommender is None:
        raise ApiServiceError(
            code="feature_unavailable",
            message="qEEG protocol recommendations are unavailable.",
            status_code=503,
            details={
                "feature": "qeeg_protocol_recommendations",
                "status": "unavailable",
                "reason": "The deepsynaps_qeeg.recommender package is not installed in this environment.",
                "remediation": "Install the deepsynaps-qeeg-pipeline package with the recommender extra.",
            },
        )

    # Build a minimal pipeline_result-like payload for summarization.
    band_powers = _maybe_json_loads(getattr(analysis, "band_powers_json", None))
    rel_maps = _band_powers_relative_map(band_powers if isinstance(band_powers, dict) else None)

    features_payload = {
        "spectral": {
            "bands": {
                band: {"relative": rel}
                for band, rel in rel_maps.items()
            },
            "peak_alpha_freq": _maybe_json_loads(getattr(analysis, "peak_alpha_freq_json", None)) or {},
        },
        "asymmetry": _maybe_json_loads(getattr(analysis, "asymmetry_json", None)) or {},
        "connectivity": _maybe_json_loads(getattr(analysis, "connectivity_json", None)) or {},
    }
    zscores_payload = _maybe_json_loads(getattr(analysis, "normative_zscores_json", None)) or {}
    risk_scores_payload = _maybe_json_loads(getattr(analysis, "risk_scores_json", None)) or {}

    fv = summarize_for_recommender(
        {"features": features_payload, "zscores": zscores_payload, "risk_scores": risk_scores_payload}
    )

    # Patient meta: use structured medical_history when available (best-effort).
    patient = db.query(Patient).filter_by(id=analysis.patient_id).first()
    patient_meta = _maybe_json_loads(getattr(patient, "medical_history", None)) if patient else None
    if not isinstance(patient_meta, dict):
        patient_meta = {}

    lib = ProtocolLibrary.load() if ProtocolLibrary is not None else None
    recs, contra_hits, rule_hits = recommend_protocols(
        fv,
        patient_meta=patient_meta,
        library=lib,
        top_k=k,
    )

    return RecommendationsResponse(
        analysis_id=analysis_id,
        success=True,
        recommendations=[
            ProtocolRecommendationOut(
                protocol_id=r.protocol_id,
                protocol_name=r.protocol_name,
                score=float(r.score),
                condition_id=r.condition_id,
                modality_id=r.modality_id,
                target_region=r.target_region,
                evidence_urls=list(r.evidence_urls),
                disclaimer=r.disclaimer,
            )
            for r in recs
        ],
        contraindications=[{"protocol_id": h.protocol_id, "reason": h.reason} for h in contra_hits],
        rules_fired=[
            {
                "rule_id": h.rule_id,
                "condition_slug": h.condition_slug,
                "score": h.score,
                "summary": h.summary,
                "citations": [{"label": c.label, "url": c.url} for c in h.citations],
                "debug": h.debug,
            }
            for h in rule_hits
        ],
    )


class TrajectoryResponse(BaseModel):
    patient_id: str
    success: bool
    error: Optional[str] = None
    is_stub: bool = False
    trajectory: Optional[dict] = None


@router.get("/patients/{patient_id}/trajectory", response_model=TrajectoryResponse)
def patient_trajectory_endpoint(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TrajectoryResponse:
    """Return the longitudinal trajectory payload for a patient.

    Delegates to :func:`deepsynaps_qeeg.ai.longitudinal.generate_trajectory_report`.
    Returns ``success=False`` with a non-500 response when the scaffold
    longitudinal module is missing from the worker.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    try:
        from app.services import qeeg_ai_bridge

        envelope = qeeg_ai_bridge.run_trajectory_report_safe(patient_id, db)
        return TrajectoryResponse(
            patient_id=patient_id,
            success=bool(envelope.get("success", False)),
            error=envelope.get("error"),
            is_stub=bool(envelope.get("is_stub", False)),
            trajectory=envelope.get("data") if isinstance(envelope.get("data"), dict) else None,
        )
    except Exception as exc:  # pragma: no cover
        _log.exception("trajectory endpoint failed for %s", patient_id)
        return TrajectoryResponse(
            patient_id=patient_id,
            success=False,
            error=f"{type(exc).__name__}: {exc}",
            is_stub=True,
            trajectory=None,
        )


# CONTRACT_V3 §5.1 / §5.2 — FHIR + BIDS exports.
@router.get("/{analysis_id}/export/fhir")
def export_qeeg_fhir(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """Export a qEEG analysis as a FHIR R4 Bundle document.

    Gated: requires approved and signed-off report.
    """
    require_minimum_role(actor, "clinician")

    from app.services import fhir_export

    row = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if row is None:
        raise ApiServiceError(
            code="not_found", message="Analysis not found", status_code=404,
        )
    _gate_patient_access(actor, row.patient_id, db)
    _verify_qeeg_export_governance(db, analysis_id)
    _record_qeeg_backend_audit_event(
        db,
        actor=actor,
        analysis_id=analysis_id,
        patient_id=row.patient_id,
        event="fhir_export",
        note="FHIR R4 Bundle export initiated",
    )

    bundle = fhir_export.qeeg_to_fhir_bundle(row)
    return Response(
        content=json.dumps(bundle, indent=2),
        media_type="application/fhir+json",
        headers={
            "Content-Disposition": (
                f'attachment; filename="qeeg_fhir_{analysis_id}.json"'
            ),
        },
    )


@router.get("/{analysis_id}/safety-cockpit", response_model=SafetyCockpitOut)
def get_safety_cockpit(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SafetyCockpitOut:
    """Return the clinical safety cockpit for a qEEG analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.qeeg_safety_engine import compute_safety_cockpit

    # Use persisted cockpit if available, else compute on-the-fly
    cockpit = None
    if analysis.safety_cockpit_json:
        try:
            cockpit = json.loads(analysis.safety_cockpit_json)
        except (TypeError, ValueError):
            pass
    if cockpit is None:
        cockpit = compute_safety_cockpit(analysis)
        analysis.safety_cockpit_json = json.dumps(cockpit)
        db.commit()
    return SafetyCockpitOut(**cockpit)


@router.get("/{analysis_id}/red-flags", response_model=RedFlagsOut)
def get_red_flags(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> RedFlagsOut:
    """Return red-flag detector output for a qEEG analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.qeeg_safety_engine import detect_red_flags

    flags = None
    if analysis.red_flags_json:
        try:
            flags = json.loads(analysis.red_flags_json)
        except (TypeError, ValueError):
            pass
    if flags is None:
        notes = None
        if analysis.qeeg_record_id:
            qeeg_record = db.query(QEEGRecord).filter_by(id=analysis.qeeg_record_id).first()
            if qeeg_record:
                notes = qeeg_record.summary_notes
        flags = detect_red_flags(analysis, notes=notes)
        analysis.red_flags_json = json.dumps(flags)
        db.commit()
    return RedFlagsOut(**flags)


@router.get("/{analysis_id}/normative-model-card", response_model=NormativeModelCardOut)
def get_normative_model_card(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> NormativeModelCardOut:
    """Return normative model metadata for a qEEG analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    _enforce_qeeg_ai_consent_for_patient_derived_endpoint(
        db, actor, analysis_id, analysis.patient_id, endpoint="normative-model-card",
    )

    meta = None
    if analysis.normative_metadata_json:
        try:
            meta = json.loads(analysis.normative_metadata_json)
        except (TypeError, ValueError):
            pass

    norm_db = analysis.norm_db_version or "unknown"
    allowed = set(NormativeModelCardOut.model_fields.keys())
    if meta:
        meta_clean = {k: v for k, v in meta.items() if k in allowed}
        try:
            card = NormativeModelCardOut(**meta_clean)
        except Exception:
            card = _normative_card_defaults(norm_db)
            card.eyes_condition_compatible = bool(analysis.eyes_condition)
    else:
        card = _normative_card_defaults(norm_db)
        card.eyes_condition_compatible = bool(analysis.eyes_condition)

    rc = _resolve_recording_condition(analysis.eyes_condition)
    provider = _normative_provider_payload(norm_db, card.status)
    return card.model_copy(
        update={
            "recording_condition": rc,
            "normative_provider": provider,
        }
    )


@router.post("/{analysis_id}/protocol-fit", response_model=ProtocolFitOut)
def compute_protocol_fit_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ProtocolFitOut:
    """Compute and persist a protocol-fit recommendation."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    patient = db.query(Patient).filter_by(id=analysis.patient_id).first()
    if not patient:
        raise ApiServiceError(code="not_found", message="Patient not found", status_code=404)

    from app.services.qeeg_protocol_fit import compute_protocol_fit

    fit = compute_protocol_fit(analysis, patient, db)
    db.commit()
    db.refresh(fit)
    return ProtocolFitOut(
        id=fit.id,
        analysis_id=fit.analysis_id,
        pattern_summary=fit.pattern_summary,
        symptom_linkage=json.loads(fit.symptom_linkage_json) if fit.symptom_linkage_json else None,
        contraindications=json.loads(fit.contraindications_json) if fit.contraindications_json else [],
        evidence_grade=fit.evidence_grade,
        off_label_flag=fit.off_label_flag,
        candidate_protocol=json.loads(fit.candidate_protocol_json) if fit.candidate_protocol_json else None,
        alternative_protocols=json.loads(fit.alternative_protocols_json) if fit.alternative_protocols_json else [],
        match_rationale=fit.match_rationale,
        caution_rationale=fit.caution_rationale,
        required_checks=json.loads(fit.required_checks_json) if fit.required_checks_json else [],
        clinician_reviewed=fit.clinician_reviewed,
    )


@router.get("/{analysis_id}/protocol-fit", response_model=ProtocolFitOut)
def get_protocol_fit_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ProtocolFitOut:
    """Return the persisted protocol-fit recommendation."""
    require_minimum_role(actor, "clinician")
    fit = db.query(QEEGProtocolFit).filter_by(analysis_id=analysis_id).order_by(QEEGProtocolFit.created_at.desc()).first()
    if not fit:
        raise ApiServiceError(code="not_found", message="Protocol fit not found. Run POST first.", status_code=404)
    _gate_patient_access(actor, fit.patient_id, db)
    return ProtocolFitOut(
        id=fit.id,
        analysis_id=fit.analysis_id,
        pattern_summary=fit.pattern_summary,
        symptom_linkage=json.loads(fit.symptom_linkage_json) if fit.symptom_linkage_json else None,
        contraindications=json.loads(fit.contraindications_json) if fit.contraindications_json else [],
        evidence_grade=fit.evidence_grade,
        off_label_flag=fit.off_label_flag,
        candidate_protocol=json.loads(fit.candidate_protocol_json) if fit.candidate_protocol_json else None,
        alternative_protocols=json.loads(fit.alternative_protocols_json) if fit.alternative_protocols_json else [],
        match_rationale=fit.match_rationale,
        caution_rationale=fit.caution_rationale,
        required_checks=json.loads(fit.required_checks_json) if fit.required_checks_json else [],
        clinician_reviewed=fit.clinician_reviewed,
    )


@router.post("/reports/{report_id}/transition")
def transition_report_state_endpoint(
    report_id: str,
    body: ReportStateTransitionIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Transition an AI report through its review workflow."""
    require_minimum_role(actor, "clinician")
    report = db.query(QEEGAIReport).filter_by(id=report_id).first()
    if not report:
        raise ApiServiceError(code="not_found", message="Report not found", status_code=404)
    _gate_patient_access(actor, report.patient_id, db)

    from app.services.qeeg_clinician_review import transition_report_state

    report = transition_report_state(report, body.action, actor, db, note=body.note)
    db.commit()
    db.refresh(report)
    return {"id": report.id, "report_state": report.report_state, "reviewer_id": report.reviewer_id, "reviewed_at": report.reviewed_at.isoformat() if report.reviewed_at else None}


@router.post("/reports/{report_id}/findings/{finding_id}")
def update_report_finding_endpoint(
    report_id: str,
    finding_id: str,
    body: ReportFindingUpdateIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Update a single finding's review status."""
    require_minimum_role(actor, "clinician")
    report = db.query(QEEGAIReport).filter_by(id=report_id).first()
    if not report:
        raise ApiServiceError(code="not_found", message="Report not found", status_code=404)
    _gate_patient_access(actor, report.patient_id, db)

    from app.services.qeeg_clinician_review import update_finding_status

    finding = update_finding_status(finding_id, body.status, body.clinician_note, body.amended_text, actor, db)
    db.commit()
    return {"id": finding.id, "status": finding.status, "claim_type": finding.claim_type}


@router.post("/reports/{report_id}/sign")
def sign_report_endpoint(
    report_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Digitally sign-off on an approved report."""
    require_minimum_role(actor, "clinician")
    report = db.query(QEEGAIReport).filter_by(id=report_id).first()
    if not report:
        raise ApiServiceError(code="not_found", message="Report not found", status_code=404)
    _gate_patient_access(actor, report.patient_id, db)

    from app.services.qeeg_clinician_review import sign_report

    report = sign_report(report_id, actor, db)
    db.commit()
    return {"id": report.id, "signed_by": report.signed_by, "signed_at": report.signed_at.isoformat() if report.signed_at else None}


@router.get("/reports/{report_id}/patient-facing")
def get_patient_facing_report(
    report_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Return the sanitized patient-facing version of an AI report.

    Gated: report must be approved (or reviewed with amendments) before
    the patient-facing version is returned.
    """
    require_minimum_role(actor, "clinician")
    report = db.query(QEEGAIReport).filter_by(id=report_id).first()
    if not report:
        raise ApiServiceError(code="not_found", message="Report not found", status_code=404)
    # Phase 2 fix (audit P1-1): suppress cross-tenant access to 404 so that
    # an actor in clinic A cannot enumerate report IDs that belong to clinic B.
    # Previously the gate raised a 403 that revealed the row's existence.
    try:
        _gate_patient_access(actor, report.patient_id, db)
    except ApiServiceError as gate_exc:
        if getattr(gate_exc, "status_code", None) == 403:
            raise ApiServiceError(code="not_found", message="Report not found", status_code=404) from None
        raise

    if report.report_state not in ("APPROVED", "REVIEWED_WITH_AMENDMENTS"):
        raise ApiServiceError(
            code="report_not_approved",
            message="Patient-facing report is only available after clinician approval.",
            status_code=403,
        )

    from app.services.qeeg_claim_governance import resolve_patient_facing_report

    resolved = resolve_patient_facing_report(
        ai_narrative_json=report.ai_narrative_json,
        report_payload=getattr(report, "report_payload", None),
        patient_facing_report_json=report.patient_facing_report_json,
    )
    if resolved is not None:
        return resolved

    return {"disclaimer": "Patient-facing report not yet generated.", "content": None}


@router.get("/patient/{patient_id}/timeline", response_model=list[TimelineEventOut])
def get_patient_timeline(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[TimelineEventOut]:
    """Return the longitudinal DeepTwin/qEEG timeline for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    from app.services.qeeg_timeline import build_timeline

    events = build_timeline(patient_id, db)
    return [TimelineEventOut(**e) for e in events]


@router.post("/{analysis_id}/export-bids")
def export_bids_package(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    """Export a Clinical qEEG Package in BIDS-style zip format.

    Gated: requires approved and signed-off report.
    """
    require_minimum_role(actor, "clinician")
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)
    _verify_qeeg_export_governance(db, analysis_id)
    _record_qeeg_backend_audit_event(
        db,
        actor=actor,
        analysis_id=analysis_id,
        patient_id=analysis.patient_id,
        event="bids_export",
        note="BIDS-style zip package export initiated",
    )

    from app.services.qeeg_bids_export import build_bids_package

    buf = build_bids_package(analysis_id, actor, db)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                f'attachment; filename="qeeg_clinical_package_{analysis_id}.zip"'
            ),
        },
    )


# ── CSV export (launch-audit 2026-04-30) ──────────────────────────────────────
#
# Real CSV envelope for a single qEEG analysis. Returns band-power rows
# alongside z-scores when the analysis carries normative deviations. Used
# by the Analyzer page for clinician-facing downloads. Never fakes data:
# if no analysis exists, this is a 404; if no band powers exist yet,
# rows is 0 and the response is honest about it.

class QEEGCsvExportResponse(BaseModel):
    csv: str
    rows: int
    generated_at: str
    analysis_id: str
    demo: bool = False


def _qeeg_csv_escape(value: object) -> str:
    if value is None:
        return ""
    s = str(value)
    if any(ch in s for ch in (",", '"', "\n", "\r")):
        return '"' + s.replace('"', '""') + '"'
    return s


@router.get("/{analysis_id}/export-csv", response_model=QEEGCsvExportResponse)
def export_qeeg_csv(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QEEGCsvExportResponse:
    """Real per-analysis CSV download. No fake rows, no fake success toast."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    bands_payload = _maybe_json_loads(analysis.band_powers_json) or {}
    bands = (bands_payload or {}).get("bands") if isinstance(bands_payload, dict) else None
    bands = bands or {}
    norm = _maybe_json_loads(analysis.normative_deviations_json) or {}

    band_names = list(bands.keys())
    headers = ["channel"] + band_names + [f"{b}_zscore" for b in band_names]
    lines = [",".join(headers)]

    channel_set: set[str] = set()
    for b in band_names:
        for ch in (bands.get(b, {}) or {}).get("channels", {}).keys():
            channel_set.add(ch)

    for ch in sorted(channel_set):
        row: list[object] = [ch]
        for b in band_names:
            v = ((bands.get(b, {}) or {}).get("channels", {}) or {}).get(ch, {}).get("relative_pct")
            row.append(round(v, 2) if isinstance(v, (int, float)) else "")
        for b in band_names:
            z = (norm.get(ch) or {}).get(b) if isinstance(norm, dict) else None
            row.append(round(z, 2) if isinstance(z, (int, float)) else "")
        lines.append(",".join(_qeeg_csv_escape(v) for v in row))

    return QEEGCsvExportResponse(
        csv="\n".join(lines),
        rows=len(channel_set),
        generated_at=datetime.now(timezone.utc).isoformat(),
        analysis_id=analysis_id,
        demo=False,
    )


# ── Page-level audit ingestion (launch-audit 2026-04-30) ──────────────────────
#
# Lightweight audit event sink for the qEEG Analyzer page. The persistence
# table is the same one used by /api/v1/audit-trail (admins see it through
# the `get_audit_trail` service). Ingestion is best-effort and never raises
# back at the UI: audit-trail outages must not break clinical workflow.

class QEEGAuditEventIn(BaseModel):
    event: str = Field(..., max_length=120)
    analysis_id: Optional[str] = Field(None, max_length=64)
    patient_id: Optional[str] = Field(None, max_length=64)
    note: Optional[str] = Field(None, max_length=1024)
    using_demo_data: Optional[bool] = False
    # Optional namespace prefix so non-qEEG surfaces (e.g. the Brain Map
    # Planner) can reuse this endpoint while still being attributable in the
    # audit trail. Falls back to "qeeg" for backwards-compat.
    # max_length bumped from 32 → 64 (2026-05-01) to accommodate the
    # ``channel_misconfiguration_detector`` surface (33 chars) and the
    # ``caregiver_delivery_concern_aggregator`` surface (37 chars). The
    # whitelist below is the real safety boundary; the cap is just a
    # defensive ceiling against runaway strings.
    surface: Optional[str] = Field("qeeg", max_length=64)


class QEEGAuditEventOut(BaseModel):
    accepted: bool
    event_id: str


@router.post("/audit-events", response_model=QEEGAuditEventOut)
def record_qeeg_audit_event(
    payload: QEEGAuditEventIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> QEEGAuditEventOut:
    require_minimum_role(actor, "clinician")
    from app.repositories.audit import create_audit_event

    now = datetime.now(timezone.utc)
    # Surface prefix lets us share this endpoint across multiple clinical
    # surfaces while still carrying provenance in the audit trail. Whitelist
    # the prefix to avoid arbitrary user-supplied strings ending up in audit
    # `action` rows. Default "qeeg" preserves prior behaviour.
    raw_surface = (payload.surface or "qeeg").strip().lower()
    surface = raw_surface if raw_surface in {"qeeg", "brain_map_planner", "session_runner", "adverse_events", "adverse_events_hub", "audit_trail", "reports", "documents", "documents_hub", "quality_assurance", "irb_manager", "clinical_trials", "course_detail", "patient_profile", "onboarding_wizard", "symptom_journal", "wellness_hub", "patient_reports", "patient_messages", "home_devices", "population_analytics", "adherence_events", "home_program_tasks", "wearables", "wearables_workbench", "clinician_inbox", "care_team_coverage", "clinician_adherence_hub", "clinician_wellness_hub", "clinician_digest", "auto_page_worker", "oncall_delivery", "escalation_policy", "patient_oncall_visibility", "patient_digest", "caregiver_consent", "caregiver_portal", "caregiver_email_digest_worker", "channel_misconfiguration_detector", "channel_auth_health_probe", "channel_auth_drift_resolution", "channel_auth_drift_resolution_audit_hub", "auth_drift_rotation_policy_advisor", "rotation_policy_advisor_outcome_tracker", "rotation_policy_advisor_threshold_tuning", "rotation_policy_advisor_threshold_adoption_outcome_tracker", "caregiver_delivery_concern_aggregator", "caregiver_delivery_concern_resolution", "caregiver_delivery_concern_resolution_audit_hub", "caregiver_delivery_concern_resolution_outcome_tracker", "resolver_coaching_inbox", "resolver_coaching_self_review_digest", "resolver_coaching_digest_audit_hub", "coaching_digest_delivery_failure_drilldown", "irb_amendment_workflow", "irb_amendment_reviewer_workload", "irb_amendment_reviewer_workload_outcome_tracker", "reviewer_sla_calibration_threshold_tuning", "qeeg_report_annotations", "qeeg_annotation_outcome_tracker", "video_assessment", "handbooks"} else "qeeg"
    event_id = f"{surface}-{payload.event}-{actor.actor_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    target_id = payload.analysis_id or payload.patient_id or actor.clinic_id or actor.actor_id
    note_parts: list[str] = []
    if payload.using_demo_data:
        note_parts.append("DEMO")
    if payload.patient_id:
        note_parts.append(f"patient={payload.patient_id}")
    if payload.analysis_id:
        note_parts.append(f"analysis={payload.analysis_id}")
    if payload.note:
        note_parts.append(payload.note[:500])
    note = "; ".join(note_parts) or payload.event

    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id),
            target_type=surface,
            action=f"{surface}.{payload.event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=note[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover - audit must never block UI
        _log.exception("qeeg audit-event persistence failed")
        return QEEGAuditEventOut(accepted=False, event_id=event_id)

    return QEEGAuditEventOut(accepted=True, event_id=event_id)


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: Advanced Integration + Reporting (Weeks 13-16)
# ═══════════════════════════════════════════════════════════════════════════════

class ReportGenerateOut(BaseModel):
    """Response shape for the 14-section clinical report endpoint."""

    analysis_id: str
    success: bool
    report: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    generated_at: str = ""
    schema_version: str = "0.4.0"
    report_state: str = "DRAFT_AI"
    disclaimer: str = (
        "This report is decision-support only and does not constitute a medical diagnosis. "
        "All findings require correlation with clinical history and qualified clinician review."
    )


@router.post("/{analysis_id}/experimental/report", response_model=ReportGenerateOut)
def generate_report_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ReportGenerateOut:
    """Generate a complete 14-section qEEG clinical report.

    Decision-support only. Report is generated in DRAFT_AI state and
    requires clinician sign-off before distribution per IQCB 2025.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    try:
        from app.services.qeeg_report_generator import generate_report

        # Build patient info
        patient = db.query(Patient).filter_by(id=analysis.patient_id).first()
        patient_info: dict[str, Any] = {
            "patient_id": analysis.patient_id,
            "age": patient.age if patient else None,
            "sex": patient.sex if patient else "unknown",
        }

        # Build scan metadata from analysis
        scan_metadata: dict[str, Any] = {
            "recording_date": analysis.created_at.isoformat() if analysis.created_at else None,
            "duration_sec": analysis.duration_sec,
            "sampling_rate": analysis.sampling_rate,
            "channels": _maybe_json_loads(analysis.channels_json) if analysis.channels_json else [],
            "montage": analysis.montage or "unknown",
            "eyes_condition": analysis.eyes_condition or "unknown",
        }

        # Build quality metrics
        quality_metrics: dict[str, Any] = {
            "overall_rating": analysis.quality_rating or "Unknown",
            "artifact_burden_pct": analysis.artifact_burden_pct,
            "bad_channels": _maybe_json_loads(analysis.bad_channels_json)
            if analysis.bad_channels_json
            else [],
            "total_channels": analysis.channel_count,
            "split_half_reliability": analysis.split_half_reliability,
            "snr_db": analysis.snr_db,
            "pipeline_steps": _maybe_json_loads(analysis.pipeline_steps_json)
            if analysis.pipeline_steps_json
            else [],
            "pipeline_version": analysis.pipeline_version or "unknown",
            "normative_db": analysis.norm_db_version or "unknown",
        }

        # Build spectral results
        spectral_results: dict[str, Any] = {
            "band_powers": _maybe_json_loads(analysis.band_powers_json)
            if analysis.band_powers_json
            else {},
            "ratios": _maybe_json_loads(analysis.ratios_json) if analysis.ratios_json else {},
            "asymmetry": _maybe_json_loads(analysis.asymmetry_json)
            if analysis.asymmetry_json
            else {},
            "iaf": _maybe_json_loads(analysis.peak_alpha_freq_json)
            if analysis.peak_alpha_freq_json
            else {},
            "psd_method": analysis.psd_method or "Welch (2s Hamming, 50% overlap)",
            "connectivity": _maybe_json_loads(analysis.connectivity_json)
            if analysis.connectivity_json
            else {},
        }

        # Build biomarker results
        biomarker_results: dict[str, Any] = {
            "findings": _maybe_json_loads(analysis.findings_json)
            if analysis.findings_json
            else [],
            "references": [],  # Would be populated from evidence DB
            "key_images": [],  # Would be populated from image captures
        }

        report = generate_report(
            analysis_id=analysis_id,
            patient_info=patient_info,
            scan_metadata=scan_metadata,
            quality_metrics=quality_metrics,
            spectral_results=spectral_results,
            biomarker_results=biomarker_results,
            template="default",
        )

        # Persist report payload for later retrieval
        from app.services.report_payload import build_report_payload

        try:
            payload = build_report_payload(report)
            analysis.report_payload_json = json.dumps(payload)
            db.commit()
        except Exception:
            _log.warning("report payload persistence skipped for %s", analysis_id)

        return ReportGenerateOut(
            analysis_id=analysis_id,
            success=True,
            report=report,
            generated_at=report["header"]["generated_at"],
            schema_version=report["header"]["schema_version"],
            report_state=report["header"]["report_state"],
        )
    except ApiServiceError:
        raise
    except Exception as exc:
        _log.exception("report generation failed for %s", analysis_id)
        return ReportGenerateOut(
            analysis_id=analysis_id,
            success=False,
            error=f"{type(exc).__name__}: {exc}",
            generated_at=datetime.now(timezone.utc).isoformat(),
        )


class ProtocolSuggestionsOut(BaseModel):
    """Response shape for protocol suggestion endpoint."""

    analysis_id: str
    success: bool
    suggestions: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    safety_screening_passed: bool = False
    disclaimer: str = (
        "Protocol suggestions are decision support only. "
        "Final protocol selection requires a qualified BCIA-certified or equivalent "
        "neurofeedback clinician."
    )
    error: Optional[str] = None


@router.get(
    "/{analysis_id}/experimental/protocol-suggestions",
    response_model=ProtocolSuggestionsOut,
)
def get_protocol_suggestions_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ProtocolSuggestionsOut:
    """Generate qEEG-guided neurofeedback protocol suggestions with safety screening.

    Returns ranked protocol list with contraindication checking.
    Decision-support only — requires qualified clinician for final selection.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    try:
        from app.services.qeeg_protocol_planner import plan_neurofeedback_protocol

        # Build spectral results
        spectral_results: dict[str, Any] = {
            "band_powers": _maybe_json_loads(analysis.band_powers_json)
            if analysis.band_powers_json
            else {},
            "ratios": _maybe_json_loads(analysis.ratios_json) if analysis.ratios_json else {},
            "asymmetry": _maybe_json_loads(analysis.asymmetry_json)
            if analysis.asymmetry_json
            else {},
        }

        biomarker_results: dict[str, Any] = {
            "findings": _maybe_json_loads(analysis.findings_json)
            if analysis.findings_json
            else [],
        }

        # Build patient history (best-effort from patient record)
        patient = db.query(Patient).filter_by(id=analysis.patient_id).first()
        patient_history: dict[str, Any] = {}
        if patient and patient.medical_history:
            try:
                history = json.loads(patient.medical_history)
                if isinstance(history, dict):
                    patient_history = history
            except (TypeError, ValueError):
                pass

        result = plan_neurofeedback_protocol(
            spectral_results=spectral_results,
            biomarker_results=biomarker_results,
            patient_history=patient_history,
        )

        return ProtocolSuggestionsOut(
            analysis_id=analysis_id,
            success=True,
            suggestions=result.get("suggestions", []),
            warnings=result.get("warnings", []),
            safety_screening_passed=result.get("safety_screening_passed", False),
            disclaimer=result.get("disclaimer", ProtocolSuggestionsOut().disclaimer),
        )
    except ApiServiceError:
        raise
    except Exception as exc:
        _log.exception("protocol suggestions failed for %s", analysis_id)
        return ProtocolSuggestionsOut(
            analysis_id=analysis_id,
            success=False,
            error=f"{type(exc).__name__}: {exc}",
        )


class MultimodalContextOut(BaseModel):
    """Response shape for multimodal cross-analyzer context."""

    patient_id: str
    qeeeg_analysis_id: str
    target_analyzer: str
    fusion_relevance: str = ""
    qeeeg_contributes: list[str] = Field(default_factory=list)
    fusion_opportunity: str = ""
    integration_method: str = ""
    clinical_value: str = ""
    safety_note: str = ""
    governance_note: str = ""
    error: Optional[str] = None


@router.get("/{analysis_id}/multimodal/{target}", response_model=MultimodalContextOut)
def get_multimodal_context_endpoint(
    analysis_id: str,
    target: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> MultimodalContextOut:
    """Get qEEG context for cross-analyzer multimodal fusion.

    Supported targets: mri, biomarkers, medications, assessments, risk, deeptwin.
    All correlations are temporal associations, not causal proof.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    try:
        from app.services.qeeg_multimodal_wiring import get_cross_analyzer_context

        result = get_cross_analyzer_context(
            patient_id=analysis.patient_id,
            analysis_id=analysis_id,
            target_analyzer=target,
        )

        if result.get("error"):
            return MultimodalContextOut(
                patient_id=analysis.patient_id,
                qeeeg_analysis_id=analysis_id,
                target_analyzer=target,
                error=result["error"],
            )

        # Determine the target contributes key dynamically
        target_contributes_key = f"{target}_contributes"
        target_contributes = result.get(target_contributes_key, [])

        return MultimodalContextOut(
            patient_id=result.get("patient_id", analysis.patient_id),
            qeeeg_analysis_id=result.get("qeeeg_analysis_id", analysis_id),
            target_analyzer=result.get("target_analyzer", target),
            fusion_relevance=result.get("fusion_relevance", ""),
            qeeeg_contributes=result.get("qeeeg_contributes", []),
            fusion_opportunity=result.get("fusion_opportunity", ""),
            integration_method=result.get("integration_method", ""),
            clinical_value=result.get("clinical_value", ""),
            safety_note=result.get("safety_note", ""),
            governance_note=result.get("governance_note", ""),
        )
    except ApiServiceError:
        raise
    except Exception as exc:
        _log.exception("multimodal context failed for %s/%s", analysis_id, target)
        return MultimodalContextOut(
            patient_id=analysis.patient_id if analysis else "",
            qeeeg_analysis_id=analysis_id,
            target_analyzer=target,
            error=f"{type(exc).__name__}: {exc}",
        )


class ComplianceDashboardOut(BaseModel):
    """Response shape for clinic compliance dashboard."""

    clinic_id: str
    success: bool
    compliance_metrics: dict[str, Any] = Field(default_factory=dict)
    state_distribution: dict[str, int] = Field(default_factory=dict)
    pending_signoff_queue: list[dict[str, Any]] = Field(default_factory=list)
    pending_signoff_total: int = 0
    action_items: list[dict[str, str]] = Field(default_factory=list)
    generated_at: str = ""
    error: Optional[str] = None


@router.get("/clinic/{clinic_id}/compliance", response_model=ComplianceDashboardOut)
def get_compliance_dashboard_endpoint(
    clinic_id: str,
    days: int = Query(default=30, ge=1, le=365),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ComplianceDashboardOut:
    """Return compliance dashboard metrics for a clinic.

    Includes approval rates, sign-off completion, safety review coverage,
    overdue alerts, and prioritized action items.
    """
    require_minimum_role(actor, "clinician")

    # Clinic access check
    if str(actor.clinic_id) != str(clinic_id):
        raise ApiServiceError(
            code="access_denied",
            message="You can only view compliance for your own clinic.",
            status_code=403,
        )

    try:
        from app.services.qeeg_compliance import compute_clinic_summary

        # Fetch analyses for this clinic within the period
        since = datetime.now(timezone.utc) - timedelta(days=days)
        analyses = (
            db.query(QEEGAnalysis)
            .filter(QEEGAnalysis.clinic_id == clinic_id)
            .filter(QEEGAnalysis.created_at >= since)
            .all()
        )

        summary = compute_clinic_summary(analyses, clinic_id)

        return ComplianceDashboardOut(
            clinic_id=clinic_id,
            success=True,
            compliance_metrics=summary.get("compliance_metrics", {}),
            state_distribution=summary.get("state_distribution", {}),
            pending_signoff_queue=summary.get("pending_signoff_queue", []),
            pending_signoff_total=summary.get("pending_signoff_total", 0),
            action_items=summary.get("action_items", []),
            generated_at=summary.get("generated_at", ""),
        )
    except ApiServiceError:
        raise
    except Exception as exc:
        _log.exception("compliance dashboard failed for clinic %s", clinic_id)
        return ComplianceDashboardOut(
            clinic_id=clinic_id,
            success=False,
            error=f"{type(exc).__name__}: {exc}",
            generated_at=datetime.now(timezone.utc).isoformat(),
        )


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3: AI Analysis + Connectivity Engine (Weeks 9-12)
# ══════════════════════════════════════════════════════════════════════════════


class SpectralAnalysisIn(BaseModel):
    """Request body for spectral analysis endpoint.

    Accepts EEG data as channel->signal mapping for analysis.
    """
    eeg_data: dict[str, list[float]] = Field(
        ..., description="channel_name -> list of signal values"
    )
    sfreq: float = Field(..., gt=0, description="Sampling frequency in Hz")
    channel_locations: dict[str, tuple[float, float, float]] = Field(
        default_factory=dict,
        description="channel_name -> (x, y, z) positions",
    )


class SpectralAnalysisOut(BaseModel):
    channel_spectral: dict
    band_powers: dict
    iaf: dict
    ratios: dict
    asymmetry: dict
    channel_count: int
    n_channels_total: int
    sfreq: float
    safety_note: str


@router.post("/{analysis_id}/experimental/spectral", response_model=SpectralAnalysisOut)
async def spectral_analysis_endpoint(
    analysis_id: str,
    payload: SpectralAnalysisIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SpectralAnalysisOut:
    """Run full spectral analysis (Welch PSD, band powers, IAF, ratios, asymmetry).

    Decision-support only. Requires clinician review. Not diagnostic.
    """
    require_minimum_role(actor, "clinician")

    result = full_spectral_analysis(
        eeg_data=payload.eeg_data,
        sfreq=payload.sfreq,
        channel_locations=payload.channel_locations,
    )

    return SpectralAnalysisOut(
        channel_spectral=result["channel_spectral"],
        band_powers=result["band_powers"],
        iaf=result["iaf"],
        ratios=result["ratios"],
        asymmetry=result["asymmetry"],
        channel_count=result["channel_count"],
        n_channels_total=result["n_channels_total"],
        sfreq=result["sfreq"],
        safety_note=result["safety_note"],
    )


class ConnectivityAnalysisIn(BaseModel):
    """Request body for connectivity analysis endpoint."""
    eeg_data: dict[str, list[float]] = Field(
        ..., description="channel_name -> list of signal values"
    )
    sfreq: float = Field(..., gt=0, description="Sampling frequency in Hz")
    band: tuple[float, float] = Field(
        default=(8.0, 13.0),
        description="Frequency band (low, high) in Hz",
    )
    threshold: float = Field(
        default=0.3,
        ge=0.0,
        le=1.0,
        description="Graph metric binarization threshold",
    )


class ConnectivityAnalysisOut(BaseModel):
    wpli_matrix: list[list[float]]
    coherence_matrix: list[list[float]]
    imaginary_coherence_matrix: list[list[float]]
    graph_metrics: dict
    band: tuple[float, float]
    n_channels: int
    methods_used: list[str]
    safety_note: str


@router.post(
    "/{analysis_id}/experimental/connectivity",
    response_model=ConnectivityAnalysisOut,
)
async def connectivity_analysis_endpoint(
    analysis_id: str,
    payload: ConnectivityAnalysisIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ConnectivityAnalysisOut:
    """Run connectivity analysis (wPLI, coherence, imaginary coherence, graph metrics).

    Volume conduction is a major confound. Decision-support only.
    Requires clinician review. Not diagnostic.
    """
    require_minimum_role(actor, "clinician")

    result = full_connectivity_analysis(
        eeg_data=payload.eeg_data,
        sfreq=payload.sfreq,
        band=payload.band,
        threshold=payload.threshold,
    )

    return ConnectivityAnalysisOut(
        wpli_matrix=result["wpli_matrix"],
        coherence_matrix=result["coherence_matrix"],
        imaginary_coherence_matrix=result["imaginary_coherence_matrix"],
        graph_metrics=result["graph_metrics"],
        band=result["band"],
        n_channels=result["n_channels"],
        methods_used=result["methods_used"],
        safety_note=result["safety_note"],
    )


class SourceLocalizationIn(BaseModel):
    """Request body for source localization endpoint."""
    eeg_data: dict[str, list[float]] = Field(
        ..., description="channel_name -> list of signal values"
    )
    sfreq: float = Field(..., gt=0, description="Sampling frequency in Hz")
    channel_locations: dict[str, tuple[float, float, float]] = Field(
        default_factory=dict,
        description="channel_name -> (x, y, z) positions",
    )
    band: tuple[float, float] = Field(
        default=(8.0, 13.0),
        description="Frequency band (low, high) in Hz",
    )
    methods: list[str] = Field(
        default=["sLORETA"],
        description="Source estimation methods to run",
    )


class SourceLocalizationOut(BaseModel):
    methods: dict
    uncertainty: dict
    n_channels: int
    sfreq: float
    band: tuple[float, float]
    safety_note: str


@router.post(
    "/{analysis_id}/experimental/source-localization",
    response_model=SourceLocalizationOut,
)
async def source_localization_endpoint(
    analysis_id: str,
    payload: SourceLocalizationIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SourceLocalizationOut:
    """Run source localization (sLORETA, eLORETA, MNE).

    Template head model — ~20mm localization error expected.
    Research-level only. Not for clinical diagnosis without expert review.
    """
    require_minimum_role(actor, "clinician")

    result = full_source_localization(
        eeg_data=payload.eeg_data,
        channel_locations=payload.channel_locations,
        sfreq=payload.sfreq,
        band=payload.band,
        methods=payload.methods,
    )

    return SourceLocalizationOut(
        methods=result["methods"],
        uncertainty=result["uncertainty"],
        n_channels=result["n_channels"],
        sfreq=result["sfreq"],
        band=result["band"],
        safety_note=result["safety_note"],
    )


class BiomarkersIn(BaseModel):
    """Request body for biomarker evidence panel endpoint."""
    spectral_results: dict = Field(
        default_factory=dict,
        description="Output from spectral analysis pipeline",
    )
    connectivity_results: dict = Field(
        default_factory=dict,
        description="Output from connectivity analysis pipeline",
    )
    age: int | None = Field(default=None, ge=0, le=120, description="Patient age in years")
    sex: str | None = Field(default=None, description="Patient sex (M/F/O)")


class BiomarkersOut(BaseModel):
    findings: list[dict]
    total_markers: int
    grade_distribution: dict[str, int]
    age_sex_context: dict
    evidence_grade_definitions: dict[str, str]
    interpretation: dict
    safety_note: str


@router.get("/{analysis_id}/experimental/biomarkers", response_model=BiomarkersOut)
async def biomarkers_evidence_panel(
    analysis_id: str,
    age: int | None = None,
    sex: str | None = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> BiomarkersOut:
    """Get biomarker evidence panel for an analysis.

    Returns 26 qEEG biomarkers across 11 conditions with evidence grades.
    Decision-support only. Never diagnostic. Requires clinician correlation.
    """
    require_minimum_role(actor, "clinician")

    biomarker_results = evaluate_biomarkers(
        spectral_results=None,
        connectivity_results=None,
        age=age,
        sex=sex,
    )

    interpretation = generate_safe_interpretation(biomarker_results)

    return BiomarkersOut(
        findings=biomarker_results["findings"],
        total_markers=biomarker_results["total_markers"],
        grade_distribution=biomarker_results["grade_distribution"],
        age_sex_context=biomarker_results["age_sex_context"],
        evidence_grade_definitions=biomarker_results["evidence_grade_definitions"],
        interpretation=interpretation,
        safety_note=biomarker_results["safety_note"],
    )


@router.post("/{analysis_id}/biomarkers", response_model=BiomarkersOut)
async def biomarkers_evidence_panel_with_data(
    analysis_id: str,
    payload: BiomarkersIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> BiomarkersOut:
    """Evaluate biomarkers against provided spectral and connectivity results.

    Returns 26 qEEG biomarkers across 11 conditions with evidence grades.
    Decision-support only. Never diagnostic. Requires clinician correlation.
    """
    require_minimum_role(actor, "clinician")

    biomarker_results = evaluate_biomarkers(
        spectral_results=payload.spectral_results or None,
        connectivity_results=payload.connectivity_results or None,
        age=payload.age,
        sex=payload.sex,
    )

    interpretation = generate_safe_interpretation(biomarker_results)

    return BiomarkersOut(
        findings=biomarker_results["findings"],
        total_markers=biomarker_results["total_markers"],
        grade_distribution=biomarker_results["grade_distribution"],
        age_sex_context=biomarker_results["age_sex_context"],
        evidence_grade_definitions=biomarker_results["evidence_grade_definitions"],
        interpretation=interpretation,
        safety_note=biomarker_results["safety_note"],
    )


@router.get("/biomarker-registry/summary")
async def biomarker_registry_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict:
    """Get summary of the biomarker registry (26 markers, 11 conditions, evidence grades).

    Transparency endpoint for governance and documentation.
    """
    require_minimum_role(actor, "clinician")
    return get_biomarker_summary()


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 5: Advanced qEEG Analysis Endpoints
# Spectral, Connectivity, Source Localization, Biomarkers,
# Protocol Suggestions, Report Generation, and Cross-Modal Fusion
# ══════════════════════════════════════════════════════════════════════════════

_QEEG_DISCLAIMER = (
    "Decision-support only. Not diagnostic. All qEEG outputs require correlation "
    "with clinical history and qualified clinician review before any clinical use."
)


def _mock_spectral_response(analysis_id: str) -> dict:
    """Return mock spectral data for demo mode."""
    return {
        "analysis_id": analysis_id,
        "demo_mode": True,
        "band_powers": {
            "delta": {
                "absolute_mean_uv2": 15.2,
                "relative_pct": 28.5,
                "channels": {
                    "Fp1": {"absolute_uv2": 18.5, "relative_pct": 30.2},
                    "Fp2": {"absolute_uv2": 17.9, "relative_pct": 29.8},
                    "Cz": {"absolute_uv2": 14.1, "relative_pct": 27.5},
                },
            },
            "theta": {
                "absolute_mean_uv2": 12.8,
                "relative_pct": 24.1,
                "channels": {
                    "Fp1": {"absolute_uv2": 14.2, "relative_pct": 25.1},
                    "Fp2": {"absolute_uv2": 13.6, "relative_pct": 24.5},
                    "Cz": {"absolute_uv2": 11.3, "relative_pct": 22.8},
                },
            },
            "alpha": {
                "absolute_mean_uv2": 10.5,
                "relative_pct": 19.7,
                "channels": {
                    "Fp1": {"absolute_uv2": 9.8, "relative_pct": 18.5},
                    "Fp2": {"absolute_uv2": 9.5, "relative_pct": 18.1},
                    "Cz": {"absolute_uv2": 12.2, "relative_pct": 21.5},
                    "O1": {"absolute_uv2": 14.5, "relative_pct": 24.2},
                    "O2": {"absolute_uv2": 14.1, "relative_pct": 23.8},
                },
            },
            "low_beta": {
                "absolute_mean_uv2": 8.3,
                "relative_pct": 15.6,
                "channels": {
                    "Fp1": {"absolute_uv2": 7.9, "relative_pct": 14.8},
                    "Cz": {"absolute_uv2": 9.2, "relative_pct": 16.5},
                },
            },
            "high_beta": {
                "absolute_mean_uv2": 4.7,
                "relative_pct": 8.8,
                "channels": {
                    "Fp1": {"absolute_uv2": 4.5, "relative_pct": 8.2},
                    "Cz": {"absolute_uv2": 5.1, "relative_pct": 9.5},
                },
            },
            "gamma": {
                "absolute_mean_uv2": 1.9,
                "relative_pct": 3.6,
                "channels": {
                    "Fp1": {"absolute_uv2": 1.8, "relative_pct": 3.4},
                    "Cz": {"absolute_uv2": 2.1, "relative_pct": 3.8},
                },
            },
        },
        "iaf": {"value": 10.2, "method": "peak_alpha", "confidence": "medium"},
        "ratios": {
            "theta_beta_ratio": 1.28,
            "theta_alpha_ratio": 1.22,
            "delta_alpha_ratio": 1.45,
        },
        "frontal_asymmetry": {
            "f4_f3_alpha": -0.15,
            "interpretation": "slightly reduced left frontal alpha (depression marker)",
        },
        "disclaimer": _QEEG_DISCLAIMER,
        "evidence_grade": "B",
    }


def _mock_connectivity_response(analysis_id: str) -> dict:
    """Return mock connectivity data for demo mode."""
    import random

    random.seed(hash(analysis_id) % 2**32)
    n_ch = 19
    wpli = [[0.0] * n_ch for _ in range(n_ch)]
    coherence = [[0.0] * n_ch for _ in range(n_ch)]
    for i in range(n_ch):
        for j in range(i + 1, n_ch):
            w = round(random.uniform(0.1, 0.75), 3)
            c = round(random.uniform(0.15, 0.85), 3)
            wpli[i][j] = wpli[j][i] = w
            coherence[i][j] = coherence[j][i] = c
    return {
        "analysis_id": analysis_id,
        "demo_mode": True,
        "connectivity_matrices": {
            "wpli": wpli,
            "coherence": coherence,
        },
        "graph_metrics": {
            "clustering_coefficient": round(random.uniform(0.3, 0.55), 3),
            "characteristic_path_length": round(random.uniform(1.8, 2.8), 2),
            "small_world_index": round(random.uniform(1.4, 2.2), 2),
            "modularity": round(random.uniform(0.3, 0.55), 3),
            "hubs": ["Cz", "Pz", "O1"],
        },
        "method": "wpli",
        "disclaimer": _QEEG_DISCLAIMER,
        "evidence_grade": "B",
    }


def _mock_source_localization_response(analysis_id: str) -> dict:
    """Return mock source localization data for demo mode."""
    return {
        "analysis_id": analysis_id,
        "demo_mode": True,
        "source_estimates": {
            "prefrontal": {"activation": 0.85, "uncertainty": 0.12},
            "temporal": {"activation": 0.62, "uncertainty": 0.18},
            "parietal": {"activation": 0.71, "uncertainty": 0.15},
            "occipital": {"activation": 0.93, "uncertainty": 0.10},
        },
        "region_activations": {
            "BA9": 0.82,
            "BA10": 0.78,
            "BA21": 0.65,
            "BA39": 0.73,
            "BA17": 0.95,
            "BA18": 0.88,
        },
        "uncertainty_metrics": {"mean_uncertainty": 0.14, "max_uncertainty": 0.22},
        "method": "eLORETA",
        "disclaimer": _QEEG_DISCLAIMER,
        "evidence_grade": "C",
    }


def _mock_biomarkers_response(analysis_id: str, condition: Optional[str] = None) -> dict:
    """Return mock biomarker data for demo mode."""
    markers = [
        {
            "name": "Elevated Theta/Beta Ratio",
            "condition": "ADHD",
            "z_score": 2.3,
            "evidence_grade": "A",
            "interpretation": "Elevated TBR consistent with attentional dysfunction",
        },
        {
            "name": "Reduced Alpha Peak Frequency",
            "condition": "depression",
            "z_score": -1.8,
            "evidence_grade": "B",
            "interpretation": "Slower alpha may indicate depressive state",
        },
        {
            "name": "Frontal Alpha Asymmetry",
            "condition": "depression",
            "z_score": -1.5,
            "evidence_grade": "B",
            "interpretation": "Reduced left frontal alpha associated with depression",
        },
        {
            "name": "Elevated Delta Power",
            "condition": "cognitive_impairment",
            "z_score": 2.1,
            "evidence_grade": "C",
            "interpretation": "Increased delta may indicate slow-wave dysfunction",
        },
        {
            "name": "Reduced Beta Coherence",
            "condition": "ADHD",
            "z_score": -1.9,
            "evidence_grade": "B",
            "interpretation": "Decreased inter-site beta coherence",
        },
        {
            "name": "Eleved Theta Frontally",
            "condition": "ADHD",
            "z_score": 2.0,
            "evidence_grade": "A",
            "interpretation": "Frontal theta elevation consistent with ADHD",
        },
        {
            "name": "Reduced SMR",
            "condition": "ADHD",
            "z_score": -1.7,
            "evidence_grade": "B",
            "interpretation": "Low sensorimotor rhythm associated with hyperactivity",
        },
        {
            "name": "Alpha Slowing",
            "condition": "cognitive_impairment",
            "z_score": -2.2,
            "evidence_grade": "B",
            "interpretation": "Subclinical alpha slowing may indicate early decline",
        },
    ]
    if condition:
        markers = [m for m in markers if condition.lower() in m["condition"].lower()]
    return {
        "analysis_id": analysis_id,
        "demo_mode": True,
        "biomarkers": markers,
        "total_markers": len(markers),
        "grade_distribution": {"A": 2, "B": 4, "C": 1, "D": 0},
        "disclaimer": _QEEG_DISCLAIMER,
    }


def _mock_protocol_suggestions(analysis_id: str, condition: str) -> dict:
    """Return mock protocol suggestions for demo mode."""
    return {
        "analysis_id": analysis_id,
        "demo_mode": True,
        "condition": condition,
        "protocols": [
            {
                "id": "p1",
                "name": "SMR Enhancement (12-15 Hz)",
                "target": "C4",
                "evidence_grade": "A",
                "sessions": 20,
                "contraindications": [],
            },
            {
                "id": "p2",
                "name": "Theta/Beta Ratio Training",
                "target": "Cz",
                "evidence_grade": "A",
                "sessions": 30,
                "contraindications": [],
            },
            {
                "id": "p3",
                "name": "Alpha-Theta Training",
                "target": "Pz",
                "evidence_grade": "B",
                "sessions": 15,
                "contraindications": ["bipolar_disorder"],
            },
            {
                "id": "p4",
                "name": "Frontal Asymmetry Training",
                "target": "F3/F4",
                "evidence_grade": "B",
                "sessions": 25,
                "contraindications": [],
            },
            {
                "id": "p5",
                "name": "Peak Alpha Frequency Training",
                "target": "Pz",
                "evidence_grade": "C",
                "sessions": 20,
                "contraindications": [],
            },
        ],
        "safety_screening_passed": True,
        "contraindications": [],
        "disclaimer": _QEEG_DISCLAIMER,
    }


def _mock_report_response(analysis_id: str) -> dict:
    """Return mock report data for demo mode."""
    now = datetime.now(timezone.utc).isoformat()
    return {
        "analysis_id": analysis_id,
        "demo_mode": True,
        "sections": {
            "executive_summary": "Demo qEEG report for testing. Elevated theta/beta ratio observed.",
            "methodology": "Standard qEEG analysis pipeline. Welch PSD, 2s epochs, 50% overlap.",
            "data_quality": "Good - 19 channels, 256 Hz, 5 min recording. <5% artifact rejection.",
            "spectral_analysis": "Delta 28.5%, Theta 24.1%, Alpha 19.7%, Low Beta 15.6%, High Beta 8.8%, Gamma 3.6%.",
            "connectivity": "Small-world index 1.85. Moderate fronto-parietal wPLI.",
            "source_localization": "Prefrontal activation 0.85, Occipital 0.93. Template head model used.",
            "biomarkers": "8 biomarkers evaluated. 2 Grade A, 4 Grade B, 1 Grade C, 1 Grade D.",
            "asymmetry": "Mild frontal alpha asymmetry (F4>F3). Consistent with depression literature.",
            "clinical_correlation": "Requires clinician correlation with full clinical history.",
            "neuromodulation_targets": "DLPFC, ACC, SMA identified as candidate targets.",
            "normative_comparison": "Theta/beta ratio >95th percentile for age. Alpha peak within norms.",
            "limitations": "Single session. Normative database: demo reference only.",
            "recommendations": "Consider theta/beta ratio training. Re-assess after 20 sessions.",
            "references": ["Hammond (2011)", "Arns et al. (2013)", "Thatcher (2012)"],
        },
        "disclaimer": _QEEG_DISCLAIMER,
        "report_state": "DRAFT_AI",
        "generated_at": now,
    }


# ── Spectral Analysis ────────────────────────────────────────────────────────

@router.post("/{analysis_id}/spectral")
async def compute_spectral_analysis_endpoint(
    analysis_id: str,
    request: Request,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Compute full spectral analysis: Welch PSD, band powers, IAF, ratios.

    Returns delta, theta, alpha, low_beta, high_beta, gamma powers,
    individual alpha frequency, theta/beta ratio, theta/alpha ratio,
    delta/alpha ratio, and frontal asymmetry.

    Decision-support only. Not diagnostic. Requires clinician review.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        return _mock_spectral_response(analysis_id)

    _enforce_qeeg_ai_consent_for_patient_derived_endpoint(
        db, actor, analysis_id, analysis.patient_id, endpoint="spectral-analysis",
    )

    if analysis.analysis_status != "completed":
        raise ApiServiceError(
            code="analysis_not_ready",
            message="Analysis must be completed before spectral analysis",
            status_code=400,
        )

    band_powers = _maybe_json_loads(analysis.band_powers_json) or {}
    peak_alpha = _maybe_json_loads(getattr(analysis, "peak_alpha_freq_json", None)) or {}
    asymmetry = _maybe_json_loads(getattr(analysis, "asymmetry_json", None)) or {}

    _record_qeeg_backend_audit_event(
        db,
        actor=actor,
        analysis_id=analysis_id,
        patient_id=analysis.patient_id,
        event="spectral_analysis_accessed",
        note="Spectral analysis results accessed",
    )

    derived = band_powers.get("derived_ratios", {}) if isinstance(band_powers, dict) else {}

    return {
        "analysis_id": analysis_id,
        "band_powers": band_powers,
        "iaf": peak_alpha,
        "ratios": derived,
        "frontal_asymmetry": asymmetry,
        "disclaimer": _QEEG_DISCLAIMER,
        "evidence_grade": "B",
    }


@router.get("/{analysis_id}/spectral")
async def get_spectral_results_endpoint(
    analysis_id: str,
    band: Optional[str] = Query(None, description="Filter by band: delta, theta, alpha, low_beta, high_beta, gamma"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get spectral analysis results."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        mock = _mock_spectral_response(analysis_id)
        if band and isinstance(mock.get("band_powers"), dict):
            mock["band_powers"] = {
                k: v for k, v in mock["band_powers"].items() if k == band.lower()
            }
        return mock

    band_powers = _maybe_json_loads(analysis.band_powers_json) or {}
    peak_alpha = _maybe_json_loads(getattr(analysis, "peak_alpha_freq_json", None)) or {}
    asymmetry = _maybe_json_loads(getattr(analysis, "asymmetry_json", None)) or {}
    derived = band_powers.get("derived_ratios", {}) if isinstance(band_powers, dict) else {}

    result = {
        "analysis_id": analysis_id,
        "band_powers": band_powers,
        "iaf": peak_alpha,
        "ratios": derived,
        "frontal_asymmetry": asymmetry,
        "disclaimer": _QEEG_DISCLAIMER,
        "evidence_grade": "B",
    }

    if band and isinstance(band_powers, dict) and "bands" in band_powers:
        bands = band_powers["bands"]
        if band.lower() in bands:
            result["band_powers"] = {"bands": {band.lower(): bands[band.lower()]}}
        else:
            result["band_powers"] = {"bands": {}}

    return result


# ── Connectivity Analysis ────────────────────────────────────────────────────

@router.post("/{analysis_id}/connectivity")
async def compute_connectivity_endpoint(
    analysis_id: str,
    request: Request,
    method: str = Query("wpli", description="Connectivity method: wpli, coherence, pli, plv"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Compute functional connectivity analysis.

    Returns connectivity matrices, graph metrics (clustering, path length,
    modularity, hub identification), and network topology measures.

    Decision-support only. Volume conduction is a major confound.
    Requires clinician review. Not diagnostic.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        return _mock_connectivity_response(analysis_id)

    _enforce_qeeg_ai_consent_for_patient_derived_endpoint(
        db, actor, analysis_id, analysis.patient_id, endpoint="connectivity-analysis",
    )

    if analysis.analysis_status != "completed":
        raise ApiServiceError(
            code="analysis_not_ready",
            message="Analysis must be completed before connectivity analysis",
            status_code=400,
        )

    connectivity = _maybe_json_loads(getattr(analysis, "connectivity_json", None)) or {}
    graph_metrics = _maybe_json_loads(getattr(analysis, "graph_metrics_json", None)) or {}

    _record_qeeg_backend_audit_event(
        db,
        actor=actor,
        analysis_id=analysis_id,
        patient_id=analysis.patient_id,
        event="connectivity_analysis_accessed",
        note=f"method={method}",
    )

    return {
        "analysis_id": analysis_id,
        "connectivity_matrices": connectivity,
        "graph_metrics": graph_metrics,
        "method": method,
        "disclaimer": _QEEG_DISCLAIMER,
        "evidence_grade": "B",
    }


@router.get("/{analysis_id}/connectivity")
async def get_connectivity_results_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get connectivity analysis results."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        return _mock_connectivity_response(analysis_id)

    connectivity = _maybe_json_loads(getattr(analysis, "connectivity_json", None)) or {}
    graph_metrics = _maybe_json_loads(getattr(analysis, "graph_metrics_json", None)) or {}

    return {
        "analysis_id": analysis_id,
        "connectivity_matrices": connectivity,
        "graph_metrics": graph_metrics,
        "disclaimer": _QEEG_DISCLAIMER,
        "evidence_grade": "B",
    }


# ── Source Localization ──────────────────────────────────────────────────────

@router.post("/{analysis_id}/source-localization")
async def compute_source_localization_endpoint(
    analysis_id: str,
    request: Request,
    method: str = Query("eloreta", description="Source method: sloreta, eloreta, mne"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Compute EEG source localization.

    Returns source estimates, region activations, uncertainty metrics.
    Template head model used -- ~20 mm localization error expected.
    Research-level only. Not for clinical diagnosis without expert review.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        return _mock_source_localization_response(analysis_id)

    _enforce_qeeg_ai_consent_for_patient_derived_endpoint(
        db, actor, analysis_id, analysis.patient_id, endpoint="source-localization",
    )

    if analysis.analysis_status != "completed":
        raise ApiServiceError(
            code="analysis_not_ready",
            message="Analysis must be completed before source localization",
            status_code=400,
        )

    source_roi = _maybe_json_loads(getattr(analysis, "source_roi_json", None)) or {}

    _record_qeeg_backend_audit_event(
        db,
        actor=actor,
        analysis_id=analysis_id,
        patient_id=analysis.patient_id,
        event="source_localization_accessed",
        note=f"method={method}",
    )

    return {
        "analysis_id": analysis_id,
        "source_estimates": source_roi,
        "region_activations": source_roi.get("roi_band_power", {}) if isinstance(source_roi, dict) else {},
        "uncertainty_metrics": source_roi.get("uncertainty", {}) if isinstance(source_roi, dict) else {},
        "method": method,
        "disclaimer": _QEEG_DISCLAIMER,
        "evidence_grade": "C",
    }


@router.get("/{analysis_id}/source-localization")
async def get_source_localization_results_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get source localization results."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        return _mock_source_localization_response(analysis_id)

    source_roi = _maybe_json_loads(getattr(analysis, "source_roi_json", None)) or {}

    return {
        "analysis_id": analysis_id,
        "source_estimates": source_roi,
        "region_activations": source_roi.get("roi_band_power", {}) if isinstance(source_roi, dict) else {},
        "uncertainty_metrics": source_roi.get("uncertainty", {}) if isinstance(source_roi, dict) else {},
        "disclaimer": _QEEG_DISCLAIMER,
        "evidence_grade": "C",
    }


# ── Biomarker Endpoints ──────────────────────────────────────────────────────

@router.get("/{analysis_id}/biomarkers")
async def get_biomarkers_endpoint(
    analysis_id: str,
    condition: Optional[str] = Query(None, description="Filter by condition"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get qEEG biomarker panel with evidence grades.

    Returns 20+ biomarkers across 11+ conditions with z-scores,
    interpretations, and evidence grades (A-D).

    Decision-support only. Never diagnostic. Requires clinician correlation.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        return _mock_biomarkers_response(analysis_id, condition)

    _enforce_qeeg_ai_consent_for_patient_derived_endpoint(
        db, actor, analysis_id, analysis.patient_id, endpoint="biomarkers",
    )

    band_powers = _maybe_json_loads(analysis.band_powers_json) or {}
    connectivity = _maybe_json_loads(getattr(analysis, "connectivity_json", None)) or {}

    try:
        biomarker_results = evaluate_biomarkers(
            spectral_results=band_powers if band_powers else None,
            connectivity_results=connectivity if connectivity else None,
            age=None,
            sex=None,
        )
        interpretation = generate_safe_interpretation(biomarker_results)

        findings = biomarker_results.get("findings", [])
        if condition:
            findings = [
                f for f in findings
                if condition.lower() in str(f.get("condition", "")).lower()
            ]

        return {
            "analysis_id": analysis_id,
            "biomarkers": findings,
            "total_markers": len(findings),
            "grade_distribution": biomarker_results.get("grade_distribution", {}),
            "interpretation": interpretation,
            "disclaimer": _QEEG_DISCLAIMER,
            "evidence_grade": "B",
        }
    except Exception as exc:
        _log.exception("Biomarker evaluation failed for %s", analysis_id)
        raise ApiServiceError(
            code="biomarker_evaluation_failed",
            message=f"Biomarker evaluation failed: {str(exc)[:300]}",
            status_code=500,
        )


@router.get("/{analysis_id}/biomarkers/summary")
async def get_biomarker_summary_endpoint(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get condensed biomarker summary for dashboard."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        mock = _mock_biomarkers_response(analysis_id)
        return {
            "analysis_id": analysis_id,
            "demo_mode": True,
            "summary": {
                "total_markers": mock["total_markers"],
                "grade_distribution": mock["grade_distribution"],
                "top_conditions": ["ADHD", "depression", "cognitive_impairment"],
            },
            "disclaimer": _QEEG_DISCLAIMER,
        }

    try:
        summary = get_biomarker_summary()
        band_powers = _maybe_json_loads(analysis.band_powers_json) or {}
        connectivity = _maybe_json_loads(getattr(analysis, "connectivity_json", None)) or {}

        biomarker_results = evaluate_biomarkers(
            spectral_results=band_powers if band_powers else None,
            connectivity_results=connectivity if connectivity else None,
            age=None,
            sex=None,
        )

        return {
            "analysis_id": analysis_id,
            "summary": {
                "total_markers": biomarker_results.get("total_markers", 0),
                "grade_distribution": biomarker_results.get("grade_distribution", {}),
                "conditions_evaluated": summary.get("conditions", []),
            },
            "disclaimer": _QEEG_DISCLAIMER,
        }
    except Exception as exc:
        _log.exception("Biomarker summary failed for %s", analysis_id)
        raise ApiServiceError(
            code="biomarker_summary_failed",
            message=f"Biomarker summary failed: {str(exc)[:300]}",
            status_code=500,
        )


# ── Protocol Suggestion Endpoints ────────────────────────────────────────────

@router.get("/{analysis_id}/protocol-suggestions")
async def get_protocol_suggestions_endpoint_v2(
    analysis_id: str,
    condition: str = Query(..., description="Target condition"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get neuromodulation protocol suggestions based on qEEG findings.

    Returns protocol library with safety screening, evidence grades,
    and contraindication checks.

    Decision-support only -- requires qualified clinician for final selection.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        return _mock_protocol_suggestions(analysis_id, condition)

    band_powers = _maybe_json_loads(analysis.band_powers_json) or {}

    _record_qeeg_backend_audit_event(
        db,
        actor=actor,
        analysis_id=analysis_id,
        patient_id=analysis.patient_id,
        event="protocol_suggestions_requested",
        note=f"condition={condition}",
    )

    # Delegate to existing recommender if available
    if recommend_protocols is not None and summarize_for_recommender is not None:
        try:
            rel_maps = _band_powers_relative_map(
                band_powers if isinstance(band_powers, dict) else None
            )
            features_payload = {
                "spectral": {
                    "bands": {band: {"relative": rel} for band, rel in rel_maps.items()},
                    "peak_alpha_freq": _maybe_json_loads(
                        getattr(analysis, "peak_alpha_freq_json", None)
                    ) or {},
                },
                "asymmetry": _maybe_json_loads(getattr(analysis, "asymmetry_json", None)) or {},
                "connectivity": _maybe_json_loads(getattr(analysis, "connectivity_json", None)) or {},
            }
            zscores = _maybe_json_loads(getattr(analysis, "normative_zscores_json", None)) or {}
            risk_scores = _maybe_json_loads(getattr(analysis, "risk_scores_json", None)) or {}

            fv = summarize_for_recommender(
                {"features": features_payload, "zscores": zscores, "risk_scores": risk_scores}
            )

            patient = db.query(Patient).filter_by(id=analysis.patient_id).first()
            patient_meta = _maybe_json_loads(getattr(patient, "medical_history", None)) if patient else None
            if not isinstance(patient_meta, dict):
                patient_meta = {}

            lib = ProtocolLibrary.load() if ProtocolLibrary is not None else None
            recs, contra_hits, rule_hits = recommend_protocols(
                fv,
                patient_meta=patient_meta,
                library=lib,
                top_k=10,
            )

            # Filter by condition if specified
            filtered_recs = [
                r for r in recs
                if condition.lower() in r.condition_id.lower()
            ] if condition else recs

            return {
                "analysis_id": analysis_id,
                "condition": condition,
                "protocols": [
                    {
                        "protocol_id": r.protocol_id,
                        "protocol_name": r.protocol_name,
                        "score": float(r.score),
                        "condition_id": r.condition_id,
                        "modality_id": r.modality_id,
                        "target_region": r.target_region,
                        "evidence_urls": list(r.evidence_urls),
                        "disclaimer": r.disclaimer,
                    }
                    for r in filtered_recs
                ],
                "safety_screening_passed": len(contra_hits) == 0,
                "contraindications": [
                    {"protocol_id": h.protocol_id, "reason": h.reason}
                    for h in contra_hits
                ],
                "rules_fired": [
                    {
                        "rule_id": h.rule_id,
                        "condition_slug": h.condition_slug,
                        "score": h.score,
                        "summary": h.summary,
                    }
                    for h in rule_hits
                ],
                "disclaimer": _QEEG_DISCLAIMER,
            }
        except Exception as exc:
            _log.warning("Recommender failed for %s: %s", analysis_id, exc)

    # Fallback: basic protocol suggestions
    return {
        "analysis_id": analysis_id,
        "condition": condition,
        "protocols": [],
        "safety_screening_passed": True,
        "contraindications": [],
        "note": (
            "Protocol suggestions require the deepsynaps_qeeg.recommender package "
            "or a configured protocol library."
        ),
        "disclaimer": _QEEG_DISCLAIMER,
        "evidence_grade": "B",
    }


# ── Report Generation Endpoints ──────────────────────────────────────────────

@router.post("/{analysis_id}/report")
async def generate_report_endpoint_v2(
    analysis_id: str,
    request: Request,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Generate 14-section structured qEEG report.

    Sections: executive summary, methodology, data quality, spectral analysis,
    connectivity, source localization, biomarkers, asymmetry, clinical
    correlation, neuromodulation targets, comparison to norms, limitations,
    recommendations, references.

    Decision-support only. Report is generated in DRAFT_AI state and
    requires clinician sign-off before distribution per IQCB 2025.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        return _mock_report_response(analysis_id)

    _enforce_qeeg_ai_consent_for_patient_derived_endpoint(
        db, actor, analysis_id, analysis.patient_id, endpoint="report-generation",
    )

    try:
        from app.services.qeeg_report_generator import generate_report

        patient = db.query(Patient).filter_by(id=analysis.patient_id).first()
        patient_info: dict = {
            "patient_id": analysis.patient_id,
            "age": patient.age if patient else None,
            "sex": patient.sex if patient else "unknown",
        }

        scan_metadata: dict = {
            "recording_date": analysis.created_at.isoformat() if analysis.created_at else None,
            "duration_sec": getattr(analysis, "recording_duration_sec", None),
            "sampling_rate": getattr(analysis, "sample_rate_hz", None),
            "channels": _maybe_json_loads(analysis.channels_json) if analysis.channels_json else [],
            "eyes_condition": analysis.eyes_condition or "unknown",
        }

        spectral_results: dict = {
            "band_powers": _maybe_json_loads(analysis.band_powers_json) or {},
            "ratios": _maybe_json_loads(getattr(analysis, "ratios_json", None)) or {},
            "asymmetry": _maybe_json_loads(getattr(analysis, "asymmetry_json", None)) or {},
            "iaf": _maybe_json_loads(getattr(analysis, "peak_alpha_freq_json", None)) or {},
            "connectivity": _maybe_json_loads(getattr(analysis, "connectivity_json", None)) or {},
        }

        biomarker_results: dict = {
            "findings": _maybe_json_loads(analysis.findings_json) if analysis.findings_json else [],
            "references": [],
        }

        report = generate_report(
            analysis_id=analysis_id,
            patient_info=patient_info,
            scan_metadata=scan_metadata,
            quality_metrics={},
            spectral_results=spectral_results,
            biomarker_results=biomarker_results,
            template="default",
        )

        # Persist report payload for later retrieval
        from app.services.report_payload import build_report_payload

        try:
            payload = build_report_payload(report)
            analysis.report_payload_json = json.dumps(payload)
            db.commit()
        except Exception:
            _log.warning("report payload persistence skipped for %s", analysis_id)

        _record_qeeg_backend_audit_event(
            db,
            actor=actor,
            analysis_id=analysis_id,
            patient_id=analysis.patient_id,
            event="report_generated",
            note="14-section structured report generated",
        )

        return {
            "analysis_id": analysis_id,
            "success": True,
            "report": report,
            "generated_at": report.get("header", {}).get("generated_at", ""),
            "schema_version": report.get("header", {}).get("schema_version", "0.4.0"),
            "report_state": "DRAFT_AI",
            "disclaimer": _QEEG_DISCLAIMER,
        }
    except ApiServiceError:
        raise
    except Exception as exc:
        _log.exception("Report generation failed for %s", analysis_id)
        return {
            "analysis_id": analysis_id,
            "success": False,
            "error": f"{type(exc).__name__}: {exc}",
            "disclaimer": _QEEG_DISCLAIMER,
            "report_state": "ERROR",
        }


@router.get("/{analysis_id}/report")
async def get_report_endpoint(
    analysis_id: str,
    format: str = Query("json", description="Format: json, html, pdf"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get generated report in requested format."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        return _mock_report_response(analysis_id)

    report_payload = _maybe_json_loads(getattr(analysis, "report_payload_json", None)) or {}

    fmt = format.lower()
    if fmt == "json":
        return {
            "analysis_id": analysis_id,
            "format": "json",
            "report": report_payload,
            "disclaimer": _QEEG_DISCLAIMER,
        }
    elif fmt == "html":
        return HTMLResponse(
            content=(
                f"<!DOCTYPE html><html><head><title>qEEG Report {analysis_id[:8]}</title></head>"
                f"<body><h1>qEEG Report {analysis_id[:8]}</h1>"
                f"<p>{_QEEG_DISCLAIMER}</p></body></html>"
            ),
            headers={
                "Content-Disposition": (
                    f'attachment; filename="qeeg_report_{analysis_id[:8]}.html"'
                ),
            },
        )
    elif fmt == "pdf":
        return {
            "analysis_id": analysis_id,
            "format": "pdf",
            "note": "PDF generation requires a PDF renderer (e.g., weasyprint).",
            "disclaimer": _QEEG_DISCLAIMER,
        }
    else:
        raise ApiServiceError(
            code="invalid_format",
            message=f"Unsupported format: {format}. Use json, html, or pdf.",
            status_code=400,
        )


# ── Cross-Modal Fusion Endpoints ─────────────────────────────────────────────

@router.get("/{analysis_id}/fusion/mri")
async def get_mri_fusion_endpoint(
    analysis_id: str,
    mri_analysis_id: str = Query(..., description="MRI analysis to fuse with"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get qEEG-MRI fusion summary."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        return {
            "analysis_id": analysis_id,
            "mri_analysis_id": mri_analysis_id,
            "demo_mode": True,
            "fusion_summary": {
                "correspondence": "Demo qEEG-MRI fusion results.",
                "overlapping_regions": ["prefrontal", "temporal"],
                "confidence": "medium",
            },
            "disclaimer": _QEEG_DISCLAIMER,
        }

    try:
        source_roi = _maybe_json_loads(getattr(analysis, "source_roi_json", None)) or {}
        fusion = get_fusion_summary(
            qeeg_source_roi=source_roi,
            mri_analysis_id=mri_analysis_id,
        )
        _record_qeeg_backend_audit_event(
            db,
            actor=actor,
            analysis_id=analysis_id,
            patient_id=analysis.patient_id,
            event="mri_fusion_accessed",
            note=f"mri_analysis_id={mri_analysis_id}",
        )
        return {
            "analysis_id": analysis_id,
            "mri_analysis_id": mri_analysis_id,
            "fusion_summary": fusion,
            "disclaimer": _QEEG_DISCLAIMER,
        }
    except Exception as exc:
        _log.exception("MRI fusion failed for %s", analysis_id)
        return {
            "analysis_id": analysis_id,
            "mri_analysis_id": mri_analysis_id,
            "error": f"{type(exc).__name__}: {exc}",
            "disclaimer": _QEEG_DISCLAIMER,
        }


@router.get("/{analysis_id}/fusion/neuromodulation-targets")
async def get_fused_neuromodulation_targets_endpoint(
    analysis_id: str,
    mri_analysis_id: str = Query(..., description="MRI analysis to fuse with"),
    condition: str = Query(..., description="Target condition"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
):
    """Get fused neuromodulation targets from qEEG + MRI."""
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if _is_demo_id(analysis_id) or _is_demo_id(analysis.patient_id):
        return {
            "analysis_id": analysis_id,
            "mri_analysis_id": mri_analysis_id,
            "condition": condition,
            "demo_mode": True,
            "fused_targets": [
                {
                    "region": "DLPFC",
                    "qeeg_support": 0.85,
                    "mri_support": 0.78,
                    "confidence": "high",
                    "rationale": "Convergent prefrontal hypoactivation",
                },
                {
                    "region": "ACC",
                    "qeeg_support": 0.72,
                    "mri_support": 0.65,
                    "confidence": "medium",
                    "rationale": "Midline theta source localization",
                },
                {
                    "region": "SMA",
                    "qeeg_support": 0.68,
                    "mri_support": 0.71,
                    "confidence": "medium",
                    "rationale": "Motor readiness potential elevation",
                },
            ],
            "disclaimer": _QEEG_DISCLAIMER,
        }

    try:
        source_roi = _maybe_json_loads(getattr(analysis, "source_roi_json", None)) or {}
        targets = get_neuromodulation_targets_fused(
            qeeg_source_roi=source_roi,
            mri_analysis_id=mri_analysis_id,
            condition=condition,
        )
        _record_qeeg_backend_audit_event(
            db,
            actor=actor,
            analysis_id=analysis_id,
            patient_id=analysis.patient_id,
            event="fused_neuromodulation_targets_accessed",
            note=f"mri_analysis_id={mri_analysis_id}; condition={condition}",
        )
        return {
            "analysis_id": analysis_id,
            "mri_analysis_id": mri_analysis_id,
            "condition": condition,
            "fused_targets": targets,
            "disclaimer": _QEEG_DISCLAIMER,
        }
    except Exception as exc:
        _log.exception("Fused targets failed for %s", analysis_id)
        return {
            "analysis_id": analysis_id,
            "mri_analysis_id": mri_analysis_id,
            "condition": condition,
            "error": f"{type(exc).__name__}: {exc}",
            "disclaimer": _QEEG_DISCLAIMER,
        }
