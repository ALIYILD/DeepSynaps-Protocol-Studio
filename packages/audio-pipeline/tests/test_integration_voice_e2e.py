"""End-to-end voice pipeline with synthetic WAV (requires [acoustic] extras)."""

from __future__ import annotations

import math
import struct
import tempfile
from pathlib import Path

import pytest

pytest.importorskip("librosa")
pytest.importorskip("soundfile")

from deepsynaps_audio.ingestion import load_recording
from deepsynaps_audio.pipeline import default_neuromod_voice_definition, run_voice_pipeline_from_paths
from deepsynaps_audio.quality import compute_qc, gate


def _write_wav_mono(path: Path, sr: int = 16000, dur_s: float = 1.2) -> None:
    import numpy as np

    n = int(sr * dur_s)
    t = np.arange(n) / sr
    y = 0.25 * np.sin(2 * math.pi * 180.0 * t)
    raw = (y * 32767).astype(np.int16)
    with path.open("wb") as f:
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + n * 2))
        f.write(b"WAVEfmt ")
        f.write(
            struct.pack(
                "<IHHIIHH",
                16,
                1,
                1,
                sr,
                sr * 2,
                2,
                16,
            )
        )
        f.write(b"data")
        f.write(struct.pack("<I", n * 2))
        f.write(raw.tobytes())


def test_load_recording_and_qc() -> None:
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "v.wav"
        _write_wav_mono(p)
        rec = load_recording(p, "sustained_vowel_a")
        assert rec.n_samples > 0
        assert rec.waveform is not None
        qc = compute_qc(rec)
        assert gate(qc)


def test_execute_voice_pipeline_real_handlers() -> None:
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "v.wav"
        _write_wav_mono(p)
        run = run_voice_pipeline_from_paths(
            audio_path=str(p),
            session_id="550e8400-e29b-41d4-a716-446655440000",
            task_protocol="sustained_vowel_a",
            patient_id="patient-1",
            transcript="The quick brown fox jumps.",
        )
        assert run.status == "completed"
        assert run.context.get("voice_report_payload") is not None
        assert run.context.get("pd_voice") is not None
        assert run.context.get("qc") is not None


def test_default_definition_execute_voice() -> None:
    from deepsynaps_audio.workflow_orchestration import execute_voice_pipeline

    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "v.wav"
        _write_wav_mono(p)
        defn = default_neuromod_voice_definition()
        run = execute_voice_pipeline(
            defn,
            {
                "path": str(p),
                "session_id": "sess-int",
                "task_protocol": "sustained_vowel_a",
                "transcript": "hello world test words.",
            },
        )
        assert run.status == "completed"
        assert len(run.artifacts) >= 6
