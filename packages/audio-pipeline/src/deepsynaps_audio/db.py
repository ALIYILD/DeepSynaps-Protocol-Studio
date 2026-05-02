"""Persist audio analysis results (file-based v1; Postgres when configured)."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .schemas import ReportBundle, VoiceSessionReportPayload

_log = __import__("logging").getLogger(__name__)

_DEFAULT_DIR = Path.cwd() / ".deepsynaps_audio_analyses"


def write_audio_analysis(
    bundle: ReportBundle,
    *,
    run_id: Optional[str] = None,
    session_payload: Optional[dict[str, Any] | VoiceSessionReportPayload] = None,
) -> str:
    """Write analysis JSON to local disk. Returns analysis id (UUID string).

    When ``DATABASE_URL`` is set, a future version can insert into ``audio_analyses``;
    for now we always persist JSON for internal review.
    """

    aid = str(uuid.uuid4())
    out_dir = Path(os.environ.get("DEEPSYNAPS_AUDIO_ANALYSIS_DIR", str(_DEFAULT_DIR)))
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{aid}.json"
    row = {
        "analysis_id": aid,
        "run_id": run_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "bundle": bundle.model_dump(mode="json"),
        "voice_session_report": (
            session_payload.model_dump(mode="json")
            if isinstance(session_payload, VoiceSessionReportPayload)
            else session_payload
        ),
    }
    path.write_text(json.dumps(row, indent=2, default=str), encoding="utf-8")

    dsn = os.environ.get("DATABASE_URL")
    if dsn:
        _log.info(
            "DATABASE_URL set but Postgres audio_analyses writer not implemented — JSON at %s",
            path,
        )

    return aid
