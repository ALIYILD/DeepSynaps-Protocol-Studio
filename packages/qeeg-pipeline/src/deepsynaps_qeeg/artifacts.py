"""Artifact rejection — ICA + ICLabel + autoreject on 2 s overlapping epochs.

Stage 3 of the pipeline. See CLAUDE.md for defaults:
    - ICA method 'picard' with fallback to 'infomax'
    - n_components = 0.99 cumulative explained variance (or min(n_ch-1, 30))
    - Fit on a 1 Hz high-pass copy, apply to original
    - Label with MNE-ICALabel; drop components where proba > 0.7 AND label ∈
      {eye, muscle, heart, line_noise, channel_noise}
    - Then epoch (2.0 s, 50% overlap, discard first 10 s and last 5 s)
    - autoreject.AutoReject local for residual rejection

This module is graceful: if mne-icalabel or autoreject is missing the stage
still produces epochs, and the quality dict reflects what was skipped.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from . import EPOCH_LENGTH_SEC, EPOCH_OVERLAP

if TYPE_CHECKING:  # pragma: no cover
    import mne

log = logging.getLogger(__name__)

ICLABEL_DROP_LABELS = {"eye", "muscle", "heart", "line_noise", "channel_noise"}
ICLABEL_PROBA_THRESHOLD = 0.7
ICA_MAX_COMPONENTS = 30
EDGE_DISCARD_START_SEC = 10.0
EDGE_DISCARD_END_SEC = 5.0


def run(
    raw_clean: "mne.io.BaseRaw",
    *,
    epoch_len: float = EPOCH_LENGTH_SEC,
    overlap: float = EPOCH_OVERLAP,
    quality: dict[str, Any] | None = None,
) -> tuple["mne.Epochs", dict[str, Any]]:
    """Fit ICA, reject non-brain components, epoch, and run autoreject.

    Parameters
    ----------
    raw_clean : mne.io.BaseRaw
        Preprocessed raw from :func:`deepsynaps_qeeg.preprocess.run`.
    epoch_len : float
        Epoch length in seconds. Default 2.0 s (from CLAUDE.md).
    overlap : float
        Overlap fraction in [0, 1). Default 0.5 (50%).
    quality : dict or None
        Optional existing quality snapshot to augment. If None, a fresh dict
        is created.

    Returns
    -------
    epochs : mne.Epochs
        Cleaned fixed-length epochs.
    quality : dict
        Augmented quality dict with keys ``n_epochs_total``,
        ``n_epochs_retained``, ``ica_components_dropped``,
        ``ica_labels_dropped``, and notes on whether ICLabel / autoreject
        were used.
    """
    import mne

    quality = dict(quality) if quality else {}
    quality.setdefault("bad_channels", list(raw_clean.info.get("bads") or []))

    # --- ICA ---
    ica, n_dropped, labels_dropped, iclabel_used = _fit_and_clean_ica(raw_clean)

    # Apply ICA to the main (non-high-passed) raw
    if ica is not None:
        try:
            ica.apply(raw_clean, verbose="WARNING")
        except Exception as exc:
            log.warning("Failed to apply ICA (%s); continuing with non-ICA data.", exc)

    quality["ica_components_dropped"] = int(n_dropped)
    quality["ica_labels_dropped"] = {str(k): int(v) for k, v in labels_dropped.items()}
    quality["iclabel_used"] = bool(iclabel_used)

    # --- Epoching ---
    tmax = float(raw_clean.times[-1])
    t_start = min(EDGE_DISCARD_START_SEC, max(0.0, tmax - 1.0))
    t_stop = max(t_start + epoch_len, tmax - EDGE_DISCARD_END_SEC)

    step = epoch_len * (1.0 - overlap) if overlap < 1.0 else epoch_len
    try:
        events = mne.make_fixed_length_events(
            raw_clean,
            start=t_start,
            stop=t_stop,
            duration=step,
        )
    except Exception:
        # older MNE used `overlap` kwarg instead
        events = mne.make_fixed_length_events(
            raw_clean,
            start=t_start,
            stop=t_stop,
            duration=epoch_len,
            overlap=epoch_len * overlap,
        )

    epochs = mne.Epochs(
        raw_clean,
        events=events,
        tmin=0.0,
        tmax=epoch_len,
        baseline=None,
        preload=True,
        reject_by_annotation=True,
        verbose="WARNING",
    )
    n_total = len(epochs)
    log.info("Built %d fixed-length epochs of %.2fs (overlap=%.2f)", n_total, epoch_len, overlap)

    # --- autoreject ---
    epochs, autoreject_used = _run_autoreject(epochs)
    n_retained = len(epochs)

    quality["n_epochs_total"] = int(n_total)
    quality["n_epochs_retained"] = int(n_retained)
    quality["autoreject_used"] = bool(autoreject_used)

    if n_retained < 40:
        log.warning(
            "Only %d clean epochs retained (target ≥ 40). Downstream metrics may be noisy.",
            n_retained,
        )

    return epochs, quality


def _fit_and_clean_ica(
    raw_clean: "mne.io.BaseRaw",
) -> tuple[Any | None, int, dict[str, int], bool]:
    """Fit ICA on a 1 Hz high-pass copy and identify components to drop.

    Returns (ica, n_dropped, labels_dropped, iclabel_used).
    """
    import mne

    try:
        from mne.preprocessing import ICA
    except Exception as exc:  # pragma: no cover
        log.warning("mne.preprocessing.ICA unavailable (%s). Skipping ICA.", exc)
        return None, 0, {}, False

    n_eeg = len(mne.pick_types(raw_clean.info, eeg=True))
    n_components = min(max(n_eeg - 1, 1), ICA_MAX_COMPONENTS)

    try:
        ica = ICA(
            n_components=n_components,
            method="picard",
            max_iter="auto",
            random_state=42,
        )
    except Exception as exc:
        log.warning("picard ICA unavailable (%s). Falling back to infomax.", exc)
        ica = ICA(
            n_components=n_components,
            method="infomax",
            max_iter="auto",
            random_state=42,
            fit_params=dict(extended=True),
        )

    hp_raw = raw_clean.copy().filter(
        l_freq=1.0, h_freq=None, phase="zero", fir_design="firwin", verbose="WARNING"
    )
    try:
        ica.fit(hp_raw, verbose="WARNING")
    except Exception as exc:
        log.warning("ICA fit failed (%s). Skipping IC rejection.", exc)
        return None, 0, {}, False

    # ICLabel
    try:
        from mne_icalabel import label_components
    except Exception as exc:  # pragma: no cover
        log.warning("mne-icalabel unavailable (%s). Skipping IC labelling.", exc)
        return ica, 0, {}, False

    try:
        labels_out = label_components(hp_raw, ica, method="iclabel")
        labels = labels_out["labels"]
        probas = labels_out["y_pred_proba"]
    except Exception as exc:
        log.warning("ICLabel failed (%s). Skipping IC rejection.", exc)
        return ica, 0, {}, False

    drop_indices: list[int] = []
    labels_dropped: dict[str, int] = {}
    for idx, (lab, proba) in enumerate(zip(labels, probas)):
        lab_key = str(lab).lower()
        if lab_key in ICLABEL_DROP_LABELS and float(proba) > ICLABEL_PROBA_THRESHOLD:
            drop_indices.append(idx)
            labels_dropped[lab_key] = labels_dropped.get(lab_key, 0) + 1

    ica.exclude = list(drop_indices)
    log.info("ICA dropping %d components: %s", len(drop_indices), labels_dropped)
    return ica, len(drop_indices), labels_dropped, True


def _run_autoreject(epochs: "mne.Epochs") -> tuple["mne.Epochs", bool]:
    """Run AutoReject local on the epochs; return (cleaned_epochs, used?)."""
    try:
        from autoreject import AutoReject
    except Exception as exc:  # pragma: no cover
        log.warning("autoreject unavailable (%s). Returning epochs as-is.", exc)
        return epochs, False

    try:
        ar = AutoReject(random_state=42, verbose=False)
        cleaned = ar.fit_transform(epochs)
        return cleaned, True
    except Exception as exc:
        log.warning("autoreject failed (%s). Returning unrejected epochs.", exc)
        return epochs, False
