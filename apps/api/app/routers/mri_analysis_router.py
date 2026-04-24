"""MRI Analyzer pipeline — API endpoints.

Implements the 8-endpoint contract from
``packages/mri-pipeline/portal_integration/api_contract.md``:

* ``POST /api/v1/mri/upload``                       — DICOM ZIP / NIfTI upload.
* ``POST /api/v1/mri/analyze``                      — kick off pipeline run.
* ``GET  /api/v1/mri/status/{job_id}``              — poll pipeline state.
* ``GET  /api/v1/mri/report/{analysis_id}``         — full ``MRIReport`` JSON.
* ``GET  /api/v1/mri/report/{analysis_id}/pdf``     — PDF report.
* ``GET  /api/v1/mri/report/{analysis_id}/html``    — HTML report.
* ``GET  /api/v1/mri/overlay/{analysis_id}/{tid}``  — interactive overlay HTML.
* ``GET  /api/v1/mri/medrag/{analysis_id}``         — MedRAG literature.

All endpoints require at least ``clinician`` role (per DASHBOARD_PAGE_SPEC §
"Permissions + audit"). Every ``/analyze`` call writes an ``AiSummaryAudit``
row so we have a traceable chain for safety review.

Regulatory posture — the ``MRIReport`` embeds the standard disclaimer:
    "Decision-support tool. Not a medical device."
"""
from __future__ import annotations

import io as _io
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import AiSummaryAudit, MriAnalysis, MriUpload
from app.services import mri_pipeline as mri_pipeline_facade
from app.settings import get_settings

_log = logging.getLogger(__name__)


router = APIRouter(prefix="/api/v1/mri", tags=["mri"])


# ── Constants / configuration ────────────────────────────────────────────────

# 500 MB upload cap — a zipped DICOM session easily clears 100 MB.
_MAX_UPLOAD_BYTES = 500 * 1024 * 1024

_VALID_CONDITIONS = {
    "mdd", "ptsd", "ocd", "alzheimers", "parkinsons", "chronic_pain",
    "tinnitus", "stroke", "adhd", "tbi", "asd", "insomnia",
}

_DISCLAIMER = (
    "Decision-support tool. Not a medical device. Coordinates and suggested "
    "parameters are derived from peer-reviewed literature. Not a substitute "
    "for clinician judgement. For neuronavigation planning only."
)


def _demo_mode_enabled() -> bool:
    """True when the façade is absent OR ``MRI_DEMO_MODE=1`` in the environment.

    Mirrors the qEEG demo pattern — ensures the dashboard page renders with a
    realistic payload even when the heavy neuro stack is not installed in
    this deployment.
    """
    if os.environ.get("MRI_DEMO_MODE") == "1":
        return True
    return not mri_pipeline_facade.HAS_MRI_PIPELINE


# ── JSON (de)serialisation helpers ───────────────────────────────────────────


def _dump(value: Any) -> Optional[str]:
    """Serialise ``value`` to JSON text, returning ``None`` for empties."""
    if value is None:
        return None
    try:
        return json.dumps(value, default=str)
    except (TypeError, ValueError) as exc:
        _log.warning("JSON dump failed (%s): %s", type(exc).__name__, exc)
        return None


def _load(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        _log.warning("JSON load failed; returning None for MRI column")
        return None


def _report_from_row(row: MriAnalysis) -> dict[str, Any]:
    """Assemble an ``MRIReport``-shaped dict from a persisted row."""
    return {
        "analysis_id": row.analysis_id,
        "patient": {
            "patient_id": row.patient_id,
            "age": row.age,
            "sex": row.sex,
        },
        "modalities_present": _load(row.modalities_present_json) or [],
        "qc": _load(row.qc_json) or {},
        "structural": _load(row.structural_json),
        "functional": _load(row.functional_json),
        "diffusion": _load(row.diffusion_json),
        "stim_targets": _load(row.stim_targets_json) or [],
        "medrag_query": _load(row.medrag_query_json) or {"findings": [], "conditions": []},
        "overlays": _load(row.overlays_json) or {},
        "pipeline_version": row.pipeline_version or "0.1.0",
        "norm_db_version": row.norm_db_version or "ISTAGING-v1",
        "disclaimer": _DISCLAIMER,
    }


def _populate_row_from_report(row: MriAnalysis, report: dict[str, Any]) -> None:
    """Copy ``MRIReport`` JSON payload into the DB row's ``*_json`` columns."""
    row.modalities_present_json = _dump(report.get("modalities_present"))
    row.structural_json = _dump(report.get("structural"))
    row.functional_json = _dump(report.get("functional"))
    row.diffusion_json = _dump(report.get("diffusion"))
    row.stim_targets_json = _dump(report.get("stim_targets"))
    row.medrag_query_json = _dump(report.get("medrag_query"))
    row.overlays_json = _dump(report.get("overlays"))
    row.qc_json = _dump(report.get("qc"))
    if "pipeline_version" in report:
        row.pipeline_version = str(report["pipeline_version"])[:16] or None
    if "norm_db_version" in report:
        row.norm_db_version = str(report["norm_db_version"])[:16] or None


# ── Audit helper ─────────────────────────────────────────────────────────────


def _audit_mri_analyze(
    db: Session,
    actor: AuthenticatedActor,
    patient_id: str,
    analysis_id: str,
    condition: str,
) -> None:
    """Write an ``AiSummaryAudit`` row for a new MRI analyze request."""
    try:
        audit = AiSummaryAudit(
            patient_id=patient_id,
            actor_id=actor.actor_id,
            actor_role=actor.role,
            summary_type="mri_analysis",
            prompt_hash=None,
            response_preview=f"analysis_id={analysis_id} condition={condition}"[:200],
            sources_used=json.dumps({"pipeline": "deepsynaps_mri"}),
            model_used="deepsynaps_mri.pipeline",
        )
        db.add(audit)
        db.commit()
    except Exception as exc:  # pragma: no cover - audit never blocks caller
        _log.warning("Failed to write MRI audit row: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass


# ── 1. Upload ────────────────────────────────────────────────────────────────


@router.post("/upload", status_code=201)
async def upload_mri(
    file: UploadFile = File(...),
    patient_id: str = Form(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Upload a DICOM zip or NIfTI file.

    Returns
    -------
    dict
        ``{"upload_id", "path", "patient_id"}`` — per api_contract.md §1.
    """
    require_minimum_role(actor, "clinician")

    filename = file.filename or "upload.bin"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ".bin"

    file_bytes = await file.read()
    if not file_bytes:
        raise ApiServiceError(
            code="file_empty",
            message="Uploaded MRI file is empty",
            status_code=422,
        )
    if len(file_bytes) > _MAX_UPLOAD_BYTES:
        raise ApiServiceError(
            code="file_too_large",
            message=f"File exceeds max size of {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
            status_code=422,
        )

    settings = get_settings()
    from app.services import media_storage

    upload_id = str(uuid.uuid4())
    try:
        file_ref = await media_storage.save_upload(
            patient_id=patient_id,
            upload_id=upload_id,
            file_bytes=file_bytes,
            extension=ext.lstrip("."),
            settings=settings,
        )
    except Exception as exc:
        _log.exception("Failed to save MRI upload")
        raise ApiServiceError(
            code="upload_failed",
            message=f"Failed to save upload: {exc}",
            status_code=500,
        )

    row = MriUpload(
        upload_id=upload_id,
        patient_id=patient_id,
        path=file_ref,
        filename=filename,
        file_size_bytes=len(file_bytes),
        mimetype=file.content_type,
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()

    _log.info(
        "MRI upload saved: upload_id=%s patient=%s size=%d",
        upload_id, patient_id, len(file_bytes),
    )
    return {
        "upload_id": upload_id,
        "path": file_ref,
        "patient_id": patient_id,
    }


# ── 2. Analyze ───────────────────────────────────────────────────────────────


@router.post("/analyze")
async def analyze_mri(
    upload_id: str = Form(...),
    patient_id: str = Form(...),
    condition: str = Form("mdd"),
    age: Optional[int] = Form(default=None),
    sex: Optional[str] = Form(default=None),
    run_mode: str = Form("background"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Kick off the MRI pipeline for an uploaded session.

    Returns
    -------
    dict
        ``{"job_id": str, "state": str}`` — per api_contract.md §2.
    """
    require_minimum_role(actor, "clinician")

    condition_lower = (condition or "").strip().lower()
    if condition_lower not in _VALID_CONDITIONS:
        raise ApiServiceError(
            code="invalid_condition",
            message=(
                f"Unknown condition '{condition}'. "
                f"Accepted: {', '.join(sorted(_VALID_CONDITIONS))}"
            ),
            status_code=422,
        )

    upload_row = db.query(MriUpload).filter_by(upload_id=upload_id).first()
    if upload_row is None and not _demo_mode_enabled():
        raise ApiServiceError(
            code="upload_not_found",
            message=f"upload_id {upload_id!r} not found",
            status_code=404,
        )

    analysis_id = str(uuid.uuid4())
    row = MriAnalysis(
        analysis_id=analysis_id,
        patient_id=patient_id,
        created_at=datetime.now(timezone.utc),
        job_id=analysis_id,
        state="queued",
        upload_ref=upload_id,
        condition=condition_lower,
        age=age,
        sex=sex,
    )
    db.add(row)
    db.commit()

    _audit_mri_analyze(db, actor, patient_id, analysis_id, condition_lower)

    # ── Demo-mode short-circuit — if the heavy pipeline isn't installed
    # OR the operator asked for demo mode explicitly, load the canned
    # sample report and mark the row SUCCESS immediately so the frontend
    # polling loop resolves on the next tick.
    if _demo_mode_enabled():
        demo = mri_pipeline_facade.load_demo_report()
        if demo and "error" not in demo:
            # Stamp analysis id onto the demo payload so /report returns
            # the id the client actually asked for.
            demo = {**demo, "analysis_id": analysis_id}
            _populate_row_from_report(row, demo)
            row.state = "SUCCESS"
            db.commit()
            _log.info(
                "MRI demo-mode analyze: analysis_id=%s condition=%s",
                analysis_id, condition_lower,
            )
            return {"job_id": analysis_id, "state": "queued"}

    # Sync mode — for tests only; blocks the request thread.
    if run_mode == "sync":
        session_dir = upload_row.path if upload_row else None
        result = mri_pipeline_facade.run_analysis_safe(
            upload_id=upload_id,
            patient_id=patient_id,
            condition=condition_lower,
            age=age,
            sex=sex,
            session_dir=session_dir,
        )
        if result.get("success") and result.get("data"):
            report = {**result["data"], "analysis_id": analysis_id}
            _populate_row_from_report(row, report)
            row.state = "SUCCESS"
        else:
            row.state = "FAILURE"
            row.qc_json = _dump(
                {"passed": False, "notes": [result.get("error") or "pipeline failed"]}
            )
        db.commit()
        return {"job_id": analysis_id, "state": "queued"}

    # Background mode — default. The row is in ``queued`` state; a real
    # Celery worker (or follow-up deployment) is expected to pick it up
    # and update ``state`` asynchronously. This endpoint returns
    # immediately.
    _log.info(
        "MRI analyze enqueued: analysis_id=%s condition=%s run_mode=%s",
        analysis_id, condition_lower, run_mode,
    )
    return {"job_id": analysis_id, "state": "queued"}


# ── 3. Status ────────────────────────────────────────────────────────────────


@router.get("/status/{job_id}")
def get_status(
    job_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return the pipeline state for ``job_id``."""
    require_minimum_role(actor, "clinician")

    row = db.query(MriAnalysis).filter_by(job_id=job_id).first()
    if row is None:
        # Accept analysis_id as fallback key.
        row = db.query(MriAnalysis).filter_by(analysis_id=job_id).first()
    if row is None:
        raise ApiServiceError(
            code="job_not_found",
            message=f"job_id {job_id!r} not found",
            status_code=404,
        )

    stage_map = {
        "queued": "queued",
        "STARTED": "ingest",
        "PROGRESS": "targeting",
        "SUCCESS": "done",
        "FAILURE": "failed",
    }
    return {
        "job_id": job_id,
        "state": row.state,
        "info": {"stage": stage_map.get(row.state, row.state)},
    }


# ── 4. Report JSON ───────────────────────────────────────────────────────────


@router.get("/report/{analysis_id}")
def get_report(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> JSONResponse:
    """Return the full ``MRIReport`` JSON for ``analysis_id``."""
    require_minimum_role(actor, "clinician")

    row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if row is None:
        raise ApiServiceError(
            code="analysis_not_found",
            message=f"analysis_id {analysis_id!r} not found",
            status_code=404,
        )
    return JSONResponse(_report_from_row(row))


# ── 5. Report PDF ────────────────────────────────────────────────────────────


@router.get("/report/{analysis_id}/pdf")
def get_report_pdf(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    """Stream a PDF render of the MRI report."""
    require_minimum_role(actor, "clinician")

    row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if row is None:
        raise ApiServiceError(
            code="analysis_not_found",
            message=f"analysis_id {analysis_id!r} not found",
            status_code=404,
        )

    report = _report_from_row(row)
    pdf_bytes = mri_pipeline_facade.generate_report_pdf_safe(analysis_id, report)
    if pdf_bytes is None:
        return JSONResponse(
            {
                "code": "pdf_unavailable",
                "message": (
                    "PDF rendering is not available in this build "
                    "(weasyprint / jinja missing)."
                ),
            },
            status_code=503,
        )
    return StreamingResponse(
        _io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="mri_report_{analysis_id}.pdf"',
        },
    )


# ── 6. Report HTML ───────────────────────────────────────────────────────────


@router.get("/report/{analysis_id}/html", response_class=HTMLResponse)
def get_report_html(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HTMLResponse:
    """Return a standalone HTML render of the MRI report."""
    require_minimum_role(actor, "clinician")

    row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if row is None:
        raise ApiServiceError(
            code="analysis_not_found",
            message=f"analysis_id {analysis_id!r} not found",
            status_code=404,
        )
    report = _report_from_row(row)
    html = mri_pipeline_facade.generate_report_html_safe(analysis_id, report)
    return HTMLResponse(html)


# ── 7. Overlay ───────────────────────────────────────────────────────────────


@router.get("/overlay/{analysis_id}/{target_id}", response_class=HTMLResponse)
def get_overlay(
    analysis_id: str,
    target_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HTMLResponse:
    """Return the interactive nilearn overlay HTML for one stim target."""
    require_minimum_role(actor, "clinician")

    row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if row is None:
        raise ApiServiceError(
            code="analysis_not_found",
            message=f"analysis_id {analysis_id!r} not found",
            status_code=404,
        )
    report = _report_from_row(row)
    html = mri_pipeline_facade.generate_overlay_html_safe(
        analysis_id, target_id, report
    )
    return HTMLResponse(html)


# ── 8. MedRAG ────────────────────────────────────────────────────────────────


@router.get("/medrag/{analysis_id}")
async def get_medrag(
    analysis_id: str,
    top_k: int = Query(default=20, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return MedRAG literature for the MRI analysis.

    Shape matches api_contract.md §8:
    ``{"analysis_id", "results": [{paper_id, title, doi, year, score, hits}]}``
    """
    require_minimum_role(actor, "clinician")

    row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if row is None:
        raise ApiServiceError(
            code="analysis_not_found",
            message=f"analysis_id {analysis_id!r} not found",
            status_code=404,
        )
    report = _report_from_row(row)
    return await mri_pipeline_facade.run_medrag_for_analysis_safe(
        report, top_k=top_k
    )


# ── 9a. List analyses per patient (for the Compare modal) ───────────────────


@router.get("/patients/{patient_id}/analyses")
def list_patient_analyses(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return a short list of MRI analyses for ``patient_id``.

    Shape: ``{"patient_id", "analyses": [{analysis_id, created_at, state,
    condition}]}``. Powers the ``Compare ←→`` modal on the Analyzer page,
    which needs ≥ 2 completed analyses to enable the longitudinal button.
    """
    require_minimum_role(actor, "clinician")

    rows = (
        db.query(MriAnalysis)
        .filter_by(patient_id=patient_id)
        .order_by(MriAnalysis.created_at.desc())
        .all()
    )
    analyses = [
        {
            "analysis_id": r.analysis_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "state": r.state,
            "condition": r.condition,
        }
        for r in rows
    ]
    return {"patient_id": patient_id, "analyses": analyses}


# ── 9. Longitudinal compare ──────────────────────────────────────────────────


@router.get("/compare/{baseline_id}/{followup_id}")
def compare_mri(
    baseline_id: str,
    followup_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> JSONResponse:
    """Compute a visit-to-visit change map between two MRI analyses.

    Loads both analyses from the DB (must belong to the same patient),
    rehydrates ``MRIReport`` JSON from the stored ``*_json`` columns,
    then calls :func:`deepsynaps_mri.longitudinal.compute_change_map`
    and returns the resulting :class:`LongitudinalReport`-shaped dict.

    This is the longitudinal upgrade from AI_UPGRADES §P0 #4:
    Reuter 2012 (FreeSurfer longitudinal pipeline, DOI
    ``10.1016/j.neuroimage.2012.02.084``) + SyN Jacobian (Avants 2008);
    TPS AD 6-month follow-up (NCT05910619). Decision-support only.
    """
    require_minimum_role(actor, "clinician")

    base_row = db.query(MriAnalysis).filter_by(analysis_id=baseline_id).first()
    if base_row is None:
        raise ApiServiceError(
            code="analysis_not_found",
            message=f"baseline analysis_id {baseline_id!r} not found",
            status_code=404,
        )
    fup_row = db.query(MriAnalysis).filter_by(analysis_id=followup_id).first()
    if fup_row is None:
        raise ApiServiceError(
            code="analysis_not_found",
            message=f"followup analysis_id {followup_id!r} not found",
            status_code=404,
        )
    if base_row.patient_id != fup_row.patient_id:
        raise ApiServiceError(
            code="patient_mismatch",
            message="baseline and followup analyses belong to different patients",
            status_code=422,
        )

    baseline_report = _report_from_row(base_row)
    followup_report = _report_from_row(fup_row)

    days_between: Optional[int] = None
    try:
        if base_row.created_at and fup_row.created_at:
            days_between = abs((fup_row.created_at - base_row.created_at).days)
    except Exception:  # pragma: no cover - defensive
        days_between = None

    # Lazy-import the longitudinal module so environments without the mri
    # pipeline on sys.path still load the router.
    try:
        from deepsynaps_mri.longitudinal import compute_change_map
    except ImportError as exc:  # pragma: no cover - optional dep
        _log.warning("longitudinal module unavailable: %s", exc)
        return JSONResponse(
            {
                "code": "longitudinal_unavailable",
                "message": "Longitudinal change-map module is not available in this build.",
            },
            status_code=503,
        )

    report = compute_change_map(
        baseline_report=baseline_report,
        followup_report=followup_report,
        days_between=days_between,
    )

    # Serialise via pydantic for stable, explicit shape on the wire.
    payload = report.model_dump(mode="json") if hasattr(report, "model_dump") else report.dict()
    return JSONResponse(payload)
