"""Voice / Audio Analyzer API — minimal analyze + fetch endpoints."""

from __future__ import annotations

import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.services import audio_pipeline as audio_facade
from app.services.audio_voice_persistence import load_voice_analysis, persist_voice_analysis

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/audio", tags=["audio-voice"])


class AnalyzeVoiceRequest(BaseModel):
    """Local-path analyze — upload surfaces should write file then pass path."""

    audio_path: str = Field(description="Absolute path to WAV/audio readable by the API worker.")
    session_id: str
    patient_id: Optional[str] = None
    task_protocol: str = "sustained_vowel_a"
    transcript: Optional[str] = None


@router.post("/analyze")
def analyze_voice(
    body: AnalyzeVoiceRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Run neuromod voice pipeline (requires ``deepsynaps_audio`` + deps on worker)."""

    require_minimum_role(actor, "clinician")

    if not getattr(audio_facade, "HAS_AUDIO_PIPELINE", False):
        raise HTTPException(
            status_code=503,
            detail="Voice analyzer package not installed on this worker.",
        )

    path = Path(body.audio_path)
    if not path.is_file():
        raise HTTPException(status_code=400, detail=f"audio_path not found: {body.audio_path}")

    fn = getattr(audio_facade, "run_voice_pipeline_from_paths", None)
    if fn is None:
        raise HTTPException(status_code=503, detail="voice pipeline unavailable")

    try:
        run = fn(
            audio_path=str(path.resolve()),
            session_id=body.session_id,
            patient_id=body.patient_id,
            task_protocol=body.task_protocol,
            transcript=body.transcript,
        )
    except Exception as exc:
        _log.exception("voice analyze failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    ctx = run.context
    report = ctx.get("voice_report_payload") or {}
    analysis_id = str(uuid.uuid4())

    pv = report.get("provenance") or {}
    persist_voice_analysis(
        db,
        analysis_id=analysis_id,
        voice_report=report,
        run_context={k: v for k, v in ctx.items() if k != "voice_report_payload"},
        patient_id=body.patient_id,
        session_id=body.session_id,
        run_id=run.run_id,
        input_path=str(path),
        file_hash_sha256=(ctx.get("recording") or {}).get("file_hash"),
        pipeline_version=pv.get("pipeline_version"),
        norm_db_version=pv.get("norm_db_version"),
    )

    return {
        "ok": True,
        "analysis_id": analysis_id,
        "run_id": run.run_id,
        "status": run.status,
        "voice_report": report,
    }


@router.get("/report/{analysis_id}")
def get_voice_report(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return stored voice report JSON."""

    require_minimum_role(actor, "clinician")
    row = load_voice_analysis(db, analysis_id)
    if row is None:
        raise HTTPException(status_code=404, detail="analysis not found")
    try:
        vr = json.loads(row.voice_report_json or "{}")
    except json.JSONDecodeError:
        vr = {}
    return {"analysis_id": analysis_id, "voice_report": vr, "status": row.status}
