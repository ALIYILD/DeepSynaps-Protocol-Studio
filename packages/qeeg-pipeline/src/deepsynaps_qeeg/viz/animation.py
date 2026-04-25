"""Animated topomap frame generation — time-series or epoch-averaged.

Creates a sequence of topomap frames that can be assembled into a GIF /
MP4 or streamed frame-by-frame to a browser-side player.

Two modes:
  1. **Epoch sweep** — renders a topomap per epoch, showing how spatial
     patterns evolve across the recording.
  2. **Time sweep** — renders a topomap per time window within a single
     epoch or continuous segment (useful for ERP / event-locked data).

The frames are rendered via :func:`viz.topomap.render_topomap` so they
inherit publication-grade MNE interpolation.
"""
from __future__ import annotations

import base64
import io
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np

from .. import FREQ_BANDS
from .topomap import render_topomap, _ensure_mne_info, _CMAP_POWER, _CMAP_ZSCORE

if TYPE_CHECKING:
    import mne

log = logging.getLogger(__name__)

_DPI = 100  # lower DPI for animation frames (faster render)


def render_animated_frames(
    epochs: Any,
    *,
    band: str = "alpha",
    bands: dict[str, tuple[float, float]] = FREQ_BANDS,
    mode: str = "epoch",
    max_frames: int = 60,
    dpi: int = _DPI,
    fmt: str = "png",
) -> list[dict[str, Any]]:
    """Generate a list of topomap frames for animation.

    Parameters
    ----------
    epochs : mne.Epochs
        Clean EEG epochs.
    band : str
        Frequency band to visualize.
    bands : dict
        Band → (lo, hi) Hz map.
    mode : str
        ``"epoch"`` — one frame per epoch (band-power in each epoch).
        ``"time"``  — one frame per time window within averaged data.
    max_frames : int
        Maximum number of frames to produce.
    dpi : int
        Resolution per frame.
    fmt : str
        Image format per frame.

    Returns
    -------
    list of dict
        Each dict: ``{"index": int, "label": str, "image_b64": str,
        "values": list[float]}``
    """
    import mne as mne_mod

    ch_names = list(epochs.ch_names)
    lo, hi = bands.get(band, (8, 13))

    if mode == "epoch":
        return _epoch_sweep(epochs, ch_names, lo, hi, band, max_frames, dpi, fmt)
    elif mode == "time":
        return _time_sweep(epochs, ch_names, lo, hi, band, max_frames, dpi, fmt)
    else:
        raise ValueError(f"Unknown animation mode: {mode!r}. Use 'epoch' or 'time'.")


def _epoch_sweep(
    epochs: Any,
    ch_names: list[str],
    lo: float,
    hi: float,
    band: str,
    max_frames: int,
    dpi: int,
    fmt: str,
) -> list[dict[str, Any]]:
    """One frame per epoch — band power spatial pattern per epoch."""
    from scipy.signal import welch

    data = epochs.get_data(copy=True)  # (n_epochs, n_channels, n_times)
    n_epochs = data.shape[0]
    sfreq = float(epochs.info["sfreq"])

    # Subsample if too many epochs
    indices = np.linspace(0, n_epochs - 1, min(n_epochs, max_frames), dtype=int)

    frames = []
    for frame_idx, epoch_idx in enumerate(indices):
        epoch_data = data[epoch_idx]  # (n_channels, n_times)

        # Compute band power per channel
        powers = []
        for ch_idx in range(epoch_data.shape[0]):
            freqs, psd = welch(epoch_data[ch_idx], fs=sfreq, nperseg=min(256, epoch_data.shape[1]))
            band_mask = (freqs >= lo) & (freqs <= hi)
            powers.append(float(np.mean(psd[band_mask])) if band_mask.any() else 0.0)

        values = np.array(powers)

        image_bytes = render_topomap(
            values,
            ch_names,
            title=f"{band.title()} — Epoch {int(epoch_idx) + 1}",
            dpi=dpi,
            fmt=fmt,
        )

        b64 = base64.b64encode(image_bytes).decode("ascii")
        mime = "image/svg+xml" if fmt == "svg" else f"image/{fmt}"

        frames.append({
            "index": frame_idx,
            "epoch_index": int(epoch_idx),
            "label": f"Epoch {int(epoch_idx) + 1}/{n_epochs}",
            "image_b64": f"data:{mime};base64,{b64}",
            "values": values.tolist(),
        })

    return frames


def _time_sweep(
    epochs: Any,
    ch_names: list[str],
    lo: float,
    hi: float,
    band: str,
    max_frames: int,
    dpi: int,
    fmt: str,
) -> list[dict[str, Any]]:
    """One frame per time window within the averaged evoked data."""
    evoked = epochs.average()
    data = evoked.get_data()  # (n_channels, n_times)
    sfreq = float(evoked.info["sfreq"])
    times = evoked.times

    # Create sliding windows
    window_samples = max(int(sfreq * 0.1), 10)  # 100ms window
    step = max(1, (data.shape[1] - window_samples) // max_frames)

    frames = []
    frame_idx = 0
    pos = 0
    while pos + window_samples <= data.shape[1] and frame_idx < max_frames:
        segment = data[:, pos:pos + window_samples]

        from scipy.signal import welch
        powers = []
        for ch_idx in range(segment.shape[0]):
            freqs, psd = welch(segment[ch_idx], fs=sfreq, nperseg=min(64, segment.shape[1]))
            band_mask = (freqs >= lo) & (freqs <= hi)
            powers.append(float(np.mean(psd[band_mask])) if band_mask.any() else 0.0)

        values = np.array(powers)
        t_start = times[pos] if pos < len(times) else 0
        t_end = times[min(pos + window_samples, len(times) - 1)] if pos + window_samples < len(times) else times[-1]

        image_bytes = render_topomap(
            values,
            ch_names,
            title=f"{band.title()} — {t_start:.2f}s to {t_end:.2f}s",
            dpi=dpi,
            fmt=fmt,
        )

        b64 = base64.b64encode(image_bytes).decode("ascii")
        mime = "image/svg+xml" if fmt == "svg" else f"image/{fmt}"

        frames.append({
            "index": frame_idx,
            "label": f"{t_start:.2f}s – {t_end:.2f}s",
            "time_start": float(t_start),
            "time_end": float(t_end),
            "image_b64": f"data:{mime};base64,{b64}",
            "values": values.tolist(),
        })

        pos += step
        frame_idx += 1

    return frames


def export_animation_metadata(
    frames: list[dict[str, Any]],
    *,
    band: str = "alpha",
    mode: str = "epoch",
    fps: int = 4,
) -> dict[str, Any]:
    """Package animation frames with playback metadata for the browser.

    Returns
    -------
    dict
        JSON payload with ``frames``, ``fps``, ``band``, ``mode``, and
        ``n_frames`` keys.
    """
    # Strip image data for a lightweight metadata-only response
    meta_frames = []
    for f in frames:
        meta_frames.append({
            "index": f["index"],
            "label": f["label"],
            "values": f.get("values"),
        })

    return {
        "type": "topomap-animation",
        "band": band,
        "mode": mode,
        "fps": fps,
        "n_frames": len(frames),
        "frames": meta_frames,
    }


def save_animation_gif(
    frames: list[dict[str, Any]],
    out_path: str | Path,
    *,
    fps: int = 4,
    loop: int = 0,
) -> Path:
    """Assemble frames into an animated GIF.

    Requires ``Pillow`` (PIL).

    Parameters
    ----------
    frames : list of dict
        Output of :func:`render_animated_frames`.
    out_path : str or Path
        Output GIF file path.
    fps : int
        Frames per second.
    loop : int
        Number of loops (0 = infinite).

    Returns
    -------
    Path
        Written file path.
    """
    from PIL import Image

    pil_frames = []
    for f in frames:
        b64_data = f["image_b64"]
        # Strip data URI prefix
        if "," in b64_data:
            b64_data = b64_data.split(",", 1)[1]
        img_bytes = base64.b64decode(b64_data)
        img = Image.open(io.BytesIO(img_bytes))
        pil_frames.append(img.convert("RGBA"))

    if not pil_frames:
        raise ValueError("No frames to save.")

    out = Path(out_path)
    duration_ms = int(1000 / fps)
    pil_frames[0].save(
        out,
        save_all=True,
        append_images=pil_frames[1:],
        duration=duration_ms,
        loop=loop,
    )

    return out
