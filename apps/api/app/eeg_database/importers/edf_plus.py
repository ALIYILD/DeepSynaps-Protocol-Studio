"""EDF/EDF+ import — header-only by default for speed on large ambulatory files."""

from __future__ import annotations

import os
import tempfile
from typing import Any


def inspect_edf_file(path: str) -> dict[str, Any]:
    """Return duration, sample rate, channel count without loading all samples.

    Uses ``preload=False`` so multi-hour GB-scale files stay fast (<30s registration).
    """
    try:
        import mne
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("MNE-Python is required for EDF import") from exc

    raw = mne.io.read_raw_edf(path, preload=False, verbose=False)
    dur = float(raw.times[-1]) if len(raw.times) else 0.0
    sfreq = float(raw.info["sfreq"])
    nchan = len(raw.ch_names)
    return {
        "durationSec": dur,
        "sampleRateHz": sfreq,
        "channelCount": nchan,
        "channelNames": list(raw.ch_names),
    }


def inspect_edf_bytes(data: bytes, suffix: str = ".edf") -> dict[str, Any]:
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    try:
        with open(path, "wb") as fh:
            fh.write(data)
        return inspect_edf_file(path)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
