"""ROI extraction on the Desikan–Killiany atlas."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    import mne
    import pandas as pd

log = logging.getLogger(__name__)


def extract_roi_band_power(
    source_estimates: dict[str, "mne.SourceEstimate"],
    *,
    subject: str = "fsaverage",
    subjects_dir: str | None = None,
) -> "pd.DataFrame":
    """Extract per-ROI band power for Desikan–Killiany (aparc).

    Parameters
    ----------
    source_estimates
        Mapping ``band -> SourceEstimate``. Each STC is expected to represent
        band power (e.g., squared amplitude averaged over time), but this
        function is agnostic and will average over vertices/time in each label.
    subject
        FreeSurfer subject name (default ``"fsaverage"``).
    subjects_dir
        FreeSurfer ``SUBJECTS_DIR``. If ``None`` and subject is fsaverage,
        it will be fetched.

    Returns
    -------
    df
        DataFrame with 68 rows (Desikan–Killiany labels excluding "unknown")
        and 5 columns (delta/theta/alpha/beta/gamma), indexed by ROI label name.
    """
    import mne
    import numpy as np
    import pandas as pd

    subjects_dir_resolved = _resolve_subjects_dir(mne, subject, subjects_dir)
    labels = mne.read_labels_from_annot(
        subject,
        parc="aparc",
        subjects_dir=subjects_dir_resolved,
        verbose="WARNING",
    )
    labels = _filter_dk68(labels)
    if len(labels) != 68:
        log.warning("Expected 68 DK labels, got %d.", len(labels))

    band_names = ["delta", "theta", "alpha", "beta", "gamma"]
    out = pd.DataFrame(index=[lab.name for lab in labels], columns=band_names, dtype=float)

    for band in band_names:
        stc = source_estimates.get(band)
        if stc is None:
            out[band] = 0.0
            continue

        values = []
        for lab in labels:
            try:
                sub = stc.in_label(lab)
                data = np.asarray(sub.data)
                # mean over vertices and time
                values.append(float(data.mean()) if data.size else 0.0)
            except Exception:
                values.append(0.0)
        out[band] = values

    return out


def _resolve_subjects_dir(mne_mod, subject: str, subjects_dir: str | None) -> str:
    if subjects_dir is not None:
        return str(subjects_dir)
    if subject != "fsaverage":
        raise ValueError("subjects_dir is required for non-fsaverage subjects.")
    fs_dir = mne_mod.datasets.fetch_fsaverage(verbose="WARNING")
    from pathlib import Path

    return str(Path(fs_dir).parent)


def _filter_dk68(labels: list) -> list:
    out = []
    for lab in labels:
        name = str(lab.name).lower()
        if "unknown" in name:
            continue
        # Keep hemispheric labels only; aparc DK typically ends with -lh/-rh.
        if not (name.endswith("-lh") or name.endswith("-rh")):
            continue
        out.append(lab)
    return out

