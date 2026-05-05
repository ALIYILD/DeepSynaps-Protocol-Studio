from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.persistence.models import EegStudioRecording, QeegAnalysisAudit, QeegAnalysisJob
from app.qeeg.registry import get_analysis

router = APIRouter(prefix="/api/v1/qeeg/analyses", tags=["qeeg-105"])


class AnalysisRunIn(BaseModel):
    recording_id: str = Field(..., min_length=1)
    params: dict[str, Any] = Field(default_factory=dict)
    priority: Optional[Literal["low", "normal", "high"]] = "normal"


class AnalysisRunOut(BaseModel):
    job_id: str
    status: Literal["queued"]
    estimated_runtime_sec: int
    cache_hit: bool = False


def _params_hash(params: dict[str, Any]) -> str:
    payload = json.dumps(params or {}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _audit(
    db: Session,
    *,
    job_id: Optional[str],
    user_id: str,
    action: str,
    metadata: dict[str, Any],
) -> None:
    db.add(
        QeegAnalysisAudit(
            job_id=job_id,
            user_id=user_id,
            action=action,
            metadata_json=json.dumps(metadata, separators=(",", ":"), sort_keys=True),
        )
    )
    db.commit()


@router.post("/{code}/run", response_model=AnalysisRunOut)
def run_qeeg_analysis(
    code: str,
    body: AnalysisRunIn,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnalysisRunOut:
    require_minimum_role(actor, "clinician")

    definition = get_analysis(code)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Unknown analysis code '{code}'.")

    if definition.status.value == "research_stub_not_validated":
        _audit(
            db,
            job_id=None,
            user_id=actor.actor_id,
            action="run",
            metadata={"analysis_code": code, "status": "research_stub_not_validated"},
        )
        raise HTTPException(
            status_code=501,
            detail={
                "code": "analysis_not_implemented",
                "analysis_code": code,
                "status": definition.status.value,
                "message": "This analysis is a research stub and is not clinically validated yet.",
            },
        )

    rec = db.query(EegStudioRecording).filter_by(id=body.recording_id).first()
    if rec is None:
        raise HTTPException(status_code=404, detail="Recording not found.")

    phash = _params_hash(body.params)

    existing = (
        db.query(QeegAnalysisJob)
        .filter_by(recording_id=rec.id, analysis_code=code, params_hash=phash)
        .first()
    )
    if existing is not None:
        _audit(
            db,
            job_id=existing.id,
            user_id=actor.actor_id,
            action="run",
            metadata={"analysis_code": code, "recording_id": rec.id, "cache_hit": True},
        )
        return AnalysisRunOut(
            job_id=existing.id,
            status="queued" if existing.status != "ready" else "queued",
            estimated_runtime_sec=int(definition.computeBackend.estimatedRuntimeSec or 0),
            cache_hit=True,
        )

    job = QeegAnalysisJob(
        id=str(uuid.uuid4()),
        recording_id=rec.id,
        patient_id=rec.patient_id,
        analysis_code=code,
        params_hash=phash,
        params_json=json.dumps(body.params or {}, separators=(",", ":"), sort_keys=True),
        status="queued",
        priority=(body.priority or "normal"),
        estimated_runtime_sec=int(definition.computeBackend.estimatedRuntimeSec or 0),
        started_at=None,
        completed_at=None,
        result_s3_key=None,
        error_message=None,
        created_by=actor.actor_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()

    _audit(
        db,
        job_id=job.id,
        user_id=actor.actor_id,
        action="run",
        metadata={"analysis_code": code, "recording_id": rec.id, "params_hash": phash},
    )

    return AnalysisRunOut(
        job_id=job.id,
        status="queued",
        estimated_runtime_sec=int(definition.computeBackend.estimatedRuntimeSec or 0),
        cache_hit=False,
    )

