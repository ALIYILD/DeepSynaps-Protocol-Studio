"""Tests for ``deepsynaps_qeeg.streaming.server`` + ``streaming.zscore_live``.

Pins the live-monitoring API contract:

- stream_frames REQUIRES stream_name when source_kind="lsl" — raises
  ValueError instead of constructing a misconfigured source.
- stream_frames REQUIRES edf_path when source_kind="mock" — same.
- stream_frames yields frames with the canonical envelope (type,
  seq, t_unix, frame, quality, zscores, disclaimer) — and the
  disclaimer carries the load-bearing "Monitoring only — not
  diagnostic" hedge so the live UI never claims diagnosis.
- zscore_window passes through to the normative engine and returns a
  dict (no crash on empty / missing spectral keys).
"""
from __future__ import annotations

import asyncio
from typing import Any
from unittest import mock

import numpy as np
import pytest

from deepsynaps_qeeg.streaming import server as server_mod
from deepsynaps_qeeg.streaming.zscore_live import zscore_window


# ── stream_frames input validation ────────────────────────────────────────


class TestStreamFramesValidation:
    def test_lsl_without_stream_name_raises(self) -> None:
        async def _run() -> Any:
            agen = server_mod.stream_frames(source_kind="lsl", stream_name=None)
            await agen.__anext__()

        with pytest.raises(ValueError, match="stream_name is required"):
            asyncio.run(_run())

    def test_mock_without_edf_path_raises(self) -> None:
        async def _run() -> Any:
            agen = server_mod.stream_frames(source_kind="mock", edf_path=None)
            await agen.__anext__()

        with pytest.raises(ValueError, match="edf_path is required"):
            asyncio.run(_run())


# ── stream_frames yields canonical envelope ───────────────────────────────


class _FakeWindow:
    """Stand-in for a streaming.lsl_source Window."""

    def __init__(self, data: np.ndarray, sfreq: float, ch_names: list[str], t0_unix: float = 0.0):
        self.data = data
        self.sfreq = sfreq
        self.ch_names = ch_names
        self.t0_unix = t0_unix


class _FakeMockSource:
    def __init__(self, *args, **kwargs):
        pass

    async def windows(self):
        # Two consecutive windows so we exercise the loop body + RollingFeatures
        # bootstrap (rolling=None on first iteration -> instantiated -> reused).
        for _ in range(2):
            yield _FakeWindow(
                data=np.zeros((4, 256), dtype=np.float32),
                sfreq=250.0,
                ch_names=["ch1", "ch2", "ch3", "ch4"],
            )


class TestStreamFramesEnvelope:
    def test_yields_canonical_frame_envelope(self) -> None:
        async def _run() -> list[dict[str, Any]]:
            with mock.patch.object(server_mod, "MockSource", _FakeMockSource):
                frames = []
                async for f in server_mod.stream_frames(
                    source_kind="mock", edf_path="fake.edf"
                ):
                    frames.append(f)
                return frames

        frames = asyncio.run(_run())
        assert len(frames) == 2
        for i, frame in enumerate(frames):
            assert frame["type"] == "frame"
            assert frame["seq"] == i
            assert "t_unix" in frame
            assert "frame" in frame
            assert "quality" in frame
            assert "zscores" in frame
            # Pin the load-bearing hedge: live monitoring must NOT claim
            # diagnosis. The disclaimer is checked on EVERY frame.
            assert frame["disclaimer"] == "Monitoring only — not diagnostic."


# ── zscore_window ─────────────────────────────────────────────────────────


class TestZscoreWindow:
    def test_returns_dict_for_empty_frame(self) -> None:
        # Pin: an empty / missing spectral block does not crash; the
        # zscore engine returns an envelope (possibly empty) instead.
        out = zscore_window({}, age=40, sex="F")
        assert isinstance(out, dict)

    def test_returns_dict_for_minimal_spectral_frame(self) -> None:
        frame = {
            "spectral": {
                "bands": {
                    "alpha": {
                        "absolute_uv2": {"Fz": 12.0, "Cz": 14.0},
                    },
                },
            },
        }
        out = zscore_window(frame, age=40, sex="F")
        assert isinstance(out, dict)

    def test_norm_db_kwarg_accepted(self) -> None:
        # The helper accepts an explicit norm_db arg without raising.
        out = zscore_window({}, age=40, sex="M", norm_db=None)
        assert isinstance(out, dict)
