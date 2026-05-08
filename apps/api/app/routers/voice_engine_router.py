"""Import shim for the voice-engine FastAPI router.

The real router lives in ``packages/voice-engine/api/router.py``. The
package directory contains a hyphen, so it can't be imported via
``packages.voice_engine``. This shim prepends the package dir to
``sys.path`` and re-exports the router for ``app.main`` to consume —
mirrors the pattern in ``evidence_router.py`` / ``literature_watch_router.py``.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import APIRouter

_VOICE_ENGINE_DIR = (
    Path(__file__).resolve().parents[4] / "packages" / "voice-engine"
)
if str(_VOICE_ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(_VOICE_ENGINE_DIR))

try:
    from api.router import router  # noqa: E402
except ImportError:
    router = APIRouter()

    @router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    async def _voice_engine_unavailable(path: str):
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="voice-engine package not available")

__all__ = ["router"]
