from __future__ import annotations

import json
import time
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse, StreamingResponse

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import QeegAnalysisJob
from app.qeeg.audit import record_qeeg_105_audit_event
from app.repositories.patients import resolve_patient_clinic_id

router = APIRouter(prefix="/api/v1/qeeg/jobs", tags=["qeeg-105"])
TERMINAL_JOB_STATUSES = {"ready", "failed", "cancelled"}

def _require_job_owner(db: Session, *, actor: AuthenticatedActor, job: QeegAnalysisJob) -> None:
    """Enforce tenant isolation for job-backed QEEG-105 operations.

    Jobs are scoped by the patient that owns the originating EEG Studio recording.
    Cross-clinic denial is converted to 404 to avoid leaking job existence.
    """
    exists, clinic_id = resolve_patient_clinic_id(db, job.patient_id)
    if not exists:
        raise HTTPException(status_code=404, detail="job_not_found")
    try:
        require_patient_owner(actor, clinic_id)
    except ApiServiceError as exc:
        if exc.code in {"cross_clinic_access_denied", "forbidden"}:
            raise HTTPException(status_code=404, detail="job_not_found") from exc
        raise


class JobStatusOut(BaseModel):
    job_id: str
    recording_id: str
    analysis_code: str
    status: str
    created_at: str = ""
    started_at: str | None = None
    completed_at: str | None = None
    error_message: str | None = None


class JobNotReadyOut(BaseModel):
    code: str = "job_not_ready"
    job_id: str
    status: str
    warnings: list[str] = Field(default_factory=list)
    validation_status: str = "not_validated"
    clinician_review_required: bool = True


class JobResultMeta(BaseModel):
    warnings: list[str] = Field(default_factory=list)
    validation_status: str = "not_validated"
    clinician_review_required: bool = True

    @model_validator(mode="after")
    def _require_review_if_not_validated(self) -> "JobResultMeta":
        if self.validation_status != "validated":
            self.clinician_review_required = True
        return self


class JobResultsOut(BaseModel):
    job_id: str
    definition_code: str
    params: dict = Field(default_factory=dict)
    meta: JobResultMeta = Field(default_factory=JobResultMeta)
    results: dict = Field(default_factory=dict)


@router.get("/{job_id}", response_model=JobStatusOut)
def get_job_status(
    job_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> JobStatusOut:
    require_minimum_role(actor, "clinician")
    job = db.query(QeegAnalysisJob).filter(QeegAnalysisJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="job_not_found")
    _require_job_owner(db, actor=actor, job=job)
    try:
        record_qeeg_105_audit_event(
            db,
            actor=actor,
            event="job_view",
            target_id=job.id,
            metadata={"job_id": job.id, "analysis_code": job.analysis_code, "status": job.status},
        )
    except Exception:  # pragma: no cover
        pass
    return JobStatusOut(
        job_id=job.id,
        recording_id=job.recording_id,
        analysis_code=job.analysis_code,
        status=job.status,
        created_at=job.created_at.isoformat() if job.created_at else "",
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        error_message=job.error_message,
    )


@router.get("/{job_id}/results", response_model=JobResultsOut)
def get_job_results(
    job_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> JobResultsOut:
    require_minimum_role(actor, "clinician")
    job = db.query(QeegAnalysisJob).filter(QeegAnalysisJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="job_not_found")
    _require_job_owner(db, actor=actor, job=job)
    try:
        record_qeeg_105_audit_event(
            db,
            actor=actor,
            event="result_view",
            target_id=job.id,
            metadata={"job_id": job.id, "analysis_code": job.analysis_code, "status": job.status},
        )
    except Exception:  # pragma: no cover
        pass

    if job.status in ("queued", "running"):
        return JSONResponse(
            status_code=202,
            content=JobNotReadyOut(
                job_id=job.id,
                status=job.status,
                warnings=["Job is still processing; retry later."],
            ).model_dump(),
        )
    if job.status != "ready":
        return JSONResponse(
            status_code=409,
            content=JobNotReadyOut(
                job_id=job.id,
                status=job.status,
                warnings=[job.error_message] if job.error_message else ["Job did not complete successfully."],
            ).model_dump(),
        )
    if not job.result_s3_key:
        return JSONResponse(
            status_code=409,
            content=JobNotReadyOut(
                job_id=job.id,
                status=job.status,
                warnings=["Job marked ready but results are not available."],
            ).model_dump(),
        )

    # Phase 0 honesty: results hydration is not available yet.
    try:
        params = json.loads(job.params_json or "{}")
    except (TypeError, ValueError):
        params = {}
    return JSONResponse(
        status_code=409,
        content={
            "code": "results_storage_not_implemented",
            "job_id": job.id,
            "warnings": [
                "Results storage/hydration is not implemented yet; this endpoint will return 200 only when real results exist."
            ],
            "validation_status": "not_validated",
            "clinician_review_required": True,
            "definition_code": job.analysis_code,
            "params": params,
        },
    )


def _sse_format(*, event: str, data: dict) -> str:
    payload = json.dumps(data, separators=(",", ":"), sort_keys=True)
    return f"event: {event}\ndata: {payload}\n\n"


@router.get("/{job_id}/stream")
def stream_job_updates(
    job_id: str,
    request: Request,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> StreamingResponse:
    require_minimum_role(actor, "clinician")
    job = db.query(QeegAnalysisJob).filter(QeegAnalysisJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="job_not_found")
    _require_job_owner(db, actor=actor, job=job)
    try:
        record_qeeg_105_audit_event(
            db,
            actor=actor,
            event="stream_open",
            target_id=job.id,
            metadata={"job_id": job.id, "analysis_code": job.analysis_code, "status": job.status},
        )
    except Exception:  # pragma: no cover
        pass

    def gen() -> Iterator[str]:
        last_status: str | None = None
        started = time.time()
        yield _sse_format(
            event="hello",
            data={"job_id": job_id, "status": job.status, "analysis_code": job.analysis_code},
        )
        while True:
            # Best-effort disconnect check. In newer Starlette `is_disconnected`
            # is async, so we can't reliably call it from a sync generator.
            # The 30s timeout bounds resource usage even if the client goes away.
            _ = request
            row = db.query(QeegAnalysisJob).filter(QeegAnalysisJob.id == job_id).first()
            if row is None:
                yield _sse_format(event="error", data={"code": "job_not_found", "job_id": job_id})
                return
            if row.status != last_status:
                last_status = row.status
                yield _sse_format(
                    event="status",
                    data={
                        "job_id": row.id,
                        "status": row.status,
                        "analysis_code": row.analysis_code,
                        "started_at": row.started_at.isoformat() if row.started_at else None,
                        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
                        "error_message": row.error_message,
                    },
                )
            if row.status in TERMINAL_JOB_STATUSES:
                yield _sse_format(event="done", data={"job_id": row.id, "status": row.status})
                return
            if (time.time() - started) > 30:
                yield _sse_format(event="keepalive", data={"job_id": row.id, "status": row.status})
                return
            time.sleep(1.0)

    return StreamingResponse(gen(), media_type="text/event-stream")

