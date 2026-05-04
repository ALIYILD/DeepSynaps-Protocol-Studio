"""Live IIR filters for Studio (visualization only; raw storage unchanged).

Butterworth high-pass 1st order (low cut time constant), low-pass 2nd order (high cut),
and notch cascades. Applied at the effective sample rate of the requested window, after
optional **temporal padding** is supplied by the router so transients settle before the
visible segment is cropped.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

import numpy as np

try:
    from scipy import signal  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover
    signal = None  # type: ignore[assignment]


# ── WinEEG-style low cut (seconds) → high-pass corner frequency (Hz) ─────────
# Mapping τ → fc = 1/(2π τ), matching RC-style time-constant displays.
LOW_CUT_SECONDS_OPTIONS: tuple[float, ...] = (0.05, 0.1, 0.16, 0.3, 0.53, 1.0)


def low_cut_s_to_hz(seconds: float) -> float:
    """Convert displayed low-cut time constant (seconds) to HPF corner frequency (Hz)."""
    if seconds <= 0:
        return 0.0
    return 1.0 / (2.0 * math.pi * seconds)


HIGH_CUT_HZ_OPTIONS: tuple[float, ...] = (15.0, 30.0, 35.0, 50.0, 70.0, 100.0)

# Fundamental line frequency presets + bandwidth codes (Hz edges, inclusive semantics).
# Each preset lists harmonics multiplier 1..N with (flow, fhigh) notch band around k*f0.
NOTCH_PRESETS: dict[str, dict[str, Any]] = {
    "none": {"fundamental_hz": 0.0, "harmonics": 0, "bw_hz": 1.0},
    "50": {"fundamental_hz": 50.0, "harmonics": 4, "bw_hz": 2.0},
    "60": {"fundamental_hz": 60.0, "harmonics": 4, "bw_hz": 2.0},
    "50-bw45-55": {"fundamental_hz": 50.0, "harmonics": 1, "bw_hz": 10.0},
    "50-bw40-50": {"fundamental_hz": 45.0, "harmonics": 1, "bw_hz": 12.0},
    "50-bw35-65": {"fundamental_hz": 50.0, "harmonics": 1, "bw_hz": 30.0},
    "50-bw55-65": {"fundamental_hz": 60.0, "harmonics": 1, "bw_hz": 10.0},
    "50-bw50-60": {"fundamental_hz": 55.0, "harmonics": 1, "bw_hz": 10.0},
    "50-bw45-75": {"fundamental_hz": 60.0, "harmonics": 2, "bw_hz": 30.0},
    "60-bw55-65": {"fundamental_hz": 60.0, "harmonics": 1, "bw_hz": 10.0},
}


def _require_scipy() -> None:
    if signal is None:
        raise RuntimeError("scipy is required for live IIR filters")


def _safe_hp_cutoff_hz(fc: float, sfreq: float) -> float:
    nyq = 0.5 * sfreq
    # Stay below Nyquist with margin
    return max(1e-6, min(fc, nyq * 0.05))


def _safe_lp_cutoff_hz(fc: float, sfreq: float) -> float:
    nyq = 0.5 * sfreq
    return max(1e-6, min(fc, nyq * 0.99))


def build_iir_sos_chain(
    sfreq: float,
    *,
    low_cut_s: float | None,
    high_cut_hz: float | None,
    notch_key: str,
) -> tuple[np.ndarray, list[str]]:
    """Return concatenated SOS sections [total_sections, 6] and warning strings."""
    _require_scipy()
    warns: list[str] = []
    sos_parts: list[np.ndarray] = []

    # High-pass (1st order Butterworth)
    if low_cut_s is not None and low_cut_s > 0:
        fc = low_cut_s_to_hz(low_cut_s)
        fc = _safe_hp_cutoff_hz(fc, sfreq)
        sos_hp = signal.butter(1, fc, btype="highpass", fs=sfreq, output="sos")  # type: ignore[union-attr]
        sos_parts.append(sos_hp)

    # Notches (12th order → repeat iirnotch as second-order sections per notch frequency)
    spec = NOTCH_PRESETS.get(notch_key, NOTCH_PRESETS["none"])
    fund = float(spec.get("fundamental_hz", 0.0))
    nh = int(spec.get("harmonics", 0))
    bw = float(spec.get("bw_hz", 2.0))
    lines: list[tuple[float, float]] = []
    if fund > 0 and nh > 0:
        for k in range(1, nh + 1):
            f0 = fund * k
            if f0 >= 0.45 * sfreq:
                break
            lines.append((f0, bw))

    if lines:
        for f0, bw in lines:
            if f0 <= 0 or f0 >= 0.5 * sfreq:
                continue
            # Quality factor Q ≈ f0 / BW for band-reject
            q = max(1.0, f0 / max(bw, 0.5))
            # iirnotch returns (b,a); convert to SOS (second-order sections)
            b, a = signal.iirnotch(w0=f0, Q=q, fs=sfreq)  # type: ignore[union-attr]
            sos_n = signal.tf2sos(b, a)  # type: ignore[union-attr]
            sos_parts.append(sos_n)

    # Low-pass (2nd order Butterworth)
    if high_cut_hz is not None and high_cut_hz > 0:
        fc = _safe_lp_cutoff_hz(float(high_cut_hz), sfreq)
        sos_lp = signal.butter(2, fc, btype="lowpass", fs=sfreq, output="sos")  # type: ignore[union-attr]
        sos_parts.append(sos_lp)

    if not sos_parts:
        return np.zeros((0, 6)), warns

    sos = np.vstack(sos_parts)
    return sos, warns


def apply_sosfilt_rows(
    data_rows: Sequence[Sequence[float]],
    sfreq: float,
    sos: np.ndarray,
) -> list[list[float]]:
    """Apply the same SOS chain to each 1-D row (channels × samples)."""
    _require_scipy()
    if sos.shape[0] == 0:
        return [list(map(float, r)) for r in data_rows]

    out: list[list[float]] = []
    for row in data_rows:
        x = np.asarray(row, dtype=np.float64)
        y = signal.sosfilt(sos, x)  # type: ignore[union-attr]
        out.append(y.astype(np.float64).tolist())
    return out


def subtract_baseline_uv(rows: Sequence[Sequence[float]], baseline_uv: float) -> list[list[float]]:
    """Subtract a scalar baseline (µV) from every sample (global DC shift)."""
    b = float(baseline_uv)
    return [[float(v) - b for v in row] for row in rows]


def subtract_epoch_mean_rows(rows: Sequence[Sequence[float]]) -> list[list[float]]:
    """Remove per-channel DC by subtracting the epoch mean (baseline correction)."""
    out: list[list[float]] = []
    for row in rows:
        arr = np.asarray(row, dtype=np.float64)
        mu = float(arr.mean()) if arr.size else 0.0
        out.append((arr - mu).tolist())
    return out


def merge_notch_key(global_key: str, override: str | None) -> str:
    if override is None or override == "":
        return global_key
    return override


def crop_rows_to_visible(
    rows: Sequence[Sequence[float]],
    *,
    sfreq: float,
    window_t_start: float,
    vis_from: float,
    vis_to: float,
) -> list[list[float]]:
    """Crop epoch aligned to ``window_t_start`` + uniform ``sfreq`` spacing."""
    if sfreq <= 0 or not rows:
        return [list(map(float, r)) for r in rows]
    i0 = int(max(0, round((vis_from - window_t_start) * sfreq)))
    nvis = int(max(1, round((vis_to - vis_from) * sfreq)))
    out: list[list[float]] = []
    for row in rows:
        arr = np.asarray(row, dtype=np.float64)
        out.append(arr[i0 : i0 + nvis].tolist())
    return out


def decimate_rows_uniform(rows: Sequence[Sequence[float]], max_points: int) -> tuple[list[list[float]], int]:
    """Return decimated rows and integer stride (≥1)."""
    if not rows or max_points <= 0:
        return [list(map(float, r)) for r in rows], 1
    L = len(rows[0])
    if L <= max_points:
        return [list(map(float, r)) for r in rows], 1
    step = max(1, int(math.ceil(L / max_points)))
    out = [np.asarray(r, dtype=np.float64)[::step].tolist() for r in rows]
    return out, step


def apply_per_channel_iir(
    rows: Sequence[Sequence[float]],
    channel_names: Sequence[str],
    sfreq: float,
    *,
    default_low_s: float | None,
    default_high_hz: float | None,
    default_notch: str,
    overrides: dict[str, dict[str, Any]],
) -> tuple[list[list[float]], list[str]]:
    """Apply potentially different SOS chains per channel (Ctrl overrides)."""
    warns: list[str] = []
    out_rows: list[list[float]] = []
    for i, name in enumerate(channel_names):
        row = rows[i] if i < len(rows) else rows[-1]
        ov = overrides.get(name, {})
        low_s = ov.get("lowCutS", default_low_s)
        high_hz = ov.get("highCutHz", default_high_hz)
        nk = merge_notch_key(default_notch, ov.get("notch"))
        if isinstance(low_s, str):
            low_s = float(low_s)
        if isinstance(high_hz, str):
            high_hz = float(high_hz)
        sos, w = build_iir_sos_chain(
            sfreq,
            low_cut_s=float(low_s) if low_s is not None else None,
            high_cut_hz=float(high_hz) if high_hz is not None else None,
            notch_key=str(nk),
        )
        warns.extend(w)
        filtered = apply_sosfilt_rows([row], sfreq, sos)[0]
        out_rows.append(filtered)

    return out_rows, warns
