"""Persist Voice/Audio pipeline rows to ``audio_analyses``."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.persistence.models import AudioAnalysis


# BUG-FIX-004: Sensitive keys that must never be persisted in run_context_json.
_SENSITIVE_CONTEXT_KEYS: set[str] = {
    "patient_name",
    "clinician_name",
    "email",
    "phone",
    "address",
    "ssn",
    "mrn",
    "dob",
    "date_of_birth",
    "voice_report_payload",  # already excluded upstream, but defense-in-depth
    "raw_audio_data",
}


def _sanitize_input_path(path: Optional[str]) -> str:
    """Strip absolute filesystem prefixes; keep only the last 3 path components.

    Prevents leaking server directory structure (e.g. ``/data/audio/patient123.wav``)
    into the database.  Returns ``""`` for *None* input.
    """
    if not path:
        return ""
    # Normalize separators and split into parts
    parts = path.replace("\\", "/").split("/")
    # Drop empty parts (from leading/trailing slashes) and Windows drive letters ("C:")
    parts = [p for p in parts if p and not (len(p) == 2 and p[1] == ":")]
    # Keep only the last 3 components so we never store absolute paths
    if len(parts) > 3:
        return "/".join(parts[-3:])
    return "/".join(parts)


def _redact_run_context(ctx: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of *ctx* with potentially sensitive PHI fields removed.

    BUG-FIX-004: run_context may contain free-form keys from the pipeline;
    we strip anything that looks like personally-identifiable information
    before writing to the database.
    """
    return {k: v for k, v in ctx.items() if k not in _SENSITIVE_CONTEXT_KEYS}


def persist_voice_analysis(
    db: Session,
    *,
    analysis_id: str,
    voice_report: dict[str, Any],
    run_context: dict[str, Any],
    patient_id: Optional[str] = None,
    session_id: Optional[str] = None,
    run_id: Optional[str] = None,
    input_path: Optional[str] = None,
    input_recording_ref: Optional[str] = None,
    file_hash_sha256: Optional[str] = None,
    pipeline_version: Optional[str] = None,
    norm_db_version: Optional[str] = None,
    status: str = "completed",
) -> None:
    """Insert or replace one analysis row."""

    ctx_out = dict(run_context)
    if input_recording_ref:
        ctx_out["input_recording_ref"] = input_recording_ref

    row = AudioAnalysis(
        analysis_id=analysis_id,
        patient_id=patient_id,
        session_id=session_id,
        run_id=run_id,
        input_path=_sanitize_input_path(input_path),  # BUG-FIX-004: strip absolute paths
        file_hash_sha256=file_hash_sha256,
        status=status,
        voice_report_json=json.dumps(voice_report, default=str),
        run_context_json=json.dumps(_redact_run_context(ctx_out), default=str),  # BUG-FIX-004: redact PHI
        pipeline_version=pipeline_version,
        norm_db_version=norm_db_version,
        created_at=datetime.now(timezone.utc),
    )
    db.merge(row)
    db.commit()


def load_voice_analysis(db: Session, analysis_id: str) -> Optional[AudioAnalysis]:
    return db.get(AudioAnalysis, analysis_id)


def list_voice_analyses_for_patient(
    db: Session,
    patient_id: str,
    *,
    limit: int = 50,
) -> list[AudioAnalysis]:
    """Return recent voice pipeline rows for dashboard / DeepTwin linking."""

    return (
        db.query(AudioAnalysis)
        .filter(AudioAnalysis.patient_id == patient_id)
        .order_by(AudioAnalysis.created_at.desc())
        .limit(min(max(limit, 1), 200))
        .all()
    )
