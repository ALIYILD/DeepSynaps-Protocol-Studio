"""Tests for ``deepsynaps_qeeg.streaming.lsl_source``.

The LSL real-source path requires ``pylsl`` + a running LSL stream; we
don't try to test that here. Instead we cover MockSource (the EDF /
in-memory replay) by feeding a duck-typed Raw stand-in, plus the
gather_windows helper and the LSLSource constructor argument
validation.
"""
from __future__ import annotations

import asyncio
from typing import Any
from collections.abc import AsyncIterator

import numpy as np
import pytest

from deepsynaps_qeeg.streaming.lsl_source import (
    LSLSource,
    MockSource,
    Window,
    gather_windows,
)


# ── Window ────────────────────────────────────────────────────────────────


class TestWindow:
    def test_default_t0_is_none(self) -> None:
        w = Window(
            data=np.zeros((4, 256)),
            sfreq=250.0,
            ch_names=["a", "b", "c", "d"],
        )
        assert w.t0_unix is None

    def test_explicit_t0_preserved(self) -> None:
        w = Window(
            data=np.zeros((1, 1)),
            sfreq=1.0,
            ch_names=["a"],
            t0_unix=123.45,
        )
        assert w.t0_unix == 123.45


# ── LSLSource constructor (no pylsl required) ────────────────────────────


class TestLslSourceInit:
    def test_defaults_pinned(self) -> None:
        src = LSLSource(stream_name="EEG")
        assert src.stream_name == "EEG"
        assert src.window_sec == 1.0
        assert src.hop_sec == 0.25
        assert src.max_buffer_sec == 10.0
        assert src.lsl_timeout_sec == 5.0

    def test_custom_args_coerced_to_float(self) -> None:
        src = LSLSource(
            stream_name="X",
            window_sec=2,
            hop_sec=0.5,
            max_buffer_sec=20,
            lsl_timeout_sec=10,
        )
        assert isinstance(src.window_sec, float)
        assert src.window_sec == 2.0
        assert src.max_buffer_sec == 20.0


# ── MockSource (duck-typed Raw stand-in) ─────────────────────────────────


class _FakeRaw:
    """Minimal duck-type for MNE Raw so we can avoid an EDF fixture."""

    def __init__(self, data: np.ndarray, sfreq: float, ch_names: list[str]):
        self._data = data
        self.info = {"sfreq": sfreq}
        self.ch_names = ch_names

    def get_data(self, picks: Any = None) -> np.ndarray:  # noqa: ARG002
        return self._data


class TestMockSource:
    def _raw(self, n_ch: int = 4, n_samp: int = 1000, sfreq: float = 250.0) -> _FakeRaw:
        return _FakeRaw(
            data=np.zeros((n_ch, n_samp)),
            sfreq=sfreq,
            ch_names=[f"ch{i+1}" for i in range(n_ch)],
        )

    def test_requires_raw_or_edf_path(self) -> None:
        # Pin: load_raw raises when neither raw nor edf_path is given.
        src = MockSource()
        with pytest.raises(ValueError, match="edf_path or raw"):
            src._load_raw()

    def test_in_memory_raw_passes_through(self) -> None:
        raw = self._raw()
        src = MockSource(raw=raw)
        # _load_raw returns the raw object directly when one is given.
        assert src._load_raw() is raw

    def test_yields_windows_at_documented_shape(self) -> None:
        raw = self._raw(n_ch=4, n_samp=1000, sfreq=250.0)
        # 1.0s window = 250 samples; 0.25s hop = 63 samples.
        src = MockSource(raw=raw, window_sec=1.0, hop_sec=0.25, realtime=False)

        async def _collect() -> list[Window]:
            out = []
            async for w in src.windows():
                out.append(w)
            return out

        windows = asyncio.run(_collect())
        assert len(windows) > 0
        # Every window has the expected shape (n_ch, win_n).
        for w in windows:
            assert w.data.shape == (4, 250)
            assert w.sfreq == 250.0
            assert w.ch_names == ["ch1", "ch2", "ch3", "ch4"]
            assert w.t0_unix is None  # MockSource leaves t0 unset

    def test_duration_sec_caps_emission(self) -> None:
        # Pin: when duration_sec is given, only windows fully within
        # that duration are yielded.
        raw = self._raw(n_ch=2, n_samp=10_000, sfreq=250.0)
        src = MockSource(raw=raw, window_sec=1.0, hop_sec=0.25)

        async def _collect() -> list[Window]:
            out = []
            async for w in src.windows(duration_sec=2.0):
                out.append(w)
            return out

        windows = asyncio.run(_collect())
        # 2 seconds of data at hop 0.25s → about 5 windows ((2-1)/0.25 + 1).
        assert 1 <= len(windows) <= 6

    def test_invalid_window_sec_raises(self) -> None:
        # Pin: zero / negative window_sec or hop_sec must raise — catches
        # a misconfiguration at the source.
        raw = self._raw()
        src = MockSource(raw=raw, window_sec=0.0, hop_sec=0.25)

        async def _run():
            async for _ in src.windows():
                break

        with pytest.raises(ValueError, match="must be positive"):
            asyncio.run(_run())

    def test_hop_larger_than_window_raises(self) -> None:
        raw = self._raw()
        src = MockSource(raw=raw, window_sec=0.5, hop_sec=2.0)

        async def _run():
            async for _ in src.windows():
                break

        with pytest.raises(ValueError, match="hop_sec cannot exceed"):
            asyncio.run(_run())


# ── gather_windows ────────────────────────────────────────────────────────


class TestGatherWindows:
    def test_collects_n_windows(self) -> None:
        raw = _FakeRaw(
            data=np.zeros((2, 5000)),
            sfreq=250.0,
            ch_names=["ch1", "ch2"],
        )
        src = MockSource(raw=raw, window_sec=1.0, hop_sec=0.5)

        async def _run() -> list[Window]:
            return await gather_windows(src, n=3)

        out = asyncio.run(_run())
        assert len(out) == 3
        for w in out:
            assert w.sfreq == 250.0
