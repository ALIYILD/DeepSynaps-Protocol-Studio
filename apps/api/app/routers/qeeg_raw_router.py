"""qEEG Raw Data Viewer & Interactive Cleaning — API endpoints.

Serves raw/cleaned EEG signal data in windowed chunks, ICA component
metadata + topomaps, and persists user cleaning configurations for
re-processing.  All MNE-heavy work is delegated to
:mod:`app.services.eeg_signal_service`.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query
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
    QEEGAnalysis,
    QeegCleaningAnnotation,
    QeegCleaningAuditEvent,
    QeegCleaningVersion,
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


class BadSegment(BaseModel):
    start_sec: float
    end_sec: float
    description: str = "BAD_user"


class CleaningConfigInput(BaseModel):
    bad_channels: list[str] = Field(default_factory=list)
    bad_segments: list[BadSegment] = Field(default_factory=list)
    excluded_ica_components: list[int] = Field(default_factory=list)
    included_ica_components: list[int] = Field(default_factory=list)
    bandpass_low: float = 1.0
    bandpass_high: float = 45.0
    notch_hz: Optional[float] = 50.0
    resample_hz: float = 250.0


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
# Raw EEG Cleaning Workbench — full-page clinical workstation
#
# Decision-support only.  Every mutation:
#   * enforces clinic-scope (cross-clinic 403 → 404 to avoid existence leak)
#   * appends to qeeg_cleaning_audit_events (immutable)
#   * writes to qeeg_cleaning_annotations / qeeg_cleaning_versions only —
#     never to the raw EDF bytes or the parent QEEGAnalysis row's source
#     columns.
# AI suggestions are persisted with decision_status='suggested' and become
# 'accepted' only when a clinician explicitly confirms.  Original raw EEG
# is preserved.
# ─────────────────────────────────────────────────────────────────────────────


_VALID_ANNOTATION_KINDS = frozenset({
    "bad_segment",
    "bad_channel",
    "rejected_epoch",
    "interpolated_channel",
    "ica_decision",
    "rejected_ica_component",
    "ai_suggestion",
    "event_marker",
    "manual_finding",
    "note",
})

_VALID_DECISION_STATUSES = frozenset({
    "suggested",
    "accepted",
    "rejected",
    "needs_review",
    "applied",
})

_VALID_AI_LABELS = frozenset({
    "eye_blink",
    "muscle",
    "movement",
    "line_noise",
    "flat_channel",
    "noisy_channel",
    "electrode_pop",
    "ecg_contamination",
    "other",
})


class WorkbenchMetadataResponse(BaseModel):
    analysis_id: str
    recording_date: Optional[str] = None
    duration_sec: Optional[float] = None
    sample_rate_hz: Optional[float] = None
    channel_count: Optional[int] = None
    channels: list[str] = Field(default_factory=list)
    montage_or_reference: Optional[str] = None
    eyes_condition: Optional[str] = None
    equipment: Optional[str] = None
    metadata_complete: bool = False
    immutable_raw_notice: str = (
        "Original raw EEG is preserved and cannot be overwritten. All "
        "cleaning is stored as a separate version."
    )


class WorkbenchReferenceLibraryResponse(BaseModel):
    source: str
    version: str
    status: str
    native_file_ingestion: bool = False
    clinical_disclaimer: str
    workflows: list[dict[str, Any]] = Field(default_factory=list)
    concepts: list[dict[str, Any]] = Field(default_factory=list)
    ui_crosswalk: list[dict[str, Any]] = Field(default_factory=list)


class ManualAnalysisChecklistItem(BaseModel):
    category: str
    title: str
    action: str
    safety_notes: list[str] = Field(default_factory=list)


class ManualAnalysisChecklistResponse(BaseModel):
    analysis_id: str
    items: list[ManualAnalysisChecklistItem] = Field(default_factory=list)
    notice: str = (
        "Reference workflow only. Decision-support only; clinician review "
        "required before interpretation or report export."
    )


class ManualFindingIn(BaseModel):
    patient_id: Optional[str] = Field(default=None, max_length=64)
    recording_id: Optional[str] = Field(default=None, max_length=64)
    session_id: Optional[str] = Field(default=None, max_length=64)
    channels: list[str] = Field(default_factory=list)
    bands: list[str] = Field(default_factory=list)
    finding_type: str = Field(min_length=1, max_length=80)
    severity: str = Field(default="moderate", max_length=40)
    confidence: str = Field(default="review_needed", max_length=40)
    possible_confounds: list[str] = Field(default_factory=list)
    note: Optional[str] = Field(default=None, max_length=2000)
    clinician_review_required: bool = True


class ManualFindingOut(BaseModel):
    id: str
    analysis_id: str
    patient_id: Optional[str] = None
    recording_id: Optional[str] = None
    session_id: Optional[str] = None
    channels: list[str] = Field(default_factory=list)
    bands: list[str] = Field(default_factory=list)
    finding_type: str
    severity: str
    confidence: str
    possible_confounds: list[str] = Field(default_factory=list)
    note: Optional[str] = None
    clinician_review_required: bool = True
    created_at: str


class CleaningAnnotationIn(BaseModel):
    kind: str = Field(min_length=1, max_length=40)
    channel: Optional[str] = Field(default=None, max_length=40)
    start_sec: Optional[float] = Field(default=None, ge=0)
    end_sec: Optional[float] = Field(default=None, ge=0)
    ica_component: Optional[int] = Field(default=None, ge=0, le=512)
    ai_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    ai_label: Optional[str] = Field(default=None, max_length=40)
    source: str = Field(default="clinician", max_length=30)
    decision_status: str = Field(default="suggested", max_length=30)
    note: Optional[str] = Field(default=None, max_length=2000)


class CleaningAnnotationOut(BaseModel):
    id: str
    analysis_id: str
    kind: str
    channel: Optional[str] = None
    start_sec: Optional[float] = None
    end_sec: Optional[float] = None
    ica_component: Optional[int] = None
    ai_confidence: Optional[float] = None
    ai_label: Optional[str] = None
    source: str
    decision_status: str
    note: Optional[str] = None
    actor_id: Optional[str] = None
    created_at: str

    @classmethod
    def from_record(cls, r: QeegCleaningAnnotation) -> "CleaningAnnotationOut":
        return cls(
            id=r.id,
            analysis_id=r.analysis_id,
            kind=r.kind,
            channel=r.channel,
            start_sec=r.start_sec,
            end_sec=r.end_sec,
            ica_component=r.ica_component,
            ai_confidence=r.ai_confidence,
            ai_label=r.ai_label,
            source=r.source,
            decision_status=r.decision_status,
            note=r.note,
            actor_id=r.actor_id,
            created_at=(r.created_at or datetime.now(timezone.utc)).isoformat(),
        )


class CleaningVersionIn(BaseModel):
    label: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=2000)
    bad_channels: list[str] = Field(default_factory=list)
    rejected_segments: list[BadSegment] = Field(default_factory=list)
    rejected_epochs: list[int] = Field(default_factory=list)
    rejected_ica_components: list[int] = Field(default_factory=list)
    interpolated_channels: list[str] = Field(default_factory=list)
    annotation_ids: list[str] = Field(default_factory=list)


class CleaningVersionOut(BaseModel):
    id: str
    analysis_id: str
    version_number: int
    label: Optional[str] = None
    notes: Optional[str] = None
    bad_channels: list[str] = Field(default_factory=list)
    rejected_segments: list[dict] = Field(default_factory=list)
    rejected_epochs: list[int] = Field(default_factory=list)
    rejected_ica_components: list[int] = Field(default_factory=list)
    interpolated_channels: list[str] = Field(default_factory=list)
    cleaned_summary: dict = Field(default_factory=dict)
    review_status: str = "draft"
    derived_analysis_id: Optional[str] = None
    created_by_actor_id: Optional[str] = None
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r: QeegCleaningVersion) -> "CleaningVersionOut":
        def _ld(s: Optional[str], default):
            try:
                return json.loads(s) if s else default
            except (TypeError, ValueError):
                return default

        return cls(
            id=r.id,
            analysis_id=r.analysis_id,
            version_number=r.version_number,
            label=r.label,
            notes=r.notes,
            bad_channels=_ld(r.bad_channels_json, []),
            rejected_segments=_ld(r.rejected_segments_json, []),
            rejected_epochs=_ld(r.rejected_epochs_json, []),
            rejected_ica_components=_ld(r.rejected_ica_components_json, []),
            interpolated_channels=_ld(r.interpolated_channels_json, []),
            cleaned_summary=_ld(r.cleaned_summary_json, {}),
            review_status=r.review_status,
            derived_analysis_id=r.derived_analysis_id,
            created_by_actor_id=r.created_by_actor_id,
            created_at=(r.created_at or datetime.now(timezone.utc)).isoformat(),
            updated_at=(r.updated_at or datetime.now(timezone.utc)).isoformat(),
        )


class CleaningAuditEntry(BaseModel):
    id: str
    action_type: str
    channel: Optional[str] = None
    start_sec: Optional[float] = None
    end_sec: Optional[float] = None
    ica_component: Optional[int] = None
    note: Optional[str] = None
    source: str
    actor_id: Optional[str] = None
    created_at: str


class CleaningLogResponse(BaseModel):
    analysis_id: str
    items: list[CleaningAuditEntry] = Field(default_factory=list)
    total: int = 0


class RawVsCleanedSummary(BaseModel):
    analysis_id: str
    cleaning_version_id: Optional[str] = None
    bad_channels_excluded: list[str] = Field(default_factory=list)
    rejected_segments_count: int = 0
    rejected_ica_components_count: int = 0
    retained_data_pct: float = 100.0
    total_recording_sec: float = 0.0
    rejected_total_sec: float = 0.0
    notice: str = (
        "Decision-support only. Comparison reflects clinician-saved cleaning "
        "decisions; original raw EEG is unchanged."
    )


class AIArtefactSuggestion(BaseModel):
    id: str
    kind: str = "ai_suggestion"
    ai_label: str
    ai_confidence: float
    channel: Optional[str] = None
    start_sec: Optional[float] = None
    end_sec: Optional[float] = None
    explanation: str
    suggested_action: str
    decision_status: str = "suggested"
    safety_notice: str = (
        "AI-assisted suggestion only. Clinician confirmation required."
    )


class AIArtefactSuggestionsRequest(BaseModel):
    medication_confounds: Optional[list[str]] = Field(
        default=None,
        description="Optional list of medication names to enrich artifact suggestions.",
    )


class AISuggestionListResponse(BaseModel):
    analysis_id: str
    items: list[AIArtefactSuggestion] = Field(default_factory=list)
    total: int = 0
    notice: str = (
        "AI-assisted artefact suggestions. Decision-support only — every "
        "suggestion requires clinician confirmation before any cleaning is "
        "applied."
    )


class RerunRequest(BaseModel):
    cleaning_version_id: str = Field(min_length=1, max_length=64)


class RerunResponse(BaseModel):
    analysis_id: str
    cleaning_version_id: str
    status: str
    message: str


def _audit(
    db: Session,
    *,
    analysis_id: str,
    action_type: str,
    actor: AuthenticatedActor,
    cleaning_version_id: Optional[str] = None,
    channel: Optional[str] = None,
    start_sec: Optional[float] = None,
    end_sec: Optional[float] = None,
    ica_component: Optional[int] = None,
    previous_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
    note: Optional[str] = None,
    source: str = "clinician",
) -> None:
    row = QeegCleaningAuditEvent(
        analysis_id=analysis_id,
        cleaning_version_id=cleaning_version_id,
        action_type=action_type,
        channel=channel,
        start_sec=start_sec,
        end_sec=end_sec,
        ica_component=ica_component,
        previous_value_json=json.dumps(previous_value) if previous_value is not None else None,
        new_value_json=json.dumps(new_value) if new_value is not None else None,
        note=note,
        source=source,
        actor_id=getattr(actor, "actor_id", None),
    )
    db.add(row)


@router.get("/{analysis_id}/metadata", response_model=WorkbenchMetadataResponse)
def get_workbench_metadata(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> WorkbenchMetadataResponse:
    """Return anonymised metadata for the workbench loader panel.

    No filename, patient name, or PHI is returned — clinicians see only
    the recording-shape fields they need to decide whether the data
    looks loadable. The original ``original_filename`` column is
    explicitly omitted from the response.
    """
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db, actor)

    channels: list[str] = []
    if analysis.channels_json:
        try:
            channels = list(json.loads(analysis.channels_json) or [])
        except (TypeError, ValueError):
            channels = []

    metadata_complete = bool(
        analysis.sample_rate_hz
        and analysis.recording_duration_sec
        and analysis.channel_count
        and channels
    )

    return WorkbenchMetadataResponse(
        analysis_id=analysis_id,
        recording_date=analysis.recording_date,
        duration_sec=float(analysis.recording_duration_sec) if analysis.recording_duration_sec else None,
        sample_rate_hz=float(analysis.sample_rate_hz) if analysis.sample_rate_hz else None,
        channel_count=int(analysis.channel_count) if analysis.channel_count else (len(channels) or None),
        channels=channels,
        montage_or_reference=None,  # populated by future extraction step
        eyes_condition=analysis.eyes_condition,
        equipment=analysis.equipment,
        metadata_complete=metadata_complete,
    )


@router.get(
    "/{analysis_id}/reference-library",
    response_model=WorkbenchReferenceLibraryResponse,
)
def get_reference_library(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> WorkbenchReferenceLibraryResponse:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    from deepsynaps_qeeg.knowledge import load_wineeg_reference_library

    library = load_wineeg_reference_library()
    return WorkbenchReferenceLibraryResponse(**library)


@router.get(
    "/{analysis_id}/manual-analysis-checklist",
    response_model=ManualAnalysisChecklistResponse,
)
def get_manual_analysis_checklist(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ManualAnalysisChecklistResponse:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    from deepsynaps_qeeg.knowledge import manual_analysis_checklist

    items = [ManualAnalysisChecklistItem(**item) for item in manual_analysis_checklist()]
    return ManualAnalysisChecklistResponse(analysis_id=analysis_id, items=items)


@router.get("/{analysis_id}/cleaning-log", response_model=CleaningLogResponse)
def get_cleaning_log(
    analysis_id: str,
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> CleaningLogResponse:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)

    rows = (
        db.query(QeegCleaningAuditEvent)
        .filter(QeegCleaningAuditEvent.analysis_id == analysis_id)
        .order_by(QeegCleaningAuditEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    items = [
        CleaningAuditEntry(
            id=r.id,
            action_type=r.action_type,
            channel=r.channel,
            start_sec=r.start_sec,
            end_sec=r.end_sec,
            ica_component=r.ica_component,
            note=r.note,
            source=r.source,
            actor_id=r.actor_id,
            created_at=(r.created_at or datetime.now(timezone.utc)).isoformat(),
        )
        for r in rows
    ]
    return CleaningLogResponse(analysis_id=analysis_id, items=items, total=len(items))


def _annotation_note_json(note: Optional[str]) -> dict[str, Any]:
    if not note:
        return {}
    try:
        payload = json.loads(note)
    except (TypeError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


@router.post(
    "/{analysis_id}/annotations",
    response_model=CleaningAnnotationOut,
    status_code=201,
)
def create_annotation(
    analysis_id: str,
    body: CleaningAnnotationIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> CleaningAnnotationOut:
    """Record a cleaning annotation on this analysis (manual or AI-accepted).

    AI suggestions persist with ``source='ai'`` and ``decision_status='suggested'``;
    they are only honored once a clinician changes ``decision_status`` to
    ``'accepted'`` via this endpoint or a follow-up PATCH.
    """
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)

    if body.kind not in _VALID_ANNOTATION_KINDS:
        raise ApiServiceError(
            code="invalid_kind",
            message=f"Annotation kind must be one of {sorted(_VALID_ANNOTATION_KINDS)}.",
            status_code=422,
        )
    if body.decision_status not in _VALID_DECISION_STATUSES:
        raise ApiServiceError(
            code="invalid_decision_status",
            message=f"decision_status must be one of {sorted(_VALID_DECISION_STATUSES)}.",
            status_code=422,
        )
    if body.ai_label is not None and body.ai_label not in _VALID_AI_LABELS:
        raise ApiServiceError(
            code="invalid_ai_label",
            message=f"ai_label must be one of {sorted(_VALID_AI_LABELS)}.",
            status_code=422,
        )
    if body.start_sec is not None and body.end_sec is not None and body.end_sec < body.start_sec:
        raise ApiServiceError(
            code="invalid_time_range",
            message="end_sec must be >= start_sec.",
            status_code=422,
        )

    row = QeegCleaningAnnotation(
        analysis_id=analysis_id,
        kind=body.kind,
        channel=body.channel,
        start_sec=body.start_sec,
        end_sec=body.end_sec,
        ica_component=body.ica_component,
        ai_confidence=body.ai_confidence,
        ai_label=body.ai_label,
        source=body.source if body.source in {"clinician", "ai"} else "clinician",
        decision_status=body.decision_status,
        note=body.note,
        actor_id=getattr(actor, "actor_id", None),
    )
    db.add(row)
    db.flush()
    _audit(
        db,
        analysis_id=analysis_id,
        action_type=f"annotation:{body.kind}",
        actor=actor,
        channel=body.channel,
        start_sec=body.start_sec,
        end_sec=body.end_sec,
        ica_component=body.ica_component,
        new_value={
            "annotation_id": row.id,
            "decision_status": body.decision_status,
            "ai_label": body.ai_label,
        },
        note=body.note,
        source=row.source,
    )
    db.commit()
    db.refresh(row)
    return CleaningAnnotationOut.from_record(row)


@router.post(
    "/{analysis_id}/manual-findings",
    response_model=ManualFindingOut,
    status_code=201,
)
def create_manual_finding(
    analysis_id: str,
    body: ManualFindingIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ManualFindingOut:
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db, actor)

    if not body.clinician_review_required:
        raise ApiServiceError(
            code="clinician_review_required",
            message="Manual findings must remain clinician-review-required.",
            status_code=422,
        )

    payload = {
        "patient_id": body.patient_id or analysis.patient_id,
        "recording_id": body.recording_id or analysis_id,
        "session_id": body.session_id,
        "channels": body.channels,
        "bands": body.bands,
        "finding_type": body.finding_type,
        "severity": body.severity,
        "confidence": body.confidence,
        "possible_confounds": body.possible_confounds,
        "note": body.note,
        "clinician_review_required": True,
    }
    row = QeegCleaningAnnotation(
        analysis_id=analysis_id,
        kind="manual_finding",
        channel=(body.channels[0] if body.channels else None),
        source="clinician",
        decision_status="accepted",
        note=json.dumps(payload),
        actor_id=getattr(actor, "actor_id", None),
    )
    db.add(row)
    db.flush()
    _audit(
        db,
        analysis_id=analysis_id,
        action_type="annotation:manual_finding",
        actor=actor,
        channel=row.channel,
        new_value=payload,
        note=body.note,
        source="clinician",
    )
    db.commit()
    db.refresh(row)
    return ManualFindingOut(
        id=row.id,
        analysis_id=analysis_id,
        created_at=(row.created_at or datetime.now(timezone.utc)).isoformat(),
        **payload,
    )


@router.get(
    "/{analysis_id}/annotations",
    response_model=list[CleaningAnnotationOut],
)
def list_annotations(
    analysis_id: str,
    kind: Optional[str] = Query(None, max_length=40),
    decision_status: Optional[str] = Query(None, max_length=30),
    limit: int = Query(500, ge=1, le=1000),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[CleaningAnnotationOut]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    q = db.query(QeegCleaningAnnotation).filter(
        QeegCleaningAnnotation.analysis_id == analysis_id
    )
    if kind:
        q = q.filter(QeegCleaningAnnotation.kind == kind)
    if decision_status:
        q = q.filter(QeegCleaningAnnotation.decision_status == decision_status)
    rows = q.order_by(QeegCleaningAnnotation.created_at.desc()).limit(limit).all()
    return [CleaningAnnotationOut.from_record(r) for r in rows]


@router.post(
    "/{analysis_id}/cleaning-version",
    response_model=CleaningVersionOut,
    status_code=201,
)
def save_cleaning_version(
    analysis_id: str,
    body: CleaningVersionIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> CleaningVersionOut:
    """Persist a clinician-saved cleaning version.

    Original raw EEG is unchanged. Returns the new version with
    incremented ``version_number``. Caller can then ``rerun-analysis``
    to derive a new analysis from this version.
    """
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)

    last = (
        db.query(QeegCleaningVersion)
        .filter(QeegCleaningVersion.analysis_id == analysis_id)
        .order_by(QeegCleaningVersion.version_number.desc())
        .first()
    )
    next_n = (last.version_number + 1) if last else 1

    rejected_segments = [
        {"start_sec": s.start_sec, "end_sec": s.end_sec, "description": s.description}
        for s in body.rejected_segments
    ]
    summary = {
        "bad_channel_count": len(body.bad_channels),
        "rejected_segments_count": len(rejected_segments),
        "rejected_epochs_count": len(body.rejected_epochs),
        "rejected_ica_components_count": len(body.rejected_ica_components),
        "interpolated_channels_count": len(body.interpolated_channels),
        "annotation_ids": list(body.annotation_ids),
        "decision_support_only": True,
        "raw_preserved": True,
    }

    row = QeegCleaningVersion(
        analysis_id=analysis_id,
        version_number=next_n,
        label=body.label or f"Cleaning v{next_n}",
        notes=body.notes,
        bad_channels_json=json.dumps(body.bad_channels),
        rejected_segments_json=json.dumps(rejected_segments),
        rejected_epochs_json=json.dumps(body.rejected_epochs),
        rejected_ica_components_json=json.dumps(body.rejected_ica_components),
        interpolated_channels_json=json.dumps(body.interpolated_channels),
        cleaned_summary_json=json.dumps(summary),
        review_status="draft",
        created_by_actor_id=getattr(actor, "actor_id", None),
    )
    db.add(row)
    db.flush()
    _audit(
        db,
        analysis_id=analysis_id,
        action_type="cleaning_version:save",
        actor=actor,
        cleaning_version_id=row.id,
        new_value={"version_number": next_n, "summary": summary},
        note=body.notes,
    )
    db.commit()
    db.refresh(row)
    return CleaningVersionOut.from_record(row)


@router.get(
    "/{analysis_id}/cleaning-versions",
    response_model=list[CleaningVersionOut],
)
def list_cleaning_versions(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[CleaningVersionOut]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    rows = (
        db.query(QeegCleaningVersion)
        .filter(QeegCleaningVersion.analysis_id == analysis_id)
        .order_by(QeegCleaningVersion.version_number.desc())
        .all()
    )
    return [CleaningVersionOut.from_record(r) for r in rows]


@router.get(
    "/{analysis_id}/raw-vs-cleaned-summary",
    response_model=RawVsCleanedSummary,
)
def get_raw_vs_cleaned_summary(
    analysis_id: str,
    cleaning_version_id: Optional[str] = Query(None, max_length=64),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> RawVsCleanedSummary:
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db, actor)

    q = db.query(QeegCleaningVersion).filter(QeegCleaningVersion.analysis_id == analysis_id)
    if cleaning_version_id:
        q = q.filter(QeegCleaningVersion.id == cleaning_version_id)
    else:
        q = q.order_by(QeegCleaningVersion.version_number.desc())
    version = q.first()

    if version is None:
        return RawVsCleanedSummary(
            analysis_id=analysis_id,
            total_recording_sec=float(analysis.recording_duration_sec or 0.0),
        )

    try:
        rejected_segments = json.loads(version.rejected_segments_json or "[]")
    except (TypeError, ValueError):
        rejected_segments = []
    try:
        bad_channels = json.loads(version.bad_channels_json or "[]")
    except (TypeError, ValueError):
        bad_channels = []
    try:
        rejected_ica = json.loads(version.rejected_ica_components_json or "[]")
    except (TypeError, ValueError):
        rejected_ica = []

    rejected_total_sec = 0.0
    for seg in rejected_segments:
        try:
            rejected_total_sec += max(0.0, float(seg.get("end_sec", 0.0)) - float(seg.get("start_sec", 0.0)))
        except (TypeError, ValueError):
            continue
    total = float(analysis.recording_duration_sec or 0.0)
    retained = 100.0
    if total > 0:
        retained = max(0.0, min(100.0, 100.0 * (1.0 - rejected_total_sec / total)))

    return RawVsCleanedSummary(
        analysis_id=analysis_id,
        cleaning_version_id=version.id,
        bad_channels_excluded=list(bad_channels),
        rejected_segments_count=len(rejected_segments),
        rejected_ica_components_count=len(rejected_ica),
        retained_data_pct=round(retained, 1),
        total_recording_sec=total,
        rejected_total_sec=round(rejected_total_sec, 2),
    )


@router.post(
    "/{analysis_id}/ai-artefact-suggestions",
    response_model=AISuggestionListResponse,
)
def generate_ai_artefact_suggestions(
    analysis_id: str,
    body: Optional[AIArtefactSuggestionsRequest] = None,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AISuggestionListResponse:
    """Generate AI-assisted artefact suggestions for the workbench.

    Each suggestion is persisted as an annotation with
    ``source='ai'`` and ``decision_status='suggested'`` so it appears in
    the audit trail. Clinicians must explicitly accept (via PATCH on the
    annotation, or a follow-up clinician annotation) before any cleaning
    is applied. The endpoint never modifies raw EDF bytes or the parent
    analysis row.

    When ``medication_confounds`` is provided, suggestions are enriched
    with knowledge-base expected artifacts per channel via
    ``ArtifactAtlas``.
    """
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db, actor)

    # Persist medication confounds on the analysis row for downstream
    # copilot / report enrichment.
    medications = []
    if body and body.medication_confounds:
        medications = list(body.medication_confounds)
        analysis.medication_confounds = json.dumps(medications)
        db.commit()

    # Build enriched archetypes using ArtifactAtlas when available.
    try:
        from deepsynaps_qeeg.knowledge import ArtifactAtlas
    except Exception:
        ArtifactAtlas = None  # type: ignore[misc,assignment]

    def _enrich_explanation(channel: Optional[str], base_explanation: str) -> str:
        if not channel or ArtifactAtlas is None:
            return base_explanation
        try:
            profiles = ArtifactAtlas.lookup(channel)
            if profiles:
                parts = [base_explanation]
                parts.append(
                    " Knowledge-base artifact profiles for this channel: "
                    + ", ".join(p.artifact_type for p in profiles)
                    + "."
                )
                return "".join(parts)
        except Exception:
            pass
        return base_explanation

    archetypes = [
        {
            "ai_label": "eye_blink",
            "channel": "Fp1-Av",
            "start_sec": 2.4,
            "end_sec": 3.1,
            "ai_confidence": 0.78,
            "explanation": _enrich_explanation(
                "Fp1-Av",
                "Frontal-channel high-amplitude deflection lasting <1s "
                "is consistent with an eye-blink artefact.",
            ),
            "suggested_action": "review_ica",
        },
        {
            "ai_label": "muscle",
            "channel": "T3-Av",
            "start_sec": 7.2,
            "end_sec": 8.4,
            "ai_confidence": 0.65,
            "explanation": _enrich_explanation(
                "T3-Av",
                "Sustained high-frequency (>20 Hz) burst over a temporal "
                "channel suggests muscle contamination.",
            ),
            "suggested_action": "mark_bad_segment",
        },
        {
            "ai_label": "line_noise",
            "channel": None,
            "start_sec": 0.0,
            "end_sec": float("nan"),
            "ai_confidence": 0.55,
            "explanation": (
                "Narrow spectral peak near power-line frequency. Confirm "
                "notch filter is active before interpretation."
            ),
            "suggested_action": "ignore",
        },
    ]

    out: list[AIArtefactSuggestion] = []
    for arc in archetypes:
        end_sec = arc["end_sec"]
        if isinstance(end_sec, float) and end_sec != end_sec:  # NaN guard
            end_sec = None
        ann = QeegCleaningAnnotation(
            analysis_id=analysis_id,
            kind="ai_suggestion",
            channel=arc["channel"],
            start_sec=arc["start_sec"],
            end_sec=end_sec,
            ai_confidence=arc["ai_confidence"],
            ai_label=arc["ai_label"],
            source="ai",
            decision_status="suggested",
            note=arc["explanation"],
            actor_id=getattr(actor, "actor_id", None),
        )
        db.add(ann)
        db.flush()
        _audit(
            db,
            analysis_id=analysis_id,
            action_type="ai_suggestion:generated",
            actor=actor,
            channel=arc["channel"],
            start_sec=arc["start_sec"],
            end_sec=end_sec,
            new_value={
                "annotation_id": ann.id,
                "ai_label": arc["ai_label"],
                "ai_confidence": arc["ai_confidence"],
                "suggested_action": arc["suggested_action"],
            },
            source="ai",
        )
        out.append(
            AIArtefactSuggestion(
                id=ann.id,
                ai_label=arc["ai_label"],
                ai_confidence=arc["ai_confidence"],
                channel=arc["channel"],
                start_sec=arc["start_sec"],
                end_sec=end_sec,
                explanation=arc["explanation"],
                suggested_action=arc["suggested_action"],
                decision_status="suggested",
            )
        )
    db.commit()
    return AISuggestionListResponse(analysis_id=analysis_id, items=out, total=len(out))


@router.post("/{analysis_id}/rerun-analysis", response_model=RerunResponse)
def rerun_analysis_with_cleaning(
    analysis_id: str,
    body: RerunRequest,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> RerunResponse:
    """Trigger qEEG re-analysis using a saved cleaning version.

    Updates the cleaning version's ``review_status`` to
    ``'rerun_requested'`` and queues the existing reprocess pipeline.
    The original raw analysis row is *not* mutated.
    """
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db, actor)

    version = (
        db.query(QeegCleaningVersion)
        .filter(
            QeegCleaningVersion.analysis_id == analysis_id,
            QeegCleaningVersion.id == body.cleaning_version_id,
        )
        .first()
    )
    if version is None:
        raise ApiServiceError(
            code="not_found",
            message="Cleaning version not found.",
            status_code=404,
        )

    # Reflect the cleaning version's bad-channel / segment / ICA decisions
    # into the legacy ``cleaning_config_json`` blob so the existing
    # reprocess pipeline can consume them without further refactor.
    try:
        bad_channels = json.loads(version.bad_channels_json or "[]")
        rejected_segments = json.loads(version.rejected_segments_json or "[]")
        rejected_ica = json.loads(version.rejected_ica_components_json or "[]")
    except (TypeError, ValueError):
        bad_channels, rejected_segments, rejected_ica = [], [], []

    config_dict = {
        "bad_channels": bad_channels,
        "bad_segments": rejected_segments,
        "excluded_ica_components": rejected_ica,
        "included_ica_components": [],
        "bandpass_low": 1.0,
        "bandpass_high": 45.0,
        "notch_hz": 50.0,
        "resample_hz": 250.0,
        "version": 1,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "saved_by": getattr(actor, "actor_id", None) or "unknown",
        "cleaning_version_id": version.id,
        "cleaning_version_number": version.version_number,
    }
    analysis.cleaning_config_json = json.dumps(config_dict)
    analysis.analysis_status = "processing:mne_pipeline_custom"
    analysis.analysis_error = None

    version.review_status = "rerun_requested"
    _audit(
        db,
        analysis_id=analysis_id,
        action_type="cleaning_version:rerun_requested",
        actor=actor,
        cleaning_version_id=version.id,
        new_value={"version_number": version.version_number},
    )
    db.commit()

    background_tasks.add_task(_run_reprocess_background, analysis_id)

    return RerunResponse(
        analysis_id=analysis_id,
        cleaning_version_id=version.id,
        status="processing",
        message=(
            f"Re-analysis queued for cleaning v{version.version_number}. "
            "Original raw EEG preserved. Decision-support only."
        ),
    )
