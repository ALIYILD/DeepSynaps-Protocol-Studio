"""Optional 3D visualization helpers for source estimates.

This module is intentionally defensive: 3D rendering requires PyVista/VTK and
often fails in headless CI environments. The pipeline can treat this as
best-effort and continue without figures.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:  # pragma: no cover
    import mne

log = logging.getLogger(__name__)

Colormap = Literal["viridis", "cividis", "RdBu_r"]


def save_stc_snapshots(
    stc: "mne.SourceEstimate",
    *,
    out_dir: str | Path,
    subject: str = "fsaverage",
    subjects_dir: str | None = None,
    kind: Literal["power", "z"] = "power",
) -> dict[str, str]:
    """Save static PNG snapshots (lat/med; hemi split) for a SourceEstimate.

    Parameters
    ----------
    stc
        Patient-derived STC (derived from the patient's EEG), typically a
        single time point representing band power or z-score.
    out_dir
        Directory where PNGs are written.
    subject
        FreeSurfer subject name (default ``"fsaverage"``).
    subjects_dir
        FreeSurfer ``SUBJECTS_DIR``.
    kind
        Determines colormap: ``"power"`` -> viridis, ``"z"`` -> RdBu_r.

    Returns
    -------
    paths
        Dict with keys ``"lateral"`` and ``"medial"`` pointing to PNG paths.
        Empty dict if rendering is unavailable.
    """
    try:
        import mne

        # Ensure backend is available before attempting any plotting.
        mne.viz.get_3d_backend()
    except Exception as exc:
        log.warning("3D backend unavailable; skipping STC snapshots (%s).", exc)
        return {}

    cmap: Colormap = "viridis" if kind == "power" else "RdBu_r"
    if cmap not in ("viridis", "cividis", "RdBu_r"):
        raise ValueError(f"Disallowed colormap: {cmap!r}")

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # MNE Brain API (PyVista) — save two canonical views.
    try:
        brain = stc.plot(
            subject=subject,
            subjects_dir=subjects_dir,
            hemi="split",
            surface="inflated",
            time_viewer=False,
            colormap=cmap,
            background="white",
            verbose="WARNING",
        )
    except Exception as exc:
        log.warning("STC plot failed; skipping snapshots (%s).", exc)
        return {}

    paths: dict[str, str] = {}
    try:
        for view in ("lateral", "medial"):
            try:
                brain.show_view(view)
            except Exception:
                # Some backends require a dict; fall back to the string.
                pass
            img_path = out_dir / f"stc_{view}.png"
            brain.save_image(str(img_path))
            paths[view] = str(img_path)
    finally:
        try:
            brain.close()
        except Exception:
            pass

    return paths

