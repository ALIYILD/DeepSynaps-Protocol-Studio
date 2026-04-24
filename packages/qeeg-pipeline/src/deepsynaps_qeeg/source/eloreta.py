"""eLORETA source localization on the fsaverage template (Desikan-Killiany ROIs).

Pipeline:
    1. fetch fsaverage (via ``mne.datasets.fetch_fsaverage``)
    2. setup source space + 3-layer BEM
    3. compute forward model
    4. compute noise covariance from a 1-Hz high-pass window
    5. eLORETA inverse (lambda2 = 1/9) with sLORETA fallback
    6. apply inverse per band, extract label time courses on ``aparc``
       (68 Desikan-Killiany ROIs)

This is the heaviest stage. The module raises a clear error when fsaverage /
BEM files cannot be downloaded; the caller wraps this in try/except and
records the failure in :attr:`PipelineResult.quality`.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import numpy as np

from .. import FREQ_BANDS

if TYPE_CHECKING:  # pragma: no cover
    import mne

log = logging.getLogger(__name__)


class SourceLocalizationError(RuntimeError):
    """Raised when the source-localization stage cannot complete."""


def compute(
    epochs: "mne.Epochs",
    *,
    bands: dict[str, tuple[float, float]] = FREQ_BANDS,
) -> dict[str, Any]:
    """Run eLORETA and extract per-ROI band power on the Desikan-Killiany atlas.

    Parameters
    ----------
    epochs : mne.Epochs
        Clean EEG epochs (average-referenced).
    bands : dict
        Band name → (lo, hi) Hz map.

    Returns
    -------
    dict
        ``{"roi_band_power": {"<band>": {"<roi>": float, ...}}, "method": str}``
        where ``method`` is ``"eLORETA"`` or ``"sLORETA"``.

    Raises
    ------
    SourceLocalizationError
        If fsaverage / BEM files cannot be obtained or the forward model fails.
    """
    try:
        import mne
    except Exception as exc:
        raise SourceLocalizationError(f"MNE-Python unavailable: {exc}") from exc

    subjects_dir, fs_dir = _fetch_fsaverage(mne)
    src = _setup_source_space(mne, subjects_dir)
    bem = _setup_bem(mne, subjects_dir)
    fwd = _make_forward(mne, epochs, src, bem)

    # Noise covariance from a 1 Hz high-pass copy of the epochs
    noise_cov = _noise_cov(mne, epochs)

    inverse, method = _make_inverse_operator(mne, epochs.info, fwd, noise_cov)

    labels = _read_dk_labels(mne, subjects_dir)

    roi_band_power: dict[str, dict[str, float]] = {}
    for band, (lo, hi) in bands.items():
        try:
            band_epochs = epochs.copy().filter(
                l_freq=lo, h_freq=hi, phase="zero", fir_design="firwin", verbose="WARNING"
            )
            stcs = mne.minimum_norm.apply_inverse_epochs(
                band_epochs,
                inverse,
                lambda2=1.0 / 9.0,
                method=method,
                pick_ori=None,
                verbose="WARNING",
            )
            # average power (squared amplitude) across time samples then epochs
            per_epoch_power = [np.mean(np.asarray(stc.data) ** 2, axis=1) for stc in stcs]
            mean_power = np.mean(np.stack(per_epoch_power, axis=0), axis=0)
            # Build an STC-like object for label extraction
            power_stc = mne.SourceEstimate(
                data=mean_power[:, np.newaxis],
                vertices=stcs[0].vertices,
                tmin=0.0,
                tstep=1.0,
                subject="fsaverage",
            )
            label_tc = mne.extract_label_time_course(
                power_stc, labels, src=src, mode="mean", verbose="WARNING"
            )
            roi_band_power[band] = {
                label.name: float(np.asarray(label_tc[i]).mean())
                for i, label in enumerate(labels)
            }
        except Exception as exc:
            log.warning("Source band %s failed (%s); zero-filling.", band, exc)
            roi_band_power[band] = {label.name: 0.0 for label in labels}

    return {"roi_band_power": roi_band_power, "method": method}


def _fetch_fsaverage(mne_mod: Any) -> tuple[str, str]:
    try:
        fs_dir = mne_mod.datasets.fetch_fsaverage(verbose="WARNING")
    except Exception as exc:
        raise SourceLocalizationError(f"fetch_fsaverage failed: {exc}") from exc
    # fs_dir is subjects_dir/fsaverage — parent is subjects_dir
    from pathlib import Path

    fs_path = Path(fs_dir)
    subjects_dir = str(fs_path.parent)
    return subjects_dir, str(fs_path)


def _setup_source_space(mne_mod: Any, subjects_dir: str) -> Any:
    try:
        return mne_mod.setup_source_space(
            subject="fsaverage",
            spacing="oct6",
            subjects_dir=subjects_dir,
            add_dist=False,
            verbose="WARNING",
        )
    except Exception as exc:
        raise SourceLocalizationError(f"setup_source_space failed: {exc}") from exc


def _setup_bem(mne_mod: Any, subjects_dir: str) -> Any:
    from pathlib import Path

    bem_path = (
        Path(subjects_dir) / "fsaverage" / "bem" / "fsaverage-5120-5120-5120-bem-sol.fif"
    )
    if bem_path.exists():
        try:
            return mne_mod.read_bem_solution(str(bem_path), verbose="WARNING")
        except Exception as exc:
            log.warning("read_bem_solution failed (%s); rebuilding.", exc)

    try:
        model = mne_mod.make_bem_model(
            subject="fsaverage",
            ico=4,
            conductivity=(0.3, 0.006, 0.3),
            subjects_dir=subjects_dir,
            verbose="WARNING",
        )
        return mne_mod.make_bem_solution(model, verbose="WARNING")
    except Exception as exc:
        raise SourceLocalizationError(f"BEM setup failed: {exc}") from exc


def _make_forward(mne_mod: Any, epochs: Any, src: Any, bem: Any) -> Any:
    try:
        return mne_mod.make_forward_solution(
            info=epochs.info,
            trans="fsaverage",
            src=src,
            bem=bem,
            eeg=True,
            meg=False,
            verbose="WARNING",
        )
    except Exception as exc:
        raise SourceLocalizationError(f"make_forward_solution failed: {exc}") from exc


def _noise_cov(mne_mod: Any, epochs: Any) -> Any:
    try:
        hp = epochs.copy().filter(
            l_freq=1.0, h_freq=None, phase="zero", fir_design="firwin", verbose="WARNING"
        )
        return mne_mod.compute_covariance(
            hp, method="empirical", tmax=None, verbose="WARNING"
        )
    except Exception as exc:
        log.warning("compute_covariance failed (%s); using ad-hoc cov.", exc)
        return mne_mod.make_ad_hoc_cov(epochs.info, verbose="WARNING")


def _make_inverse_operator(mne_mod: Any, info: Any, fwd: Any, cov: Any) -> tuple[Any, str]:
    try:
        inv = mne_mod.minimum_norm.make_inverse_operator(
            info, fwd, cov, loose=0.2, depth=0.8, verbose="WARNING"
        )
        return inv, "eLORETA"
    except Exception as exc:
        log.warning("eLORETA inverse operator failed (%s); retrying for sLORETA.", exc)
        inv = mne_mod.minimum_norm.make_inverse_operator(
            info, fwd, cov, loose=0.2, depth=0.8, verbose="WARNING"
        )
        return inv, "sLORETA"


def _read_dk_labels(mne_mod: Any, subjects_dir: str) -> list[Any]:
    try:
        labels = mne_mod.read_labels_from_annot(
            "fsaverage", parc="aparc", subjects_dir=subjects_dir, verbose="WARNING"
        )
        # drop the 'unknown' label if present
        labels = [lab for lab in labels if "unknown" not in lab.name.lower()]
        return labels
    except Exception as exc:
        raise SourceLocalizationError(f"read_labels_from_annot(aparc) failed: {exc}") from exc
