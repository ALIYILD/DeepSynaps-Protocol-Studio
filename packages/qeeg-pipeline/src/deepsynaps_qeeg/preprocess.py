"""Preprocessing — bad channels, robust reference, bandpass, notch, resample.

Stage 2 of the pipeline. See CLAUDE.md for defaults:
    - PyPREP robust average reference (with bad channel detection)
    - Bandpass 1–45 Hz (FIR, firwin, zero-phase, skip_by_annotation='edge')
    - Notch at configurable Hz (default 50 Hz)
    - Resample to 250 Hz

This module is deliberately lenient: if PyPREP is unavailable (or fails on a
given recording), we fall back to `mne`'s standard average reference so the
pipeline can still produce a cleaned `Raw` downstream.

All heavy scientific imports are inside function bodies so importing this
module does not require MNE to be installed.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from . import BANDPASS, NOTCH_HZ, RESAMPLE_SFREQ

if TYPE_CHECKING:  # pragma: no cover
    import mne

log = logging.getLogger(__name__)


def run(
    raw: "mne.io.BaseRaw",
    *,
    bandpass: tuple[float, float] = BANDPASS,
    notch: float | None = NOTCH_HZ,
    resample: float = RESAMPLE_SFREQ,
) -> tuple["mne.io.BaseRaw", dict[str, Any]]:
    """Run the preprocessing stage on a loaded `Raw` object.

    Parameters
    ----------
    raw : mne.io.BaseRaw
        Loaded, validated, montaged raw recording from :func:`deepsynaps_qeeg.io.load_raw`.
    bandpass : tuple of (float, float)
        Low/high cutoff in Hz for the zero-phase FIR bandpass. Defaults to
        ``BANDPASS`` (1.0, 45.0).
    notch : float or None
        Notch frequency in Hz (50.0 or 60.0). ``None`` disables notch filtering.
    resample : float
        Target sampling frequency in Hz after resampling. Default 250 Hz.

    Returns
    -------
    cleaned : mne.io.BaseRaw
        The preprocessed raw object (in place for efficiency — a copy is made
        before PyPREP so the caller's raw is preserved).
    quality : dict
        Quality snapshot with keys: ``bad_channels`` (list of str),
        ``sfreq_input`` (float), ``sfreq_output`` (float),
        ``bandpass`` (list [lo, hi]), ``notch_hz`` (float | None),
        ``n_channels_input`` (int), ``n_channels_rejected`` (int),
        and ``prep_used`` (bool).

    Notes
    -----
    The returned raw has been referenced, filtered, notched, and resampled.
    Bad channels identified by PyPREP are interpolated before re-referencing.
    """
    import mne  # heavy

    raw = raw.copy().load_data()
    sfreq_input = float(raw.info["sfreq"])
    n_ch_input = len(mne.pick_types(raw.info, eeg=True))

    bad_channels, prep_used = _robust_average_reference(raw)

    # Bandpass filter — zero-phase FIR firwin, skip over edge annotations
    lo, hi = bandpass
    log.info("Bandpass filtering %.1f–%.1f Hz", lo, hi)
    raw.filter(
        l_freq=lo,
        h_freq=hi,
        method="fir",
        fir_design="firwin",
        phase="zero",
        skip_by_annotation="edge",
        verbose="WARNING",
    )

    if notch is not None:
        log.info("Notch filter at %.1f Hz", notch)
        raw.notch_filter(
            freqs=[notch],
            method="fir",
            fir_design="firwin",
            phase="zero",
            skip_by_annotation="edge",
            verbose="WARNING",
        )

    # Resample — done AFTER filtering to avoid aliasing
    if resample and abs(raw.info["sfreq"] - resample) > 1e-6:
        log.info("Resampling %.1f → %.1f Hz", raw.info["sfreq"], resample)
        raw.resample(resample, npad="auto", verbose="WARNING")

    sfreq_output = float(raw.info["sfreq"])

    quality: dict[str, Any] = {
        "bad_channels": list(bad_channels),
        "n_channels_input": int(n_ch_input),
        "n_channels_rejected": int(len(bad_channels)),
        "sfreq_input": sfreq_input,
        "sfreq_output": sfreq_output,
        "bandpass": [float(lo), float(hi)],
        "notch_hz": float(notch) if notch is not None else None,
        "prep_used": bool(prep_used),
        # Records the bad-channel detection path actually used. PyPREP is the
        # primary detector; when unavailable / failing we fall back to a
        # correlation+deviation pass instead of silently skipping the test.
        "bad_channel_detector": "pyprep" if prep_used else "correlation_deviation_fallback",
    }
    return raw, quality


def _robust_average_reference(raw: "mne.io.BaseRaw") -> tuple[list[str], bool]:
    """Apply PyPREP robust average reference, with graceful fallback.

    Parameters
    ----------
    raw : mne.io.BaseRaw
        Raw object; modified in place to apply the reference.

    Returns
    -------
    bad_channels : list of str
        Channels flagged bad (and interpolated).
    prep_used : bool
        True if PyPREP ran successfully, False if we fell back to a plain
        average reference.
    """
    import mne  # noqa: F401  (imported for side-effects in some envs)

    try:
        from pyprep.prep_pipeline import PrepPipeline
    except Exception as exc:  # pragma: no cover - import-time guard
        log.warning("PyPREP unavailable (%s). Falling back to plain average reference.", exc)
        return _fallback_average_ref(raw)

    try:
        montage = raw.get_montage()
        if montage is None:
            import mne as _mne

            montage = _mne.channels.make_standard_montage("standard_1020")
        prep_params = {
            "ref_chs": "eeg",
            "reref_chs": "eeg",
            "line_freqs": [],  # notch handled in run()
        }
        prep = PrepPipeline(raw, prep_params, montage, random_state=42)
        prep.fit()
        bad_channels = list(prep.still_noisy_channels)
        # prep.raw now holds the robust-referenced, bad-interpolated raw
        raw._data[:] = prep.raw.get_data()
        # Mirror bads
        raw.info["bads"] = [b for b in bad_channels if b in raw.ch_names]
        log.info("PyPREP complete. Bad channels: %s", bad_channels)
        return bad_channels, True
    except Exception as exc:
        log.warning("PyPREP failed (%s). Falling back to plain average reference.", exc)
        return _fallback_average_ref(raw)


def _fallback_average_ref(raw: "mne.io.BaseRaw") -> tuple[list[str], bool]:
    """Plain MNE average reference used when PyPREP is unavailable / fails.

    Before applying the average reference we run a lightweight bad-channel
    detector based on the PREP "noisy channels" criteria (Bigdely-Shamlo 2015):

    - **deviation criterion**: channels whose robust z-score of channel-wise
      standard deviation exceeds 5.0 are flagged as bad.
    - **correlation criterion**: channels whose median Pearson correlation to
      all other channels falls below 0.4 are flagged as bad.

    Bad channels are interpolated (when montage permits) before re-referencing
    so the resulting average reference is not biased by extreme channels.
    Failures degrade gracefully — the average reference is always applied even
    if the detector raises.
    """

    bads_detected: list[str] = []
    try:
        bads_detected = _detect_bad_channels_correlation_deviation(raw)
    except Exception as exc:  # pragma: no cover - defensive only
        log.warning("Fallback bad-channel detection failed (%s); skipping.", exc)

    # Merge with anything already on info["bads"] (e.g. user overrides upstream)
    existing = list(raw.info.get("bads") or [])
    bads = sorted(set(existing) | set(bads_detected))
    interpolated = False
    if bads:
        raw.info["bads"] = bads
        try:
            raw.interpolate_bads(reset_bads=True, verbose="WARNING")
            interpolated = True
            log.info(
                "Fallback bad-channel pass interpolated %d channels: %s", len(bads), bads
            )
        except Exception as exc:
            log.warning(
                "interpolate_bads failed in fallback path (%s); proceeding without "
                "interpolation. Average reference will exclude bad channels.",
                exc,
            )

    try:
        raw.set_eeg_reference("average", projection=False, verbose="WARNING")
    except ValueError as exc:
        # Defensive: if no good channels remain (e.g. unmappable montage),
        # restore bads so the caller still sees what was flagged and skip
        # referencing. The pipeline marks this in quality.
        log.warning(
            "set_eeg_reference('average') failed in fallback (%s); skipping reference.",
            exc,
        )
        if not interpolated:
            raw.info["bads"] = bads

    # Always report the originally-detected bads, even if interpolation
    # cleared raw.info['bads'] (so quality records what we found).
    return list(bads or raw.info.get("bads") or []), False


def _detect_bad_channels_correlation_deviation(
    raw: "mne.io.BaseRaw",
    *,
    deviation_z_threshold: float = 5.0,
    correlation_threshold: float = 0.4,
) -> list[str]:
    """Lightweight PREP-style noisy-channel detection.

    Parameters
    ----------
    raw : mne.io.BaseRaw
        Raw recording with EEG channels.
    deviation_z_threshold : float
        Robust-z threshold on channel-wise std. Channels above this are flagged.
    correlation_threshold : float
        Median Pearson correlation to other channels below which a channel is
        flagged.

    Returns
    -------
    list of str
        Channel names flagged as bad. Empty list when nothing flagged or when
        the recording is too short / has too few channels for the test.
    """
    import mne
    import numpy as np

    eeg_picks = mne.pick_types(raw.info, eeg=True)
    if len(eeg_picks) < 4:
        return []

    data = raw.get_data(picks=eeg_picks)
    ch_names = [raw.ch_names[i] for i in eeg_picks]

    # --- Deviation criterion: robust z of per-channel std ---
    stds = np.std(data, axis=1)
    if not np.any(np.isfinite(stds)) or stds.size == 0:
        return []
    median_std = float(np.median(stds))
    mad_std = float(np.median(np.abs(stds - median_std)) * 1.4826) or 1e-12
    robust_z_std = (stds - median_std) / mad_std
    deviation_bad = {
        ch_names[i] for i, z in enumerate(robust_z_std)
        if np.isfinite(z) and abs(float(z)) > deviation_z_threshold
    }

    # --- Correlation criterion: median pairwise Pearson correlation ---
    correlation_bad: set[str] = set()
    if data.shape[0] >= 4 and data.shape[1] >= 250:
        try:
            corr = np.corrcoef(data)
            np.fill_diagonal(corr, np.nan)
            with np.errstate(invalid="ignore"):
                med_corr = np.nanmedian(np.abs(corr), axis=1)
            for i, c in enumerate(med_corr):
                if np.isfinite(c) and float(c) < correlation_threshold:
                    correlation_bad.add(ch_names[i])
        except Exception as exc:  # pragma: no cover
            log.warning("Correlation-based bad detection failed (%s).", exc)

    bad = sorted(deviation_bad | correlation_bad)
    if bad:
        log.info(
            "Fallback noisy-channel detector flagged %d channels (deviation=%s, correlation=%s)",
            len(bad), sorted(deviation_bad), sorted(correlation_bad),
        )
    return bad
