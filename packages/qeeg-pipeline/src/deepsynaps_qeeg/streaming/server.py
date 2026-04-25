"""FastAPI-oriented helpers for streaming live qEEG frames.

This module intentionally does **not** implement Studio auth/tier gating. That
lives in the Studio API layer (apps/api). Here we provide only the
source→window→features pipeline used by WS/SSE endpoints.
"""

from __future__ import annotations

import time
from typing import Any, AsyncIterator, Literal

from .lsl_source import LSLSource, MockSource
from .quality import compute_quality_indicators
from .rolling import RollingFeatures
from .zscore_live import zscore_window


async def stream_frames(
    *,
    source_kind: Literal["lsl", "mock"],
    stream_name: str | None = None,
    edf_path: str | None = None,
    age: int | None = None,
    sex: str | None = None,
    line_freq_hz: float = 50.0,
) -> AsyncIterator[dict[str, Any]]:
    """Yield feature frames suitable for WS/SSE transport."""
    if source_kind == "lsl":
        if not stream_name:
            raise ValueError("stream_name is required for LSL source.")
        source = LSLSource(stream_name=stream_name)
        win_iter = source.windows()
    else:
        if not edf_path:
            raise ValueError("edf_path is required for mock source.")
        source = MockSource(edf_path=edf_path, realtime=False)
        win_iter = source.windows()

    rolling: RollingFeatures | None = None
    seq = 0
    async for w in win_iter:
        if rolling is None:
            rolling = RollingFeatures(sfreq=float(w.sfreq), ch_names=list(w.ch_names))
        frame = rolling.update(w.data, t0_unix=w.t0_unix)
        quality = compute_quality_indicators(w.data, sfreq=float(w.sfreq), line_freq_hz=float(line_freq_hz))
        z = zscore_window(frame, age=age, sex=sex)
        yield {
            "type": "frame",
            "seq": seq,
            "t_unix": time.time(),
            "frame": frame,
            "quality": quality,
            "zscores": z,
            "disclaimer": "Monitoring only — not diagnostic.",
        }
        seq += 1

