"""qEEG Raw Data Viewer & Interactive Cleaning — API endpoints.

Serves raw/cleaned EEG signal data in windowed chunks, ICA component
metadata + topomaps, and persists user cleaning configurations for
re-processing.  All MNE-heavy work is delegated to
:mod:`app.services.eeg_signal_service`.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import QEEGAnalysis

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


def _load_analysis(analysis_id: str, db: Session) -> QEEGAnalysis:
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
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


# ── Endpoint 1: Channel Info ────────────────────────────────────────────────


@router.get("/{analysis_id}/channel-info", response_model=ChannelInfoResponse)
def get_channel_info(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
):
    """Return channel names, positions, sampling rate, and recording duration."""
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db)

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
    _load_analysis(analysis_id, db)  # Validate existence
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
    _load_analysis(analysis_id, db)
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
    _load_analysis(analysis_id, db)
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
    _load_analysis(analysis_id, db)
    _require_mne()

    from app.services.eeg_signal_service import extract_ica_timecourse

    tc = extract_ica_timecourse(
        analysis_id, component_index, db,
        t_start=t_start, t_end=t_end, window_sec=window_sec, max_points=max_points,
    )
    return ICATimecourseResponse(**tc)


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
    analysis = _load_analysis(analysis_id, db)

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
    analysis = _load_analysis(analysis_id, db)

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
    analysis = _load_analysis(analysis_id, db)

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
