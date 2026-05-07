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

# Clinical-use constants — defined here to mirror __init__.py without a circular import.
_ENGINE_VERSION = "0.1.0"
_CLINICAL_DISCLAIMER = (
    "Voice-derived decision support; not a diagnostic device. "
    "Patterns are statistical, not validated against clinical outcomes. "
    "All findings require clinician interpretation."
)

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
# Auth dependency (lazy — only used when the app has auth wired)
# ---------------------------------------------------------------------------


def _get_optional_actor():
    """Return the authenticated actor if auth is configured, else None.

    Monkeypatch seam: tests replace this via app.dependency_overrides.
    """
    try:
        from app.auth import get_authenticated_actor  # lazy

        return get_authenticated_actor
    except ImportError:
        return lambda: None


def _get_actor_dependency():
    """FastAPI Depends target for the authenticated actor.

    Returns a real AuthenticatedActor when app.auth is importable (i.e.
    when the router is mounted inside the main API app), None otherwise
    (bare voice-engine test environment).
    """
    try:
        from app.auth import get_authenticated_actor  # lazy
        return Depends(get_authenticated_actor)
    except ImportError:
        return Depends(lambda: None)


# ---------------------------------------------------------------------------
# Clinic-scope gate (mirrors audio_analysis_router._gate_patient_access)
# ---------------------------------------------------------------------------


def _gate_session_clinic_access(actor: Any, patient_id: Optional[str], db: Any) -> None:
    """Enforce that actor belongs to the same clinic as the patient.

    Mirrors audio_analysis_router._gate_patient_access exactly:
    - null/missing patient_id: no-op (caller should 404 before reaching this)
    - uses resolve_patient_clinic_id + require_patient_owner from app.auth
    - cross-clinic ApiServiceError propagates as 403

    Fail closed: if any auth dependency is missing, reject the request rather
    than no-op the gate (matches audio_analysis_router._gate_patient_access behavior).
    No-op only when actor is None (bare voice-engine environment with no auth wired).
    """
    if actor is None:
        return
    if not patient_id:
        return
    # Fail closed: if any auth dependency is missing, raise 500 rather than
    # silently returning and granting cross-clinic access.
    from app.repositories.patients import resolve_patient_clinic_id  # lazy
    from app.auth import require_patient_owner  # lazy
    from app.errors import ApiServiceError  # lazy

    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        try:
            require_patient_owner(actor, clinic_id)
        except ApiServiceError as exc:
            if exc.code == "cross_clinic_access_denied":
                raise HTTPException(status_code=403, detail="session not in your clinic") from exc
            raise


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
    actor: Any = _get_actor_dependency(),
    db: Any = Depends(_get_optional_db),
) -> dict[str, Any]:
    """Validate, normalise and store an audio file on the Fly volume; return AudioMeta as dict.

    Clinic-scope gate: if actor is from a different clinic than the patient, returns 403.
    """
    # Gate: actor must belong to the same clinic as the patient being written to.
    _gate_session_clinic_access(actor, patient_id, db)

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

    # Persist an AudioAnalysis row so /voice/analyze and /voice/result resolve
    # by session_id. Best-effort: skipped silently when the DB layer is absent
    # (bare voice-engine tests) or fails. Without this, analyze 404s on every
    # uploaded session because the security fix from PR #552 requires a DB row.
    if db is not None:
        try:
            import uuid as _uuid  # lazy
            from app.persistence.models import AudioAnalysis  # lazy

            existing = (
                db.query(AudioAnalysis)
                .filter(AudioAnalysis.session_id == meta.session_id)
                .first()
            )
            if existing is None:
                row = AudioAnalysis(
                    analysis_id=str(_uuid.uuid4()),
                    patient_id=meta.patient_id,
                    session_id=meta.session_id,
                    status="uploaded",
                    input_path=meta.processed_s3_key,
                )
                db.add(row)
                db.commit()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "voice upload: failed to insert AudioAnalysis row for session=%s: %s",
                meta.session_id,
                exc,
            )
            try:
                db.rollback()
            except Exception:
                pass

    return dataclasses.asdict(meta)


@router.post("/analyze/{session_id}")
async def analyze_voice(
    session_id: str,
    body: AnalyzeRequest = AnalyzeRequest(),
    actor: Any = _get_actor_dependency(),
    db: Any = Depends(_get_optional_db),
) -> dict[str, Any]:
    """Trigger full voice analysis pipeline for a session (synchronous MVP).

    Clinic-scope gate: the session's patient must belong to the actor's clinic.
    Requires the AudioAnalysis DB row to exist; 404 if missing (no client-supplied
    patient_id fallback — that would allow IDOR via body spoofing).

    # TODO Background queue integration: replace inline call with task enqueue
    # when worker infra exists. Keep run_voice_analysis_for_session signature stable.
    """
    # Gate: require the DB row to exist so we gate on persisted patient_id only.
    # Never fall back to body.patient_id — a malicious caller could spoof it.
    row = _lookup_audio_analysis(session_id, db)
    if row is None:
        raise HTTPException(status_code=404, detail="session not found")

    row_patient_id = getattr(row, "patient_id", None)
    if row_patient_id is None:
        raise HTTPException(status_code=404, detail="session not found")

    _gate_session_clinic_access(actor, row_patient_id, db)
    patient_id = row_patient_id

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
        "disclaimer": _CLINICAL_DISCLAIMER,
        "engine_version": _ENGINE_VERSION,
    }


@router.get("/result/{session_id}")
async def get_voice_result(
    session_id: str,
    actor: Any = _get_actor_dependency(),
    db: Any = Depends(_get_optional_db),
) -> dict[str, Any]:
    """Retrieve voice analysis result for a session from the DB.

    Clinic-scope gate: the session's patient must belong to the actor's clinic.
    """
    row = _lookup_audio_analysis(session_id, db)

    if row is None:
        raise HTTPException(status_code=404, detail="session not found")

    patient_id = getattr(row, "patient_id", None)
    if patient_id is None:
        raise HTTPException(status_code=404, detail="session not found")

    # Gate: cross-clinic access on result is blocked.
    _gate_session_clinic_access(actor, patient_id, db)

    status = getattr(row, "status", "uploaded")

    if status == "uploaded":
        return {
            "status": "pending",
            "session_id": session_id,
            "disclaimer": _CLINICAL_DISCLAIMER,
            "engine_version": _ENGINE_VERSION,
        }

    if status == "failed":
        return {
            "status": "failed",
            "session_id": session_id,
            "message": "Pipeline failed; see logs.",
            "disclaimer": _CLINICAL_DISCLAIMER,
            "engine_version": _ENGINE_VERSION,
        }

    # status == "completed"
    blob: dict = {}
    raw = getattr(row, "voice_report_json", None)
    if raw:
        try:
            blob = json.loads(raw)
        except Exception:
            blob = {}

    return {
        "status": "completed",
        "session_id": session_id,
        "patient_id": patient_id,
        "risk_tier": blob.get("risk_tier"),
        "risk_scores": blob.get("raw_scores"),
        "summary": blob.get("summary"),
        "flags": blob.get("flags") or blob.get("raw_flags"),
        "data_quality_notes": blob.get("data_quality_notes"),
        "disclaimer": _CLINICAL_DISCLAIMER,
        "engine_version": persisted_version,
    }
