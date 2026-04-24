"""
Overlay rendering — colored stim-target heatmaps on the patient's T1.

For every StimTarget we produce:
  1. 3-view PNG triptych (axial / coronal / sagittal) with a colored
     Gaussian spot at the target MNI coordinate, overlaid on T1.
  2. Glass-brain PNG showing the global position.
  3. Interactive HTML (nilearn.view_img) — drag-scrollable, ships to
     the dashboard via an <iframe>.

Colors are assigned per modality (stable across reports):
    rtms  -> orange
    tps   -> magenta
    tfus  -> cyan
    tdcs  -> green
    tacs  -> yellow
    personalised -> bright red (takes precedence)
"""
from __future__ import annotations

import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .schemas import StimTarget

log = logging.getLogger(__name__)

MODALITY_COLOR: dict[str, str] = {
    "rtms": "#ff8800",
    "tps":  "#cc00aa",
    "tfus": "#00b5d8",
    "tdcs": "#22c55e",
    "tacs": "#eab308",
}
PERSONALISED_COLOR = "#ff0033"


@dataclass
class OverlayArtifacts:
    target_id: str
    triptych_png: str
    glass_png: str
    interactive_html: str


# ---------------------------------------------------------------------------
# Gaussian spot helper
# ---------------------------------------------------------------------------
def _gaussian_spot(
    reference_img,
    mni_xyz: tuple[float, float, float],
    sigma_mm: float = 6.0,
):
    """Make a 3D Gaussian blob NIfTI centred at ``mni_xyz`` in the reference grid."""
    import nibabel as nib
    from nibabel.affines import apply_affine

    shape = reference_img.shape[:3]
    affine = reference_img.affine
    inv = np.linalg.inv(affine)
    vox = apply_affine(inv, np.array(mni_xyz))

    zooms = reference_img.header.get_zooms()[:3]
    sigma_vox = np.array([sigma_mm / z for z in zooms])

    xi, yi, zi = np.indices(shape)
    d2 = (
        ((xi - vox[0]) / sigma_vox[0]) ** 2
        + ((yi - vox[1]) / sigma_vox[1]) ** 2
        + ((zi - vox[2]) / sigma_vox[2]) ** 2
    )
    blob = np.exp(-0.5 * d2).astype(np.float32)
    return nib.Nifti1Image(blob, affine)


def _target_color(target: StimTarget) -> str:
    if "personalised" in target.method or "personalized" in target.method:
        return PERSONALISED_COLOR
    return MODALITY_COLOR.get(target.modality, "#ff8800")


# ---------------------------------------------------------------------------
# Per-target rendering
# ---------------------------------------------------------------------------
def render_target_overlays(
    target: StimTarget,
    t1_mni_path: str | Path,
    out_dir: str | Path,
    *,
    sigma_mm: float = 6.0,
    threshold: float = 0.05,
) -> OverlayArtifacts:
    """Render triptych + glass brain + interactive HTML for one StimTarget.

    Assumes ``t1_mni_path`` is the T1 warped to MNI152NLin2009cAsym.
    """
    import nibabel as nib
    from matplotlib.colors import LinearSegmentedColormap
    from nilearn import plotting

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    t1 = nib.load(str(t1_mni_path))
    spot = _gaussian_spot(t1, target.mni_xyz, sigma_mm=sigma_mm)

    color = _target_color(target)
    cmap = LinearSegmentedColormap.from_list(
        f"cmap_{target.target_id}", ["#00000000", color], N=256
    )

    trip_png = out_dir / f"{target.target_id}_triptych.png"
    glass_png = out_dir / f"{target.target_id}_glass.png"
    html = out_dir / f"{target.target_id}_interactive.html"

    display = plotting.plot_stat_map(
        spot,
        bg_img=t1,
        cut_coords=target.mni_xyz,
        display_mode="ortho",
        colorbar=False,
        cmap=cmap,
        threshold=threshold,
        title=f"{target.target_id} — {target.region_name}",
        annotate=True,
        draw_cross=True,
    )
    display.savefig(str(trip_png), dpi=150)
    display.close()

    glass = plotting.plot_glass_brain(
        spot,
        display_mode="lyrz",
        colorbar=False,
        cmap=cmap,
        threshold=threshold,
        plot_abs=False,
        title=f"{target.target_id}",
    )
    glass.savefig(str(glass_png), dpi=150)
    glass.close()

    view = plotting.view_img(
        spot,
        bg_img=t1,
        cut_coords=target.mni_xyz,
        cmap=cmap,
        threshold=threshold,
        title=f"{target.target_id} — {target.region_name}",
    )
    view.save_as_html(str(html))

    return OverlayArtifacts(
        target_id=target.target_id,
        triptych_png=str(trip_png),
        glass_png=str(glass_png),
        interactive_html=str(html),
    )


# ---------------------------------------------------------------------------
# Batch — all targets on one page
# ---------------------------------------------------------------------------
def render_all_targets(
    targets: list[StimTarget],
    t1_mni_path: str | Path,
    out_dir: str | Path,
) -> dict[str, OverlayArtifacts]:
    """Render every target; returns ``{target_id: OverlayArtifacts}``."""
    return {t.target_id: render_target_overlays(t, t1_mni_path, out_dir) for t in targets}


def combined_glass_brain(
    targets: list[StimTarget],
    out_path: str | Path,
    *,
    title: str = "All stim targets",
):
    """Single glass brain with every target plotted as a coloured marker."""
    from nilearn import plotting

    coords = [t.mni_xyz for t in targets]
    colors = [_target_color(t) for t in targets]

    display = plotting.plot_markers(
        node_values=[1] * len(coords),
        node_coords=coords,
        node_size=60,
        node_cmap=None,
        display_mode="lyrz",
        title=title,
    )
    display.savefig(str(out_path), dpi=150)
    display.close()
    return str(out_path)
