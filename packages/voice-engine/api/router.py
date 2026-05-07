# Wired into the FastAPI app via apps/api/app/routers/voice_engine_router.py
# (a thin import shim; the directory packages/voice-engine/ has a hyphen and
# cannot be imported as packages.voice_engine). Final paths under /api/v1:
#   POST /api/v1/voice/upload
#   POST /api/v1/voice/analyze/{session_id}
#   GET  /api/v1/voice/result/{session_id}
"""FastAPI router for the Voice Analyzer: upload, analyze, result endpoints."""

from __future__ import annotations

import dataclasses
import json
import logging
import sys
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

# Allow bare `import audio_io` whether router is imported from inside the package
# tree or from the voice-engine root directly.
_VOICE_ENGINE_DIR = str(Path(__file__).parent.parent)
if _VOICE_ENGINE_DIR not in sys.path:
    sys.path.insert(0, _VOICE_ENGINE_DIR)

import audio_io  # noqa: E402  (after sys.path manipulation)
import pipeline as _pipeline  # noqa: E402

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["voice"])


# ---------------------------------------------------------------------------
# DB session dependency (lazy — only used when the app has a real DB wired)
# ---------------------------------------------------------------------------


def _get_optional_db():
    """Yield an SQLAlchemy session if the app DB is configured, else yield None.

    Monkeypatch seam: tests replace this with a no-op or a fake session.
    """
    try:
        from app.database import get_db_session  # lazy — not available in bare voice-engine tests

        yield from get_db_session()
    except ImportError:
        yield None


# ---------------------------------------------------------------------------
# DB lookup helper (seam for /voice/result)
# ---------------------------------------------------------------------------


def _lookup_audio_analysis(session_id: str, db=None):
    """Return the AudioAnalysis ORM row for session_id, or None.

    Monkeypatch seam: tests replace this to return fake rows without a DB.
    """
    if db is None:
        return None
    try:
        from app.persistence.models import AudioAnalysis  # lazy

        return db.query(AudioAnalysis).filter(AudioAnalysis.session_id == session_id).first()
    except Exception as exc:
        logger.warning("_lookup_audio_analysis: DB error: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Request/response schemas
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    patient_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/upload")
async def upload_voice(
    patient_id: str = Form(...),
    session_id: str | None = Form(None),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Validate, normalise and upload an audio file; return AudioMeta as a dict.

    TODO: Once the `voice_sessions` (or `audio_analyses`) table is wired up,
    persist a row here with the returned AudioMeta fields so downstream
    analyze calls can look up the processed S3 key by session_id.
    See apps/api/app/persistence/models/media.py :: AudioAnalysis.
    """
    try:
        meta = audio_io.preprocess_upload(
            upload_file=file,
            patient_id=patient_id,
            session_id=session_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("preprocess_upload failed for patient_id=%s", patient_id)
        raise HTTPException(status_code=500, detail="preprocessing failed") from exc

    return dataclasses.asdict(meta)


@router.post("/analyze/{session_id}")
async def analyze_voice(
    session_id: str,
    body: AnalyzeRequest = AnalyzeRequest(),
    db: Any = Depends(_get_optional_db),
) -> dict[str, Any]:
    """Trigger full voice analysis pipeline for a session (synchronous MVP).

    # TODO Background queue integration: replace inline call with task enqueue
    # when worker infra exists. Keep run_voice_analysis_for_session signature stable.
    """
    patient_id = body.patient_id or session_id  # fall back to session_id as patient hint

    try:
        result = _pipeline.run_voice_analysis_for_session(
            patient_id=patient_id,
            session_id=session_id,
            db_session=db,
        )
    except Exception as exc:
        logger.exception(
            "analyze_voice: pipeline raised unexpectedly for session_id=%s", session_id
        )
        raise HTTPException(status_code=500, detail="pipeline error") from exc

    status = "completed" if result.report is not None else "failed"

    risk_tier = None
    risk_scores = None
    if result.risk is not None:
        risk_tier = result.risk.risk_tier
        risk_scores = {
            "depression_risk": result.risk.depression_risk,
            "anxiety_risk": result.risk.anxiety_risk,
            "stress_level": result.risk.stress_level,
            "cognitive_load": result.risk.cognitive_load,
        }
    elif result.report is not None:
        risk_tier = result.report.risk_tier
        risk_scores = result.report.raw_scores

    return {
        "status": status,
        "session_id": session_id,
        "patient_id": patient_id,
        "risk_tier": risk_tier,
        "risk_scores": risk_scores,
        "pipeline_status": {
            "steps_completed": result.pipeline_status.steps_completed,
            "failed_steps": result.pipeline_status.failed_steps,
            "total_steps": result.pipeline_status.total_steps,
        },
    }


@router.get("/result/{session_id}")
async def get_voice_result(
    session_id: str,
    db: Any = Depends(_get_optional_db),
) -> dict[str, Any]:
    """Retrieve voice analysis result for a session from the DB."""
    row = _lookup_audio_analysis(session_id, db)

    if row is None:
        raise HTTPException(status_code=404, detail="session not found")

    status = getattr(row, "status", "uploaded")

    if status == "uploaded":
        return {"status": "pending", "session_id": session_id}

    if status == "failed":
        return {
            "status": "failed",
            "session_id": session_id,
            "message": "Pipeline failed; see logs.",
        }

    # status == "completed"
    blob: dict = {}
    raw = getattr(row, "voice_report_json", None)
    if raw:
        try:
            blob = json.loads(raw)
        except Exception:
            blob = {}

    patient_id = getattr(row, "patient_id", None)

    return {
        "status": "completed",
        "session_id": session_id,
        "patient_id": patient_id,
        "risk_tier": blob.get("risk_tier"),
        "risk_scores": blob.get("raw_scores"),
        "summary": blob.get("summary"),
        "flags": blob.get("flags") or blob.get("raw_flags"),
        "data_quality_notes": blob.get("data_quality_notes"),
    }
