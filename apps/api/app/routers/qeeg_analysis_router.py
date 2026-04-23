"""qEEG Analysis Pipeline — API endpoints.

Handles EDF file upload, spectral analysis, AI interpretation,
pre/post comparison, prediction, and correlation.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

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
    analyzed_at: Optional[str] = None
    created_at: str

    @classmethod
    def from_record(cls, r: QEEGAnalysis) -> "AnalysisOut":
        return cls(
            id=r.id,
            qeeg_record_id=r.qeeg_record_id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            original_filename=r.original_filename,
            file_size_bytes=r.file_size_bytes,
            recording_duration_sec=r.recording_duration_sec,
            sample_rate_hz=r.sample_rate_hz,
            channels=json.loads(r.channels_json) if r.channels_json else None,
            channel_count=r.channel_count,
            recording_date=r.recording_date,
            eyes_condition=r.eyes_condition,
            equipment=r.equipment,
            analysis_status=r.analysis_status,
            analysis_error=r.analysis_error,
            band_powers=json.loads(r.band_powers_json) if r.band_powers_json else None,
            artifact_rejection=json.loads(r.artifact_rejection_json) if r.artifact_rejection_json else None,
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
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnalysisOut:
    """Upload an EDF/BDF/EEG file for qEEG analysis."""
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

        # Parse EDF
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

    condition_matches = match_condition_patterns(band_powers)

    # Generate AI report
    report_result = await generate_ai_report(
        band_powers=band_powers,
        patient_context=body.patient_context,
        condition_matches=condition_matches,
        report_type=body.report_type,
    )

    report_data = report_result.get("data", {})

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
        model_used=report_result.get("model_used"),
        prompt_hash=report_result.get("prompt_hash"),
        confidence_note=report_data.get("confidence_level"),
    )
    db.add(report)

    # Audit log
    audit = AiSummaryAudit(
        patient_id=analysis.patient_id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        summary_type="qeeg_analysis",
        prompt_hash=report_result.get("prompt_hash"),
        response_preview=str(report_data.get("executive_summary", ""))[:200],
        sources_used=json.dumps(["edf_analysis", "qeeg_condition_map"]),
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
