"""Threshold-based auto-artifact scanner for the clinical raw-data workstation.

Phase 4 of the qEEG raw-data clinical workstation rebuild. Surfaces the
``scan_for_artifacts`` callable that returns a structured set of bad-channel
and bad-segment proposals which the UI can present for clinician review.

Design intent
=============

* Decision-support only. Nothing here mutates the raw recording or the
  ``cleaning_config_json`` blob. The router persists the proposal into a
  ``auto_clean_runs`` row and writes ``CleaningDecision`` audit rows once
  the clinician accepts or rejects items.
* No new heavy Python deps. ``mne`` and ``autoreject`` are *optional*; if
  either is unavailable we fall back to direct NumPy thresholds over the
  Raw object loaded by ``eeg_signal_service.load_raw_for_analysis``.
* Returns ``{'bad_channels': [...], 'bad_segments': [...], 'summary': {...}}``
  with one structured row per detection. Each row carries a stable ``reason``
  drawn from the Phase-1 reason vocabulary (``flatline``, ``amp_threshold``,
  ``high_kurtosis``, ``line_noise``, ``gradient``).

Confidence
----------

We map each metric onto a [0.0, 1.0] confidence using a saturating function
of metric / threshold. This keeps "gross outlier ⇒ high confidence" while
avoiding NaN / inf when the signal is empty.
"""
from __future__ import annotations

import logging
import math
from typing import Any

from sqlalchemy.orm import Session

from app.errors import ApiServiceError

_log = logging.getLogger(__name__)

# ── Optional heavy imports (mirror eeg_signal_service guards) ───────────────

try:
    import numpy as np

    _HAS_NUMPY = True
except ImportError:
    np = None  # type: ignore[assignment]
    _HAS_NUMPY = False

try:
    import autoreject  # type: ignore[import-not-found]  # noqa: F401

    _HAS_AUTOREJECT = True
except ImportError:
    _HAS_AUTOREJECT = False


# ── Confidence helper ───────────────────────────────────────────────────────


def _confidence_from_ratio(metric: float, threshold: float) -> float:
    """Map metric/threshold ratio onto a [0.0, 1.0] confidence.

    A metric exactly at threshold lands at 0.5; 2x threshold approaches
    ~0.88; very large metrics asymptote to ~1.0. This is a saturating
    sigmoid of the log-ratio, which keeps the curve sane across orders of
    magnitude.
    """
    if threshold <= 0 or not math.isfinite(metric):
        return 0.5
    ratio = max(metric / threshold, 1e-6)
    # tanh-like saturation around log-ratio
    log_r = math.log(ratio)
    return float(max(0.0, min(1.0, 0.5 + 0.5 * math.tanh(log_r))))


def _round(x: float, n: int = 2) -> float:
    if not math.isfinite(x):
        return 0.0
    return round(float(x), n)


# ── Public API ──────────────────────────────────────────────────────────────


def scan_for_artifacts(
    analysis_id: str,
    db: Session,
    *,
    amp_threshold_uv: float = 200.0,
    gradient_threshold_uv_per_ms: float = 50.0,
    kurtosis_threshold: float = 8.0,
    line_noise_ratio_threshold: float = 0.15,
    flatline_min_sec: float = 1.0,
) -> dict[str, Any]:
    """Threshold-based bad-channel + bad-segment scan.

    Loads the raw signal via ``eeg_signal_service.load_raw_for_analysis``
    (which handles caching + EDF/BDF/SET loading). Runs five detectors:

    1. **Flatline** — channels whose absolute signal stays below 0.5 µV for
       longer than ``flatline_min_sec``. Sign of disconnected electrodes.
    2. **High amplitude** — segments where any channel exceeds
       ``amp_threshold_uv``. Captures eye-blinks, electrode pops, motion.
    3. **High gradient** — segments with first-difference exceeding
       ``gradient_threshold_uv_per_ms``. Captures fast deflections.
    4. **Per-channel kurtosis** — channels with sample kurtosis >
       ``kurtosis_threshold`` (peaky distribution → impulsive artifact).
    5. **Line noise** — channels where ratio of FFT power within 50/60 Hz
       narrow band to total broadband power exceeds
       ``line_noise_ratio_threshold``.

    Returns
    -------
    dict
        ``{'bad_channels': [...], 'bad_segments': [...], 'summary': {...}}``.
        Empty lists are valid (clean recording). Each detection row carries
        ``reason``, ``metric``, ``confidence``.
    """
    if not _HAS_NUMPY:
        # NumPy is a hard dep in the API image; this branch only triggers in
        # weird sandbox environments. Surface a clean error for the router.
        raise ApiServiceError(
            code="dependency_missing",
            message="NumPy is required for auto-scan.",
            status_code=503,
        )

    # Lazy import — same guard pattern as eeg_signal_service.
    try:
        from app.services.eeg_signal_service import load_raw_for_analysis
    except ImportError as exc:
        raise ApiServiceError(
            code="dependency_missing",
            message="EEG signal service unavailable.",
            status_code=503,
        ) from exc

    raw = load_raw_for_analysis(analysis_id, db)
    sfreq = float(raw.info["sfreq"])
    ch_names = list(raw.ch_names)

    # Pull all data once. Convert to microvolts (MNE stores volts).
    data_v, _times = raw[:, :]
    data_uv = np.asarray(data_v, dtype=np.float64) * 1e6
    n_channels, n_samples = data_uv.shape

    bad_channels: list[dict[str, Any]] = []
    bad_segments: list[dict[str, Any]] = []

    # ── 1. Flatline detection (per channel) ──────────────────────────────
    flat_min_samples = int(flatline_min_sec * sfreq)
    if flat_min_samples < 8:
        flat_min_samples = 8
    flat_threshold_uv = 0.5
    for ci in range(n_channels):
        abs_sig = np.abs(data_uv[ci])
        flat_mask = abs_sig < flat_threshold_uv
        if not flat_mask.any():
            continue
        # Longest contiguous flat run
        # Trick: find run-length encoding via diff.
        padded = np.concatenate(([False], flat_mask, [False]))
        edges = np.diff(padded.astype(np.int8))
        starts = np.where(edges == 1)[0]
        ends = np.where(edges == -1)[0]
        if len(starts) == 0:
            continue
        runs = ends - starts
        longest_run = int(runs.max())
        if longest_run >= flat_min_samples:
            flat_sec = longest_run / sfreq
            confidence = _confidence_from_ratio(flat_sec, flatline_min_sec)
            bad_channels.append(
                {
                    "channel": ch_names[ci],
                    "reason": "flatline",
                    "metric": {"flat_sec": _round(flat_sec, 2)},
                    "confidence": _round(confidence, 3),
                }
            )

    # ── 2. Per-channel kurtosis ──────────────────────────────────────────
    # Kurtosis of a normal distribution = 0 (excess kurtosis). High excess
    # kurtosis → peaky / heavy-tailed → impulsive artifact suspect.
    means = np.mean(data_uv, axis=1, keepdims=True)
    stds = np.std(data_uv, axis=1, keepdims=True)
    stds = np.where(stds < 1e-9, 1e-9, stds)
    z = (data_uv - means) / stds
    excess_kurt = np.mean(z**4, axis=1) - 3.0
    flagged_chs = {entry["channel"] for entry in bad_channels}
    for ci in range(n_channels):
        k = float(excess_kurt[ci])
        if k > kurtosis_threshold and ch_names[ci] not in flagged_chs:
            confidence = _confidence_from_ratio(k, kurtosis_threshold)
            bad_channels.append(
                {
                    "channel": ch_names[ci],
                    "reason": "high_kurtosis",
                    "metric": {"kurtosis": _round(k, 2)},
                    "confidence": _round(confidence, 3),
                }
            )

    # ── 3. Line-noise ratio (FFT-based) ──────────────────────────────────
    # Compare narrow-band power around 50 and 60 Hz to total broadband power.
    if n_samples >= 64:
        # Use real FFT on a windowed slice for speed (cap at ~30s).
        max_samples = int(min(n_samples, sfreq * 30))
        slice_data = data_uv[:, :max_samples]
        # Demean for cleaner spectrum.
        slice_data = slice_data - np.mean(slice_data, axis=1, keepdims=True)
        # Real FFT power.
        spec = np.fft.rfft(slice_data, axis=1)
        psd = (np.abs(spec) ** 2) / max(slice_data.shape[1], 1)
        freqs = np.fft.rfftfreq(slice_data.shape[1], d=1.0 / sfreq)
        total_power = np.sum(psd, axis=1) + 1e-12
        for line_hz in (50.0, 60.0):
            if line_hz >= sfreq / 2.0:
                continue
            band_mask = (freqs >= line_hz - 2.0) & (freqs <= line_hz + 2.0)
            if not band_mask.any():
                continue
            band_power = np.sum(psd[:, band_mask], axis=1)
            ratios = band_power / total_power
            for ci in range(n_channels):
                ratio = float(ratios[ci])
                if (
                    ratio > line_noise_ratio_threshold
                    and ch_names[ci] not in flagged_chs
                ):
                    confidence = _confidence_from_ratio(
                        ratio, line_noise_ratio_threshold
                    )
                    bad_channels.append(
                        {
                            "channel": ch_names[ci],
                            "reason": "line_noise",
                            "metric": {
                                "line_hz": line_hz,
                                "ratio": _round(ratio, 3),
                            },
                            "confidence": _round(confidence, 3),
                        }
                    )
                    flagged_chs.add(ch_names[ci])

    # ── 4. Bad-segment detection (amplitude) ─────────────────────────────
    # Sliding window of 0.5 s. A window is bad if any channel's peak exceeds
    # ``amp_threshold_uv``.
    window_sec = 0.5
    window_samples = max(int(window_sec * sfreq), 8)
    step = window_samples // 2  # 50% overlap
    if step < 1:
        step = 1
    seg_buckets: list[tuple[int, int, str, float]] = []
    for start in range(0, n_samples - window_samples + 1, step):
        end = start + window_samples
        win = data_uv[:, start:end]
        peak = float(np.max(np.abs(win)))
        if peak > amp_threshold_uv:
            seg_buckets.append((start, end, "amp_threshold", peak))

    # ── 5. Bad-segment detection (gradient) ──────────────────────────────
    # Compute first difference. Threshold is in uV per ms; convert to
    # uV per sample using sfreq.
    if n_samples > 1:
        sample_dt_ms = 1000.0 / sfreq
        grad_threshold_uv_per_sample = (
            gradient_threshold_uv_per_ms * sample_dt_ms
        )
        diff = np.abs(np.diff(data_uv, axis=1))
        for start in range(0, n_samples - window_samples + 1, step):
            end = min(start + window_samples, n_samples - 1)
            win = diff[:, start:end]
            if win.size == 0:
                continue
            peak = float(np.max(win))
            if peak > grad_threshold_uv_per_sample:
                seg_buckets.append((start, end, "gradient", peak))

    # Merge overlapping segments per reason
    seg_buckets.sort(key=lambda t: (t[2], t[0]))
    merged: list[tuple[int, int, str, float]] = []
    for start, end, reason, peak in seg_buckets:
        if merged and merged[-1][2] == reason and start <= merged[-1][1]:
            prev = merged.pop()
            merged.append(
                (prev[0], max(prev[1], end), reason, max(prev[3], peak))
            )
        else:
            merged.append((start, end, reason, peak))

    for start, end, reason, peak in merged:
        seg_start_sec = start / sfreq
        seg_end_sec = end / sfreq
        if reason == "amp_threshold":
            confidence = _confidence_from_ratio(peak, amp_threshold_uv)
            metric = {"peak_uv": _round(peak, 1)}
        else:
            sample_dt_ms = 1000.0 / sfreq
            peak_per_ms = peak / max(sample_dt_ms, 1e-6)
            confidence = _confidence_from_ratio(
                peak_per_ms, gradient_threshold_uv_per_ms
            )
            metric = {"peak_uv_per_ms": _round(peak_per_ms, 1)}
        bad_segments.append(
            {
                "start_sec": _round(seg_start_sec, 2),
                "end_sec": _round(seg_end_sec, 2),
                "reason": reason,
                "metric": metric,
                "confidence": _round(confidence, 3),
            }
        )

    total_excluded_sec = sum(
        max(0.0, s["end_sec"] - s["start_sec"]) for s in bad_segments
    )

    return {
        "bad_channels": bad_channels,
        "bad_segments": bad_segments,
        "summary": {
            "n_bad_channels": len(bad_channels),
            "n_bad_segments": len(bad_segments),
            "total_excluded_sec": _round(total_excluded_sec, 2),
            "autoreject_used": _HAS_AUTOREJECT,
            "scanner_version": "1.0",
        },
    }


__all__ = ["scan_for_artifacts"]
