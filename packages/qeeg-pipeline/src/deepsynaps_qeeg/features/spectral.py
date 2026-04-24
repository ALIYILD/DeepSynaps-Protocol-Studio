"""Spectral features — Welch band power, SpecParam aperiodic, peak alpha.

Stage 4 (spectral part). Output shape matches ``CONTRACT.md §1.1.spectral``:

```
{
  "bands": {
    "<band>": {
      "absolute_uv2": {"<ch>": float, ...},
      "relative":     {"<ch>": float, ...},
    }, ...
  },
  "aperiodic": {
    "slope":    {"<ch>": float, ...},
    "offset":   {"<ch>": float, ...},
    "r_squared":{"<ch>": float, ...},
  },
  "peak_alpha_freq": {"<ch>": float | None, ...},
}
```

SpecParam (fooof) is optional — if the package is missing, slope/offset/r² and
peak alpha frequency are returned as ``None`` per channel and a warning is
logged.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import numpy as np

from .. import FREQ_BANDS

if TYPE_CHECKING:  # pragma: no cover
    import mne

log = logging.getLogger(__name__)

WELCH_WINDOW_SEC = 4.0
WELCH_OVERLAP = 0.5
PSD_FREQ_RANGE = (1.0, 45.0)
FOOOF_FREQ_RANGE = (1.0, 40.0)
FOOOF_PEAK_WIDTH_LIMITS = (2.0, 12.0)
PAF_SEARCH = (7.0, 13.0)
_UV2_SCALE = 1e12  # V²/Hz → µV²/Hz


def compute(
    epochs: "mne.Epochs",
    bands: dict[str, tuple[float, float]] = FREQ_BANDS,
) -> dict[str, Any]:
    """Compute per-channel band power + SpecParam aperiodic + PAF.

    Parameters
    ----------
    epochs : mne.Epochs
        Clean epochs from :func:`deepsynaps_qeeg.artifacts.run`.
    bands : dict
        Band-name → (lo, hi) map. Defaults to :data:`FREQ_BANDS`.

    Returns
    -------
    dict
        See module docstring / CONTRACT.md §1.1.spectral.
    """
    import mne  # noqa: F401

    ch_names = list(epochs.ch_names)
    sfreq = float(epochs.info["sfreq"])
    n_per_seg = int(min(WELCH_WINDOW_SEC * sfreq, epochs.get_data().shape[-1]))
    n_overlap = int(n_per_seg * WELCH_OVERLAP)

    # PSD: average across epochs → (n_channels, n_freqs), units V²/Hz
    freqs, psd = _compute_psd(epochs, fmin=PSD_FREQ_RANGE[0], fmax=PSD_FREQ_RANGE[1],
                              n_per_seg=n_per_seg, n_overlap=n_overlap)
    psd_uv2 = psd * _UV2_SCALE  # µV²/Hz

    # --- Band power ---
    bands_out: dict[str, dict[str, dict[str, float]]] = {}
    total_power = _integrate_band(freqs, psd_uv2, PSD_FREQ_RANGE[0], PSD_FREQ_RANGE[1])
    for band_name, (lo, hi) in bands.items():
        abs_power = _integrate_band(freqs, psd_uv2, lo, hi)
        rel_power = np.where(total_power > 0, abs_power / total_power, 0.0)
        bands_out[band_name] = {
            "absolute_uv2": {ch: float(abs_power[i]) for i, ch in enumerate(ch_names)},
            "relative":     {ch: float(rel_power[i]) for i, ch in enumerate(ch_names)},
        }

    # --- SpecParam aperiodic + PAF ---
    slope, offset, r_squared, paf = _fit_specparam(freqs, psd_uv2, ch_names)

    return {
        "bands": bands_out,
        "aperiodic": {
            "slope":     {ch: _maybe_float(slope[i]) for i, ch in enumerate(ch_names)},
            "offset":    {ch: _maybe_float(offset[i]) for i, ch in enumerate(ch_names)},
            "r_squared": {ch: _maybe_float(r_squared[i]) for i, ch in enumerate(ch_names)},
        },
        "peak_alpha_freq": {ch: _maybe_float(paf[i]) for i, ch in enumerate(ch_names)},
    }


def _compute_psd(
    epochs: "mne.Epochs",
    *,
    fmin: float,
    fmax: float,
    n_per_seg: int,
    n_overlap: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Welch PSD averaged across epochs, returning (freqs, psd[n_ch, n_freqs])."""
    try:
        spectrum = epochs.compute_psd(
            method="welch",
            fmin=fmin,
            fmax=fmax,
            n_fft=n_per_seg,
            n_per_seg=n_per_seg,
            n_overlap=n_overlap,
            picks="eeg",
            verbose="WARNING",
        )
        psd_all = spectrum.get_data()  # (n_epochs, n_ch, n_freqs)
        freqs = spectrum.freqs
    except Exception as exc:
        log.warning("epochs.compute_psd unavailable (%s); using scipy.signal.welch fallback.", exc)
        from scipy.signal import welch

        data = epochs.get_data(picks="eeg")  # (n_epochs, n_ch, n_times)
        freqs, psd_all = welch(
            data,
            fs=float(epochs.info["sfreq"]),
            nperseg=n_per_seg,
            noverlap=n_overlap,
            axis=-1,
        )
        mask = (freqs >= fmin) & (freqs <= fmax)
        freqs = freqs[mask]
        psd_all = psd_all[..., mask]

    # Average across epochs
    psd = psd_all.mean(axis=0)
    return np.asarray(freqs), np.asarray(psd)


def _integrate_band(freqs: np.ndarray, psd: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Trapezoidal integral of PSD over [lo, hi]. Shape: (n_channels,)."""
    mask = (freqs >= lo) & (freqs <= hi)
    if not np.any(mask):
        return np.zeros(psd.shape[0])
    return np.trapz(psd[:, mask], freqs[mask], axis=-1)


def _fit_specparam(
    freqs: np.ndarray,
    psd: np.ndarray,
    ch_names: list[str],
) -> tuple[list[float | None], list[float | None], list[float | None], list[float | None]]:
    """Fit FOOOF per channel; return (slope, offset, r², PAF) lists, one per channel."""
    n_ch = psd.shape[0]
    none_list: list[float | None] = [None] * n_ch
    try:
        from fooof import FOOOF
    except Exception as exc:
        log.warning("fooof/SpecParam unavailable (%s). Skipping aperiodic + PAF.", exc)
        return list(none_list), list(none_list), list(none_list), list(none_list)

    slope: list[float | None] = []
    offset: list[float | None] = []
    r_squared: list[float | None] = []
    paf: list[float | None] = []

    for i, ch in enumerate(ch_names):
        try:
            fm = FOOOF(peak_width_limits=list(FOOOF_PEAK_WIDTH_LIMITS), verbose=False)
            fm.fit(freqs, psd[i], list(FOOOF_FREQ_RANGE))
            aperiodic = fm.aperiodic_params_
            offset.append(float(aperiodic[0]))
            # aperiodic_params_ may be length 2 (offset, exponent) or 3 (offset, knee, exp)
            slope.append(float(aperiodic[-1]))
            r_squared.append(float(fm.r_squared_))

            peaks = np.atleast_2d(getattr(fm, "peak_params_", np.zeros((0, 3))))
            paf_val = _peak_alpha_from_peaks(peaks, *PAF_SEARCH)
            paf.append(paf_val)
        except Exception as exc:
            log.warning("FOOOF fit failed on %s (%s).", ch, exc)
            offset.append(None)
            slope.append(None)
            r_squared.append(None)
            # Fallback PAF: argmax of PSD in 7–13 Hz band
            paf.append(_peak_alpha_from_psd(freqs, psd[i]))

    return slope, offset, r_squared, paf


def _peak_alpha_from_peaks(peaks: np.ndarray, lo: float, hi: float) -> float | None:
    """Pick highest-power peak within [lo, hi] Hz from FOOOF peak_params_.

    peak_params_ columns: [center_freq, power, bandwidth].
    """
    if peaks.size == 0:
        return None
    mask = (peaks[:, 0] >= lo) & (peaks[:, 0] <= hi)
    if not np.any(mask):
        return None
    within = peaks[mask]
    idx = int(np.argmax(within[:, 1]))
    return float(within[idx, 0])


def _peak_alpha_from_psd(freqs: np.ndarray, psd_row: np.ndarray) -> float | None:
    """Fallback PAF: argmax of PSD within 7–13 Hz when FOOOF is unavailable."""
    mask = (freqs >= PAF_SEARCH[0]) & (freqs <= PAF_SEARCH[1])
    if not np.any(mask):
        return None
    idx = int(np.argmax(psd_row[mask]))
    return float(freqs[mask][idx])


def _maybe_float(v: float | None) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
        if not np.isfinite(f):
            return None
        return f
    except (TypeError, ValueError):
        return None
