from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.persistence.models import QeegAnalysisJob

router = APIRouter(prefix="/api/v1/qeeg/jobs", tags=["qeeg-105"])


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
    _ = actor
    job = db.query(QeegAnalysisJob).filter(QeegAnalysisJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="job_not_found")
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
    _ = actor
    job = db.query(QeegAnalysisJob).filter(QeegAnalysisJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="job_not_found")
    if job.status != "ready":
        raise HTTPException(status_code=409, detail="job_not_ready")
    # Phase 0 stub: results storage lands in Phase 1+.
    try:
        params = json.loads(job.params_json or "{}")
    except (TypeError, ValueError):
        params = {}
    return JobResultsOut(job_id=job.id, definition_code=job.analysis_code, params=params)

