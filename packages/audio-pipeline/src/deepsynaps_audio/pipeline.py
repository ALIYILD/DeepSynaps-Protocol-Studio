"""End-to-end voice analysis entrypoints."""

from __future__ import annotations

from typing import Any, Mapping
from uuid import UUID

from .schemas import AudioPipelineDefinition, AudioPipelineNode, Session
from .workflow_orchestration import execute_voice_pipeline


def default_neuromod_voice_definition() -> AudioPipelineDefinition:
    """Standard PD/neuromod pipeline: ingest → QC → acoustic → neuro → cognitive → report."""

    return AudioPipelineDefinition(
        pipeline_id="neuromod_voice_v1",
        version="1.0.0",
        description="Internal v1 neuromodulation voice assessment",
        nodes=[
            AudioPipelineNode(node_id="n1", stage="ingestion", params={}),
            AudioPipelineNode(node_id="n2", stage="qc", params={}),
            AudioPipelineNode(node_id="n3", stage="acoustic_feature_engine", params={}),
            AudioPipelineNode(node_id="n4", stage="neurological_voice_analyzers", params={}),
            AudioPipelineNode(node_id="n5", stage="cognitive_speech_analyzers", params={}),
            AudioPipelineNode(node_id="n6", stage="reporting", params={}),
        ],
    )


def run_voice_pipeline_from_paths(
    *,
    audio_path: str,
    session_id: str,
    task_protocol: str = "sustained_vowel_a",
    patient_id: str | None = None,
    transcript: str | None = None,
    reading_recording_path: str | None = None,
    pipeline: AudioPipelineDefinition | None = None,
    run_id: str | None = None,
) -> Any:
    """Convenience wrapper — loads ``audio_path`` through the default neuromod DAG."""

    ref: dict[str, Any] = {
        "path": audio_path,
        "session_id": session_id,
        "task_protocol": task_protocol,
        "patient_id": patient_id,
    }
    if transcript:
        ref["transcript"] = transcript
    if reading_recording_path:
        ref["reading_recording_path"] = reading_recording_path

    defn = pipeline or default_neuromod_voice_definition()
    return execute_voice_pipeline(defn, ref, run_id=run_id)


def run_full_pipeline(session: Session) -> Mapping[str, Any]:
    """Best-effort end-to-end run using the first recording in the session.

    Expects each :class:`Recording` to have ``source_path`` set (from
    :func:`ingestion.load_recording`). Uses first task in ``session.recordings``.
    """

    if not session.recordings:
        raise ValueError("session has no recordings")
    task_key = next(iter(session.recordings))
    rec = session.recordings[task_key]
    if not rec.source_path:
        raise ValueError("recording.source_path required for run_full_pipeline")
    return run_voice_pipeline_from_paths(
        audio_path=rec.source_path,
        session_id=str(session.session_id),
        task_protocol=rec.task_protocol,
        patient_id=str(session.patient_id),
    )


__all__ = [
    "default_neuromod_voice_definition",
    "run_voice_pipeline_from_paths",
    "run_full_pipeline",
]
