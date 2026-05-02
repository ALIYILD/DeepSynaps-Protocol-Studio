"""FastAPI router for the Audio / Voice Analyzer.

Endpoint shape mirrors ``deepsynaps_qeeg`` / ``deepsynaps_mri`` so the
portal can consume all three analyzers through one client.
"""

from __future__ import annotations


def build_router():  # type: ignore[no-untyped-def]
    """Construct the FastAPI router for the Audio / Voice Analyzer.

    TODO: implement in PR #5 (see ``AUDIO_ANALYZER_STACK.md §9`` task
    5). Endpoints:

    * ``POST /audio/upload`` — start a session, return signed S3 URLs.
    * ``POST /audio/sessions/{id}/analyze`` — enqueue analysis.
    * ``GET  /audio/sessions/{id}/report`` — fetch HTML/PDF/JSON.
    * ``GET  /patients/{id}/audio/timeline`` — longitudinal view.

    FastAPI is imported lazily so the slim install does not require
    it.
    """

    raise NotImplementedError(
        "api.build_router: implement in PR #5 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
