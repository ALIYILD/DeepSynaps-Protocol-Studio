"""Respiratory / cough voice analysis — optional v2 module (smartphone-style screening).

Extracts cough- and breath-oriented acoustic features and a transparent baseline
risk score. Research / wellness use only; not a clinical diagnosis.
"""

from __future__ import annotations

import logging
import math
from typing import Literal, Union

import numpy as np

from ..schemas import (
    RespiratoryFeatures,
    RespiratoryRiskScore,
    VoiceAsset,
    VoiceSegment,
)

logger = logging.getLogger(__name__)

VoiceInput = Union[VoiceSegment, VoiceAsset]

BASELINE_RESPIRATORY_LR_VERSION = "1.0.0"
# Heuristic weights: higher cough harshness (mid band), wheeze-like narrowband ratio,
# longer coughs — push risk up; higher spectral flatness (more noise-like breath) — mild push.
BASELINE_RESPIRATORY_LR_WEIGHTS: dict[str, float] = {
    "cough_rate_per_min": 0.018,
    "mean_cough_duration_s": 0.65,
    "spectral_centroid_hz_mean": 0.00025,
    "band_energy_ratio_mid": 0.45,
    "wheeze_like_band_ratio": 0.55,
    "spectral_flatness_mean": 0.35,
    "ie_ratio_deviation": 0.4,  # abs(ie - 0.45)
    "breath_rate_norm_deviation": 0.012,  # abs(rate - 15) / 15
}
BASELINE_RESPIRATORY_LR_BIAS = -0.55

_MODEL_REGISTRY: dict[str, tuple[str, dict[str, float], float]] = {
    "baseline_respiratory_lr": (
        BASELINE_RESPIRATORY_LR_VERSION,
        BASELINE_RESPIRATORY_LR_WEIGHTS,
        BASELINE_RESPIRATORY_LR_BIAS,
    ),
}


def extract_respiration_features(
    segment: VoiceInput,
    *,
    task_type: Literal["cough", "breath", "other"] = "cough",
) -> RespiratoryFeatures:
    """Extract respiratory acoustic features from a cough, breath, or mixed clip.

    Cough path: segment impulsive events (short high-energy bursts), estimate count,
    rate, duration stats, and broadband / band-limited energy distribution.

    Breath path: estimate breath cycles from a slowly varying amplitude envelope and
    approximate inspiration vs expiration timing (heuristic split).

    Parameters
    ----------
    segment
        :class:`VoiceSegment` or :class:`VoiceAsset` with optional ``waveform``.
    task_type
        ``cough`` — impulse detection and cough-rate features (clip may hold multiple coughs).
        ``breath`` — cycle timing and I/E-style ratio from envelope modulation.
        ``other`` — full-clip spectral summary without task-specific segmentation.
    """

    notes: list[str] = []
    sr, duration_s, waveform = _resolve_waveform(segment)

    empty = RespiratoryFeatures(
        task_type=task_type,
        extraction_notes=notes + (["no_raw_audio_waveform"] if not waveform else []),
    )

    if waveform is None or len(waveform) < 8:
        notes.append("insufficient_audio")
        empty.extraction_notes = notes
        return empty

    x = np.asarray(waveform, dtype=np.float64).ravel()
    dur = float(len(x) / sr) if sr > 0 else duration_s
    dur = max(dur, 1e-6)

    # Whole-clip summary (all task types).
    frame_len = max(8, int(0.020 * sr))
    hop = max(1, int(0.010 * sr))
    rms = _frame_rms(x, frame_len, hop)
    times = (np.arange(len(rms)) * hop + frame_len // 2) / sr
    db_frames = 20.0 * np.log10(rms + 1e-12)
    peak_rms_db = float(np.max(db_frames))
    mean_rms_db = float(np.mean(db_frames))

    centroid_mean, flatness_mean = _spectral_centroid_and_flatness(x, sr, frame_len, hop)
    low_r, mid_r, high_r = _tri_band_energy_ratio(x, sr, frame_len, hop)
    wheeze_r = _wheeze_like_ratio(x, sr, frame_len, hop)

    # Defaults for cough/breath-specific fields.
    cough_count = 0
    cough_rate = 0.0
    cough_dur_mean = 0.0
    cough_dur_sd = 0.0
    cycles = 0
    insp_mean = 0.0
    exp_mean = 0.0
    ie_ratio = 0.45
    breath_rpm = 0.0

    if task_type == "cough":
        events = _segment_cough_events(rms, hop, sr, times)
        cough_count = len(events)
        cough_rate = float(cough_count / (dur / 60.0))
        if events:
            durations = [e[1] - e[0] for e in events]
            cough_dur_mean = float(np.mean(durations))
            cough_dur_sd = float(np.std(durations)) if len(durations) > 1 else 0.0
        else:
            notes.append("no_cough_impulses_detected")

    elif task_type == "breath":
        cycles, insp_mean, exp_mean, ie_ratio, breath_rpm = _estimate_breath_cycles(x, sr)
        if cycles == 0:
            notes.append("no_breath_cycles_detected")

    elif task_type == "other":
        notes.append("task_type_other_spectral_summary_only")

    return RespiratoryFeatures(
        task_type=task_type,
        cough_count=cough_count,
        cough_rate_per_min=cough_rate,
        mean_cough_duration_s=cough_dur_mean,
        cough_duration_sd_s=cough_dur_sd,
        peak_rms_db=peak_rms_db,
        mean_rms_db=mean_rms_db,
        spectral_centroid_hz_mean=centroid_mean,
        spectral_flatness_mean=flatness_mean,
        band_energy_ratio_low=low_r,
        band_energy_ratio_mid=mid_r,
        band_energy_ratio_high=high_r,
        wheeze_like_band_ratio=wheeze_r,
        breath_cycles_estimated=cycles,
        inspiration_mean_s=insp_mean,
        expiration_mean_s=exp_mean,
        ie_ratio=ie_ratio,
        breath_rate_per_min=breath_rpm,
        extraction_notes=notes,
    )


def score_respiratory_risk(
    features: RespiratoryFeatures,
    *,
    model_name: str = "baseline_respiratory_lr",
) -> RespiratoryRiskScore:
    """Map :class:`RespiratoryFeatures` to a 0–1 respiratory acoustic risk score.

    The bundled ``baseline_respiratory_lr`` uses a transparent weighted sum + logistic;
    suitable for monitoring-style dashboards (VoiceMed-inspired envelope), not diagnosis.
    """

    if model_name not in _MODEL_REGISTRY:
        logger.warning(
            "Unknown respiratory model %r; falling back to baseline_respiratory_lr",
            model_name,
        )
        model_name = "baseline_respiratory_lr"

    version, weights, bias = _MODEL_REGISTRY[model_name]
    z = bias
    drivers: list[str] = []

    def add(name: str, value: float, w: float) -> None:
        nonlocal z
        c = w * value
        z += c
        if abs(c) > 0.02:
            drivers.append(f"{name}={value:.4f}*{w:.4f}")

    add("cough_rate_per_min", features.cough_rate_per_min, weights["cough_rate_per_min"])
    add("mean_cough_duration_s", features.mean_cough_duration_s, weights["mean_cough_duration_s"])
    add(
        "spectral_centroid_hz_mean",
        features.spectral_centroid_hz_mean,
        weights["spectral_centroid_hz_mean"],
    )
    add("band_energy_ratio_mid", features.band_energy_ratio_mid, weights["band_energy_ratio_mid"])
    add("wheeze_like_band_ratio", features.wheeze_like_band_ratio, weights["wheeze_like_band_ratio"])
    add("spectral_flatness_mean", features.spectral_flatness_mean, weights["spectral_flatness_mean"])

    ie_dev = abs(float(features.ie_ratio) - 0.45)
    add("ie_ratio_deviation", ie_dev, weights["ie_ratio_deviation"])

    br_dev = abs(float(features.breath_rate_per_min) - 15.0) / 15.0
    add("breath_rate_norm_deviation", br_dev, weights["breath_rate_norm_deviation"])

    score = float(1.0 / (1.0 + math.exp(-z)))
    score = max(0.0, min(1.0, score))

    # Confidence: higher when task-specific structure was detected.
    conf = 0.55
    if features.task_type == "cough" and features.cough_count > 0:
        conf = 0.72
    elif features.task_type == "breath" and features.breath_cycles_estimated > 0:
        conf = 0.70
    elif features.task_type == "other":
        conf = 0.48

    return RespiratoryRiskScore(
        score=score,
        model_name=model_name,
        model_version=version,
        confidence=min(1.0, conf),
        drivers=sorted(drivers)[:14],
    )


# --- internals ---------------------------------------------------------


def _resolve_waveform(segment: VoiceInput) -> tuple[int, float, list[float] | None]:
    if isinstance(segment, VoiceSegment):
        sr = segment.sample_rate_hz
        wf = segment.waveform
        dur = max(0.0, segment.end_s - segment.start_s)
        if wf is not None and len(wf) > 0 and sr > 0:
            dur = len(wf) / float(sr)
        return sr, dur, wf
    sr = segment.sample_rate_hz
    wf = segment.waveform
    dur = float(segment.duration_s)
    if wf is not None and len(wf) > 0 and sr > 0:
        dur = len(wf) / float(sr)
    return sr, dur, wf


def _frame_rms(sig: np.ndarray, frame_len: int, hop: int) -> np.ndarray:
    out: list[float] = []
    n = len(sig)
    i = 0
    while i + frame_len <= n:
        frame = sig[i : i + frame_len]
        out.append(float(np.sqrt(np.mean(frame**2))))
        i += hop
    return np.asarray(out, dtype=np.float64)


def _spectral_centroid_and_flatness(
    x: np.ndarray,
    sr: int,
    frame_len: int,
    hop: int,
) -> tuple[float, float]:
    cents: list[float] = []
    flats: list[float] = []
    freqs = np.fft.rfftfreq(frame_len, d=1.0 / sr)
    n = len(x)
    i = 0
    while i + frame_len <= n:
        frame = x[i : i + frame_len] * np.hanning(frame_len)
        mag = np.abs(np.fft.rfft(frame)) + 1e-12
        centroid = float(np.sum(freqs * mag) / np.sum(mag))
        cents.append(centroid)
        geom = np.exp(np.mean(np.log(mag)))
        arith = float(np.mean(mag))
        flats.append(float(geom / arith))
        i += hop
    if not cents:
        return 0.0, 0.0
    return float(np.mean(cents)), float(np.mean(flats))


def _tri_band_energy_ratio(x: np.ndarray, sr: int, frame_len: int, hop: int) -> tuple[float, float, float]:
    """Relative band energies: low 0–500 Hz, mid 500–2000 Hz, high 2–8 kHz (speech/airway bands)."""

    n = len(x)
    i = 0
    el, em, eh, et = 0.0, 0.0, 0.0, 0.0
    while i + frame_len <= n:
        frame = x[i : i + frame_len] * np.hanning(frame_len)
        mag = np.abs(np.fft.rfft(frame)) ** 2 + 1e-18
        freqs = np.fft.rfftfreq(frame_len, d=1.0 / sr)
        low = float(np.sum(mag[freqs <= 500.0]))
        mid = float(np.sum(mag[(freqs > 500.0) & (freqs <= 2000.0)]))
        high = float(np.sum(mag[(freqs > 2000.0) & (freqs <= 8000.0)]))
        el += low
        em += mid
        eh += high
        et += low + mid + high
        i += hop
    if et <= 0:
        return 0.33, 0.33, 0.34
    return el / et, em / et, eh / et


def _wheeze_like_ratio(x: np.ndarray, sr: int, frame_len: int, hop: int) -> float:
    """Mid-band (300–1200 Hz) peakiness vs broadband — coarse wheeze-like cue."""

    n = len(x)
    ratios: list[float] = []
    i = 0
    freqs = np.fft.rfftfreq(frame_len, d=1.0 / sr)
    mid_mask = (freqs >= 300.0) & (freqs <= 1200.0)
    broad_mask = (freqs >= 100.0) & (freqs <= 4000.0)
    while i + frame_len <= n:
        frame = x[i : i + frame_len] * np.hanning(frame_len)
        mag = np.abs(np.fft.rfft(frame)) + 1e-12
        mid_e = float(np.sum(mag[mid_mask] ** 2))
        broad_e = float(np.sum(mag[broad_mask] ** 2))
        ratios.append(mid_e / (broad_e + 1e-12))
        i += hop
    if not ratios:
        return 0.0
    return float(np.mean(ratios))


def _segment_cough_events(
    rms: np.ndarray,
    hop: int,
    sr: int,
    times: np.ndarray,
) -> list[tuple[float, float]]:
    """Segment short impulsive cough-like bursts using RMS envelope."""

    if len(rms) < 4:
        return []
    env_db = 20.0 * np.log10(rms + 1e-12)
    med = float(np.median(env_db))
    mad = float(np.median(np.abs(env_db - med))) + 1e-9
    thresh = med + 4.5 * mad
    above = env_db > thresh
    runs = _bool_runs(above)
    events: list[tuple[float, float]] = []
    frame_dur = hop / sr
    min_dur = 0.05
    max_dur = 0.65
    min_sep = int(0.12 / frame_dur)

    for start_idx, end_idx in runs:
        dur_s = (end_idx - start_idx + 1) * frame_dur
        if dur_s < min_dur or dur_s > max_dur:
            continue
        t0 = float(times[max(0, start_idx)])
        t1 = float(times[min(len(times) - 1, end_idx)])
        events.append((t0, t1))

    # Merge events closer than min_sep frames.
    merged: list[tuple[float, float]] = []
    for e in sorted(events, key=lambda x: x[0]):
        if not merged:
            merged.append(e)
            continue
        prev = merged[-1]
        if e[0] - prev[1] < min_sep * frame_dur:
            merged[-1] = (prev[0], max(prev[1], e[1]))
        else:
            merged.append(e)
    return merged


def _bool_runs(mask: np.ndarray) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    i = 0
    n = len(mask)
    while i < n:
        if not mask[i]:
            i += 1
            continue
        j = i
        while j < n and mask[j]:
            j += 1
        runs.append((i, j - 1))
        i = j
    return runs


def _estimate_breath_cycles(x: np.ndarray, sr: int) -> tuple[int, float, float, float, float]:
    """Estimate breath cycles from a slowly varying amplitude envelope."""

    # Heavy smoothing to emphasise slow respiratory modulation.
    win = max(int(0.35 * sr), 8)
    env = _moving_average(np.abs(x), win)
    env = _moving_average(env, win // 2 or 1)
    if len(env) < win * 2:
        return 0, 0.0, 0.0, 0.45, 0.0

    # Downsample envelope for peak finding (~40 Hz).
    ds = max(1, sr // 40)
    env_ds = env[::ds]
    t_ds = np.arange(len(env_ds)) * (ds / sr)

    env_ds = env_ds - float(np.min(env_ds))
    mx = float(np.max(env_ds)) + 1e-12
    env_ds = env_ds / mx

    try:
        from scipy.signal import find_peaks

        peaks, _ = find_peaks(env_ds, distance=max(1, int(0.8 * 40 / ds)), prominence=0.08, width=2)
    except Exception:
        peaks = np.array(
            [i for i in range(1, len(env_ds) - 1) if env_ds[i] > env_ds[i - 1] and env_ds[i] > env_ds[i + 1]],
            dtype=int,
        )

    if len(peaks) < 2:
        # Single broad modulation: treat as one incomplete cycle.
        dur_total = len(x) / sr
        return 1, dur_total * 0.4, dur_total * 0.6, 0.4 / max(dur_total, 1e-6), 60.0 / max(dur_total, 1e-6)

    periods = np.diff(peaks) * (ds / sr)
    period_mean = float(np.mean(periods)) if len(periods) else float(len(x) / sr)
    breath_rpm = float(60.0 / max(period_mean, 1e-6))
    cycles = len(peaks)

    insp_sum = 0.0
    exp_sum = 0.0
    n_pairs = 0
    for k in range(len(peaks) - 1):
        seg = env_ds[peaks[k] : peaks[k + 1] + 1]
        if len(seg) < 4:
            continue
        idx_max = int(np.argmax(seg))
        frac_insp = idx_max / max(len(seg) - 1, 1)
        dur = (peaks[k + 1] - peaks[k]) * (ds / sr)
        insp_sum += frac_insp * dur
        exp_sum += (1.0 - frac_insp) * dur
        n_pairs += 1

    if n_pairs == 0:
        return cycles, 0.0, 0.0, 0.45, breath_rpm

    insp_mean = insp_sum / n_pairs
    exp_mean = exp_sum / n_pairs
    tot = insp_mean + exp_mean + 1e-9
    ie = insp_mean / tot
    return cycles, insp_mean, exp_mean, ie, breath_rpm


def _moving_average(a: np.ndarray, win: int) -> np.ndarray:
    if win <= 1:
        return a
    kernel = np.ones(win, dtype=np.float64) / win
    return np.convolve(a, kernel, mode="same")
