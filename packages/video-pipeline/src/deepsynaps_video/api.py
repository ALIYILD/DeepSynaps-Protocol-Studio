"""FastAPI surface for the Video Analyzer.

Endpoints mirror the MRI Analyzer's shape so the Studio API gateway can
expose them under ``/api/video/...`` consistently. All handlers are thin —
they delegate to ``pipeline`` and ``db``. FastAPI is imported lazily so the
slim base image still loads this package.
"""

from __future__ import annotations

from typing import Any

try:  # pragma: no cover - optional dep
    from fastapi import APIRouter, HTTPException
except ImportError:  # pragma: no cover
    APIRouter = None  # type: ignore[assignment]
    HTTPException = None  # type: ignore[assignment]


def build_router() -> Any:
    """Construct the FastAPI router. Raises if FastAPI isn't installed.

    Routes:

    - ``POST /api/video/upload`` — multipart mp4/mov, or JSON ``{rtsp_url}``.
    - ``POST /api/video/{analysis_id}/tag`` — operator marks task epochs.
    - ``GET  /api/video/{analysis_id}`` — poll status.
    - ``GET  /api/video/{analysis_id}/report.json``.
    - ``GET  /api/video/{analysis_id}/report.pdf``.
    - ``GET  /api/video/{analysis_id}/overlay.mp4``.
    - ``GET  /api/video/{analysis_id}/clip/{event_id}.mp4``.
    - ``GET  /api/video/{analysis_id}/evidence/{task_id}``.
    - ``GET  /api/video/patient/{patient_id}/longitudinal``.

    TODO(impl): wire each route to ``worker.queue_*`` and ``db.fetch_*``.
    """

    if APIRouter is None:
        raise RuntimeError("fastapi is not installed; install with '.[api]'")
    raise NotImplementedError


__all__ = ["build_router"]
