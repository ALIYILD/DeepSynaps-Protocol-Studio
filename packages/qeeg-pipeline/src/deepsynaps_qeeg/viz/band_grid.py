"""Band-grid topomap layout — 5-band (delta–gamma) figure panel.

Renders a publication-grade grid of topographic maps (one per frequency
band) as a single figure, suitable for embedding in PDF reports or MNE
Report HTML sections.

Two modes:
  1. **Absolute power** — warm palette, linear scale.
  2. **Z-score**        — diverging RdBu_r, symmetric about zero.
"""
from __future__ import annotations

import base64
import io
import logging
from pathlib import Path
from typing import Any

import numpy as np

from .. import FREQ_BANDS
from .topomap import _CMAP_POWER, _CMAP_ZSCORE, _ensure_mne_info

log = logging.getLogger(__name__)

BAND_ORDER = ["delta", "theta", "alpha", "beta", "gamma"]
_DPI = 150


def render_band_grid(
    band_values: dict[str, np.ndarray | list[float]],
    ch_names: list[str],
    *,
    mode: str = "power",
    title: str | None = None,
    out_path: str | Path | None = None,
    fmt: str = "png",
    dpi: int = _DPI,
    bands: dict[str, tuple[float, float]] = FREQ_BANDS,
) -> bytes:
    """Render a 1×5 grid of topomaps for each canonical EEG band.

    Parameters
    ----------
    band_values : dict
        ``{band_name: array(n_channels)}`` — one array per band.
    ch_names : list of str
        Channel labels matching a 10-20 montage.
    mode : str
        ``"power"`` for absolute power maps, ``"zscore"`` for z-score maps.
    title : str or None
        Super-title for the whole figure.
    out_path : Path or None
        If provided, also write the file to disk.
    fmt : str
        Image format: 'png' or 'svg'.
    dpi : int
        Resolution.
    bands : dict
        Band → (lo, hi) Hz. Defaults to the canonical five bands.

    Returns
    -------
    bytes
        Raw image data.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import mne

    info = _ensure_mne_info(ch_names)

    ordered = [b for b in BAND_ORDER if b in band_values]
    if not ordered:
        ordered = sorted(band_values.keys())

    n = len(ordered)
    fig, axes = plt.subplots(1, n, figsize=(3.2 * n, 3.5), dpi=dpi)
    if n == 1:
        axes = [axes]

    symmetric = mode == "zscore"
    cmap = _CMAP_ZSCORE if symmetric else _CMAP_POWER

    for ax, band in zip(axes, ordered):
        vals = np.asarray(band_values[band], dtype=float)

        vmin, vmax = None, None
        if symmetric:
            absmax = max(1e-9, float(np.nanmax(np.abs(vals))))
            vmin, vmax = -absmax, absmax

        mne.viz.plot_topomap(
            vals,
            info,
            axes=ax,
            show=False,
            cmap=cmap,
            vlim=(vmin, vmax),
            contours=6,
        )
        lo, hi = bands.get(band, (0, 0))
        ax.set_title(f"{band.title()}\n({lo}-{hi} Hz)", fontsize=9, fontweight="bold")

    if title:
        fig.suptitle(title, fontsize=13, fontweight="bold", y=1.02)

    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format=fmt, bbox_inches="tight", dpi=dpi)
    plt.close(fig)
    raw_bytes = buf.getvalue()

    if out_path is not None:
        Path(out_path).write_bytes(raw_bytes)

    return raw_bytes


def render_band_grid_base64(
    band_values: dict[str, np.ndarray | list[float]],
    ch_names: list[str],
    **kwargs: Any,
) -> str:
    """Render the band grid and return a base64 data-URI string."""
    fmt = kwargs.pop("fmt", "png")
    raw = render_band_grid(band_values, ch_names, fmt=fmt, **kwargs)
    b64 = base64.b64encode(raw).decode("ascii")
    mime = "image/svg+xml" if fmt == "svg" else f"image/{fmt}"
    return f"data:{mime};base64,{b64}"
