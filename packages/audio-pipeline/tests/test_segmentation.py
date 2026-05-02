"""Tests for energy-based voice segmentation."""

from __future__ import annotations

import math
import tempfile
from pathlib import Path

import pytest

pytest.importorskip("numpy")

from deepsynaps_audio.ingestion import load_recording
from deepsynaps_audio.segmentation import segment_voice_tasks


def _write_tone_with_pause(path: Path, sr: int = 16000) -> None:
    import numpy as np

    t1 = np.arange(int(0.4 * sr)) / sr
    t2 = np.arange(int(0.4 * sr)) / sr
    y1 = 0.2 * np.sin(2 * math.pi * 200.0 * t1)
    silence = np.zeros(int(0.5 * sr))
    y2 = 0.2 * np.sin(2 * math.pi * 200.0 * t2)
    y = np.concatenate([y1, silence, y2]).astype(np.float32)
    import soundfile as sf

    sf.write(str(path), y, sr)


def test_segment_voice_tasks_returns_segments() -> None:
    pytest.importorskip("soundfile")
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "x.wav"
        _write_tone_with_pause(p)
        rec = load_recording(p, "reading_passage")
        segs = segment_voice_tasks(rec)
        assert len(segs) >= 1
        assert all(s.end_s > s.start_s for s in segs)


def test_empty_waveform_returns_empty() -> None:
    from deepsynaps_audio.schemas import Recording
    from uuid import uuid4

    r = Recording(
        recording_id=uuid4(),
        task_protocol="x",
        sample_rate=16000,
        duration_s=0.0,
        n_samples=0,
        channels=1,
        waveform=None,
    )
    assert segment_voice_tasks(r) == []
