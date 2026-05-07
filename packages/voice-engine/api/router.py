# To wire into the FastAPI app, add to apps/api/app/main.py:
#     from packages.voice_engine.api import router as voice_router
#     app.include_router(voice_router.router)
# (Skipped here to avoid touching main.py while a concurrent session has it dirty.)
"""FastAPI router for the Voice Analyzer: upload, analyze, result endpoints."""

from __future__ import annotations

import dataclasses
import logging
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

# Allow bare `import audio_io` whether router is imported from inside the package
# tree or from the voice-engine root directly.
_VOICE_ENGINE_DIR = str(Path(__file__).parent.parent)
if _VOICE_ENGINE_DIR not in sys.path:
    sys.path.insert(0, _VOICE_ENGINE_DIR)

import audio_io  # noqa: E402  (after sys.path manipulation)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["voice"])


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
async def analyze_voice(session_id: str) -> dict[str, Any]:
    """Trigger full voice analysis pipeline for a session (not yet implemented)."""
    return {
        "status": "not_implemented",
        "session_id": session_id,
        "message": "Pipeline wiring will be added in Prompt 8.",
    }


@router.get("/result/{session_id}")
async def get_voice_result(session_id: str) -> dict[str, Any]:
    """Retrieve voice analysis result for a session."""
    return {"status": "pending", "session_id": session_id}
