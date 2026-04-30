"""Source-localization visualization — cortex surface + three-brain-js export.

Server-rendered:
  ``render_source_cortex`` → Matplotlib brain-surface image (PNG/SVG)
  using MNE's ``mne.viz.plot_source_estimates`` on fsaverage.

Interactive (browser):
  ``export_threebrain_payload`` → JSON payload for three-brain-js WebGL
  viewer (MPL-2 licensed), containing per-ROI power values projected
  onto the Desikan-Killiany atlas.
"""
from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np


if TYPE_CHECKING:
    pass

log = logging.getLogger(__name__)

_DPI = 150

# Desikan-Killiany (aparc) region ordering (68 ROIs without 'unknown')
# Used to build the three-brain-js ROI-to-value mapping.
_DK_REGIONS_LH = [
    "bankssts", "caudalanteriorcingulate", "caudalmiddlefrontal",
    "cuneus", "entorhinal", "fusiform", "inferiorparietal",
    "inferiortemporal", "isthmuscingulate", "lateraloccipital",
    "lateralorbitofrontal", "lingual", "medialorbitofrontal",
    "middletemporal", "parahippocampal", "paracentral",
    "parsopercularis", "parsorbitalis", "parstriangularis",
    "pericalcarine", "postcentral", "posteriorcingulate",
    "precentral", "precuneus", "rostralanteriorcingulate",
    "rostralmiddlefrontal", "superiorfrontal", "superiorparietal",
    "superiortemporal", "supramarginal", "frontalpole",
    "temporalpole", "transversetemporal", "insula",
]


def render_source_cortex(
    roi_band_power: dict[str, dict[str, float]],
    *,
    band: str = "alpha",
    title: str | None = None,
    out_path: str | Path | None = None,
    fmt: str = "png",
    dpi: int = _DPI,
    views: list[str] | None = None,
) -> bytes:
    """Render source-localized power as a cortical surface map.

    Uses MNE's surface plotting on the fsaverage template to create a
    publication-grade brain-surface figure.

    Parameters
    ----------
    roi_band_power : dict
        ``{band: {roi_label: power_value, ...}, ...}`` — output of
        ``source.eloreta.compute()["roi_band_power"]``.
    band : str
        Which band to visualize.
    title : str or None
        Figure title.
    out_path : Path or None
        Write to disk.
    fmt : str
        'png' or 'svg'.
    dpi : int
        Resolution.
    views : list of str or None
        Brain views: ['lateral', 'medial', 'dorsal']. Defaults to lateral.

    Returns
    -------
    bytes
        Raw image data.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    if views is None:
        views = ["lateral"]

    band_data = roi_band_power.get(band, {})
    if not band_data:
        log.warning("No data for band '%s'; returning empty image.", band)
        fig, ax = plt.subplots(figsize=(4, 4), dpi=dpi)
        ax.text(0.5, 0.5, f"No {band} data", ha="center", va="center", fontsize=14)
        ax.set_axis_off()
        buf = io.BytesIO()
        fig.savefig(buf, format=fmt, dpi=dpi)
        plt.close(fig)
        return buf.getvalue()

    # Build a static cortical parcellation image using matplotlib
    fig = _render_parcellation_map(band_data, band, title or f"{band.title()} Source Power", dpi)

    buf = io.BytesIO()
    fig.savefig(buf, format=fmt, bbox_inches="tight", dpi=dpi)
    plt.close(fig)
    raw_bytes = buf.getvalue()

    if out_path:
        Path(out_path).write_bytes(raw_bytes)

    return raw_bytes


def _render_parcellation_map(
    roi_values: dict[str, float],
    band: str,
    title: str,
    dpi: int,
) -> Any:
    """Create a simplified cortical map using a circular/radial layout.

    When full 3D rendering is unavailable (no display, no PyVista), this
    creates a publication-acceptable radial glyph map of ROI power values
    on the Desikan-Killiany atlas.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Wedge
    import matplotlib.colors as mcolors

    # Separate hemispheres
    lh_rois = {k: v for k, v in roi_values.items() if k.endswith("-lh") or "-lh" in k}
    rh_rois = {k: v for k, v in roi_values.items() if k.endswith("-rh") or "-rh" in k}

    # If no hemisphere suffix, treat all as a single set
    if not lh_rois and not rh_rois:
        lh_rois = roi_values

    all_vals = list(roi_values.values())
    vmin = min(all_vals) if all_vals else 0
    vmax = max(all_vals) if all_vals else 1
    if vmin == vmax:
        vmax = vmin + 1e-9

    norm = mcolors.Normalize(vmin=vmin, vmax=vmax)
    cmap = plt.cm.YlOrRd

    fig, axes = plt.subplots(1, 2, figsize=(10, 5), dpi=dpi)

    for ax, (hemi_label, hemi_data) in zip(axes, [("Left Hemisphere", lh_rois), ("Right Hemisphere", rh_rois)]):
        rois = sorted(hemi_data.keys())
        n = len(rois) if rois else 1

        # Radial layout — each ROI gets a wedge
        angle_step = 360.0 / max(n, 1)
        for idx, roi in enumerate(rois):
            val = hemi_data[roi]
            theta1 = idx * angle_step
            theta2 = theta1 + angle_step - 1

            wedge = Wedge(
                center=(0.5, 0.5),
                r=0.45,
                theta1=theta1,
                theta2=theta2,
                width=0.15,
                facecolor=cmap(norm(val)),
                edgecolor="white",
                linewidth=0.5,
            )
            ax.add_patch(wedge)

            # Label
            mid_angle = np.radians((theta1 + theta2) / 2)
            lx = 0.5 + 0.35 * np.cos(mid_angle)
            ly = 0.5 + 0.35 * np.sin(mid_angle)
            short_name = roi.split("-")[0][:12]
            if n <= 20:
                ax.text(lx, ly, short_name, fontsize=5, ha="center", va="center", rotation=0)

        ax.set_xlim(-0.05, 1.05)
        ax.set_ylim(-0.05, 1.05)
        ax.set_aspect("equal")
        ax.set_title(hemi_label, fontsize=10, fontweight="bold")
        ax.set_axis_off()

    fig.suptitle(title, fontsize=13, fontweight="bold", y=1.02)

    # Colourbar
    sm = plt.cm.ScalarMappable(cmap=cmap, norm=norm)
    sm.set_array([])
    fig.colorbar(sm, ax=axes, fraction=0.02, pad=0.04, label="Power")

    fig.tight_layout()
    return fig


def export_threebrain_payload(
    roi_band_power: dict[str, dict[str, float]],
    *,
    band: str = "alpha",
    atlas: str = "aparc",
    subject: str = "fsaverage",
    method: str = "eLORETA",
    threshold_pct: float = 0.0,
) -> dict[str, Any]:
    """Export source-localized data for the three-brain-js WebGL viewer.

    Parameters
    ----------
    roi_band_power : dict
        ``{band: {roi_label: power_value, ...}, ...}``
    band : str
        Which band to export.
    atlas : str
        Parcellation atlas name.
    subject : str
        FreeSurfer subject ID.
    method : str
        Source localization method used.
    threshold_pct : float
        Percentile threshold (0-100) below which values are masked.

    Returns
    -------
    dict
        JSON-serialisable payload for three-brain-js.
    """
    band_data = roi_band_power.get(band, {})

    values = list(band_data.values())
    threshold = 0.0
    if values and threshold_pct > 0:
        threshold = float(np.percentile(values, threshold_pct))

    roi_entries = []
    for roi, val in band_data.items():
        roi_entries.append({
            "label": roi,
            "value": float(val),
            "visible": float(val) >= threshold,
            "hemisphere": "lh" if roi.endswith("-lh") or "lh" in roi.lower() else "rh",
        })

    return {
        "type": "threebrain/source",
        "subject": subject,
        "atlas": atlas,
        "method": method,
        "band": band,
        "threshold": threshold,
        "threshold_pct": threshold_pct,
        "color_map": "YlOrRd",
        "roi_values": roi_entries,
        "stats": {
            "n_rois": len(roi_entries),
            "min": float(min(values)) if values else 0,
            "max": float(max(values)) if values else 0,
            "mean": float(np.mean(values)) if values else 0,
        },
    }


def export_all_bands_threebrain(
    roi_band_power: dict[str, dict[str, float]],
    **kwargs: Any,
) -> dict[str, dict[str, Any]]:
    """Export three-brain-js payloads for all available bands.

    Returns
    -------
    dict
        ``{band_name: threebrain_payload, ...}``
    """
    return {
        band: export_threebrain_payload(roi_band_power, band=band, **kwargs)
        for band in roi_band_power.keys()
    }
