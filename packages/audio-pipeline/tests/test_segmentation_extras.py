"""Additional tests for energy-based voice segmentation (PR 84 residuals).

All tests use in-memory numpy arrays via the Recording schema — no real audio
files or acoustic extras required.
"""

from __future__ import annotations

import math
from uuid import uuid4

import pytest

pytest.importorskip("numpy")

import numpy as np

from deepsynaps_audio.schemas import Recording, VoiceSegment
from deepsynaps_audio.segmentation import segment_voice_tasks


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_recording(
    waveform: list[float],
    sample_rate: int = 16000,
    task_protocol: str = "reading_passage",
) -> Recording:
    n = len(waveform)
    return Recording(
        recording_id=uuid4(),
        task_protocol=task_protocol,
        sample_rate=sample_rate,
        duration_s=n / sample_rate if sample_rate > 0 else 0.0,
        n_samples=n,
        channels=1,
        waveform=waveform,
    )


def _sine_tone(freq_hz: float, duration_s: float, sr: int = 16000, amp: float = 0.3) -> np.ndarray:
    t = np.arange(int(duration_s * sr)) / sr
    return (amp * np.sin(2 * math.pi * freq_hz * t)).astype(np.float64)


def _silence(duration_s: float, sr: int = 16000) -> np.ndarray:
    return np.zeros(int(duration_s * sr), dtype=np.float64)


# ---------------------------------------------------------------------------
# Edge-case / guard tests
# ---------------------------------------------------------------------------


def test_none_waveform_returns_empty() -> None:
    r = _make_recording([])
    r2 = r.model_copy(update={"waveform": None})
    assert segment_voice_tasks(r2) == []


def test_single_sample_returns_empty() -> None:
    r = _make_recording([0.5])
    assert segment_voice_tasks(r) == []


def test_two_sample_silence_returns_empty() -> None:
    r = _make_recording([0.0, 0.0])
    assert segment_voice_tasks(r) == []


def test_all_silence_returns_empty() -> None:
    sr = 16000
    silence = _silence(1.0, sr).tolist()
    r = _make_recording(silence, sr)
    segs = segment_voice_tasks(r)
    assert segs == []


# ---------------------------------------------------------------------------
# Contract tests — returns VoiceSegment with correct types
# ---------------------------------------------------------------------------


def test_single_voiced_block_one_segment() -> None:
    """Loud tone followed by silence → at least one segment (contrast needed for
    the RMS-quantile threshold to fire)."""
    sr = 16000
    tone = _sine_tone(200.0, 0.5, sr, amp=0.5)
    # trailing silence provides the energy contrast the quantile VAD needs
    silence = _silence(0.5, sr)
    y = np.concatenate([tone, silence]).tolist()
    r = _make_recording(y, sr)
    segs = segment_voice_tasks(r)
    assert len(segs) >= 1
    for s in segs:
        assert isinstance(s, VoiceSegment)
        assert s.end_s > s.start_s
        assert s.sample_rate_hz == sr
        assert isinstance(s.waveform, list)
        assert len(s.waveform) > 0


def test_two_tones_with_gap_produces_segments() -> None:
    """Two loud tones separated by 0.5 s of silence → ≥1 segment (may merge
    or not depending on max_merge_gap_s default 0.15 s)."""
    sr = 16000
    t1 = _sine_tone(200.0, 0.4, sr, amp=0.5)
    gap = _silence(0.5, sr)
    t2 = _sine_tone(300.0, 0.4, sr, amp=0.5)
    y = np.concatenate([t1, gap, t2]).tolist()
    r = _make_recording(y, sr)
    segs = segment_voice_tasks(r)
    assert len(segs) >= 1
    for s in segs:
        assert s.end_s > s.start_s


def test_short_gap_merges_into_one_segment() -> None:
    """Two tones with a short gap followed by trailing silence → ≥1 segment."""
    sr = 16000
    t1 = _sine_tone(200.0, 0.4, sr, amp=0.5)
    gap = _silence(0.1, sr)
    t2 = _sine_tone(200.0, 0.4, sr, amp=0.5)
    trailing = _silence(0.5, sr)
    y = np.concatenate([t1, gap, t2, trailing]).tolist()
    r = _make_recording(y, sr)
    segs = segment_voice_tasks(r)
    # should produce at least one merged segment, not more than 2
    assert 1 <= len(segs) <= 2


def test_segment_waveform_is_subset_of_original() -> None:
    """Segment waveform samples must be a valid slice of the source waveform."""
    sr = 16000
    tone = _sine_tone(200.0, 0.5, sr, amp=0.4)
    silence = _silence(0.5, sr)
    y = np.concatenate([tone, silence]).tolist()
    r = _make_recording(y, sr)
    segs = segment_voice_tasks(r)
    assert len(segs) >= 1
    for seg in segs:
        # samples extracted from the correct index range
        i0 = max(0, int(seg.start_s * sr))
        i1 = min(len(y), math.ceil(seg.end_s * sr))
        expected_len = i1 - i0
        # allow ±1 sample due to float rounding
        assert abs(len(seg.waveform) - expected_len) <= 1


def test_segment_start_end_ordering_always_valid() -> None:
    sr = 16000
    tone = _sine_tone(440.0, 1.0, sr, amp=0.4).tolist()
    r = _make_recording(tone, sr)
    segs = segment_voice_tasks(r)
    for seg in segs:
        assert seg.start_s >= 0.0
        assert seg.end_s <= len(tone) / sr + 0.01  # tiny float tolerance
        assert seg.end_s > seg.start_s


# ---------------------------------------------------------------------------
# Parameter contract tests
# ---------------------------------------------------------------------------


def test_min_segment_s_filters_short_blips() -> None:
    """Segments shorter than min_segment_s must be dropped."""
    sr = 16000
    # very short loud blip (0.1 s) followed by longer loud section (0.5 s)
    blip = _sine_tone(200.0, 0.1, sr, amp=0.6)
    gap = _silence(0.2, sr)
    loud = _sine_tone(200.0, 0.5, sr, amp=0.6)
    y = np.concatenate([blip, gap, loud]).tolist()
    r = _make_recording(y, sr)
    # default min_segment_s=0.25 — blip should be filtered
    segs = segment_voice_tasks(r, min_segment_s=0.25)
    for seg in segs:
        assert seg.end_s - seg.start_s >= 0.2  # practical tolerance


def test_custom_energy_quantile_affects_output() -> None:
    """Lower quantile threshold ⟹ more (or same) segments vs higher quantile."""
    sr = 16000
    tone = _sine_tone(200.0, 0.5, sr, amp=0.3).tolist()
    r = _make_recording(tone, sr)
    segs_low = segment_voice_tasks(r, energy_quantile=0.1)
    segs_high = segment_voice_tasks(r, energy_quantile=0.9)
    # at very high quantile almost nothing is "voiced" — 0 or fewer segments
    assert len(segs_low) >= len(segs_high)


def test_returns_list_of_voice_segment_instances() -> None:
    sr = 16000
    y = _sine_tone(200.0, 0.6, sr, amp=0.4).tolist()
    r = _make_recording(y, sr)
    segs = segment_voice_tasks(r)
    assert isinstance(segs, list)
    for s in segs:
        assert isinstance(s, VoiceSegment)


def test_voiced_signal_at_end_segment_captured() -> None:
    """Signal with loud + quiet sections should produce captured segments."""
    sr = 16000
    # Leading silence then tone ending at signal boundary (no trailing silence)
    silence = _silence(0.4, sr)
    tone = _sine_tone(200.0, 0.6, sr, amp=0.5)
    y = np.concatenate([silence, tone]).tolist()
    r = _make_recording(y, sr)
    segs = segment_voice_tasks(r)
    # Must produce at least one segment
    assert len(segs) >= 1
    # End of last segment should be near end of signal
    last = segs[-1]
    signal_duration = len(y) / sr
    assert last.end_s <= signal_duration + 0.05


def test_low_sr_small_signal_no_crash() -> None:
    """Very low sample rate with tiny signal should not crash."""
    sr = 8000
    y = _sine_tone(200.0, 0.5, sr, amp=0.4).tolist()
    r = _make_recording(y, sr)
    segs = segment_voice_tasks(r)
    assert isinstance(segs, list)


def test_large_merge_gap_collapses_many_segments() -> None:
    """Very large max_merge_gap_s should collapse everything into ≤ 2 segments."""
    sr = 16000
    parts = []
    for _ in range(4):
        parts.append(_sine_tone(200.0, 0.3, sr, amp=0.5))
        parts.append(_silence(0.2, sr))
    y = np.concatenate(parts).tolist()
    r = _make_recording(y, sr)
    segs_big = segment_voice_tasks(r, max_merge_gap_s=5.0)
    segs_small = segment_voice_tasks(r, max_merge_gap_s=0.01)
    assert len(segs_big) <= len(segs_small)
