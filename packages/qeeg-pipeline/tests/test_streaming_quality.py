"""Tests for ``deepsynaps_qeeg.streaming.quality``.

Pins the live qEEG monitoring quality indicators:

- A flat (zero-variance) channel is detected via ``flatline_frac``.
- A clipped (rail-to-rail saturated) channel is detected via
  ``clipping_frac``.
- Line-noise ratio is sensitive to a strong 50 Hz / 60 Hz tone.
- A short window (n_samp < 8) returns the safe degenerate envelope so
  callers don't crash on a starved buffer.
- Rejects non-2D input (defensive: catches a wiring bug at the source).
"""
from __future__ import annotations

import numpy as np
import pytest

from deepsynaps_qeeg.streaming.quality import compute_quality_indicators


SFREQ = 250.0
N_CH = 4


def _clean_window(n_samp: int = 256) -> np.ndarray:
    rng = np.random.default_rng(seed=42)
    return rng.standard_normal((N_CH, n_samp)) * 1e-6  # 1 µV-scale


class TestComputeQualityIndicators:
    def test_clean_window_returns_full_envelope(self) -> None:
        out = compute_quality_indicators(_clean_window(), sfreq=SFREQ)
        assert set(out.keys()) == {
            "impedance_kohm",
            "flatline_frac",
            "clipping_frac",
            "line_noise_ratio",
            "rms_uv",
        }
        assert out["impedance_kohm"] is None  # not measured here
        assert isinstance(out["rms_uv"], dict)
        assert len(out["rms_uv"]) == N_CH

    def test_short_window_returns_safe_envelope(self) -> None:
        # Pin: fewer than 8 samples → degenerate envelope, no crash.
        x = np.zeros((N_CH, 4))
        out = compute_quality_indicators(x, sfreq=SFREQ)
        assert out["flatline_frac"] == 1.0
        assert out["clipping_frac"] == 0.0
        assert out["line_noise_ratio"] == 0.0
        assert out["rms_uv"] == {}

    def test_non_2d_input_raises_value_error(self) -> None:
        # Pin: 1-D input is a wiring bug at the source — catch loudly.
        with pytest.raises(ValueError, match="window must be 2D"):
            compute_quality_indicators(np.zeros(256), sfreq=SFREQ)

    def test_flat_channel_detected(self) -> None:
        # All zeros → 100 % flat fraction.
        x = np.zeros((N_CH, 256))
        out = compute_quality_indicators(x, sfreq=SFREQ)
        assert out["flatline_frac"] == 1.0

    def test_clipped_channel_detected(self) -> None:
        # Rail-to-rail saturation → high clipping fraction.
        x = np.tile(np.array([1.0, -1.0]), (N_CH, 128))
        out = compute_quality_indicators(x, sfreq=SFREQ)
        # Every sample is at the per-channel min or max → clip == 1.0.
        assert out["clipping_frac"] == pytest.approx(1.0)

    def test_strong_50hz_tone_dominates_line_ratio(self) -> None:
        # Build a 50 Hz tone — line-noise ratio should approach 1.0.
        n = 256
        t = np.arange(n) / SFREQ
        tone = np.sin(2 * np.pi * 50.0 * t)
        x = np.tile(tone, (N_CH, 1))
        out = compute_quality_indicators(x, sfreq=SFREQ, line_freq_hz=50.0)
        assert out["line_noise_ratio"] > 0.5

    def test_60hz_line_freq_branch(self) -> None:
        # Same shape, 60 Hz tone, 60 Hz line setting.
        n = 256
        t = np.arange(n) / SFREQ
        tone = np.sin(2 * np.pi * 60.0 * t)
        x = np.tile(tone, (N_CH, 1))
        out = compute_quality_indicators(x, sfreq=SFREQ, line_freq_hz=60.0)
        assert out["line_noise_ratio"] > 0.5

    def test_rms_uv_keyed_by_channel_index(self) -> None:
        out = compute_quality_indicators(_clean_window(), sfreq=SFREQ)
        # Channel keys are "ch1"..."chN".
        assert set(out["rms_uv"].keys()) == {f"ch{i+1}" for i in range(N_CH)}
        for v in out["rms_uv"].values():
            assert isinstance(v, float)
            assert v >= 0.0

    def test_zero_total_power_yields_zero_line_ratio(self) -> None:
        # All-zero window after the short-buffer guard: a long all-zero
        # window has total power = 0 → line_ratio defensive zero.
        x = np.zeros((N_CH, 256))
        out = compute_quality_indicators(x, sfreq=SFREQ)
        assert out["line_noise_ratio"] == 0.0
