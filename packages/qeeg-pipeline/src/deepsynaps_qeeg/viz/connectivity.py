"""Connectivity visualization — heatmap matrix + chord diagram data export.

Server-rendered:
  ``render_connectivity_matrix`` → Matplotlib heatmap image (PNG/SVG)
  for PDF embedding.

Interactive (browser):
  ``export_chord_payload`` → JSON payload compatible with brainvis-d3
  chord diagram component.

  ``export_plotly_payload`` → Plotly.js heatmap trace JSON for the
  browser-side interactive viewer.
"""
from __future__ import annotations

import base64
import io
import json
import logging
from pathlib import Path
from typing import Any

import numpy as np

from .. import FREQ_BANDS

log = logging.getLogger(__name__)

# Style locks: only {viridis, cividis, RdBu_r} in user-facing surfaces.
_CMAP_COH = "viridis"        # coherence: 0→1
_CMAP_WPLI = "RdBu_r"        # wPLI: diverging
_CMAP_GENERIC = "viridis"

_DPI = 150

# ── Yeo-7 network assignment for Desikan-Killiany ROIs ──────────────────────
# Simplified mapping used for chord-diagram grouping. Each label in the DK
# atlas is assigned to one of seven canonical resting-state networks.
_DK_NETWORK_MAP: dict[str, str] = {
    "lateralorbitofrontal": "Fronto-Parietal",
    "medialorbitofrontal": "Default",
    "parsorbitalis": "Fronto-Parietal",
    "parstriangularis": "Fronto-Parietal",
    "parsopercularis": "Fronto-Parietal",
    "rostralmiddlefrontal": "Fronto-Parietal",
    "caudalmiddlefrontal": "Dorsal-Attention",
    "superiorfrontal": "Default",
    "frontalpole": "Default",
    "rostralanteriorcingulate": "Default",
    "caudalanteriorcingulate": "Salience",
    "precentral": "Somato-Motor",
    "postcentral": "Somato-Motor",
    "paracentral": "Somato-Motor",
    "supramarginal": "Salience",
    "inferiorparietal": "Fronto-Parietal",
    "superiorparietal": "Dorsal-Attention",
    "precuneus": "Default",
    "posteriorcingulate": "Default",
    "isthmuscingulate": "Default",
    "cuneus": "Visual",
    "pericalcarine": "Visual",
    "lateraloccipital": "Visual",
    "lingual": "Visual",
    "fusiform": "Visual",
    "superiortemporal": "Ventral-Attention",
    "middletemporal": "Default",
    "inferiortemporal": "Default",
    "bankssts": "Default",
    "transversetemporal": "Somato-Motor",
    "entorhinal": "Default",
    "parahippocampal": "Default",
    "temporalpole": "Limbic",
    "insula": "Salience",
}


def _network_for_roi(roi_label: str) -> str:
    """Look up the Yeo-7 network for a DK ROI label."""
    clean = roi_label.split("-")[0].replace("_", "").lower()
    return _DK_NETWORK_MAP.get(clean, "Other")


def render_connectivity_matrix(
    matrix: np.ndarray,
    labels: list[str],
    *,
    title: str = "Connectivity",
    cmap: str = _CMAP_COH,
    vmin: float | None = None,
    vmax: float | None = None,
    out_path: str | Path | None = None,
    fmt: str = "png",
    dpi: int = _DPI,
    annotate: bool = False,
) -> bytes:
    """Render a connectivity matrix as a Matplotlib heatmap.

    Parameters
    ----------
    matrix : ndarray, shape (n, n)
        Symmetric connectivity matrix (e.g. coherence, wPLI).
    labels : list of str
        Row/column labels (channel or ROI names).
    title : str
        Figure title.
    cmap : str
        Colour map.
    vmin, vmax : float or None
        Colour scale bounds.
    out_path : Path or None
        Write the image to disk if provided.
    fmt : str
        'png' or 'svg'.
    dpi : int
        Resolution.
    annotate : bool
        If True, print values inside each cell (only practical for < 20 nodes).

    Returns
    -------
    bytes
        Raw image data.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    matrix = np.asarray(matrix, dtype=float)
    n = matrix.shape[0]

    figsize = max(5, 0.35 * n)
    fig, ax = plt.subplots(figsize=(figsize, figsize), dpi=dpi)

    im = ax.imshow(matrix, cmap=cmap, vmin=vmin, vmax=vmax, aspect="equal", origin="upper")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

    if n <= 30:
        ax.set_xticks(range(n))
        ax.set_yticks(range(n))
        ax.set_xticklabels(labels, rotation=90, fontsize=max(5, 9 - n // 10))
        ax.set_yticklabels(labels, fontsize=max(5, 9 - n // 10))
    else:
        ax.set_xticks([])
        ax.set_yticks([])

    if annotate and n <= 20:
        for i in range(n):
            for j in range(n):
                ax.text(j, i, f"{matrix[i, j]:.2f}", ha="center", va="center", fontsize=6)

    ax.set_title(title, fontsize=12, fontweight="bold", pad=10)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format=fmt, bbox_inches="tight", dpi=dpi)
    plt.close(fig)
    raw_bytes = buf.getvalue()

    if out_path:
        Path(out_path).write_bytes(raw_bytes)

    return raw_bytes


def render_connectivity_matrix_base64(
    matrix: np.ndarray,
    labels: list[str],
    **kwargs: Any,
) -> str:
    """Render the connectivity matrix and return a base64 data-URI."""
    fmt = kwargs.pop("fmt", "png")
    raw = render_connectivity_matrix(matrix, labels, fmt=fmt, **kwargs)
    b64 = base64.b64encode(raw).decode("ascii")
    mime = "image/svg+xml" if fmt == "svg" else f"image/{fmt}"
    return f"data:{mime};base64,{b64}"


def export_chord_payload(
    matrix: np.ndarray,
    labels: list[str],
    *,
    threshold: float = 0.3,
    networks: list[str] | None = None,
    metric_name: str = "coherence",
    band: str = "alpha",
) -> dict[str, Any]:
    """Export connectivity data as a brainvis-d3 chord-diagram payload.

    Parameters
    ----------
    matrix : ndarray (n, n)
        Symmetric connectivity matrix.
    labels : list of str
        ROI/channel labels.
    threshold : float
        Only include edges with |weight| >= threshold.
    networks : list of str or None
        Network assignment per node. Auto-inferred from DK atlas if None.
    metric_name : str
        Name of the connectivity metric.
    band : str
        Frequency band label.

    Returns
    -------
    dict
        JSON-serialisable payload for brainvis-d3.
    """
    matrix = np.asarray(matrix, dtype=float)
    n = matrix.shape[0]

    if networks is None:
        networks = [_network_for_roi(lab) for lab in labels]

    nodes = [
        {"id": i, "label": labels[i], "network": networks[i]}
        for i in range(n)
    ]

    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            w = float(matrix[i, j])
            if abs(w) >= threshold:
                edges.append({
                    "source": i,
                    "target": j,
                    "weight": abs(w),
                    "sign": 1 if w >= 0 else -1,
                })

    return {
        "type": "brainvis-d3/chord",
        "metric": metric_name,
        "band": band,
        "threshold": threshold,
        "nodes": nodes,
        "edges": edges,
        "networks": sorted(set(networks)),
    }


def export_plotly_payload(
    matrix: np.ndarray,
    labels: list[str],
    *,
    title: str = "Connectivity",
    cmap: str = "RdBu_r",
    symmetric: bool = True,
) -> dict[str, Any]:
    """Export the matrix as a Plotly heatmap trace for browser rendering.

    Returns
    -------
    dict
        Plotly JSON spec with ``data`` and ``layout`` keys.
    """
    matrix = np.asarray(matrix, dtype=float)
    zmin, zmax = None, None
    if symmetric:
        absmax = max(1e-9, float(np.nanmax(np.abs(matrix))))
        zmin, zmax = -absmax, absmax

    return {
        "data": [{
            "type": "heatmap",
            "z": matrix.tolist(),
            "x": labels,
            "y": labels,
            "colorscale": cmap,
            "zmin": zmin,
            "zmax": zmax,
            "reversescale": symmetric,
        }],
        "layout": {
            "title": title,
            "width": 600,
            "height": 600,
            "margin": {"l": 80, "r": 20, "t": 50, "b": 80},
        },
    }


def export_multi_band_chord(
    connectivity_result: dict[str, Any],
    *,
    metric: str = "coherence",
    threshold: float = 0.3,
) -> dict[str, dict[str, Any]]:
    """Export chord payloads for all bands from a connectivity pipeline result.

    Parameters
    ----------
    connectivity_result : dict
        Output of ``features.connectivity.compute`` — contains
        ``coherence``, ``wpli``, and ``channels`` keys.
    metric : str
        Which metric to export: 'coherence' or 'wpli'.
    threshold : float
        Edge weight threshold.

    Returns
    -------
    dict
        ``{band_name: chord_payload, ...}``
    """
    channels = connectivity_result.get("channels", [])
    metric_data = connectivity_result.get(metric, {})

    result = {}
    for band, mat_list in metric_data.items():
        mat = np.asarray(mat_list, dtype=float)
        result[band] = export_chord_payload(
            mat,
            channels,
            threshold=threshold,
            metric_name=metric,
            band=band,
        )

    return result
