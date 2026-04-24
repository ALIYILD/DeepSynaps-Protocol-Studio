"""qEEG Analysis Pipeline — API endpoints.

Handles EDF file upload, spectral analysis, AI interpretation,
pre/post comparison, prediction, and correlation.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Form, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import (
    AiSummaryAudit,
    QEEGAnalysis,
    QEEGAIReport,
    QEEGComparison,
    QEEGRecord,
)
from app.settings import get_settings

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/qeeg-analysis", tags=["qeeg-analysis"])

# ── Max upload size for EDF files (100 MB) ───────────────────────────────────
_MAX_EDF_BYTES = 100 * 1024 * 1024

# ── Allowed extensions ───────────────────────────────────────────────────────
_ALLOWED_EXTENSIONS = {".edf", ".edf+", ".bdf", ".bdf+", ".eeg"}

# ── EDF magic bytes check ────────────────────────────────────────────────────
_EDF_MAGIC = b"0       "  # EDF files start with "0" followed by 7 spaces


# ── Response Models ──────────────────────────────────────────────────────────

_DEFAULT_PIPELINE_VERSION = "0.1.0"
_DEFAULT_NORM_DB_VERSION = "toy-0.1"


def _try_import_full_pipeline() -> Any:
    """Return ``deepsynaps_qeeg.pipeline.run_full_pipeline`` or ``None``.

    The reference MNE-Python pipeline is an *optional* editable path
    dependency (see ``[project.optional-dependencies]`` ``qeeg`` extra in
    ``apps/api/pyproject.toml``). The API worker must stay importable on
    machines without MNE — so the heavy import is guarded here, logged
    once, and callers fall back to the legacy Welch path.

    Returns
    -------
    callable or None
        The ``run_full_pipeline`` function, or ``None`` if the module or
        any of its scientific dependencies (mne, scipy, numpy, fooof,
        mne-connectivity, autoreject, pyprep, mne-icalabel) cannot be
        imported.
    """
    try:
        from deepsynaps_qeeg.pipeline import run_full_pipeline  # type: ignore
        return run_full_pipeline
    except Exception as exc:  # pragma: no cover — exercised via monkeypatch
        _log.info(
            "deepsynaps_qeeg.pipeline unavailable (%s); "
            "falling back to legacy Welch path.",
            exc,
        )
        return None


def _synthesise_legacy_band_powers(features: dict[str, Any]) -> dict[str, Any]:
    """Convert MNE-pipeline ``features`` into the legacy band_powers shape.

    The legacy ``band_powers_json`` column (CONTRACT §1) is still populated
    alongside the new richer columns for backward compatibility — deterministic
    condition matching, comparison deltas and the AI interpreter all read it.

    Parameters
    ----------
    features : dict
        The ``PipelineResult.features`` dict. Must contain a
        ``features["spectral"]["bands"]`` mapping of the shape described in
        CONTRACT §1.1. Missing keys are tolerated.

    Returns
    -------
    dict
        A dict with ``bands`` (each band has ``hz_range`` and per-channel
        ``absolute_uv2`` / ``relative_pct``) and ``derived_ratios`` derived
        from features where possible.
    """
    FREQ_BANDS = {
        "delta": [1.0, 4.0],
        "theta": [4.0, 8.0],
        "alpha": [8.0, 13.0],
        "beta": [13.0, 30.0],
        "gamma": [30.0, 45.0],
    }
    spectral = (features or {}).get("spectral", {}) or {}
    bands_in = spectral.get("bands", {}) or {}
    legacy_bands: dict[str, Any] = {}
    for band_name, band_info in bands_in.items():
        abs_map = (band_info or {}).get("absolute_uv2", {}) or {}
        rel_map = (band_info or {}).get("relative", {}) or {}
        channel_out: dict[str, Any] = {}
        for ch in set(abs_map) | set(rel_map):
            abs_val = float(abs_map.get(ch, 0.0) or 0.0)
            rel_frac = float(rel_map.get(ch, 0.0) or 0.0)
            channel_out[ch] = {
                "absolute_uv2": abs_val,
                # Legacy shape uses percent, features shape uses fraction.
                "relative_pct": rel_frac * 100.0,
            }
        legacy_bands[band_name] = {
            "hz_range": FREQ_BANDS.get(band_name, [0.0, 0.0]),
            "channels": channel_out,
        }

    # Derived ratios — best-effort from features we have.
    derived: dict[str, Any] = {}
    asymmetry = (features or {}).get("asymmetry", {}) or {}
    faa: dict[str, float] = {}
    if "frontal_alpha_F3_F4" in asymmetry:
        faa["F3_F4"] = float(asymmetry["frontal_alpha_F3_F4"])
    if "frontal_alpha_F7_F8" in asymmetry:
        faa["F7_F8"] = float(asymmetry["frontal_alpha_F7_F8"])
    if faa:
        derived["frontal_alpha_asymmetry"] = faa

    paf = spectral.get("peak_alpha_freq") or {}
    if paf:
        derived["alpha_peak_frequency"] = {
            "channels": {ch: v for ch, v in paf.items() if v is not None}
        }

    # Theta/beta ratio per channel from absolute powers, when both bands present.
    theta_abs = (bands_in.get("theta") or {}).get("absolute_uv2", {}) or {}
    beta_abs = (bands_in.get("beta") or {}).get("absolute_uv2", {}) or {}
    if theta_abs and beta_abs:
        tbr: dict[str, float] = {}
        for ch in set(theta_abs) & set(beta_abs):
            b = float(beta_abs.get(ch, 0.0) or 0.0)
            if b > 0.0:
                tbr[ch] = float(theta_abs.get(ch, 0.0) or 0.0) / b
        if tbr:
            derived["theta_beta_ratio"] = {"channels": tbr}

    return {"bands": legacy_bands, "derived_ratios": derived}


def _run_and_persist_full_pipeline(
    *,
    analysis: QEEGAnalysis,
    file_bytes: bytes,
    run_full_pipeline: Any,
) -> bool:
    """Invoke ``run_full_pipeline`` on a file-bytes buffer and persist results.

    The pipeline takes a filesystem path (MNE I/O opens streams via
    ``mne.io.read_raw_*``), so we materialise the uploaded bytes into a
    temporary file for the duration of the call. All new CONTRACT §2
    columns are populated on the ``analysis`` record, plus the legacy
    ``band_powers_json`` for backward compatibility.

    Parameters
    ----------
    analysis : QEEGAnalysis
        The SQLAlchemy row to update in place. The caller commits.
    file_bytes : bytes
        Raw upload bytes (EDF / BDF / BrainVision / etc.).
    run_full_pipeline : callable
        The pipeline entrypoint — signature matches
        ``deepsynaps_qeeg.pipeline.run_full_pipeline``.

    Returns
    -------
    bool
        ``True`` if the pipeline ran and fields were persisted; ``False``
        if the pipeline raised (e.g. missing scientific dependency). On
        ``False`` the caller falls back to the legacy Welch path. We
        deliberately do **not** mark the analysis as failed here — a
        ``False`` return leaves the analysis row in ``processing`` and
        unmodified so the legacy path can take over.
    """
    # Determine extension from original filename if we have one.
    filename = analysis.original_filename or "recording.edf"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ".edf"

    tmp_path: Optional[str] = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=ext, prefix="qeeg_")
        try:
            os.write(fd, file_bytes)
        finally:
            os.close(fd)

        result = run_full_pipeline(tmp_path)
    except Exception as exc:
        _log.warning(
            "run_full_pipeline failed (%s); falling back to legacy Welch path.",
            exc,
        )
        return False
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    features = getattr(result, "features", {}) or {}
    zscores = getattr(result, "zscores", {}) or {}
    flagged = list(getattr(result, "flagged_conditions", []) or [])
    quality = getattr(result, "quality", {}) or {}

    # Pipeline / norm-DB versions. Prefer quality/zscores metadata, fall back
    # to defaults mandated by the contract.
    pipeline_version = str(
        (quality or {}).get("pipeline_version") or _DEFAULT_PIPELINE_VERSION
    )
    norm_db_version = str(
        (zscores or {}).get("norm_db_version") or _DEFAULT_NORM_DB_VERSION
    )

    spectral = features.get("spectral", {}) or {}

    # Persist new columns.
    analysis.aperiodic_json = json.dumps(spectral.get("aperiodic")) if spectral.get("aperiodic") is not None else None
    analysis.peak_alpha_freq_json = (
        json.dumps(spectral.get("peak_alpha_freq"))
        if spectral.get("peak_alpha_freq") is not None
        else None
    )
    analysis.connectivity_json = (
        json.dumps(features.get("connectivity"))
        if features.get("connectivity") is not None
        else None
    )
    analysis.asymmetry_json = (
        json.dumps(features.get("asymmetry"))
        if features.get("asymmetry") is not None
        else None
    )
    analysis.graph_metrics_json = (
        json.dumps(features.get("graph"))
        if features.get("graph") is not None
        else None
    )
    analysis.source_roi_json = (
        json.dumps(features.get("source"))
        if features.get("source") is not None
        else None
    )
    analysis.normative_zscores_json = json.dumps(zscores) if zscores else None
    analysis.flagged_conditions = json.dumps(flagged)
    analysis.quality_metrics_json = json.dumps(quality) if quality else None
    analysis.pipeline_version = pipeline_version
    analysis.norm_db_version = norm_db_version

    # Legacy compat — synthesise a ``band_powers_json`` from the new features
    # so deterministic condition matching, comparisons and the AI fallback
    # keep working on old code paths.
    legacy_band_powers = _synthesise_legacy_band_powers(features)
    analysis.band_powers_json = json.dumps(legacy_band_powers)

    # Mirror artifact / quality into the legacy artifact_rejection_json so
    # the existing UI quality strip keeps rendering something sensible.
    if quality:
        analysis.artifact_rejection_json = json.dumps(
            {
                "n_channels_rejected": quality.get("n_channels_rejected"),
                "bad_channels": quality.get("bad_channels", []),
                "n_epochs_total": quality.get("n_epochs_total"),
                "n_epochs_retained": quality.get("n_epochs_retained"),
                "ica_components_dropped": quality.get("ica_components_dropped"),
                "ica_labels_dropped": quality.get("ica_labels_dropped", {}),
            }
        )

    # Metadata pulled from quality where possible.
    if quality.get("sfreq_output") is not None:
        try:
            analysis.sample_rate_hz = float(quality["sfreq_output"])
        except (TypeError, ValueError):
            pass
    if quality.get("n_channels_input") is not None:
        try:
            analysis.channel_count = int(quality["n_channels_input"])
        except (TypeError, ValueError):
            pass

    # Channel list: pull from connectivity.channels if present.
    connectivity = features.get("connectivity") or {}
    ch_list = connectivity.get("channels")
    if isinstance(ch_list, list) and ch_list:
        analysis.channels_json = json.dumps(list(ch_list))

    analysis.analysis_params_json = json.dumps(
        {
            "pipeline": "deepsynaps_qeeg",
            "pipeline_version": pipeline_version,
            "norm_db_version": norm_db_version,
            "bandpass": quality.get("bandpass"),
            "notch_hz": quality.get("notch_hz"),
        }
    )

    return True


def _safe_json_loads(raw: Optional[str]) -> Optional[Any]:
    """Parse a JSON string column, returning ``None`` on empty / invalid input.

    Parameters
    ----------
    raw : str or None
        The raw value stored in the ``*_json`` column.

    Returns
    -------
    object or None
        Parsed Python object, or ``None`` if ``raw`` is falsy or malformed.
        Malformed JSON is logged (at WARNING) and treated as missing — the
        API response stays well-formed even if a row is corrupted.
    """
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError) as exc:
        _log.warning("Failed to parse JSON column (len=%d): %s", len(raw), exc)
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
    # ── MNE-pipeline fields (CONTRACT §3) ────────────────────────────────────
    # All optional so legacy analyses (written before migration 037) stay
    # backward-compatible. The frontend renders sections conditionally on
    # these being non-null.
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
    analyzed_at: Optional[str] = None
    created_at: str

    @classmethod
    def from_record(cls, r: QEEGAnalysis) -> "AnalysisOut":
        """Build an :class:`AnalysisOut` from the ORM row.

        Each ``*_json`` column is parsed defensively via
        :func:`_safe_json_loads` so a single malformed row cannot break the
        listing endpoint. Missing columns (on a legacy DB pre-037) are
        tolerated via ``getattr``.
        """
        flagged_raw = _safe_json_loads(getattr(r, "flagged_conditions", None))
        flagged_list: Optional[list[str]]
        if flagged_raw is None:
            flagged_list = None
        elif isinstance(flagged_raw, list):
            flagged_list = [str(x) for x in flagged_raw]
        else:
            flagged_list = None
        return cls(
            id=r.id,
            qeeg_record_id=r.qeeg_record_id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            original_filename=r.original_filename,
            file_size_bytes=r.file_size_bytes,
            recording_duration_sec=r.recording_duration_sec,
            sample_rate_hz=r.sample_rate_hz,
            channels=_safe_json_loads(r.channels_json),
            channel_count=r.channel_count,
            recording_date=r.recording_date,
            eyes_condition=r.eyes_condition,
            equipment=r.equipment,
            analysis_status=r.analysis_status,
            analysis_error=r.analysis_error,
            band_powers=_safe_json_loads(r.band_powers_json),
            artifact_rejection=_safe_json_loads(r.artifact_rejection_json),
            aperiodic=_safe_json_loads(getattr(r, "aperiodic_json", None)),
            peak_alpha_freq=_safe_json_loads(getattr(r, "peak_alpha_freq_json", None)),
            connectivity=_safe_json_loads(getattr(r, "connectivity_json", None)),
            asymmetry=_safe_json_loads(getattr(r, "asymmetry_json", None)),
            graph_metrics=_safe_json_loads(getattr(r, "graph_metrics_json", None)),
            source_roi=_safe_json_loads(getattr(r, "source_roi_json", None)),
            normative_zscores=_safe_json_loads(getattr(r, "normative_zscores_json", None)),
            flagged_conditions=flagged_list,
            quality_metrics=_safe_json_loads(getattr(r, "quality_metrics_json", None)),
            pipeline_version=getattr(r, "pipeline_version", None),
            norm_db_version=getattr(r, "norm_db_version", None),
            analyzed_at=r.analyzed_at.isoformat() if r.analyzed_at else None,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )


class AnalysisListResponse(BaseModel):
    items: list[AnalysisOut]
    total: int


class AIReportOut(BaseModel):
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
            created_at=r.created_at.isoformat() if r.created_at else "",
        )


class ComparisonOut(BaseModel):
    id: str
    patient_id: str
    baseline_analysis_id: str
    followup_analysis_id: str
    comparison_type: str
    delta_powers: Optional[dict] = None
    improvement_summary: Optional[dict] = None
    ai_comparison_narrative: Optional[str] = None
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

    _log.info("EDF uploaded: %s (%d bytes) for patient %s", filename, len(file_bytes), patient_id)
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

    if analysis.analysis_status == "completed":
        return AnalysisOut.from_record(analysis)

    # Update status
    analysis.analysis_status = "processing"
    db.commit()

    try:
        # Load file
        settings = get_settings()
        from app.services import media_storage

        file_bytes = await media_storage.read_upload(analysis.file_ref, settings)

        # ── New MNE-pipeline (preferred when available) ──────────────────────
        # We prefer the full MNE / SpecParam / eLORETA / normative-z pipeline
        # from the editable path dep ``deepsynaps_qeeg``. If its import or
        # invocation fails (e.g. MNE not installed, dependency missing), we
        # fall through to the legacy Welch path so the worker never crashes.
        full_pipeline = _try_import_full_pipeline()
        pipeline_ran = False

        if full_pipeline is not None:
            pipeline_ran = _run_and_persist_full_pipeline(
                analysis=analysis,
                file_bytes=file_bytes,
                run_full_pipeline=full_pipeline,
            )

        if not pipeline_ran:
            # Parse EDF (legacy Welch path)
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

            # Extract standard 10-20 channels
            raw_eeg = extract_eeg_channels(raw, channel_map)

            # Artifact rejection
            from app.services.spectral_analysis import apply_artifact_rejection, compute_band_powers

            cleaned_raw, artifact_stats = apply_artifact_rejection(raw_eeg)
            analysis.artifact_rejection_json = json.dumps(artifact_stats)

            # Compute band powers
            band_powers = compute_band_powers(cleaned_raw)
            analysis.band_powers_json = json.dumps(band_powers)
            analysis.analysis_params_json = json.dumps({
                "epoch_length_sec": 2.0,
                "artifact_threshold_uv": 100.0,
                "bands": {"delta": [0.5, 4], "theta": [4, 8], "alpha": [8, 12], "beta": [12, 30], "gamma": [30, 45]},
            })

            # Update linked QEEGRecord findings
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


# ── Run Advanced (re-invoke full pipeline on demand) ─────────────────────────

@router.post("/{analysis_id}/run-advanced", response_model=AnalysisOut)
async def run_advanced_analyses(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnalysisOut:
    """Re-run the advanced MNE pipeline on an uploaded recording.

    Idempotent: if the analysis already has the advanced-pipeline columns
    populated (``pipeline_version`` non-null), the existing record is
    returned as-is. Otherwise the full pipeline is invoked on the stored
    file bytes.

    When ``deepsynaps_qeeg`` (MNE / SpecParam / eLORETA / …) is not
    importable, a friendly error is returned via the ``quality_metrics``
    payload instead of raising — per CONTRACT §6, the API worker must
    never crash on a missing scientific dependency.
    """
    require_minimum_role(actor, "clinician")

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)

    # Idempotency — if already run, summarise and return.
    if getattr(analysis, "pipeline_version", None):
        _log.info("run-advanced called on already-run analysis %s", analysis_id)
        existing_modules = ["preprocess", "artifacts", "spectral"]
        if analysis.connectivity_json:
            existing_modules.append("connectivity")
        if analysis.source_roi_json:
            existing_modules.append("source")
        if analysis.normative_zscores_json:
            existing_modules.append("normative")
        _set_advanced_summary(
            analysis,
            pipeline_version=analysis.pipeline_version,
            modules=existing_modules,
            note="already_run",
        )
        db.commit()
        db.refresh(analysis)
        return AnalysisOut.from_record(analysis)

    full_pipeline = _try_import_full_pipeline()
    if full_pipeline is None:
        # Dependency missing — record a friendly error in quality_metrics
        # per CONTRACT §6 and return rather than 500-ing.
        analysis.quality_metrics_json = json.dumps(
            {
                "error": "dependency_missing",
                "message": (
                    "The advanced qEEG pipeline requires MNE-Python and related "
                    "scientific packages which are not installed on this API "
                    "worker. Install with `pip install -e \".[qeeg]\"` on a "
                    "machine with compatible BLAS/LAPACK."
                ),
                "pipeline_version": _DEFAULT_PIPELINE_VERSION,
            }
        )
        db.commit()
        db.refresh(analysis)
        return AnalysisOut.from_record(analysis)

    # Load bytes from storage
    settings = get_settings()
    from app.services import media_storage

    if not analysis.file_ref:
        raise ApiServiceError(
            code="no_file",
            message="Analysis has no associated file to re-process",
            status_code=400,
        )

    file_bytes = await media_storage.read_upload(analysis.file_ref, settings)
    ok = _run_and_persist_full_pipeline(
        analysis=analysis,
        file_bytes=file_bytes,
        run_full_pipeline=full_pipeline,
    )

    if not ok:
        analysis.quality_metrics_json = json.dumps(
            {
                "error": "pipeline_runtime_error",
                "message": (
                    "The advanced qEEG pipeline failed at runtime. "
                    "See server logs for details."
                ),
                "pipeline_version": _DEFAULT_PIPELINE_VERSION,
            }
        )
        db.commit()
        db.refresh(analysis)
        return AnalysisOut.from_record(analysis)

    # Summarise which modules actually ran, based on which columns came back.
    modules = ["preprocess", "artifacts", "spectral"]
    if analysis.connectivity_json:
        modules.append("connectivity")
    if analysis.asymmetry_json:
        modules.append("asymmetry")
    if analysis.graph_metrics_json:
        modules.append("graph")
    if analysis.source_roi_json:
        modules.append("source")
    if analysis.normative_zscores_json:
        modules.append("normative")
    _set_advanced_summary(
        analysis,
        pipeline_version=analysis.pipeline_version or _DEFAULT_PIPELINE_VERSION,
        modules=modules,
        note="ran",
    )

    analysis.analysis_status = "completed"
    analysis.analyzed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(analysis)
    return AnalysisOut.from_record(analysis)


def _set_advanced_summary(
    analysis: QEEGAnalysis,
    *,
    pipeline_version: str,
    modules: list[str],
    note: str,
) -> None:
    """Write a compact summary into ``advanced_analyses_json`` for the UI.

    Parameters
    ----------
    analysis : QEEGAnalysis
        Row to mutate in place.
    pipeline_version : str
        Version string to record.
    modules : list of str
        Names of pipeline stages that contributed data (e.g. ``["preprocess",
        "spectral", "source"]``).
    note : str
        Short free-form note (``"ran"`` | ``"already_run"`` | error code).
    """
    analysis.advanced_analyses_json = json.dumps(
        {
            "ran_at": datetime.now(timezone.utc).isoformat(),
            "pipeline_version": pipeline_version,
            "modules": modules,
            "note": note,
        }
    )


# ── Get Analysis ─────────────────────────────────────────────────────────────

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

    return AnalysisOut.from_record(analysis)


# ── List Analyses for Patient ────────────────────────────────────────────────

@router.get("/patient/{patient_id}", response_model=AnalysisListResponse)
def list_patient_analyses(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnalysisListResponse:
    """List all qEEG analyses for a patient."""
    require_minimum_role(actor, "clinician")

    analyses = (
        db.query(QEEGAnalysis)
        .filter_by(patient_id=patient_id)
        .order_by(QEEGAnalysis.created_at.desc())
        .limit(100)
        .all()
    )

    return AnalysisListResponse(
        items=[AnalysisOut.from_record(a) for a in analyses],
        total=len(analyses),
    )


# ── Generate AI Report ───────────────────────────────────────────────────────

class AIReportRequest(BaseModel):
    report_type: str = Field(default="standard", pattern="^(standard|prediction)$")
    patient_context: Optional[str] = None


@router.post("/{analysis_id}/ai-report", response_model=AIReportOut, status_code=201)
async def generate_ai_report_endpoint(
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

    condition_matches = match_condition_patterns(band_powers)

    # Auto-surface any clinician-supplied clinical-context survey that was
    # embedded in the linked QEEGRecord's notes. This lets the LLM see
    # recording confounders (caffeine, sleep, meds), prior neuromodulation
    # history, and red-flag screen results alongside the band powers.
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

    # Surface the new MNE-pipeline fields when present so the AI interpreter
    # can include advanced features / z-scores / RAG context in the prompt.
    # Reconstruct a minimal features dict from individual columns — the
    # interpreter only needs the subsections it uses.
    features_dict: Optional[dict] = None
    spectral_sub: dict[str, Any] = {}
    aperiodic = _safe_json_loads(getattr(analysis, "aperiodic_json", None))
    if aperiodic:
        spectral_sub["aperiodic"] = aperiodic
    paf = _safe_json_loads(getattr(analysis, "peak_alpha_freq_json", None))
    if paf:
        spectral_sub["peak_alpha_freq"] = paf
    connectivity = _safe_json_loads(getattr(analysis, "connectivity_json", None))
    asymmetry = _safe_json_loads(getattr(analysis, "asymmetry_json", None))
    graph = _safe_json_loads(getattr(analysis, "graph_metrics_json", None))
    source_roi = _safe_json_loads(getattr(analysis, "source_roi_json", None))
    if spectral_sub or connectivity or asymmetry or graph or source_roi:
        features_dict = {}
        if spectral_sub:
            features_dict["spectral"] = spectral_sub
        if connectivity:
            features_dict["connectivity"] = connectivity
        if asymmetry:
            features_dict["asymmetry"] = asymmetry
        if graph:
            features_dict["graph"] = graph
        if source_roi:
            features_dict["source"] = source_roi

    zscores_payload = _safe_json_loads(getattr(analysis, "normative_zscores_json", None))
    quality_payload = _safe_json_loads(getattr(analysis, "quality_metrics_json", None))
    flagged_payload = _safe_json_loads(getattr(analysis, "flagged_conditions", None))
    flagged_list: Optional[list[str]]
    if isinstance(flagged_payload, list):
        flagged_list = [str(x) for x in flagged_payload]
    else:
        flagged_list = None

    # Generate AI report
    report_result = await generate_ai_report(
        band_powers=band_powers,
        patient_context=merged_patient_context,
        condition_matches=condition_matches,
        report_type=body.report_type,
        features=features_dict,
        zscores=zscores_payload if isinstance(zscores_payload, dict) else None,
        flagged_conditions=flagged_list,
        quality=quality_payload if isinstance(quality_payload, dict) else None,
    )

    report_data = report_result.get("data", {})
    literature_refs = report_result.get("literature_refs") or []

    # Save report
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
    )
    db.add(report)

    # Audit log — append the RAG source when literature hits were returned.
    audit_sources = ["edf_analysis", "qeeg_condition_map", *survey_sources_used]
    if literature_refs:
        audit_sources.append("qeeg_rag_literature")
    audit = AiSummaryAudit(
        patient_id=analysis.patient_id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        summary_type="qeeg_analysis",
        prompt_hash=report_result.get("prompt_hash"),
        response_preview=str(report_data.get("executive_summary", ""))[:200],
        sources_used=json.dumps(audit_sources),
        model_used=report_result.get("model_used"),
    )
    db.add(audit)
    db.commit()
    db.refresh(report)

    return AIReportOut.from_record(report)


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

    return ComparisonOut.from_record(comp)


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

    return ComparisonOut.from_record(comp)


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
