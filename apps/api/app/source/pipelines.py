"""High-level LORETA / spectra-LLORETA / dipole pipelines."""

from __future__ import annotations

from typing import Any

import numpy as np

from app.source.atlases import approximate_label, roi_rows_from_peaks
from app.source.dipole_fit import fit_dipole_timecourse
from app.source.forward import make_sphere_forward
from app.source.inverse import make_inverse_and_apply, stc_peak_snapshot


def _ensure_montage(raw: Any) -> None:
    import mne

    try:
        raw.set_montage("standard_1020", on_missing="ignore")
    except Exception:
        try:
            mne.channels.make_standard_montage("standard_1020")
            raw.set_montage("standard_1020", on_missing="ignore")
        except Exception:
            pass


def _vertex_to_mm(src: Any, vertex_idx: int) -> tuple[float, float, float]:
    """Map linear source-space row index → position (meters in head coords → mm)."""
    i = int(vertex_idx)
    for space in src:
        rr = np.asarray(space["rr"])
        n = rr.shape[0]
        if i < n:
            x, y, z = rr[i]
            return float(x * 1000), float(y * 1000), float(z * 1000)
        i -= n
    return 0.0, 0.0, 0.0


def loreta_erp_pipeline(
    epochs: Any,
    *,
    pick_time_ms: float | None,
    method: str = "sLORETA",
    lambda2: float = 1.0 / 9.0,
) -> dict[str, Any]:
    import mne

    _ensure_montage(epochs)
    evoked = epochs.average()
    noise_cov = mne.compute_covariance(epochs, tmax=0.0, method="shrunk", verbose=False)
    sphere, src, fwd = make_sphere_forward(evoked.info, pos_mm=18.0, verbose=False)
    inv, stc = make_inverse_and_apply(
        evoked,
        fwd,
        noise_cov,
        method=method,
        lambda2=lambda2,
        verbose=False,
    )
    if pick_time_ms is None:
        idx_time = int(np.argmax(np.max(np.abs(stc.data), axis=0)))
    else:
        t_tar = pick_time_ms / 1000.0
        idx_time = int(np.argmin(np.abs(stc.times - t_tar)))
    snap = stc_peak_snapshot(stc, pick_time_index=idx_time)
    pv = snap["peakVertex"]
    mni_mm = list(_vertex_to_mm(src, pv))
    lab = approximate_label((mni_mm[0], mni_mm[1], mni_mm[2]))
    peaks = [{"mniMm": mni_mm, "value": snap["peakValue"]}]
    roi_table = roi_rows_from_peaks(peaks)

    # Sparse preview along time for slider (decimate)
    dec = max(1, stc.data.shape[1] // 128)
    preview = {
        "timesSec": stc.times[::dec].tolist(),
        "peakEnvelope": np.max(np.abs(stc.data), axis=0)[::dec].astype(np.float32).tolist(),
    }

    return {
        "ok": True,
        "method": method,
        "peak": {
            "vertex": pv,
            "mniMmHeadApprox": mni_mm,
            "latencyMs": snap.get("timeSec", 0) * 1000 if snap.get("timeSec") is not None else None,
            "value": snap["peakValue"],
            "labelGuess": lab["regionGuess"],
        },
        "roiTable": roi_table,
        "previewSeries": preview,
        "forwardMeta": {"kind": "sphere_volume", "vertices": snap["nVertices"]},
    }


def loreta_spectra_pipeline(raw: Any, *, band_hz: tuple[float, float], from_sec: float, to_sec: float) -> dict[str, Any]:
    """Band-limited RMS per channel → pseudo-evoked (scalar map) → inverse."""
    import mne
    from scipy import signal as scipy_signal

    _ensure_montage(raw)
    raw.load_data()
    sfreq = float(raw.info["sfreq"])
    start = int(from_sec * sfreq)
    stop = int(to_sec * sfreq)
    data = raw.get_data(start=start, stop=stop) * 1e6  # V→µV for consistency with ERP path
    lo, hi = band_hz
    nyq = sfreq / 2.0
    hi = min(hi, nyq - 1.0)
    lo = max(lo, 0.5)
    sos = scipy_signal.butter(4, [lo, hi], btype="bandpass", fs=sfreq, output="sos")
    rms_ch = []
    for chi in range(data.shape[0]):
        xf = scipy_signal.sosfiltfilt(sos, data[chi].astype(np.float64))
        rms_ch.append(float(np.sqrt(np.mean(xf**2))))
    rms_arr = np.asarray(rms_ch, dtype=np.float64)[:, np.newaxis]
    info = raw.info.copy()
    evk = mne.EvokedArray(rms_arr, info, tmin=0.0)
    scale = float(np.mean(rms_arr) + 1e-9)
    noise_cov = mne.make_ad_hoc_cov(info, std=dict(eeg=scale))
    sphere, src, fwd = make_sphere_forward(evk.info, pos_mm=22.0, verbose=False)
    inv, stc = make_inverse_and_apply(
        evk,
        fwd,
        noise_cov,
        method="sLORETA",
        lambda2=1.0 / 9.0,
        verbose=False,
    )
    snap = stc_peak_snapshot(stc, pick_time_index=0)
    pv = snap["peakVertex"]
    mni_mm = list(_vertex_to_mm(src, pv))
    peaks = [{"mniMm": mni_mm, "value": snap["peakValue"]}]
    roi_table = roi_rows_from_peaks(peaks)
    lab = approximate_label((mni_mm[0], mni_mm[1], mni_mm[2]))
    return {
        "ok": True,
        "bandHz": list(band_hz),
        "peak": {"mniMmHeadApprox": mni_mm, "value": snap["peakValue"], "labelGuess": lab["regionGuess"]},
        "roiTable": roi_table,
        "note": "Band RMS map inverse — exploratory; prefer ERP latency-localised analysis when possible.",
    }


def dipole_pipeline(epochs: Any, *, step: int = 4) -> dict[str, Any]:
    import mne

    _ensure_montage(epochs)
    evoked = epochs.average()
    cov = mne.compute_covariance(epochs, tmax=0.0, method="shrunk", verbose=False)
    sphere, _src, _fwd = make_sphere_forward(evoked.info, pos_mm=18.0, verbose=False)
    dip_out = fit_dipole_timecourse(evoked, cov, sphere, step=step, verbose=False)
    dip_out["ok"] = True
    return dip_out
