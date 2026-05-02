"""Facade for the sibling ``deepsynaps_audio`` voice analyzer pipeline.

Guards heavy optional deps (librosa, soundfile) so the API worker starts when the
editable ``packages/audio-pipeline`` install is missing or incomplete.

Consumers should check :data:`HAS_AUDIO_PIPELINE` before assuming real analysis runs.
"""

from __future__ import annotations

import logging
from typing import Any, Mapping, Optional

_log = logging.getLogger(__name__)

try:
    from deepsynaps_audio.pipeline import (  # type: ignore[import-not-found]
        default_neuromod_voice_definition,
        run_voice_pipeline_from_paths,
    )
    from deepsynaps_audio.workflow_orchestration import (  # type: ignore[import-not-found]
        collect_audio_provenance,
        execute_voice_pipeline,
        resume_audio_pipeline,
    )

    HAS_AUDIO_PIPELINE: bool = True
except Exception as _exc:  # ImportError or missing librosa
    default_neuromod_voice_definition = None  # type: ignore[assignment]
    run_voice_pipeline_from_paths = None  # type: ignore[assignment]
    collect_audio_provenance = None  # type: ignore[assignment]
    execute_voice_pipeline = None  # type: ignore[assignment]
    resume_audio_pipeline = None  # type: ignore[assignment]
    HAS_AUDIO_PIPELINE = False
    _log.info(
        "deepsynaps_audio pipeline not available (%s: %s). "
        "Install packages/audio-pipeline[acoustic] to enable voice analysis.",
        type(_exc).__name__,
        _exc,
    )


def run_voice_analysis_safe(
    audio_path: str,
    *,
    session_id: str,
    task_protocol: str = "sustained_vowel_a",
    patient_id: Optional[str] = None,
    transcript: Optional[str] = None,
) -> dict[str, Any]:
    """Run the internal neuromod voice DAG or return a structured error envelope."""

    if not HAS_AUDIO_PIPELINE or run_voice_pipeline_from_paths is None:
        return {
            "ok": False,
            "error": "audio_pipeline_unavailable",
            "detail": "Install deepsynaps-audio with [acoustic] optional dependencies.",
        }
    try:
        run = run_voice_pipeline_from_paths(
            audio_path=audio_path,
            session_id=session_id,
            task_protocol=task_protocol,
            patient_id=patient_id,
            transcript=transcript,
        )
        return {
            "ok": True,
            "run_id": run.run_id,
            "status": run.status,
            "context": run.context,
            "artifacts": [a.model_dump(mode="json") for a in run.artifacts],
        }
    except Exception as exc:  # noqa: BLE001
        _log.exception("voice pipeline failed: %s", exc)
        return {"ok": False, "error": "voice_pipeline_failed", "detail": str(exc)}


__all__ = [
    "HAS_AUDIO_PIPELINE",
    "run_voice_analysis_safe",
    "default_neuromod_voice_definition",
    "run_voice_pipeline_from_paths",
    "execute_voice_pipeline",
    "resume_audio_pipeline",
    "collect_audio_provenance",
]
