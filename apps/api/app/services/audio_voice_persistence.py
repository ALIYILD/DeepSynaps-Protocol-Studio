"""Persist Voice/Audio pipeline rows to ``audio_analyses``."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.persistence.models import AudioAnalysis


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
        input_path=input_path,
        file_hash_sha256=file_hash_sha256,
        status=status,
        voice_report_json=json.dumps(voice_report, default=str),
        run_context_json=json.dumps(ctx_out, default=str),
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
