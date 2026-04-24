"""Visualization subpackage — publication-grade qEEG figures (v2).

Dual-stack architecture:
  Server-rendered (MNE plot_topomap → PNG/SVG) for PDF reports.
  Interactive browser (Plotly.js / three-brain-js / brainvis-d3) via JSON payloads.
"""

from .topomap import render_topomap, render_topomap_base64
from .band_grid import render_band_grid
from .connectivity import render_connectivity_matrix, export_chord_payload
from .source import render_source_cortex, export_threebrain_payload
from .animation import render_animated_frames

__all__ = [
    "render_topomap",
    "render_topomap_base64",
    "render_band_grid",
    "render_connectivity_matrix",
    "export_chord_payload",
    "render_source_cortex",
    "export_threebrain_payload",
    "render_animated_frames",
]
