"""Sources for live qEEG windows.

The streaming contract is intentionally small: an async iterator yielding
overlapping 1-second windows (shape: n_channels × n_samples) at a fixed hop
interval (default 250 ms).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import AsyncIterator, Iterable

import numpy as np

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class Window:
    """A 1-second EEG window."""

    data: np.ndarray  # (n_ch, n_samp), volts
    sfreq: float
    ch_names: list[str]
    t0_unix: float | None = None  # optional capture time


class LSLSource:
    """Pull EEG samples from an LSL stream and yield overlapping windows."""

    def __init__(
        self,
        *,
        stream_name: str,
        window_sec: float = 1.0,
        hop_sec: float = 0.25,
        max_buffer_sec: float = 10.0,
        lsl_timeout_sec: float = 5.0,
    ) -> None:
        self.stream_name = stream_name
        self.window_sec = float(window_sec)
        self.hop_sec = float(hop_sec)
        self.max_buffer_sec = float(max_buffer_sec)
        self.lsl_timeout_sec = float(lsl_timeout_sec)

    async def windows(self) -> AsyncIterator[Window]:
        try:
            from pylsl import StreamInlet, resolve_byprop  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError(
                "pylsl is required for LSLSource. Install it (and liblsl) to use live LSL streaming."
            ) from exc

        streams = resolve_byprop("name", self.stream_name, timeout=self.lsl_timeout_sec)
        if not streams:
            raise RuntimeError(f"LSL stream not found by name: {self.stream_name!r}")

        inlet = StreamInlet(streams[0], max_buflen=int(max(1.0, self.max_buffer_sec)))
        info = inlet.info()
        sfreq = float(info.nominal_srate())
        if sfreq <= 0:
            raise RuntimeError("LSL stream has no nominal sampling rate.")

        ch_names = []
        try:  # best-effort; many streams omit channel labels
            ch = info.desc().child("channels").child("channel")
            while ch.name():
                label = ch.child_value("label") or ch.child_value("name") or ""
                ch_names.append(label.strip() or f"ch{len(ch_names)}")
                ch = ch.next_sibling()
        except Exception:
            ch_names = []

        # Determine channel count from the first sample.
        samp, ts = inlet.pull_sample(timeout=self.lsl_timeout_sec)
        if samp is None:
            raise RuntimeError("Timed out waiting for first LSL sample.")
        n_ch = len(samp)
        if not ch_names:
            ch_names = [f"ch{i+1}" for i in range(n_ch)]
        else:
            ch_names = (ch_names + [f"ch{i+1}" for i in range(len(ch_names), n_ch)])[:n_ch]

        win_n = int(round(self.window_sec * sfreq))
        hop_n = int(round(self.hop_sec * sfreq))
        if hop_n <= 0 or win_n <= 0:
            raise ValueError("window_sec and hop_sec must be positive.")
        if hop_n > win_n:
            raise ValueError("hop_sec cannot exceed window_sec.")

        buf = np.zeros((n_ch, 0), dtype=float)
        last_emit_len = 0

        # Seed with the first sample.
        buf = np.concatenate([buf, np.asarray(samp, dtype=float).reshape(n_ch, 1)], axis=1)
        last_t0 = float(ts) if ts is not None else None

        while True:
            # Pull a small chunk; pylsl returns (samples, timestamps) for pull_chunk.
            samples, stamps = inlet.pull_chunk(timeout=0.0, max_samples=hop_n)
            if samples:
                x = np.asarray(samples, dtype=float).T  # (n_ch, n_new)
                buf = np.concatenate([buf, x], axis=1)
                if stamps:
                    last_t0 = float(stamps[-1])
            else:
                # No new samples yet; yield control.
                await asyncio.sleep(self.hop_sec / 4.0)

            # Keep buffer bounded.
            max_n = int(round(self.max_buffer_sec * sfreq))
            if buf.shape[1] > max_n:
                buf = buf[:, -max_n:]

            # Emit as many windows as possible on hop.
            while buf.shape[1] >= win_n and (buf.shape[1] - last_emit_len) >= hop_n:
                window = buf[:, -win_n:]
                yield Window(data=window.copy(), sfreq=sfreq, ch_names=list(ch_names), t0_unix=last_t0)
                last_emit_len = buf.shape[1]


class MockSource:
    """Replay an EDF (or in-memory MNE Raw) as overlapping windows.

    Intended for local development and tests; can optionally pace windows
    in real time.
    """

    def __init__(
        self,
        *,
        edf_path: str | None = None,
        raw: object | None = None,
        window_sec: float = 1.0,
        hop_sec: float = 0.25,
        realtime: bool = False,
    ) -> None:
        self.edf_path = edf_path
        self.raw = raw
        self.window_sec = float(window_sec)
        self.hop_sec = float(hop_sec)
        self.realtime = bool(realtime)

    def _load_raw(self):
        if self.raw is not None:
            return self.raw
        if not self.edf_path:
            raise ValueError("MockSource requires edf_path or raw.")
        mne = __import__("mne")
        return mne.io.read_raw_edf(self.edf_path, preload=True, verbose="WARNING")

    async def windows(self, *, duration_sec: float | None = None) -> AsyncIterator[Window]:
        raw = self._load_raw()
        # Minimal interface: mne.io.BaseRaw (has get_data/info/ch_names/times)
        data = raw.get_data(picks="eeg")  # (n_ch, n_samp)
        sfreq = float(raw.info["sfreq"])
        ch_names = list(getattr(raw, "ch_names", [])) or [f"ch{i+1}" for i in range(data.shape[0])]

        win_n = int(round(self.window_sec * sfreq))
        hop_n = int(round(self.hop_sec * sfreq))
        if hop_n <= 0 or win_n <= 0:
            raise ValueError("window_sec and hop_sec must be positive.")
        if hop_n > win_n:
            raise ValueError("hop_sec cannot exceed window_sec.")

        max_samp = data.shape[1]
        if duration_sec is not None:
            max_samp = min(max_samp, int(round(duration_sec * sfreq)))

        i = 0
        while i + win_n <= max_samp:
            window = data[:, i : i + win_n]
            yield Window(data=np.asarray(window, dtype=float), sfreq=sfreq, ch_names=ch_names, t0_unix=None)
            i += hop_n
            if self.realtime:
                await asyncio.sleep(self.hop_sec)


async def gather_windows(
    source: "LSLSource | MockSource",
    *,
    n: int,
) -> list[Window]:
    """Test helper: collect N windows from a source."""
    out: list[Window] = []
    async for w in source.windows():  # type: ignore[attr-defined]
        out.append(w)
        if len(out) >= n:
            break
    return out

