"""qEEG Raw Data Viewer & Interactive Cleaning — API endpoints.

Serves raw/cleaned EEG signal data in windowed chunks, ICA component
metadata + topomaps, and persists user cleaning configurations for
re-processing.  All MNE-heavy work is delegated to
:mod:`app.services.eeg_signal_service`.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import os

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from datetime import datetime, timezone

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AutoCleanRun,
    CleaningDecision,
    QEEGAnalysis,
)
from app.repositories.patients import resolve_patient_clinic_id

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/qeeg-raw", tags=["qeeg-raw"])


# ── Response / Request Models ───────────────────────────────────────────────


class ChannelDetail(BaseModel):
    name: str
    type: str = "eeg"
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    position_z: Optional[float] = None


class ChannelInfoResponse(BaseModel):
    analysis_id: str
    channels: list[ChannelDetail] = Field(default_factory=list)
    sfreq: float = 0.0
    duration_sec: float = 0.0
    n_samples: int = 0
    n_channels: int = 0


class CleaningLogItem(BaseModel):
    id: str
    actor: str  # 'ai' | 'user'
    action: str
    target: Optional[str] = None
    accepted_by_user: Optional[bool] = None
    confidence: Optional[float] = None
    created_at: Optional[str] = None


class CleaningLogResponse(BaseModel):
    analysis_id: str
    items: list[CleaningLogItem] = Field(default_factory=list)


class RawMetadataResponse(BaseModel):
    """Lightweight identification block for the Raw Cleaning Workbench
    header. Deliberately omits PHI — ``patient_name`` is always
    ``[redacted]`` because the workbench is a clinician-facing
    technical tool and the patient is referenced by ``patient_id``.
    """
    analysis_id: str
    patient_id: Optional[str] = None
    patient_name: Optional[str] = "[redacted]"
    original_filename: Optional[str] = None
    recording_date: Optional[str] = None
    eyes_condition: Optional[str] = None
    equipment: Optional[str] = None
    sample_rate_hz: Optional[float] = None
    channel_count: Optional[int] = None
    recording_duration_sec: Optional[float] = None
    analysis_status: Optional[str] = None


class AnnotationItem(BaseModel):
    onset: float
    duration: float
    description: str = ""


class SignalWindowResponse(BaseModel):
    analysis_id: str
    t_start: float
    t_end: float
    sfreq: float
    sfreq_original: float
    downsample_factor: int = 1
    channels: list[str] = Field(default_factory=list)
    n_samples: int = 0
    data: list[list[float]] = Field(default_factory=list)
    total_duration_sec: float = 0.0
    annotations: list[AnnotationItem] = Field(default_factory=list)
    processing_applied: list[str] = Field(default_factory=list)
    bad_channels_interpolated: list[str] = Field(default_factory=list)


class ICAComponentDetail(BaseModel):
    index: int
    topomap_b64: str = ""
    label: str = "unknown"
    label_probabilities: dict[str, float] = Field(default_factory=dict)
    is_excluded: bool = False
    variance_explained_pct: Optional[float] = None


class ICAComponentsResponse(BaseModel):
    analysis_id: str
    n_components: int = 0
    method: str = "unavailable"
    components: list[ICAComponentDetail] = Field(default_factory=list)
    auto_excluded_indices: list[int] = Field(default_factory=list)
    iclabel_available: bool = False


class ICATimecourseResponse(BaseModel):
    analysis_id: str
    component_index: int
    t_start: float
    t_end: float
    sfreq: float
    n_samples: int = 0
    data: list[float] = Field(default_factory=list)
    label: str = "unknown"
    is_excluded: bool = False


# Phase 3: filter preview ----------------------------------------------------

class FilterPreviewRequest(BaseModel):
    t_start: float = Field(default=0.0, ge=0.0)
    window_sec: float = Field(default=10.0, gt=0.0, le=30.0)
    lff: Optional[float] = Field(default=1.0, ge=0.0, le=200.0)
    hff: Optional[float] = Field(default=45.0, ge=0.0, le=500.0)
    notch: Optional[float] = Field(default=50.0, ge=0.0, le=200.0)


class FreqResponseModel(BaseModel):
    hz: list[float] = Field(default_factory=list)
    magnitude_db: list[float] = Field(default_factory=list)


class FilterPreviewResponse(BaseModel):
    analysis_id: str
    t_start: float = 0.0
    t_end: float = 0.0
    sfreq: float = 0.0
    channels: list[str] = Field(default_factory=list)
    raw: list[list[float]] = Field(default_factory=list)
    filtered: list[list[float]] = Field(default_factory=list)
    freq_response: FreqResponseModel = Field(default_factory=FreqResponseModel)
    params: dict[str, Optional[float]] = Field(default_factory=dict)


_REASON_VOCAB = {
    "blink", "lateral_eye", "sweat", "movement", "emg", "ecg",
    "electrode_pop", "line_noise", "flatline", "other",
}


class BadSegment(BaseModel):
    start_sec: float
    end_sec: float
    description: str = "BAD_user"
    # Phase 1 extensions (047): structured reason taxonomy + provenance.
    reason: Optional[str] = None
    source: Optional[str] = None  # 'user' | 'ai' | 'auto_scan'
    confidence: Optional[float] = None


class ICAExclusion(BaseModel):
    """Structured ICA exclusion entry. Backwards-compatible: callers may still pass plain ints."""
    idx: int
    label: Optional[str] = None  # 'brain'|'blink'|'eye'|'muscle'|'heart'|'line'|'channel-noise'|'other'
    source: Optional[str] = None  # 'user' | 'ai' | 'iclabel'
    confidence: Optional[float] = None


class CleaningConfigInput(BaseModel):
    bad_channels: list[str] = Field(default_factory=list)
    bad_segments: list[BadSegment] = Field(default_factory=list)
    excluded_ica_components: list[int] = Field(default_factory=list)
    included_ica_components: list[int] = Field(default_factory=list)
    bandpass_low: float = 1.0
    bandpass_high: float = 45.0
    notch_hz: Optional[float] = 50.0
    resample_hz: float = 250.0
    # Phase 1 extensions (047): provenance and structured ICA detail. All optional
    # so existing callers continue to round-trip without change.
    ica_method: Optional[str] = None  # 'infomax' | 'fastica' | 'picard'
    ica_seed: Optional[int] = None
    auto_clean_run_id: Optional[str] = None
    excluded_ica_detail: list[ICAExclusion] = Field(default_factory=list)
    decision_log_summary_json: Optional[str] = None


class CleaningConfigResponse(BaseModel):
    analysis_id: str
    saved_at: Optional[str] = None
    config: Optional[CleaningConfigInput] = None


class ReprocessResponse(BaseModel):
    analysis_id: str
    status: str
    message: str = ""


# ── Helpers ──────────────────────────────────────────────────────────────────


def _load_analysis(
    analysis_id: str, db: Session, actor: AuthenticatedActor | None = None
) -> QEEGAnalysis:
    """Load a qEEG analysis, optionally enforcing the cross-clinic gate.

    Pre-fix this returned the analysis unconditionally — every endpoint
    in this router (raw signal, cleaned signal, ICA components, ICA
    timecourse, cleaning config get/set, channel info, reprocess) was
    therefore wide open across clinics. Any clinician could read raw
    EDF samples from any patient in any clinic by guessing or
    enumerating analysis_ids.

    The new optional ``actor`` parameter is the load-bearing fix:
    when supplied, the patient's owning clinic is resolved and the
    canonical ``require_patient_owner`` is enforced. Existing call
    sites that pass ``actor`` (every route in this router) are now
    cross-clinic-safe; legacy callers that don't pass it (none in
    this file) keep the prior behaviour to avoid silent breakage.
    """
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    if actor is not None and analysis.patient_id:
        exists, clinic_id = resolve_patient_clinic_id(db, analysis.patient_id)
        if exists:
            try:
                require_patient_owner(actor, clinic_id)
            except ApiServiceError as exc:
                # Convert cross-clinic 403 to 404 to avoid leaking
                # row existence to a probing actor.
                if exc.code in {"cross_clinic_access_denied", "forbidden"}:
                    raise ApiServiceError(
                        code="not_found",
                        message="Analysis not found",
                        status_code=404,
                    ) from exc
                raise
        elif actor.role != "admin":
            # Orphaned patient — refuse for non-admins so a crafted
            # analysis_id whose patient_id no longer resolves cannot
            # become a covert read target.
            raise ApiServiceError(
                code="not_found",
                message="Analysis not found",
                status_code=404,
            )
    return analysis


def _require_mne() -> None:
    """Raise a clear error if MNE is not installed."""
    try:
        from app.services.eeg_signal_service import _HAS_MNE
        if not _HAS_MNE:
            raise ApiServiceError(
                code="dependency_missing",
                message="MNE-Python is not installed. The raw data viewer requires the qeeg_mne extra.",
                status_code=503,
            )
    except ImportError:
        raise ApiServiceError(
            code="dependency_missing",
            message="EEG signal service unavailable",
            status_code=503,
        )


# ── Endpoint 0: Lightweight metadata (no MNE) ──────────────────────────────


@router.get("/{analysis_id}/metadata", response_model=RawMetadataResponse)
def get_raw_metadata(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> RawMetadataResponse:
    """Return the workbench header block (identification + recording
    parameters) without touching MNE or the EDF file. Patient name is
    redacted by design — the workbench is keyed on ``patient_id``.
    """
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db, actor)
    return RawMetadataResponse(
        analysis_id=analysis_id,
        patient_id=getattr(analysis, "patient_id", None),
        original_filename=getattr(analysis, "original_filename", None),
        recording_date=getattr(analysis, "recording_date", None),
        eyes_condition=getattr(analysis, "eyes_condition", None),
        equipment=getattr(analysis, "equipment", None),
        sample_rate_hz=getattr(analysis, "sample_rate_hz", None),
        channel_count=getattr(analysis, "channel_count", None),
        recording_duration_sec=getattr(analysis, "recording_duration_sec", None),
        analysis_status=getattr(analysis, "analysis_status", None),
    )


# ── Endpoint 0b: Cleaning Log (CleaningDecision audit trail) ────────────────


@router.get("/{analysis_id}/cleaning-log", response_model=CleaningLogResponse)
def get_cleaning_log(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> CleaningLogResponse:
    """Return the per-analysis ``CleaningDecision`` audit rows (AI
    suggestions + clinician accept/edit/reject), newest-first.
    """
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    rows = (
        db.query(CleaningDecision)
        .filter(CleaningDecision.analysis_id == analysis_id)
        .order_by(CleaningDecision.created_at.desc())
        .all()
    )
    items = [
        CleaningLogItem(
            id=r.id,
            actor=r.actor,
            action=r.action,
            target=r.target,
            accepted_by_user=r.accepted_by_user,
            confidence=r.confidence,
            created_at=r.created_at.isoformat() if r.created_at else None,
        )
        for r in rows
    ]
    return CleaningLogResponse(analysis_id=analysis_id, items=items)


# ── Endpoint 1: Channel Info ────────────────────────────────────────────────


@router.get("/{analysis_id}/channel-info", response_model=ChannelInfoResponse)
def get_channel_info(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Return channel names, positions, sampling rate, and recording duration."""
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db, actor)

    # Try from DB first (fast path)
    if analysis.channels_json and analysis.sample_rate_hz and analysis.recording_duration_sec:
        try:
            ch_names = json.loads(analysis.channels_json)
            channels = [ChannelDetail(name=ch) for ch in ch_names]
            return ChannelInfoResponse(
                analysis_id=analysis_id,
                channels=channels,
                sfreq=float(analysis.sample_rate_hz),
                duration_sec=float(analysis.recording_duration_sec),
                n_samples=int(float(analysis.recording_duration_sec) * float(analysis.sample_rate_hz)),
                n_channels=len(ch_names),
            )
        except (TypeError, ValueError):
            pass

    # Fall back to loading the raw file
    _require_mne()
    from app.services.eeg_signal_service import extract_channel_info, load_raw_for_analysis

    raw = load_raw_for_analysis(analysis_id, db)
    info = extract_channel_info(raw)

    channels = [ChannelDetail(**ch) for ch in info["channels"]]
    return ChannelInfoResponse(
        analysis_id=analysis_id,
        channels=channels,
        sfreq=info["sfreq"],
        duration_sec=info["duration_sec"],
        n_samples=info["n_samples"],
        n_channels=info["n_channels"],
    )


# ── Endpoint 2: Raw Signal ──────────────────────────────────────────────────


@router.get("/{analysis_id}/raw-signal", response_model=SignalWindowResponse)
def get_raw_signal(
    analysis_id: str,
    t_start: float = Query(0.0, ge=0),
    t_end: Optional[float] = Query(None),
    window_sec: float = Query(10.0, gt=0, le=30),
    channels: Optional[str] = Query(None, description="Comma-separated channel names"),
    max_points_per_channel: int = Query(2500, gt=100, le=10000),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Serve raw (unprocessed) EEG signal in a time window."""
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)  # Validate existence
    _require_mne()

    from app.services.eeg_signal_service import extract_signal_window, load_raw_for_analysis

    raw = load_raw_for_analysis(analysis_id, db)
    ch_list = [c.strip() for c in channels.split(",")] if channels else None

    window = extract_signal_window(
        raw,
        t_start=t_start,
        t_end=t_end,
        window_sec=window_sec,
        channels=ch_list,
        max_points_per_channel=max_points_per_channel,
    )

    return SignalWindowResponse(analysis_id=analysis_id, **window)


# ── Endpoint 3: Cleaned Signal ──────────────────────────────────────────────


@router.get("/{analysis_id}/cleaned-signal", response_model=SignalWindowResponse)
def get_cleaned_signal(
    analysis_id: str,
    t_start: float = Query(0.0, ge=0),
    t_end: Optional[float] = Query(None),
    window_sec: float = Query(10.0, gt=0, le=30),
    channels: Optional[str] = Query(None, description="Comma-separated channel names"),
    max_points_per_channel: int = Query(2500, gt=100, le=10000),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Serve preprocessed + ICA-cleaned EEG signal in a time window."""
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    _require_mne()

    from app.services.eeg_signal_service import extract_signal_window, load_cleaned_for_analysis

    raw_clean = load_cleaned_for_analysis(analysis_id, db)
    ch_list = [c.strip() for c in channels.split(",")] if channels else None

    window = extract_signal_window(
        raw_clean,
        t_start=t_start,
        t_end=t_end,
        window_sec=window_sec,
        channels=ch_list,
        max_points_per_channel=max_points_per_channel,
    )

    return SignalWindowResponse(analysis_id=analysis_id, **window)


# ── Endpoint 4: ICA Components ──────────────────────────────────────────────


@router.get("/{analysis_id}/ica-components", response_model=ICAComponentsResponse)
def get_ica_components(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Return ICA component topomaps, ICLabel classifications, and auto-exclusion decisions."""
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    _require_mne()

    from app.services.eeg_signal_service import extract_ica_data

    ica_data = extract_ica_data(analysis_id, db)

    components = [ICAComponentDetail(**c) for c in ica_data.get("components", [])]
    return ICAComponentsResponse(
        analysis_id=analysis_id,
        n_components=ica_data.get("n_components", 0),
        method=ica_data.get("method", "unavailable"),
        components=components,
        auto_excluded_indices=ica_data.get("auto_excluded_indices", []),
        iclabel_available=ica_data.get("iclabel_available", False),
    )


# ── Endpoint 5: ICA Timecourse ──────────────────────────────────────────────


@router.get("/{analysis_id}/ica-timecourse/{component_index}", response_model=ICATimecourseResponse)
def get_ica_timecourse(
    analysis_id: str,
    component_index: int,
    t_start: float = Query(0.0, ge=0),
    t_end: Optional[float] = Query(None),
    window_sec: float = Query(10.0, gt=0, le=30),
    max_points: int = Query(2500, gt=100, le=10000),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Return the activation time course of a single ICA component."""
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    _require_mne()

    from app.services.eeg_signal_service import extract_ica_timecourse

    tc = extract_ica_timecourse(
        analysis_id, component_index, db,
        t_start=t_start, t_end=t_end, window_sec=window_sec, max_points=max_points,
    )
    return ICATimecourseResponse(**tc)


# ── Endpoint 5b (Phase 3): Filter Preview ───────────────────────────────────


@router.post(
    "/{analysis_id}/filter-preview",
    response_model=FilterPreviewResponse,
)
def post_filter_preview(
    analysis_id: str,
    body: Optional[FilterPreviewRequest] = None,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> FilterPreviewResponse:
    """Return paired raw/filtered traces + frequency response for a 10s window.

    Decision-support only — no persistence, no audit row. Used by the UI to
    preview the effect of LFF/HFF/notch parameters before the clinician
    commits them via Save / Reprocess.
    """
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    _require_mne()

    payload = body or FilterPreviewRequest()

    from app.services.eeg_signal_service import compute_filter_preview

    result = compute_filter_preview(
        analysis_id,
        db,
        t_start=payload.t_start,
        window_sec=payload.window_sec,
        lff=payload.lff,
        hff=payload.hff,
        notch=payload.notch,
    )
    return FilterPreviewResponse(**result)


# ── Endpoint 6: Save Cleaning Config ────────────────────────────────────────


@router.post("/{analysis_id}/cleaning-config", response_model=CleaningConfigResponse)
def save_cleaning_config(
    analysis_id: str,
    config: CleaningConfigInput,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Persist the user's manual cleaning decisions."""
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db, actor)

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    config_dict = config.model_dump()
    config_dict["version"] = 1
    config_dict["saved_at"] = now
    config_dict["saved_by"] = getattr(actor, "actor_id", None) or "unknown"

    analysis.cleaning_config_json = json.dumps(config_dict)
    db.commit()

    return CleaningConfigResponse(
        analysis_id=analysis_id,
        saved_at=now,
        config=config,
    )


# ── Endpoint 7: Get Cleaning Config ─────────────────────────────────────────


@router.get("/{analysis_id}/cleaning-config", response_model=CleaningConfigResponse)
def get_cleaning_config(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Retrieve the saved cleaning configuration."""
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db, actor)

    if not analysis.cleaning_config_json:
        return CleaningConfigResponse(analysis_id=analysis_id)

    try:
        config_dict = json.loads(analysis.cleaning_config_json)
    except (TypeError, ValueError):
        return CleaningConfigResponse(analysis_id=analysis_id)

    saved_at = config_dict.pop("saved_at", None)
    config_dict.pop("version", None)
    config_dict.pop("saved_by", None)

    return CleaningConfigResponse(
        analysis_id=analysis_id,
        saved_at=saved_at,
        config=CleaningConfigInput(**{k: v for k, v in config_dict.items() if k in CleaningConfigInput.model_fields}),
    )


# ── Endpoint 8: Reprocess ───────────────────────────────────────────────────


def _run_reprocess_background(analysis_id: str) -> None:
    """Background task to re-run the pipeline with user overrides."""
    from app.services.eeg_signal_service import run_custom_pipeline_sync

    result = run_custom_pipeline_sync(analysis_id)
    if result.get("status") == "failed":
        _log.error("Reprocess failed for %s: %s", analysis_id, result.get("error"))


@router.post("/{analysis_id}/reprocess", response_model=ReprocessResponse)
def reprocess_with_overrides(
    analysis_id: str,
    config: Optional[CleaningConfigInput] = None,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Re-run the MNE pipeline with user cleaning overrides.

    If ``config`` is provided, saves it first. Otherwise uses the
    previously saved cleaning configuration.
    """
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db, actor)

    # Save config if provided
    if config is not None:
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        config_dict = config.model_dump()
        config_dict["version"] = 1
        config_dict["saved_at"] = now
        config_dict["saved_by"] = getattr(actor, "actor_id", None) or "unknown"
        analysis.cleaning_config_json = json.dumps(config_dict)

    if not analysis.cleaning_config_json:
        raise ApiServiceError(
            code="no_config",
            message="No cleaning configuration saved. Save a cleaning config first.",
            status_code=400,
        )

    analysis.analysis_status = "processing:mne_pipeline_custom"
    analysis.analysis_error = None
    db.commit()

    background_tasks.add_task(_run_reprocess_background, analysis_id)

    return ReprocessResponse(
        analysis_id=analysis_id,
        status="processing",
        message="Re-processing started with your cleaning preferences. Poll the analysis status endpoint for progress.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Phase 4 — Artifact tooling endpoints
#
# All four mutate state (create AutoCleanRun rows + CleaningDecision audit
# rows). Decision-support only: nothing here mutates the raw EDF bytes; the
# clinician's accept/reject choices flow through CleaningConfigInput → the
# existing reprocess pipeline.
# ─────────────────────────────────────────────────────────────────────────────


def _audit(db, *, analysis_id, action_type, actor, new_value=None, source="ai"):
    """Mirror-write audit shim.

    The Phase 4 endpoints write to two places: CleaningDecision (this branch's
    canonical audit table from migration 047) and a QeegCleaningAuditEvent
    table from a sibling overnight workbench branch. That sibling table is not
    on this branch, so the mirror is a no-op here. CleaningDecision is the
    load-bearing audit row; QeegCleaningAuditEvent is the surface the older
    cleaning-log page reads from. When the branches converge in main, replace
    this shim with the real `_audit` helper from the workbench module.
    """
    # Intentional no-op — see docstring.
    return None


_AUTO_SCAN_REASONS = {
    "flatline",
    "high_kurtosis",
    "line_noise",
    "amp_threshold",
    "gradient",
}

_TEMPLATE_LABEL_MAP: dict[str, set[str]] = {
    # ICLabel uses a 7-class taxonomy: 'brain', 'muscle', 'eye', 'heart',
    # 'line_noise', 'channel_noise', 'other'. We accept a few alternate
    # spellings here so the UI can stay friendly.
    "eye_blink": {"eye", "blink", "eye_blink"},
    "lateral_eye": {"eye", "lateral_eye"},
    "emg": {"muscle", "emg"},
    "ecg": {"heart", "ecg", "ekg"},
    "electrode_pop": {"channel_noise", "electrode_pop", "channel-noise"},
}

_TEMPLATE_CONFIDENCE_THRESHOLD = 0.7


class AutoScanProposalChannel(BaseModel):
    channel: str
    reason: str
    metric: dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.0


class AutoScanProposalSegment(BaseModel):
    start_sec: float
    end_sec: float
    reason: str
    metric: dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.0


class AutoScanProposalSummary(BaseModel):
    n_bad_channels: int = 0
    n_bad_segments: int = 0
    total_excluded_sec: float = 0.0
    autoreject_used: bool = False
    scanner_version: str = "1.0"


class AutoScanProposal(BaseModel):
    bad_channels: list[AutoScanProposalChannel] = Field(default_factory=list)
    bad_segments: list[AutoScanProposalSegment] = Field(default_factory=list)
    summary: AutoScanProposalSummary = Field(default_factory=AutoScanProposalSummary)


class AutoScanResponse(BaseModel):
    analysis_id: str
    run_id: str
    proposal: AutoScanProposal
    notice: str = (
        "Decision-support only. Threshold-based auto-scan; clinician review "
        "required before any cleaning is applied."
    )


class AutoScanDecideRequest(BaseModel):
    accepted_items: dict[str, list[dict[str, Any]]] = Field(
        default_factory=lambda: {"bad_channels": [], "bad_segments": []},
    )
    rejected_items: dict[str, list[dict[str, Any]]] = Field(
        default_factory=lambda: {"bad_channels": [], "bad_segments": []},
    )


class AutoScanDecideResponse(BaseModel):
    analysis_id: str
    run_id: str
    committed_at: str
    decisions_logged: int = 0
    accepted_counts: dict[str, int] = Field(default_factory=dict)
    rejected_counts: dict[str, int] = Field(default_factory=dict)


class SpikeEvent(BaseModel):
    t_sec: float
    channel: Optional[str] = None
    peak_uv: Optional[float] = None
    classification: Optional[str] = None
    confidence: Optional[float] = None


class SpikeEventsResponse(BaseModel):
    analysis_id: str
    events: list[SpikeEvent] = Field(default_factory=list)
    detector_available: bool = False
    notice: str = (
        "Decision-support only. Empty list is a valid clinical signal "
        "(no spikes detected)."
    )


class ApplyTemplateRequest(BaseModel):
    template: str = Field(min_length=1, max_length=40)


class ApplyTemplateResponse(BaseModel):
    analysis_id: str
    template: str
    components_excluded: list[int] = Field(default_factory=list)
    components_examined: int = 0
    decisions_logged: int = 0
    notice: str = (
        "AI-applied template. Clinician review still required before "
        "exporting or interpreting cleaned data."
    )


def _merge_into_cleaning_config(
    analysis: QEEGAnalysis,
    *,
    accepted_bad_channels: list[dict[str, Any]],
    accepted_bad_segments: list[dict[str, Any]],
    auto_clean_run_id: Optional[str] = None,
    excluded_ica_components: Optional[list[int]] = None,
) -> dict[str, Any]:
    """Merge accepted scan items into the existing cleaning_config_json.

    Existing entries are preserved; new items are appended (de-duplicated by
    channel name / start-end pair / IC index). Returns the merged config
    dict for callers that want to inspect it.
    """
    cfg: dict[str, Any]
    try:
        cfg = json.loads(analysis.cleaning_config_json) if analysis.cleaning_config_json else {}
        if not isinstance(cfg, dict):
            cfg = {}
    except (TypeError, ValueError):
        cfg = {}

    cfg.setdefault("bad_channels", [])
    cfg.setdefault("bad_segments", [])
    cfg.setdefault("excluded_ica_components", [])
    cfg.setdefault("included_ica_components", [])
    cfg.setdefault("bandpass_low", 1.0)
    cfg.setdefault("bandpass_high", 45.0)
    cfg.setdefault("notch_hz", 50.0)
    cfg.setdefault("resample_hz", 250.0)

    existing_channels = {c for c in cfg["bad_channels"] if isinstance(c, str)}
    for item in accepted_bad_channels:
        ch = item.get("channel")
        if not ch or ch in existing_channels:
            continue
        cfg["bad_channels"].append(ch)
        existing_channels.add(ch)

    existing_seg_keys = {
        (round(float(s.get("start_sec", 0.0)), 2), round(float(s.get("end_sec", 0.0)), 2))
        for s in cfg["bad_segments"]
        if isinstance(s, dict) and "start_sec" in s
    }
    for item in accepted_bad_segments:
        try:
            start = round(float(item.get("start_sec", 0.0)), 2)
            end = round(float(item.get("end_sec", 0.0)), 2)
        except (TypeError, ValueError):
            continue
        key = (start, end)
        if key in existing_seg_keys:
            continue
        cfg["bad_segments"].append(
            {
                "start_sec": start,
                "end_sec": end,
                "description": "BAD_auto_scan",
                "reason": item.get("reason"),
                "source": "auto_scan",
                "confidence": item.get("confidence"),
            }
        )
        existing_seg_keys.add(key)

    if excluded_ica_components:
        existing_ica = set(int(x) for x in cfg["excluded_ica_components"] if isinstance(x, int))
        for idx in excluded_ica_components:
            try:
                ii = int(idx)
            except (TypeError, ValueError):
                continue
            if ii not in existing_ica:
                cfg["excluded_ica_components"].append(ii)
                existing_ica.add(ii)

    if auto_clean_run_id:
        cfg["auto_clean_run_id"] = auto_clean_run_id

    cfg["saved_at"] = datetime.now(timezone.utc).isoformat()
    cfg["version"] = cfg.get("version", 1)
    analysis.cleaning_config_json = json.dumps(cfg)
    return cfg


@router.post("/{analysis_id}/auto-scan", response_model=AutoScanResponse)
def post_auto_scan(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AutoScanResponse:
    """Run threshold-based auto-scan and persist proposal as ``AutoCleanRun``.

    Returns ``run_id`` + the structured proposal. The clinician then calls
    :func:`post_auto_scan_decide` with their accept/reject selections to
    commit. Until they do, nothing flows into ``cleaning_config_json``.
    """
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    _require_mne()

    from app.services.auto_artifact_scan import scan_for_artifacts

    result = scan_for_artifacts(analysis_id, db)

    run = AutoCleanRun(
        analysis_id=analysis_id,
        proposal_json=json.dumps(result),
        created_by=getattr(actor, "actor_id", None),
    )
    db.add(run)
    db.flush()

    # Audit row recording that the AI proposed a scan. No accept/reject yet.
    db.add(
        CleaningDecision(
            analysis_id=analysis_id,
            auto_clean_run_id=run.id,
            actor="ai",
            action="auto_scan_proposed",
            target=f"summary:{result['summary'].get('n_bad_channels', 0)}c/"
                   f"{result['summary'].get('n_bad_segments', 0)}s",
            payload_json=json.dumps(result["summary"]),
            accepted_by_user=None,
            confidence=None,
        )
    )
    _audit(
        db,
        analysis_id=analysis_id,
        action_type="auto_scan:generated",
        actor=actor,
        new_value={
            "run_id": run.id,
            "summary": result["summary"],
        },
        source="ai",
    )
    db.commit()
    db.refresh(run)

    return AutoScanResponse(
        analysis_id=analysis_id,
        run_id=run.id,
        proposal=AutoScanProposal(**result),
    )


@router.post(
    "/{analysis_id}/auto-scan/{run_id}/decide",
    response_model=AutoScanDecideResponse,
)
def post_auto_scan_decide(
    analysis_id: str,
    run_id: str,
    body: AutoScanDecideRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AutoScanDecideResponse:
    """Commit clinician accept/reject decisions on an auto-scan proposal.

    Writes one ``CleaningDecision`` audit row per accepted **and** rejected
    item, updates the ``AutoCleanRun`` row's ``accepted_items_json`` /
    ``rejected_items_json`` columns, and merges the *accepted* items into
    the analysis' ``cleaning_config_json`` so the next reprocess picks them
    up.
    """
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db, actor)

    run = (
        db.query(AutoCleanRun)
        .filter(AutoCleanRun.id == run_id, AutoCleanRun.analysis_id == analysis_id)
        .first()
    )
    if run is None:
        raise ApiServiceError(
            code="not_found",
            message="Auto-clean run not found.",
            status_code=404,
        )

    accepted = body.accepted_items or {"bad_channels": [], "bad_segments": []}
    rejected = body.rejected_items or {"bad_channels": [], "bad_segments": []}
    accepted_channels = list(accepted.get("bad_channels") or [])
    accepted_segments = list(accepted.get("bad_segments") or [])
    rejected_channels = list(rejected.get("bad_channels") or [])
    rejected_segments = list(rejected.get("bad_segments") or [])

    decisions_logged = 0
    for item in accepted_channels:
        db.add(
            CleaningDecision(
                analysis_id=analysis_id,
                auto_clean_run_id=run.id,
                actor="user",
                action="accept_ai_suggestion",
                target=f"bad_channel:{item.get('channel', '?')}",
                payload_json=json.dumps(item),
                accepted_by_user=True,
                confidence=item.get("confidence"),
            )
        )
        decisions_logged += 1
    for item in accepted_segments:
        db.add(
            CleaningDecision(
                analysis_id=analysis_id,
                auto_clean_run_id=run.id,
                actor="user",
                action="accept_ai_suggestion",
                target=(
                    f"bad_segment:{item.get('start_sec', 0)}-"
                    f"{item.get('end_sec', 0)}"
                ),
                payload_json=json.dumps(item),
                accepted_by_user=True,
                confidence=item.get("confidence"),
            )
        )
        decisions_logged += 1
    for item in rejected_channels:
        db.add(
            CleaningDecision(
                analysis_id=analysis_id,
                auto_clean_run_id=run.id,
                actor="user",
                action="reject_ai_suggestion",
                target=f"bad_channel:{item.get('channel', '?')}",
                payload_json=json.dumps(item),
                accepted_by_user=False,
                confidence=item.get("confidence"),
            )
        )
        decisions_logged += 1
    for item in rejected_segments:
        db.add(
            CleaningDecision(
                analysis_id=analysis_id,
                auto_clean_run_id=run.id,
                actor="user",
                action="reject_ai_suggestion",
                target=(
                    f"bad_segment:{item.get('start_sec', 0)}-"
                    f"{item.get('end_sec', 0)}"
                ),
                payload_json=json.dumps(item),
                accepted_by_user=False,
                confidence=item.get("confidence"),
            )
        )
        decisions_logged += 1

    run.accepted_items_json = json.dumps(
        {"bad_channels": accepted_channels, "bad_segments": accepted_segments}
    )
    run.rejected_items_json = json.dumps(
        {"bad_channels": rejected_channels, "bad_segments": rejected_segments}
    )

    _merge_into_cleaning_config(
        analysis,
        accepted_bad_channels=accepted_channels,
        accepted_bad_segments=accepted_segments,
        auto_clean_run_id=run.id,
    )
    _audit(
        db,
        analysis_id=analysis_id,
        action_type="auto_scan:decided",
        actor=actor,
        new_value={
            "run_id": run.id,
            "accepted_counts": {
                "bad_channels": len(accepted_channels),
                "bad_segments": len(accepted_segments),
            },
            "rejected_counts": {
                "bad_channels": len(rejected_channels),
                "bad_segments": len(rejected_segments),
            },
        },
        source="clinician",
    )
    db.commit()

    return AutoScanDecideResponse(
        analysis_id=analysis_id,
        run_id=run.id,
        committed_at=datetime.now(timezone.utc).isoformat(),
        decisions_logged=decisions_logged,
        accepted_counts={
            "bad_channels": len(accepted_channels),
            "bad_segments": len(accepted_segments),
        },
        rejected_counts={
            "bad_channels": len(rejected_channels),
            "bad_segments": len(rejected_segments),
        },
    )


@router.get("/{analysis_id}/spike-events", response_model=SpikeEventsResponse)
def get_spike_events(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SpikeEventsResponse:
    """Return spike-event detections from the qEEG package, if available.

    Empty list (with ``detector_available=False``) is the documented
    clinical contract when the optional spike detector isn't present.
    Returns 200 either way so the UI's spike side panel doesn't break.
    """
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)

    events: list[SpikeEvent] = []
    detector_available = False

    try:
        # The optional pipeline package may expose a spike detector. If not,
        # we silently return an empty list — the empty list is a valid
        # clinical signal ("no spikes detected").
        from deepsynaps_qeeg import spike_detection  # type: ignore[import-not-found]
        detector_available = True
        try:
            raw_events = spike_detection.detect_for_analysis(analysis_id, db)  # type: ignore[attr-defined]
            for ev in raw_events or []:
                try:
                    events.append(
                        SpikeEvent(
                            t_sec=float(ev.get("t_sec", 0.0)),
                            channel=ev.get("channel"),
                            peak_uv=ev.get("peak_uv"),
                            classification=ev.get("classification"),
                            confidence=ev.get("confidence"),
                        )
                    )
                except (TypeError, ValueError):
                    continue
        except Exception as exc:  # detector present but raised
            _log.warning("spike_detection.detect_for_analysis failed: %s", exc)
    except ImportError:
        detector_available = False

    return SpikeEventsResponse(
        analysis_id=analysis_id,
        events=events,
        detector_available=detector_available,
    )


@router.post(
    "/{analysis_id}/apply-template",
    response_model=ApplyTemplateResponse,
)
def post_apply_template(
    analysis_id: str,
    body: ApplyTemplateRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ApplyTemplateResponse:
    """Apply an artifact-template ICA exclusion preset.

    Looks at the existing ICA components for the analysis (via
    :func:`extract_ica_data`) and excludes the ones whose ICLabel matches
    the requested template above the confidence threshold. Writes one
    ``CleaningDecision`` audit row per excluded component
    (``actor='ai'``, ``action='apply_template'``) and merges the IDs into
    ``cleaning_config_json.excluded_ica_components``.
    """
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db, actor)
    template = body.template.strip().lower()
    if template not in _TEMPLATE_LABEL_MAP:
        raise ApiServiceError(
            code="invalid_template",
            message=(
                "Unknown template. Must be one of: "
                + ", ".join(sorted(_TEMPLATE_LABEL_MAP.keys()))
            ),
            status_code=422,
        )
    target_labels = _TEMPLATE_LABEL_MAP[template]

    _require_mne()
    from app.services.eeg_signal_service import extract_ica_data

    ica_data = extract_ica_data(analysis_id, db)
    components = ica_data.get("components", []) or []

    components_excluded: list[int] = []
    decisions_logged = 0
    for comp in components:
        try:
            idx = int(comp.get("index"))
        except (TypeError, ValueError):
            continue
        label = (comp.get("label") or "").lower()
        proba = comp.get("label_probabilities") or {}
        # Best-matching probability across the template's accepted labels.
        best_p = 0.0
        for lbl, p in proba.items():
            if lbl.lower() in target_labels:
                try:
                    best_p = max(best_p, float(p))
                except (TypeError, ValueError):
                    continue
        # Direct label match (e.g. when ICLabel labels the component
        # outright with one of the target labels) also counts.
        if label in target_labels and best_p < 1.0:
            best_p = max(best_p, 1.0)
        if label not in target_labels and best_p < _TEMPLATE_CONFIDENCE_THRESHOLD:
            continue
        components_excluded.append(idx)
        db.add(
            CleaningDecision(
                analysis_id=analysis_id,
                actor="ai",
                action="apply_template",
                target=f"ica_component:{idx}",
                payload_json=json.dumps(
                    {
                        "template": template,
                        "label": label,
                        "best_probability": round(best_p, 3),
                        "label_probabilities": proba,
                    }
                ),
                accepted_by_user=None,
                confidence=round(best_p, 3) if best_p else None,
            )
        )
        decisions_logged += 1

    if components_excluded:
        _merge_into_cleaning_config(
            analysis,
            accepted_bad_channels=[],
            accepted_bad_segments=[],
            excluded_ica_components=components_excluded,
        )

    _audit(
        db,
        analysis_id=analysis_id,
        action_type="ica_template:applied",
        actor=actor,
        new_value={
            "template": template,
            "components_excluded": components_excluded,
            "components_examined": len(components),
        },
        source="ai",
    )
    db.commit()

    return ApplyTemplateResponse(
        analysis_id=analysis_id,
        template=template,
        components_excluded=components_excluded,
        components_examined=len(components),
        decisions_logged=decisions_logged,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Phase 6 — cleaned-signal export + Cleaning Report PDF
#
# Two clinician deliverables:
#   - POST /export-cleaned   → application/octet-stream (EDF / EDF+ / BDF / FIF)
#   - POST /cleaning-report  → application/pdf
# Both gated on clinician role; both 503 when MNE / WeasyPrint missing.
# ─────────────────────────────────────────────────────────────────────────────


_EXPORT_MEDIA_TYPES = {
    "edf": "application/octet-stream",
    "edf_plus": "application/octet-stream",
    "bdf": "application/octet-stream",
    "fif": "application/octet-stream",
}


class ExportCleanedRequest(BaseModel):
    format: str = Field(
        default="edf",
        description="One of: edf, edf_plus, bdf, fif",
    )
    interpolate_bad_channels: bool = Field(default=True)


@router.post("/{analysis_id}/export-cleaned")
def post_export_cleaned(
    analysis_id: str,
    body: ExportCleanedRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Apply the saved cleaning config and stream the cleaned signal.

    Produces an EDF / EDF+ / BDF / FIF binary attachment. Bad channels can be
    interpolated (sensor positions required) or excluded outright via the
    ``interpolate_bad_channels`` flag.
    """
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    _require_mne()

    fmt = (body.format or "").strip().lower()
    if fmt not in _EXPORT_MEDIA_TYPES:
        raise ApiServiceError(
            code="invalid_format",
            message=(
                "Unknown export format. Must be one of: "
                + ", ".join(sorted(_EXPORT_MEDIA_TYPES.keys()))
            ),
            status_code=422,
        )

    from app.services import eeg_export_and_report as _exp

    try:
        out_path, out_filename = _exp.export_cleaned_to_path(
            analysis_id,
            db,
            fmt=fmt,
            interpolate_bad_channels=bool(body.interpolate_bad_channels),
        )
    except _exp.ExportFormatError as exc:
        raise ApiServiceError(
            code="invalid_format", message=str(exc), status_code=422
        )
    except RuntimeError as exc:
        raise ApiServiceError(
            code="export_failed",
            message=str(exc),
            status_code=500,
        )

    try:
        with open(out_path, "rb") as fh:
            payload = fh.read()
    finally:
        try:
            os.unlink(out_path)
        except OSError:  # pragma: no cover
            pass

    headers = {
        "Content-Disposition": f'attachment; filename="{out_filename}"',
    }
    return Response(
        content=payload,
        media_type=_EXPORT_MEDIA_TYPES[fmt],
        headers=headers,
    )


@router.post("/{analysis_id}/cleaning-report")
def post_cleaning_report(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Render and stream the signed Cleaning Report PDF.

    Includes: pseudonymized header, cleaning summary, decisions grouped by
    actor, before/after spectra (Cz/Pz/O1/O2), signed footer with the
    clinician's id + display name + clinic + timestamp, and a decision-
    support disclaimer.
    """
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)

    from app.services import eeg_export_and_report as _exp

    html = _exp.build_cleaning_report_html(analysis_id, db, actor)

    try:
        pdf_bytes = _exp.render_cleaning_report_pdf(html)
    except _exp.CleaningReportRendererUnavailable as exc:
        raise ApiServiceError(
            code="dependency_missing",
            message=str(exc),
            status_code=503,
        )

    filename = f"cleaning_report_{analysis_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Phase 7 — perf telemetry ────────────────────────────────────────────────
#
# The frontend renderer is already externally windowed (see
# apps/web/src/eeg-signal-renderer.js header comment). Phase 7 adds a tiny,
# memory-only ring buffer of perf samples per analysis so we can answer
# "is rendering still smooth on long recordings" without persisting anything
# to the database. The buffer is intentionally process-local — it resets on
# restart and is not rate-limited because the only writers are the workstation
# clients themselves.

class WindowPerfSampleIn(BaseModel):
    frame_render_ms: float = Field(..., ge=0)
    window_load_ms: float = Field(..., ge=0)
    sample_count: int = Field(..., ge=0)
    channel_count: int = Field(..., ge=0)


class WindowPerfStatsResponse(BaseModel):
    analysis_id: str
    sample_count: int = 0
    p50_frame_ms: Optional[float] = None
    p95_frame_ms: Optional[float] = None
    p50_window_load_ms: Optional[float] = None
    p95_window_load_ms: Optional[float] = None
    last_n: list[dict[str, Any]] = Field(default_factory=list)


# Per-process ring buffer keyed by analysis id. Capped at _PERF_BUF_SIZE
# samples per analysis to bound memory regardless of client behaviour.
_PERF_BUF_SIZE = 64
_PERF_RING: dict[str, list[dict[str, Any]]] = {}


def _percentile(values: list[float], pct: float) -> Optional[float]:
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return float(s[0])
    k = max(0, min(len(s) - 1, int(round((pct / 100.0) * (len(s) - 1)))))
    return float(s[k])


@router.post(
    "/{analysis_id}/window-perf-stats",
    response_model=WindowPerfStatsResponse,
)
def push_window_perf_sample(
    analysis_id: str,
    sample: WindowPerfSampleIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> WindowPerfStatsResponse:
    """Append one (frame_ms, load_ms) sample to the in-memory ring buffer."""
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    buf = _PERF_RING.setdefault(analysis_id, [])
    buf.append(sample.model_dump())
    if len(buf) > _PERF_BUF_SIZE:
        del buf[: len(buf) - _PERF_BUF_SIZE]
    return _summarise_perf(analysis_id, buf)


@router.get(
    "/{analysis_id}/window-perf-stats",
    response_model=WindowPerfStatsResponse,
)
def get_window_perf_stats(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> WindowPerfStatsResponse:
    """Return aggregated render perf stats from the in-memory ring buffer."""
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    buf = _PERF_RING.get(analysis_id, [])
    return _summarise_perf(analysis_id, buf)


def _summarise_perf(analysis_id: str, buf: list[dict[str, Any]]) -> WindowPerfStatsResponse:
    if not buf:
        return WindowPerfStatsResponse(analysis_id=analysis_id, sample_count=0, last_n=[])
    frame_vals = [float(s["frame_render_ms"]) for s in buf]
    load_vals = [float(s["window_load_ms"]) for s in buf]
    return WindowPerfStatsResponse(
        analysis_id=analysis_id,
        sample_count=len(buf),
        p50_frame_ms=_percentile(frame_vals, 50),
        p95_frame_ms=_percentile(frame_vals, 95),
        p50_window_load_ms=_percentile(load_vals, 50),
        p95_window_load_ms=_percentile(load_vals, 95),
        last_n=buf[-10:],
    )
