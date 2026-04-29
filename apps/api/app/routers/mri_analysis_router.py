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

import asyncio
import io as _io
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.persistence.models import (
    AiSummaryAudit,
    ClinicalSession,
    MriAnalysis,
    MriReportFinding,
    MriTargetPlan,
    MriUpload,
    OutcomeSeries,
    Patient,
    QEEGRecord,
)
from app.repositories.patients import resolve_patient_clinic_id
from app.services import mri_pipeline as mri_pipeline_facade
from app.settings import get_settings

_log = logging.getLogger(__name__)

try:
    from deepsynaps_mri.niivue_payload import StimTarget as ViewerStimTarget
    from deepsynaps_mri.niivue_payload import build_payload as build_viewer_payload
except ImportError:  # pragma: no cover - optional package path during thin installs
    ViewerStimTarget = None  # type: ignore[assignment]
    build_viewer_payload = None  # type: ignore[assignment]


def _gate_patient_access(
    actor: AuthenticatedActor, patient_id: str, db: Session
) -> None:
    """Cross-clinic ownership gate. See deeptwin_router for context."""
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)

try:
    from deepsynaps_mri.niivue_payload import StimTarget as ViewerStimTarget
    from deepsynaps_mri.niivue_payload import build_payload as build_viewer_payload
except ImportError:  # pragma: no cover - optional package path during thin installs
    ViewerStimTarget = None  # type: ignore[assignment]
    build_viewer_payload = None  # type: ignore[assignment]

# Upload validation + fusion payload + safer-language helpers — added
# 2026-04-26 night. Imported lazily through a try/except so the API still
# loads even on slim deployments where the mri pipeline package isn't
# installed (the demo-mode short-circuit covers that path).
try:
    from deepsynaps_mri.safety import (  # type: ignore[import-not-found]
        findings_from_structural,
        safe_brain_age,
        to_fusion_payload,
    )
    from deepsynaps_mri.schemas import BrainAgePrediction  # type: ignore[import-not-found]
    from deepsynaps_mri.validation import validate_upload_blob  # type: ignore[import-not-found]
    HAS_MRI_VALIDATION = True
except ImportError:  # pragma: no cover - thin-install fallback
    findings_from_structural = None  # type: ignore[assignment]
    safe_brain_age = None  # type: ignore[assignment]
    to_fusion_payload = None  # type: ignore[assignment]
    BrainAgePrediction = None  # type: ignore[assignment]
    validate_upload_blob = None  # type: ignore[assignment]
    HAS_MRI_VALIDATION = False


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
    """Deserialise a JSON string previously produced by :func:`_dump`."""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError) as exc:
        _log.warning("JSON load failed (%s): %s", type(exc).__name__, exc)
        return None


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return str(value)


def _timeline_sort_key(item: dict[str, Any]) -> str:
    return str(item.get("at") or "")


def _timeline_dt(raw: Any) -> Optional[datetime]:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo is not None else raw.replace(tzinfo=timezone.utc)
    text = str(raw).strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def _build_patient_timeline_payload(
    patient_id: str,
    actor: AuthenticatedActor,
    db: Session,
) -> dict[str, Any]:
    session_q = db.query(ClinicalSession).filter_by(patient_id=patient_id)
    qeeg_q = db.query(QEEGRecord).filter_by(patient_id=patient_id)
    outcome_q = db.query(OutcomeSeries).filter_by(patient_id=patient_id)
    if actor.role != "admin":
        session_q = session_q.filter(ClinicalSession.clinician_id == actor.actor_id)
        qeeg_q = qeeg_q.filter(QEEGRecord.clinician_id == actor.actor_id)
        outcome_q = outcome_q.filter(OutcomeSeries.clinician_id == actor.actor_id)

    mri_rows = (
        db.query(MriAnalysis)
        .filter_by(patient_id=patient_id)
        .order_by(MriAnalysis.created_at.asc())
        .all()
    )
    session_rows = session_q.order_by(ClinicalSession.scheduled_at.asc()).all()
    qeeg_rows = qeeg_q.order_by(QEEGRecord.created_at.asc()).all()
    outcome_rows = outcome_q.order_by(OutcomeSeries.administered_at.asc()).all()

    sessions = [
        {
            "id": row.id,
            "lane": "sessions",
            "at": row.completed_at or row.scheduled_at,
            "title": f"Session {row.session_number}" if row.session_number else (row.appointment_type or "Session"),
            "status": row.status,
            "meta": {
                "modality": row.modality,
                "appointment_type": row.appointment_type,
                "protocol_ref": row.protocol_ref,
                "outcome": row.outcome,
            },
        }
        for row in session_rows
    ]
    qeeg = [
        {
            "id": row.id,
            "lane": "qeeg",
            "at": row.recording_date or _iso(row.created_at),
            "title": f"{(row.recording_type or 'qEEG').replace('_', ' ')} qEEG",
            "status": "recorded",
            "meta": {
                "equipment": row.equipment,
                "eyes_condition": row.eyes_condition,
                "course_id": row.course_id,
            },
        }
        for row in qeeg_rows
    ]
    mri = [
        {
            "id": row.analysis_id,
            "lane": "mri",
            "at": _iso(row.created_at),
            "title": f"MRI {str(row.condition or 'analysis').upper()}",
            "status": row.state,
            "meta": {
                "condition": row.condition,
                "upload_ref": row.upload_ref,
            },
        }
        for row in mri_rows
    ]
    outcomes = [
        {
            "id": row.id,
            "lane": "outcomes",
            "at": _iso(row.administered_at),
            "title": row.template_title or row.template_id,
            "status": row.measurement_point,
            "meta": {
                "template_id": row.template_id,
                "score": row.score,
                "score_numeric": row.score_numeric,
                "course_id": row.course_id,
            },
        }
        for row in outcome_rows
    ]

    links: list[dict[str, Any]] = []
    outcomes_by_course: dict[str, list[dict[str, Any]]] = {}
    for item in outcomes:
        course_id = item["meta"].get("course_id")
        if course_id:
            outcomes_by_course.setdefault(course_id, []).append(item)
    for qeeg_item in qeeg:
        course_id = qeeg_item["meta"].get("course_id")
        if not course_id:
            continue
        for outcome_item in outcomes_by_course.get(course_id, []):
            links.append(
                {
                    "from_lane": "qeeg",
                    "from_id": qeeg_item["id"],
                    "to_lane": "outcomes",
                    "to_id": outcome_item["id"],
                    "kind": "course",
                }
            )

    if sessions and qeeg:
        for qeeg_item in qeeg:
            qeeg_dt = _timeline_dt(qeeg_item.get("at"))
            closest = min(
                sessions,
                key=lambda sess: abs(
                    (_timeline_dt(sess.get("at")) - qeeg_dt).total_seconds()
                ) if _timeline_dt(sess.get("at")) and qeeg_dt else 10**12,
            )
            links.append(
                {
                    "from_lane": "sessions",
                    "from_id": closest["id"],
                    "to_lane": "qeeg",
                    "to_id": qeeg_item["id"],
                    "kind": "temporal",
                }
            )

    if sessions and mri:
        for mri_item in mri:
            mri_dt = _timeline_dt(mri_item.get("at"))
            closest = min(
                sessions,
                key=lambda sess: abs(
                    (_timeline_dt(sess.get("at")) - mri_dt).total_seconds()
                ) if _timeline_dt(sess.get("at")) and mri_dt else 10**12,
            )
            links.append(
                {
                    "from_lane": "sessions",
                    "from_id": closest["id"],
                    "to_lane": "mri",
                    "to_id": mri_item["id"],
                    "kind": "temporal",
                }
            )

    return {
        "patient_id": patient_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "lanes": {
            "sessions": sorted(sessions, key=_timeline_sort_key),
            "qeeg": sorted(qeeg, key=_timeline_sort_key),
            "mri": sorted(mri, key=_timeline_sort_key),
            "outcomes": sorted(outcomes, key=_timeline_sort_key),
        },
        "links": links,
    }


def _report_from_row(row: MriAnalysis) -> dict[str, Any]:
    """Assemble an ``MRIReport``-shaped dict from a persisted row.

    Includes the safer per-region ``findings`` array and a brain-age block
    that's been routed through :func:`safe_brain_age` so the API never
    surfaces an implausible predicted age. Both are optional — if the mri
    pipeline package isn't importable the raw stored payload is returned
    unchanged.
    """
    structural = _load(row.structural_json)
    qc = _load(row.qc_json) or {}

    # Safer brain-age envelope. Re-runs the wrapper on whatever the model
    # produced so the field always carries confidence_band_years +
    # calibration_provenance even on legacy rows persisted before the
    # safety wrapper landed.
    if (
        HAS_MRI_VALIDATION
        and safe_brain_age is not None
        and BrainAgePrediction is not None
        and isinstance(structural, dict)
        and structural.get("brain_age")
    ):
        try:
            raw_ba = BrainAgePrediction(**structural["brain_age"])
            wrapped = safe_brain_age(raw_ba)
            structural = dict(structural)
            structural["brain_age"] = wrapped.model_dump(mode="json")
        except Exception as exc:  # noqa: BLE001
            _log.info("brain-age safety wrap skipped (%s: %s)", type(exc).__name__, exc)

    findings: list[dict[str, Any]] = []
    if HAS_MRI_VALIDATION and findings_from_structural is not None:
        try:
            findings = findings_from_structural(structural)
        except Exception as exc:  # noqa: BLE001
            _log.info("findings_from_structural skipped (%s: %s)", type(exc).__name__, exc)

    return {
        "analysis_id": row.analysis_id,
        "patient": {
            "patient_id": row.patient_id,
            "age": row.age,
            "sex": row.sex,
        },
        "modalities_present": _load(row.modalities_present_json) or [],
        "qc": qc,
        "qc_warnings": _load(getattr(row, "qc_warnings_json", None)) or [],
        "structural": structural,
        "functional": _load(row.functional_json),
        "diffusion": _load(row.diffusion_json),
        "stim_targets": _load(row.stim_targets_json) or [],
        "medrag_query": _load(row.medrag_query_json) or {"findings": [], "conditions": []},
        "overlays": _load(row.overlays_json) or {},
        "pipeline_version": row.pipeline_version or "0.1.0",
        "norm_db_version": row.norm_db_version or "ISTAGING-v1",
        # Safer per-region observations (added 2026-04-26 night). Always
        # includes ``requires_clinical_correlation: True`` and hedged
        # language; never says "diagnosis".
        "findings": findings,
        "disclaimer": _DISCLAIMER,
    }


def _status_payload_from_row(row: MriAnalysis, job_id: str) -> dict[str, Any]:
    stage_map = {
        "queued": "queued",
        "STARTED": "ingest",
        "PROGRESS": "targeting",
        "SUCCESS": "done",
        "FAILURE": "failed",
    }
    info: dict[str, Any] = {"stage": stage_map.get(row.state, row.state)}
    failure = getattr(row, "failure_reason", None)
    if failure:
        info["error"] = failure
    payload: dict[str, Any] = {
        "job_id": job_id,
        "state": row.state,
        "info": info,
    }
    if failure:
        payload["error"] = failure
    return payload


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
    # Generate patient-facing report at the same time as the analysis report
    from app.services.mri_claim_governance import sanitize_for_patient
    row.patient_facing_report_json = json.dumps(sanitize_for_patient(report))


def _viewer_payload_from_report(analysis_id: str, report: dict[str, Any]) -> dict[str, Any]:
    if build_viewer_payload is None or ViewerStimTarget is None:
        raise ApiServiceError(
            code="viewer_unavailable",
            message="MRI viewer payload builder is not available in this build.",
            status_code=503,
        )

    overlays: list[tuple[str, str, float]] = []
    if report.get("overlays"):
        overlays.append(("stat.nii.gz", "warm", 0.6))

    diffusion = report.get("diffusion") or {}
    if diffusion.get("fa_map_s3"):
        overlays.append(("fa_map.nii.gz", "winter", 0.45))
    if diffusion.get("md_map_s3"):
        overlays.append(("md_map.nii.gz", "red", 0.45))

    bundles: list[str] = []
    for bundle in diffusion.get("bundles") or []:
        name = bundle.get("bundle")
        if name:
            bundles.append(str(name))

    targets = []
    for item in report.get("stim_targets") or []:
        coords = item.get("mni_xyz") or []
        if len(coords) != 3:
            continue
        modality = str(item.get("modality") or "rtms").lower()
        if str(item.get("method") or "").endswith("_personalised"):
            modality = "personalised"
        targets.append(
            ViewerStimTarget(
                name=str(item.get("target_id") or item.get("region_name") or "target"),
                mni=(float(coords[0]), float(coords[1]), float(coords[2])),
                modality=modality,  # type: ignore[arg-type]
                radius_mm=4.0,
            )
        )

    payload = build_viewer_payload(
        case_id=analysis_id,
        api_prefix="/api/v1/mri",
        overlays=overlays,
        bundles=bundles,
        targets=targets,
    )
    return payload.to_dict()


def _summarize_change_rows(rows: Any, label: str) -> Optional[dict[str, Any]]:
    if not isinstance(rows, list) or not rows:
        return None
    ranked = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            delta = float(row.get("delta_pct") or 0.0)
        except (TypeError, ValueError):
            continue
        ranked.append({
            "domain": label,
            "region": row.get("region") or "region",
            "delta_pct": round(delta, 2),
            "flagged": bool(row.get("flagged")),
        })
    if not ranked:
        return None
    ranked.sort(key=lambda item: abs(item["delta_pct"]), reverse=True)
    return ranked[0]


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
@limiter.limit("10/minute")
async def upload_mri(
    request: Request,
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
    _gate_patient_access(actor, patient_id, db)

    filename = file.filename or "upload.bin"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ".bin"

    _ALLOWED_MRI_EXTENSIONS = frozenset({"zip", "nii", "gz", "dcm", "dicom", "img", "hdr"})
    _fn_lower = filename.lower()
    _ext_valid = (
        _fn_lower.endswith(".nii.gz")
        or _fn_lower.endswith(".tar.gz")
        or ext.lstrip(".") in _ALLOWED_MRI_EXTENSIONS
    )
    if not _ext_valid:
        raise ApiServiceError(
            code="invalid_file_type",
            message=(
                f"File type '{ext}' is not accepted. "
                "Allowed: .zip, .nii, .nii.gz, .dcm, .dicom, .img, .hdr"
            ),
            status_code=422,
        )

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

    # Stronger upload validation (added 2026-04-26 night): extension whitelist
    # + NIfTI magic-byte / zip sanity check before we ever persist the blob.
    # Skipped only when the validator helpers aren't importable (slim
    # deployment) — in that case the loose, pre-existing checks above are
    # the only safety net.
    if HAS_MRI_VALIDATION and validate_upload_blob is not None:
        validation = validate_upload_blob(filename, file_bytes)
        if not validation.ok:
            raise ApiServiceError(
                code=validation.code or "invalid_upload",
                message=validation.message,
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
        _log.error(
            "mri_upload_failed",
            extra={
                "event": "mri_upload_failed",
                "patient_id": patient_id,
                "actor_id": actor.actor_id,
                "upload_filename": filename,
                "error": str(exc),
            },
        )
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
        "mri_upload_success",
        extra={
            "event": "mri_upload_success",
            "upload_id": upload_id,
            "patient_id": patient_id,
            "actor_id": actor.actor_id,
            "upload_filename": filename,
            "file_size_bytes": len(file_bytes),
            "mimetype": file.content_type,
        },
    )
    return {
        "upload_id": upload_id,
        "path": file_ref,
        "patient_id": patient_id,
    }


# ── 2. Analyze ───────────────────────────────────────────────────────────────


@router.post("/analyze")
@limiter.limit("10/minute")
async def analyze_mri(
    request: Request,
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

    Pre-fix this route had no rate limit — an authenticated
    clinician could POST 10 000 jobs in a tight loop, each writing
    rows + audit + (in non-demo) enqueuing a real pipeline run.
    No queue-depth check, no cost ceiling. The 10/min IP cap is a
    minimum guard; real per-actor cost limits should be a separate
    follow-up wired through the worker queue.

    Returns
    -------
    dict
        ``{"job_id": str, "state": str}`` — per api_contract.md §2.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

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
            _err_msg = result.get("error") or "pipeline failed"
            row.qc_json = _dump(
                {"passed": False, "notes": [_err_msg]}
            )
            row.failure_reason = str(_err_msg)[:1000]
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

    _gate_patient_access(actor, row.patient_id, db)
    return _status_payload_from_row(row, job_id)


@router.get("/status/{job_id}/events")
async def stream_status_events(
    job_id: str,
    request: Request,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    """SSE stream for MRI job status updates."""
    require_minimum_role(actor, "clinician")

    row = db.query(MriAnalysis).filter_by(job_id=job_id).first()
    if row is None:
        row = db.query(MriAnalysis).filter_by(analysis_id=job_id).first()
    if row is None:
        raise ApiServiceError(
            code="job_not_found",
            message=f"job_id {job_id!r} not found",
            status_code=404,
        )

    _gate_patient_access(actor, row.patient_id, db)

    async def event_generator():
        last_payload: str | None = None
        while True:
            if await request.is_disconnected():
                break
            db.refresh(row)
            payload = _status_payload_from_row(row, job_id)
            payload["analysis_id"] = row.analysis_id
            encoded = json.dumps(payload)
            if encoded != last_payload:
                event_name = "complete" if row.state in {"SUCCESS", "FAILURE"} else "progress"
                yield f"event: {event_name}\ndata: {encoded}\n\n"
                last_payload = encoded
                if row.state in {"SUCCESS", "FAILURE"}:
                    break
            else:
                heartbeat = json.dumps({"analysis_id": row.analysis_id, "type": "heartbeat"})
                yield f"event: heartbeat\ndata: {heartbeat}\n\n"
            await asyncio.sleep(2.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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
    _gate_patient_access(actor, row.patient_id, db)
    return JSONResponse(_report_from_row(row))


@router.get("/report/{analysis_id}/fusion_payload")
def get_fusion_payload(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> JSONResponse:
    """Return a narrow fusion-ready payload for the qEEG-MRI fusion stream.

    Shape — see ``deepsynaps_mri.safety.to_fusion_payload`` docstring.
    Decision-support only; every entry carries
    ``requires_clinical_correlation: True``.
    """
    require_minimum_role(actor, "clinician")

    row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if row is None:
        raise ApiServiceError(
            code="analysis_not_found",
            message=f"analysis_id {analysis_id!r} not found",
            status_code=404,
        )
    _gate_patient_access(actor, row.patient_id, db)

    report = _report_from_row(row)
    if not (HAS_MRI_VALIDATION and to_fusion_payload is not None):
        return JSONResponse(
            {
                "code": "fusion_payload_unavailable",
                "message": (
                    "MRI fusion payload helper is not available in this build "
                    "(packages/mri-pipeline missing)."
                ),
            },
            status_code=503,
        )
    try:
        payload = to_fusion_payload(report, subject_id=row.patient_id)
    except Exception as exc:  # noqa: BLE001
        _log.exception("to_fusion_payload failed for analysis_id=%s", analysis_id)
        raise ApiServiceError(
            code="fusion_payload_failed",
            message=f"{type(exc).__name__}: {exc}",
            status_code=500,
        )
    return JSONResponse(payload)


@router.get("/{analysis_id}/viewer.json")
def get_viewer_payload(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> JSONResponse:
    """Return a NiiVue-friendly payload for the MRI dashboard viewer."""
    require_minimum_role(actor, "clinician")

    row = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if row is None:
        raise ApiServiceError(
            code="analysis_not_found",
            message=f"analysis_id {analysis_id!r} not found",
            status_code=404,
        )
    _gate_patient_access(actor, row.patient_id, db)
    return JSONResponse(_viewer_payload_from_report(analysis_id, _report_from_row(row)))


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
    _gate_patient_access(actor, row.patient_id, db)

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
    _gate_patient_access(actor, row.patient_id, db)
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
    _gate_patient_access(actor, row.patient_id, db)
    report = _report_from_row(row)
    html = mri_pipeline_facade.generate_overlay_html_safe(
        analysis_id, target_id, report
    )
    return HTMLResponse(html)


@router.get("/patients/{patient_id}/timeline")
def get_patient_timeline(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Aggregate sessions, qEEG, MRI, and outcomes into a 4-lane timeline."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)
    return _build_patient_timeline_payload(patient_id, actor, db)


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
    _gate_patient_access(actor, row.patient_id, db)
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
    _gate_patient_access(actor, patient_id, db)

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
    _gate_patient_access(actor, base_row.patient_id, db)

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
    key_findings = [
        item for item in [
            _summarize_change_rows(payload.get("structural_changes"), "structural"),
            _summarize_change_rows(payload.get("functional_changes"), "functional"),
            _summarize_change_rows(payload.get("diffusion_changes"), "diffusion"),
        ]
        if item is not None
    ]
    payload["comparison_meta"] = {
        "patient_id": base_row.patient_id,
        "baseline_created_at": base_row.created_at.isoformat() if base_row.created_at else None,
        "followup_created_at": fup_row.created_at.isoformat() if fup_row.created_at else None,
        "baseline_condition": base_row.condition,
        "followup_condition": fup_row.condition,
        "baseline_state": base_row.state,
        "followup_state": fup_row.state,
        "key_findings": key_findings,
    }
    return JSONResponse(payload)


# ── MRI Clinical Workbench endpoints (migration 053) ─────────────────────────


class _ReportStateTransitionIn(BaseModel):
    action: str
    note: Optional[str] = None


class _SafetyCockpitOut(BaseModel):
    checks: list[dict]
    red_flags: list[dict]
    overall_status: str
    disclaimer: str


class _RedFlagsOut(BaseModel):
    flags: list[dict]
    flag_count: int
    high_severity_count: int
    disclaimer: str


class _AtlasModelCardOut(BaseModel):
    template_space: Optional[str] = None
    atlas_version: Optional[str] = None
    registration_method: Optional[str] = None
    segmentation_method: Optional[str] = None
    brain_extraction_status: Optional[str] = None
    registration_confidence: Optional[str] = None
    coordinate_uncertainty_mm: Optional[float] = None
    known_limitations: Optional[str] = None
    complete: bool = False


class _TargetPlanOut(BaseModel):
    id: str
    analysis_id: str
    target_index: int
    anatomical_label: str
    modality_compatibility: Optional[list[str]] = None
    atlas_version: Optional[str] = None
    registration_confidence: Optional[str] = None
    coordinate_uncertainty_mm: Optional[float] = None
    contraindications: list[str] = Field(default_factory=list)
    evidence_grade: Optional[str] = None
    off_label_flag: bool = False
    match_rationale: Optional[str] = None
    caution_rationale: Optional[str] = None
    required_checks: list[str] = Field(default_factory=list)


class _TimelineEventOut(BaseModel):
    date: str
    event_type: str
    title: str
    description: str
    severity: Optional[str] = None
    resolved: bool = False
    source_analysis_id: Optional[str] = None


@router.get("/{analysis_id}/safety-cockpit", response_model=_SafetyCockpitOut)
def get_mri_safety_cockpit(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> _SafetyCockpitOut:
    """Return the clinical safety cockpit for an MRI analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.mri_safety_engine import compute_mri_safety_cockpit

    cockpit = None
    if analysis.safety_cockpit_json:
        try:
            cockpit = json.loads(analysis.safety_cockpit_json)
        except (TypeError, ValueError):
            pass
    if cockpit is None:
        cockpit = compute_mri_safety_cockpit(analysis)
        analysis.safety_cockpit_json = json.dumps(cockpit)
        db.commit()

    _log.info(
        "mri_safety_cockpit_served",
        extra={
            "event": "mri_safety_cockpit_served",
            "analysis_id": analysis_id,
            "overall_status": cockpit.get("overall_status"),
            "red_flag_count": len(cockpit.get("red_flags", [])),
            "radiology_review_required": any(
                f.get("code") == "RADIOLOGY_REVIEW_REQUIRED" for f in cockpit.get("red_flags", [])
            ),
            "actor_id": actor.actor_id,
        },
    )
    return _SafetyCockpitOut(**cockpit)


@router.get("/{analysis_id}/red-flags", response_model=_RedFlagsOut)
def get_mri_red_flags(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> _RedFlagsOut:
    """Return red-flag detector output for an MRI analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.mri_safety_engine import compute_mri_safety_cockpit

    flags = None
    if analysis.red_flags_json:
        try:
            flags = json.loads(analysis.red_flags_json)
        except (TypeError, ValueError):
            pass
    if flags is None:
        cockpit = compute_mri_safety_cockpit(analysis)
        red_flags = cockpit.get("red_flags", [])
        flags = {
            "flags": red_flags,
            "flag_count": len(red_flags),
            "high_severity_count": sum(1 for f in red_flags if f.get("severity") == "high"),
            "disclaimer": cockpit.get("disclaimer", ""),
        }
        analysis.red_flags_json = json.dumps(flags)
        db.commit()
    return _RedFlagsOut(**flags)


@router.get("/{analysis_id}/atlas-model-card", response_model=_AtlasModelCardOut)
def get_mri_atlas_model_card(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> _AtlasModelCardOut:
    """Return atlas / model metadata for an MRI analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    meta = None
    if analysis.atlas_metadata_json:
        try:
            meta = json.loads(analysis.atlas_metadata_json)
        except (TypeError, ValueError):
            pass
    if meta:
        return _AtlasModelCardOut(**meta)

    structural = _load(analysis.structural_json) or {}
    reg = structural.get("registration", {})
    return _AtlasModelCardOut(
        template_space=reg.get("template_space", "MNI152"),
        atlas_version=structural.get("atlas_version", "unknown"),
        registration_method=reg.get("method", "unknown"),
        segmentation_method=structural.get("segmentation_method", "unknown"),
        brain_extraction_status=structural.get("brain_extraction", "unknown"),
        registration_confidence=reg.get("confidence", "unknown"),
        coordinate_uncertainty_mm=reg.get("uncertainty_mm"),
        known_limitations="MRI spatial context incomplete — interpret cautiously." if not structural else None,
        complete=bool(structural),
    )


@router.post("/{analysis_id}/target-plan-governance", response_model=list[_TargetPlanOut])
def compute_mri_target_plan_governance(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[_TargetPlanOut]:
    """Compute and persist target-plan governance records for an MRI analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    patient = db.query(Patient).filter_by(id=analysis.patient_id).first()
    if not patient:
        raise ApiServiceError(code="not_found", message="Patient not found", status_code=404)

    from app.services.mri_protocol_governance import compute_target_plan_governance

    plans = compute_target_plan_governance(analysis, patient, db)
    db.commit()

    _log.info(
        "mri_target_plan_generated",
        extra={
            "event": "mri_target_plan_generated",
            "analysis_id": analysis_id,
            "target_count": len(plans),
            "off_label_count": sum(1 for p in plans if p.off_label_flag),
            "actor_id": actor.actor_id,
        },
    )

    out: list[_TargetPlanOut] = []
    for p in plans:
        db.refresh(p)
        out.append(_TargetPlanOut(
            id=p.id,
            analysis_id=p.analysis_id,
            target_index=p.target_index,
            anatomical_label=p.anatomical_label,
            modality_compatibility=json.loads(p.modality_compatibility) if p.modality_compatibility else None,
            atlas_version=p.atlas_version,
            registration_confidence=p.registration_confidence,
            coordinate_uncertainty_mm=p.coordinate_uncertainty_mm,
            contraindications=json.loads(p.contraindications) if p.contraindications else [],
            evidence_grade=p.evidence_grade,
            off_label_flag=p.off_label_flag,
            match_rationale=p.match_rationale,
            caution_rationale=p.caution_rationale,
            required_checks=json.loads(p.required_checks) if p.required_checks else [],
        ))
    return out


@router.get("/{analysis_id}/target-plan-governance", response_model=list[_TargetPlanOut])
def get_mri_target_plan_governance(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[_TargetPlanOut]:
    """Return persisted target-plan governance records for an MRI analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    rows = db.query(MriTargetPlan).filter_by(analysis_id=analysis_id).order_by(MriTargetPlan.target_index.asc()).all()
    out: list[_TargetPlanOut] = []
    for p in rows:
        out.append(_TargetPlanOut(
            id=p.id,
            analysis_id=p.analysis_id,
            target_index=p.target_index,
            anatomical_label=p.anatomical_label,
            modality_compatibility=json.loads(p.modality_compatibility) if p.modality_compatibility else None,
            atlas_version=p.atlas_version,
            registration_confidence=p.registration_confidence,
            coordinate_uncertainty_mm=p.coordinate_uncertainty_mm,
            contraindications=json.loads(p.contraindications) if p.contraindications else [],
            evidence_grade=p.evidence_grade,
            off_label_flag=p.off_label_flag,
            match_rationale=p.match_rationale,
            caution_rationale=p.caution_rationale,
            required_checks=json.loads(p.required_checks) if p.required_checks else [],
        ))
    return out


@router.post("/{analysis_id}/transition")
def transition_mri_report_state(
    analysis_id: str,
    body: _ReportStateTransitionIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Transition an MRI analysis report through its review workflow."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.mri_clinician_review import transition_report_state

    analysis = transition_report_state(analysis, body.action, actor, db, note=body.note)
    db.commit()
    return {
        "analysis_id": analysis.analysis_id,
        "report_state": analysis.report_state,
        "reviewer_id": analysis.reviewer_id,
        "reviewed_at": analysis.reviewed_at.isoformat() if analysis.reviewed_at else None,
    }


@router.post("/{analysis_id}/sign")
def sign_mri_report(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Digitally sign-off on an approved MRI report."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.mri_clinician_review import sign_report

    analysis = sign_report(analysis_id, actor, db)
    db.commit()
    return {
        "analysis_id": analysis.analysis_id,
        "signed_by": analysis.signed_by,
        "signed_at": analysis.signed_at.isoformat() if analysis.signed_at else None,
    }


@router.get("/{analysis_id}/patient-facing")
def get_mri_patient_facing_report(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return the sanitized patient-facing version of an MRI report.

    Gated: report must be approved (or reviewed with amendments) before
    the patient-facing version is returned.
    """
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if analysis.report_state not in ("MRI_APPROVED", "MRI_REVIEWED_WITH_AMENDMENTS"):
        _log.warning(
            "mri_patient_report_blocked",
            extra={
                "event": "mri_patient_report_blocked",
                "analysis_id": analysis_id,
                "report_state": analysis.report_state,
                "actor_id": actor.actor_id,
            },
        )
        raise ApiServiceError(
            code="report_not_approved",
            message="Patient-facing report is only available after clinician approval.",
            status_code=403,
        )

    if not analysis.patient_facing_report_json:
        return {"disclaimer": "Patient-facing report not yet generated.", "content": None}
    return json.loads(analysis.patient_facing_report_json)


@router.get("/patient/{patient_id}/timeline", response_model=list[_TimelineEventOut])
def get_mri_patient_timeline(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[_TimelineEventOut]:
    """Return the MRI clinical workbench timeline for a patient."""
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, db)

    from app.services.mri_timeline import build_timeline

    events = build_timeline(patient_id, db)
    return [_TimelineEventOut(**e) for e in events]


@router.post("/{analysis_id}/export-bids")
def export_mri_bids_package(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    """Export a Clinical MRI Package in BIDS-style zip format.

    Gated: requires approved and signed-off report.
    """
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.mri_bids_export import build_bids_package

    buf = build_bids_package(analysis_id, actor, db)
    _log.info(
        "mri_bids_export_served",
        extra={
            "event": "mri_bids_export_served",
            "analysis_id": analysis_id,
            "actor_id": actor.actor_id,
            "actor_role": actor.role,
        },
    )
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                f'attachment; filename="mri_clinical_package_{analysis_id}.zip"'
            ),
        },
    )



class _FindingUpdateIn(BaseModel):
    status: str
    clinician_note: Optional[str] = None
    amended_text: Optional[str] = None


@router.post("/{analysis_id}/claim-governance")
def generate_mri_claim_governance(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Run claim governance over the MRI AI report."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.mri_claim_governance import classify_mri_claims

    report = _report_from_row(analysis)
    findings = classify_mri_claims(report)
    analysis.claim_governance_json = json.dumps(findings)

    blocked_count = sum(1 for f in findings if f.get("claim_type") == "BLOCKED")
    _log.info(
        "mri_claim_governance_generated",
        extra={
            "event": "mri_claim_governance_generated",
            "analysis_id": analysis_id,
            "finding_count": len(findings),
            "blocked_count": blocked_count,
            "actor_id": actor.actor_id,
        },
    )

    existing = {f.target_id: f for f in db.query(MriReportFinding).filter_by(analysis_id=analysis_id).all()}
    for idx, item in enumerate(findings):
        target_id = f"{item.get('section', 'unknown')}_{idx}"
        if target_id in existing:
            existing[target_id].claim_type = item["claim_type"]
            if item.get("block_reason"):
                existing[target_id].clinician_note = item["block_reason"]
        else:
            db.add(
                MriReportFinding(
                    analysis_id=analysis_id,
                    target_id=target_id,
                    claim_type=item["claim_type"],
                    status="BLOCKED" if item["claim_type"] == "BLOCKED" else "PENDING_REVIEW",
                    clinician_note=item.get("block_reason"),
                )
            )
    db.commit()
    return {"analysis_id": analysis_id, "findings": findings}


@router.get("/{analysis_id}/claim-governance")
def get_mri_claim_governance(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return persisted claim governance for an MRI analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    if analysis.claim_governance_json:
        return {"analysis_id": analysis_id, "findings": json.loads(analysis.claim_governance_json)}
    return {"analysis_id": analysis_id, "findings": []}


@router.post("/{analysis_id}/findings/{finding_id}")
def update_mri_finding(
    analysis_id: str,
    finding_id: str,
    body: _FindingUpdateIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Update a single MRI finding's review status."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.mri_clinician_review import update_finding_status

    finding = update_finding_status(
        finding_id, body.status, body.clinician_note, body.amended_text, actor, db
    )
    db.commit()
    return {"id": finding.id, "status": finding.status, "claim_type": finding.claim_type}


@router.get("/{analysis_id}/audit-trail")
def get_mri_audit_trail(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return the immutable audit trail for an MRI analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.mri_clinician_review import get_audit_trail

    audits = get_audit_trail(analysis_id, db)
    return {
        "analysis_id": analysis_id,
        "audits": [
            {
                "id": a.id,
                "action": a.action,
                "actor_id": a.actor_id,
                "actor_role": a.actor_role,
                "previous_state": a.previous_state,
                "new_state": a.new_state,
                "note": a.note,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in audits
        ],
    }


@router.post("/{analysis_id}/export")
def export_mri_package(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    """Build and return a comprehensive clinical export package for an MRI analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.mri_bids_export import build_bids_package

    buf = build_bids_package(analysis_id, actor, db)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="mri_export_{analysis_id}.zip"',
        },
    )


@router.get("/{analysis_id}/registration-qa")
def get_mri_registration_qa(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return registration QA metrics for an MRI analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.mri_registration_qa import compute_registration_qa

    return compute_registration_qa(analysis)


@router.get("/{analysis_id}/phi-audit")
def get_mri_phi_audit(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return PHI / de-identification audit for an MRI analysis."""
    require_minimum_role(actor, "clinician")
    analysis = db.query(MriAnalysis).filter_by(analysis_id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    _gate_patient_access(actor, analysis.patient_id, db)

    from app.services.mri_phi_audit import compute_phi_audit

    return compute_phi_audit(analysis)
