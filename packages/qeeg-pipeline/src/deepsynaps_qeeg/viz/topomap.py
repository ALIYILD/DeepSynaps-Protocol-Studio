"""Publication-grade 2-D EEG topographic maps via MNE ``plot_topomap``.

Replaces the Plotly contour approximation in ``mne_report_builder`` with
MNE's spherical-spline interpolation — the same rendering used in
EEGLAB / Fieldtrip and peer-reviewed publications.

Both PNG (for PDF embedding) and base64 data-URIs (for HTML reports) are
supported.  An optional z-score overlay uses a symmetric RdBu_r colour
map with clinically meaningful thresholds (|z| > 1.96).
"""
from __future__ import annotations

import base64
import io
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np

from .. import FREQ_BANDS

if TYPE_CHECKING:
    import mne

log = logging.getLogger(__name__)

# Style locks: only {viridis, cividis, RdBu_r} in user-facing surfaces.
_CMAP_POWER = "viridis"
_CMAP_ZSCORE = "RdBu_r"       # diverging, red = high / blue = low
_CMAP_RELATIVE = "viridis"

_DPI = 150
_FIG_SIZE = (3.5, 3.5)


def _ensure_mne_info(
    ch_names: list[str],
    sfreq: float = 250.0,
) -> "mne.Info":
    """Create an MNE Info with standard 10-20 montage positions."""
    import mne

    info = mne.create_info(ch_names=list(ch_names), sfreq=sfreq, ch_types="eeg")
    montage = mne.channels.make_standard_montage("standard_1020")
    info.set_montage(montage, on_missing="ignore")
    return info


def render_topomap(
    values: np.ndarray | list[float],
    ch_names: list[str],
    *,
    title: str = "",
    cmap: str | None = None,
    symmetric: bool = False,
    vlim: tuple[float | None, float | None] = (None, None),
    out_path: str | Path | None = None,
    fmt: str = "png",
    dpi: int = _DPI,
    show_names: bool = False,
    contours: int = 6,
) -> bytes:
    """Render a single topomap to bytes (PNG/SVG).

    Parameters
    ----------
    values : array-like, shape (n_channels,)
        Scalar value per channel.
    ch_names : list of str
        Channel labels matching a 10-20 montage.
    title : str
        Figure title.
    cmap : str or None
        Matplotlib colour map. Auto-selected based on *symmetric*.
    symmetric : bool
        If True, centre the colour bar at zero (for z-scores / asymmetry).
    vlim : tuple
        Explicit (vmin, vmax). ``None`` entries are auto-computed.
    out_path : Path or None
        If provided, also write the file to disk.
    fmt : str
        Image format: 'png' or 'svg'.
    dpi : int
        Resolution for raster formats.
    show_names : bool
        Annotate electrode labels on the map.
    contours : int
        Number of contour lines.

    Returns
    -------
    bytes
        Raw image data.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import mne

    values = np.asarray(values, dtype=float)
    info = _ensure_mne_info(ch_names)

    if cmap is None:
        cmap = _CMAP_ZSCORE if symmetric else _CMAP_POWER

    vmin, vmax = vlim
    if symmetric and vmin is None and vmax is None:
        absmax = max(1e-9, float(np.nanmax(np.abs(values))))
        vmin, vmax = -absmax, absmax

    fig, ax = plt.subplots(figsize=_FIG_SIZE, dpi=dpi)
    mne.viz.plot_topomap(
        values,
        info,
        axes=ax,
        show=False,
        cmap=cmap,
        vlim=(vmin, vmax),
        contours=contours,
        names=ch_names if show_names else None,
    )
    if title:
        ax.set_title(title, fontsize=11, fontweight="bold", pad=8)

    buf = io.BytesIO()
    fig.savefig(buf, format=fmt, bbox_inches="tight", dpi=dpi)
    plt.close(fig)
    raw_bytes = buf.getvalue()

    if out_path is not None:
        Path(out_path).write_bytes(raw_bytes)

    return raw_bytes


def render_topomap_base64(
    values: np.ndarray | list[float],
    ch_names: list[str],
    **kwargs: Any,
) -> str:
    """Render a topomap and return a base64 ``data:image/png;base64,...`` URI.

    Accepts the same keyword arguments as :func:`render_topomap`.
    """
    fmt = kwargs.pop("fmt", "png")
    raw = render_topomap(values, ch_names, fmt=fmt, **kwargs)
    b64 = base64.b64encode(raw).decode("ascii")
    mime = "image/svg+xml" if fmt == "svg" else f"image/{fmt}"
    return f"data:{mime};base64,{b64}"


def render_zscore_topomap(
    zscores: np.ndarray | list[float],
    ch_names: list[str],
    *,
    band: str = "",
    threshold: float = 2.0,
    **kwargs: Any,
) -> bytes:
    """Convenience wrapper for z-score topomaps with clinical thresholds.

    Applies symmetric colour mapping centred at zero, with contour lines
    at the significance boundary (|z| = 2.0).
    """
    title = kwargs.pop("title", f"{band.title()} z-score" if band else "z-score")
    return render_topomap(
        zscores,
        ch_names,
        title=title,
        symmetric=True,
        cmap=_CMAP_ZSCORE,
        **kwargs,
    )
