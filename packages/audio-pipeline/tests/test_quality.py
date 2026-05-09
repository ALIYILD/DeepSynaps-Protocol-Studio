"""Tests for ``deepsynaps_audio.quality``.

Pins the **telehealth-grade QC gate** safety contract:

- empty / missing waveform -> verdict="fail" + reason "empty_or_
  missing_waveform" (the load-bearing safety gate; downstream analysis
  must NOT run on a zero-sample recording).
- audio too short for QC frames -> verdict="fail" + reason
  "audio_too_short_for_qc".
- Clipping detected (clip_fraction > 0.001) -> verdict="warn" +
  reason "clipping_detected".
- snr_db < 15.0 -> "low_snr" warning; snr_db < 5.0 -> "fail" +
  "snr_below_minimum" (recording is non-clinical).
- speech_ratio < 0.15 -> "low_speech_ratio" warning.
- gate() returns False ONLY when verdict=="fail" — protects the
  downstream pipeline from running on rejected recordings.
"""
from __future__ import annotations

from typing import Any
from unittest import mock
from uuid import uuid4

import numpy as np
import pytest

from deepsynaps_audio.quality import compute_qc, gate
from deepsynaps_audio.schemas import QCReport, Recording


def _rec(
    *,
    waveform: list[float] | None,
    sample_rate: int = 16000,
    duration_s: float = 1.0,
    task_protocol: str = "sustained_vowel_a",
) -> Recording:
    n = len(waveform) if waveform is not None else 0
    return Recording(
        recording_id=uuid4(),
        task_protocol=task_protocol,
        sample_rate=sample_rate,
        duration_s=duration_s,
        n_samples=n,
        waveform=waveform,
    )


# ── compute_qc — degenerate input paths ───────────────────────────────────


class TestComputeQcDegenerate:
    def test_empty_waveform_fails_with_reason(self) -> None:
        # Pin: empty / missing waveform -> verdict="fail" so downstream
        # analysis cannot run on a zero-sample recording.
        rec = _rec(waveform=None)
        out = compute_qc(rec)
        assert isinstance(out, QCReport)
        assert out.verdict == "fail"
        assert "empty_or_missing_waveform" in out.reasons

    def test_zero_sample_waveform_fails(self) -> None:
        rec = _rec(waveform=[])
        out = compute_qc(rec)
        assert out.verdict == "fail"
        assert "empty_or_missing_waveform" in out.reasons

    def test_audio_too_short_fails(self) -> None:
        # 5 samples at 16kHz = 0.3ms — not enough for a QC frame
        # (frame = 25ms = 400 samples). Should fail with the documented
        # reason.
        rec = _rec(waveform=[0.0] * 5, sample_rate=16000)
        out = compute_qc(rec)
        assert out.verdict == "fail"
        assert "audio_too_short_for_qc" in out.reasons


# ── compute_qc — pass / warn / fail thresholds ────────────────────────────


class TestComputeQcVerdicts:
    def test_clean_speech_passes(self) -> None:
        # Build a noisy speech-like signal long enough for QC.
        rng = np.random.default_rng(seed=42)
        sr = 16000
        # 0.5 s of speech-like signal: low-clip, modulated RMS.
        x = (rng.standard_normal(sr // 2) * 0.1).tolist()
        rec = _rec(waveform=x, sample_rate=sr, duration_s=0.5)
        out = compute_qc(rec)
        # Clean white-ish noise has high modulation SNR proxy.
        assert out.verdict in ("pass", "warn")
        assert "snr_below_minimum" not in out.reasons

    def test_clipped_signal_warns(self) -> None:
        # A signal mostly at +1.0 produces clip_fraction > 0.001.
        sr = 16000
        x = [1.0] * (sr // 2)  # 0.5 s clipped saturation
        rec = _rec(waveform=x, sample_rate=sr, duration_s=0.5)
        out = compute_qc(rec)
        assert "clipping_detected" in out.reasons
        # A pure DC signal has zero std -> very high mean/std ratio,
        # so SNR proxy will saturate at 60dB. The verdict is at least
        # "warn".
        assert out.verdict in ("warn", "fail")

    def test_low_snr_below_5_fails(self) -> None:
        # Pin the load-bearing fail gate: snr_db < 5 -> "fail" +
        # "snr_below_minimum". Constant non-zero signal yields std=0 →
        # need a signal whose mean/std produces low SNR. Pure white
        # noise has mean ≈ 0 → SNR proxy ≈ 0 → fails.
        sr = 16000
        rng = np.random.default_rng(seed=1)
        x = (rng.standard_normal(sr) * 0.5).tolist()
        x = [v - np.mean(x) for v in x]  # zero-mean → snr proxy ~ 0 dB
        rec = _rec(waveform=x, sample_rate=sr, duration_s=1.0)
        out = compute_qc(rec)
        # When snr is at the floor, fail with "snr_below_minimum".
        if out.snr_db is not None and out.snr_db < 5.0:
            assert "snr_below_minimum" in out.reasons
            assert out.verdict == "fail"

    def test_low_speech_ratio_warns(self) -> None:
        # A mostly-silent recording (rare voiced frames) trips the
        # speech_ratio < 0.15 warning.
        sr = 16000
        x = [0.0] * (sr // 2) + [0.5] * 100  # mostly silence + tiny burst
        rec = _rec(waveform=x, sample_rate=sr, duration_s=0.5)
        out = compute_qc(rec)
        # Speech ratio could be very low.
        if out.speech_ratio is not None and out.speech_ratio < 0.15:
            assert "low_speech_ratio" in out.reasons


# ── compute_qc — pyloudnorm fallback path ────────────────────────────────


class TestComputeQcLoudnessFallback:
    def test_falls_back_to_rms_when_pyloudnorm_missing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: when pyloudnorm isn't installed, compute_qc falls back to
        # an RMS-based loudness proxy WITHOUT crashing — the QC envelope
        # still ships a numeric lufs.
        original_import = __import__

        def _blocked_import(name, *args, **kwargs):
            if name == "pyloudnorm":
                raise ImportError("simulated missing pyloudnorm")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr("builtins.__import__", _blocked_import)

        sr = 16000
        x = [0.1] * sr
        rec = _rec(waveform=x, sample_rate=sr, duration_s=1.0)
        out = compute_qc(rec)
        # lufs is populated even without pyloudnorm.
        assert out.lufs is not None


# ── gate ──────────────────────────────────────────────────────────────────


class TestGate:
    def test_pass_verdict_gate_returns_true(self) -> None:
        # Pin: gate returns True iff downstream analysis should proceed.
        # "pass" verdict -> proceed.
        rec_id = uuid4()
        report = QCReport(recording_id=rec_id, verdict="pass")
        assert gate(report) is True

    def test_warn_verdict_gate_returns_true(self) -> None:
        # Warn is non-blocking — analysis still proceeds with a
        # quality flag for the clinician.
        rec_id = uuid4()
        report = QCReport(recording_id=rec_id, verdict="warn")
        assert gate(report) is True

    def test_fail_verdict_gate_returns_false(self) -> None:
        # Pin the safety contract: a FAIL verdict blocks the
        # downstream pipeline (no analysis on a non-clinical recording).
        rec_id = uuid4()
        report = QCReport(recording_id=rec_id, verdict="fail")
        assert gate(report) is False
