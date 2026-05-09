"""Tests for ``deepsynaps_audio.pipeline`` (end-to-end entrypoints).

Pins the public entrypoint contract:

- default_neuromod_voice_definition emits the canonical 6-stage DAG
  (ingestion -> qc -> acoustic -> neuro -> cognitive -> reporting).
  Refactor cannot silently drop or reorder a clinical step.
- run_voice_pipeline_from_paths assembles the input_audio_ref dict
  with the right fields and forwards to execute_voice_pipeline. The
  optional transcript / reading_recording_path get attached only when
  provided (no fake fields when missing).
- run_full_pipeline raises ValueError on empty recordings (no
  silent no-op).
- run_full_pipeline raises ValueError when the first recording has no
  source_path (must be loaded via ingestion.load_recording first).
"""
from __future__ import annotations

from unittest import mock
from uuid import uuid4

import pytest

from deepsynaps_audio.pipeline import (
    default_neuromod_voice_definition,
    run_full_pipeline,
    run_voice_pipeline_from_paths,
)
from deepsynaps_audio.schemas import (
    AudioPipelineDefinition,
    Recording,
    Session,
)


# ── default_neuromod_voice_definition ─────────────────────────────────────


class TestDefaultNeuromodDefinition:
    def test_pipeline_id_and_version(self) -> None:
        d = default_neuromod_voice_definition()
        assert isinstance(d, AudioPipelineDefinition)
        assert d.pipeline_id == "neuromod_voice_v1"
        assert d.version == "1.0.0"

    def test_six_node_canonical_order(self) -> None:
        # Pin: refactor cannot silently drop or reorder a clinical step.
        d = default_neuromod_voice_definition()
        stages = [n.stage for n in d.nodes]
        assert stages == [
            "ingestion",
            "qc",
            "acoustic_feature_engine",
            "neurological_voice_analyzers",
            "cognitive_speech_analyzers",
            "reporting",
        ]

    def test_node_ids_are_distinct(self) -> None:
        d = default_neuromod_voice_definition()
        ids = [n.node_id for n in d.nodes]
        assert len(set(ids)) == len(ids)


# ── run_voice_pipeline_from_paths ─────────────────────────────────────────


class TestRunVoicePipelineFromPaths:
    def test_assembles_minimal_ref_and_forwards(self) -> None:
        sentinel = object()
        with mock.patch(
            "deepsynaps_audio.pipeline.execute_voice_pipeline",
            return_value=sentinel,
        ) as exec_mock:
            out = run_voice_pipeline_from_paths(
                audio_path="s3://x.wav",
                session_id="S1",
                task_protocol="sustained_vowel_a",
            )
        assert out is sentinel
        # The passed input_audio_ref dict carries path / session_id /
        # task_protocol / patient_id keys.
        called_args = exec_mock.call_args
        defn, ref = called_args.args[0], called_args.args[1]
        assert isinstance(defn, AudioPipelineDefinition)
        assert ref["path"] == "s3://x.wav"
        assert ref["session_id"] == "S1"
        assert ref["task_protocol"] == "sustained_vowel_a"
        # patient_id defaults to None and is included in the ref
        # (downstream is fine with None as the key).
        assert ref["patient_id"] is None

    def test_optional_transcript_attached_when_provided(self) -> None:
        with mock.patch(
            "deepsynaps_audio.pipeline.execute_voice_pipeline"
        ) as exec_mock:
            run_voice_pipeline_from_paths(
                audio_path="x.wav",
                session_id="S1",
                transcript="I went to the doctor.",
            )
        ref = exec_mock.call_args.args[1]
        assert ref["transcript"] == "I went to the doctor."

    def test_no_transcript_means_no_transcript_field(self) -> None:
        # Pin: when transcript is None, the field is NOT included in
        # the ref (avoid ambiguous "transcript: null" downstream).
        with mock.patch(
            "deepsynaps_audio.pipeline.execute_voice_pipeline"
        ) as exec_mock:
            run_voice_pipeline_from_paths(
                audio_path="x.wav",
                session_id="S1",
                transcript=None,
            )
        ref = exec_mock.call_args.args[1]
        assert "transcript" not in ref

    def test_optional_reading_recording_attached_when_provided(self) -> None:
        with mock.patch(
            "deepsynaps_audio.pipeline.execute_voice_pipeline"
        ) as exec_mock:
            run_voice_pipeline_from_paths(
                audio_path="x.wav",
                session_id="S1",
                reading_recording_path="reading.wav",
            )
        ref = exec_mock.call_args.args[1]
        assert ref["reading_recording_path"] == "reading.wav"

    def test_no_reading_recording_means_field_absent(self) -> None:
        with mock.patch(
            "deepsynaps_audio.pipeline.execute_voice_pipeline"
        ) as exec_mock:
            run_voice_pipeline_from_paths(audio_path="x.wav", session_id="S1")
        ref = exec_mock.call_args.args[1]
        assert "reading_recording_path" not in ref

    def test_explicit_pipeline_definition_used(self) -> None:
        # When a custom AudioPipelineDefinition is passed, it's used
        # instead of the default neuromod pipeline.
        custom = AudioPipelineDefinition(
            pipeline_id="custom",
            nodes=[],
        )
        with mock.patch(
            "deepsynaps_audio.pipeline.execute_voice_pipeline"
        ) as exec_mock:
            run_voice_pipeline_from_paths(
                audio_path="x.wav",
                session_id="S1",
                pipeline=custom,
            )
        defn = exec_mock.call_args.args[0]
        assert defn is custom

    def test_run_id_forwarded(self) -> None:
        with mock.patch(
            "deepsynaps_audio.pipeline.execute_voice_pipeline"
        ) as exec_mock:
            run_voice_pipeline_from_paths(
                audio_path="x.wav",
                session_id="S1",
                run_id="R-explicit",
            )
        # run_id is a kwarg in the call.
        assert exec_mock.call_args.kwargs.get("run_id") == "R-explicit"


# ── run_full_pipeline ─────────────────────────────────────────────────────


def _session(*, recordings: dict[str, Recording] | None = None) -> Session:
    return Session(
        session_id=uuid4(),
        patient_id=uuid4(),
        tenant_id=uuid4(),
        recordings=recordings or {},
    )


class TestRunFullPipeline:
    def test_empty_recordings_raises(self) -> None:
        # Pin: no recordings -> ValueError, not a silent no-op.
        s = _session(recordings={})
        with pytest.raises(ValueError, match="no recordings"):
            run_full_pipeline(s)

    def test_recording_without_source_path_raises(self) -> None:
        # Pin: recordings must be loaded via ingestion.load_recording
        # (which sets source_path) before run_full_pipeline can run.
        rec = Recording(
            recording_id=uuid4(),
            task_protocol="sustained_vowel_a",
            sample_rate=16000,
            duration_s=1.0,
            n_samples=16000,
            source_path=None,  # not loaded
        )
        s = _session(recordings={"sustained_vowel_a": rec})
        with pytest.raises(ValueError, match="source_path required"):
            run_full_pipeline(s)

    def test_runs_with_loaded_recording(self) -> None:
        rec = Recording(
            recording_id=uuid4(),
            task_protocol="sustained_vowel_a",
            sample_rate=16000,
            duration_s=1.0,
            n_samples=16000,
            source_path="s3://input/voice.wav",
        )
        s = _session(recordings={"sustained_vowel_a": rec})

        sentinel = object()
        with mock.patch(
            "deepsynaps_audio.pipeline.execute_voice_pipeline",
            return_value=sentinel,
        ) as exec_mock:
            out = run_full_pipeline(s)
        assert out is sentinel
        ref = exec_mock.call_args.args[1]
        assert ref["path"] == "s3://input/voice.wav"
        assert ref["task_protocol"] == "sustained_vowel_a"
