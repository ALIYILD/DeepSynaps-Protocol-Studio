from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
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
from app.persistence.models import QeegAnalysisJob
from app.qeeg.audit import record_qeeg_105_audit_event
from app.repositories.patients import resolve_patient_clinic_id

router = APIRouter(prefix="/api/v1/qeeg/jobs", tags=["qeeg-105"])

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


class JobResultsOut(BaseModel):
    job_id: str
    definition_code: str
    params: dict = Field(default_factory=dict)
    outputs: dict = Field(default_factory=dict)
    visualizations: list[dict] = Field(default_factory=list)
    references: list[dict] = Field(default_factory=list)
    hedge_text: str = ""
    citations: list[dict] = Field(default_factory=list)
    note: str = "Phase 0: results payload is not yet implemented."


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
    if job.status != "ready":
        raise HTTPException(status_code=409, detail="job_not_ready")
    # Phase 0 stub: results storage lands in Phase 1+.
    try:
        params = json.loads(job.params_json or "{}")
    except (TypeError, ValueError):
        params = {}
    return JobResultsOut(job_id=job.id, definition_code=job.analysis_code, params=params)

