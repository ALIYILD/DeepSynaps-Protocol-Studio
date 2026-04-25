"""Forward model construction for EEG source localization.

Implements MNE-Python 1.12.x semantics.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    import mne

log = logging.getLogger(__name__)


def build_forward_model(
    raw: "mne.io.BaseRaw",
    *,
    subject: str = "fsaverage",
    subjects_dir: str | None = None,
    bids_subject: str | None = None,
) -> "mne.Forward":
    """Build an EEG forward model.

    Parameters
    ----------
    raw
        Preprocessed EEG recording with a montage (digitization points).
    subject
        FreeSurfer subject name. Default ``"fsaverage"``.
    subjects_dir
        FreeSurfer ``SUBJECTS_DIR``. If ``None`` and no subject MRI is provided,
        fsaverage is fetched via :func:`mne.datasets.fetch_fsaverage`.
    bids_subject
        Optional BIDS subject identifier produced by the MRI analyzer; when set,
        it overrides ``subject``.

    Returns
    -------
    fwd
        Forward solution.
    """
    import mne

    subj = bids_subject or subject
    subj = str(subj)

    subjects_dir_resolved = _resolve_subjects_dir(mne, subj, subjects_dir)
    src = mne.setup_source_space(
        subject=subj,
        spacing="oct6",
        subjects_dir=subjects_dir_resolved,
        add_dist=False,
        verbose="WARNING",
    )
    bem = _load_or_make_bem_solution(mne, subj, subjects_dir_resolved)
    trans = _resolve_trans(subj, subjects_dir_resolved)

    # NOTE: EEG-only forward; MEG disabled.
    fwd = mne.make_forward_solution(
        info=raw.info,
        trans=trans,
        src=src,
        bem=bem,
        eeg=True,
        meg=False,
        mindist=5.0,
        verbose="WARNING",
    )
    return fwd


def _resolve_subjects_dir(mne_mod, subject: str, subjects_dir: str | None) -> str:
    if subjects_dir is not None:
        return str(subjects_dir)

    if subject != "fsaverage":
        raise ValueError(
            "subjects_dir is required for non-fsaverage subjects "
            f"(got subject={subject!r})."
        )

    fs_dir = mne_mod.datasets.fetch_fsaverage(verbose="WARNING")
    # fetch_fsaverage returns <subjects_dir>/fsaverage
    subjects_dir_resolved = str(Path(fs_dir).parent)
    return subjects_dir_resolved


def _load_or_make_bem_solution(mne_mod, subject: str, subjects_dir: str) -> object:
    bem_sol = Path(subjects_dir) / subject / "bem" / f"{subject}-5120-5120-5120-bem-sol.fif"
    if bem_sol.exists():
        try:
            return mne_mod.read_bem_solution(str(bem_sol), verbose="WARNING")
        except Exception as exc:
            log.warning("Failed reading BEM solution (%s); rebuilding.", exc)

    model = mne_mod.make_bem_model(
        subject=subject,
        ico=4,
        conductivity=(0.3, 0.006, 0.3),
        subjects_dir=subjects_dir,
        verbose="WARNING",
    )
    bem = mne_mod.make_bem_solution(model, verbose="WARNING")
    return bem


def _resolve_trans(subject: str, subjects_dir: str) -> str | Path:
    if subject == "fsaverage":
        # MNE ships a built-in transform for fsaverage.
        return "fsaverage"

    # For subject-specific MRIs we need a coregistration transform. We try a few
    # common conventions used by FreeSurfer/MNE pipelines.
    candidates = [
        Path(subjects_dir) / subject / "bem" / f"{subject}-trans.fif",
        Path(subjects_dir) / subject / "bem" / "trans.fif",
    ]
    for cand in candidates:
        if cand.exists():
            return cand

    raise FileNotFoundError(
        "Could not find a head<->MRI transform for subject "
        f"{subject!r} under subjects_dir={subjects_dir!r}. "
        "Expected e.g. '<subjects_dir>/<subject>/bem/<subject>-trans.fif'."
    )

