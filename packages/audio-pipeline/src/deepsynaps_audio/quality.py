"""Telehealth-grade quality control for incoming voice recordings."""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from .schemas import QCReport, QCVerdict, Recording

logger = logging.getLogger(__name__)


def compute_qc(recording: Recording) -> QCReport:
    """Compute loudness, clipping, SNR proxy, and voiced-energy ratio.

    Uses ``pyloudnorm`` for LUFS when installed ([quality] extra); otherwise
    RMS-based loudness proxy (dBFS). Speech ratio uses frame-wise RMS vs median gate.
    """

    reasons: list[str] = []
    if recording.waveform is None or recording.n_samples == 0:
        return QCReport(
            recording_id=recording.recording_id,
            verdict="fail",
            native_sample_rate=recording.sample_rate,
            reasons=["empty_or_missing_waveform"],
        )

    x = np.asarray(recording.waveform, dtype=np.float64).ravel()
    sr = recording.sample_rate
    peak_dbfs = float(20.0 * np.log10(np.max(np.abs(x)) + 1e-12))
    clip_fraction = float(np.mean(np.abs(x) >= 0.999))

    lufs: Optional[float] = None
    try:
        import pyloudnorm as pyln

        meter = pyln.Meter(sr)
        lufs = float(meter.integrated_loudness(x.astype(np.float32)))
    except Exception:
        # RMS loudness proxy (not ITU-R BS.1770).
        rms = float(np.sqrt(np.mean(x**2)))
        lufs = float(20.0 * np.log10(rms + 1e-12))

    frame = max(1, int(0.025 * sr))
    hop = max(1, frame // 2)
    rms_frames: list[float] = []
    i = 0
    while i + frame <= len(x):
        seg = x[i : i + frame]
        rms_frames.append(float(np.sqrt(np.mean(seg**2))))
        i += hop
    if not rms_frames:
        return QCReport(
            recording_id=recording.recording_id,
            peak_dbfs=peak_dbfs,
            clip_fraction=clip_fraction,
            native_sample_rate=recording.sample_rate,
            verdict="fail",
            reasons=["audio_too_short_for_qc"],
        )
    rms_arr = np.asarray(rms_frames)
    med = float(np.median(rms_arr))
    rms_std = float(np.std(rms_arr))
    rms_mean = float(np.mean(rms_arr))
    # Modulation-based SNR: clean periodic speech has frame-to-frame variation; pure tones
    # have low std — use mean/(std+eps) to avoid false "low SNR" on sustained vowels.
    snr_db = float(20.0 * np.log10((rms_mean + 1e-12) / (rms_std + 1e-10)))
    snr_db = float(min(60.0, max(0.0, snr_db)))
    voiced = rms_arr > (med * 0.12 + 1e-12)
    speech_ratio = float(np.mean(voiced))

    verdict: QCVerdict = "pass"
    if clip_fraction > 0.001:
        verdict = "warn"
        reasons.append("clipping_detected")
    if snr_db < 15.0:
        verdict = "warn" if verdict == "pass" else verdict
        reasons.append("low_snr")
    if snr_db < 5.0:
        verdict = "fail"
        reasons.append("snr_below_minimum")
    if speech_ratio < 0.15:
        verdict = "warn" if verdict != "fail" else verdict
        reasons.append("low_speech_ratio")

    return QCReport(
        recording_id=recording.recording_id,
        lufs=lufs,
        peak_dbfs=peak_dbfs,
        clip_fraction=clip_fraction,
        snr_db=snr_db,
        speech_ratio=speech_ratio,
        native_sample_rate=recording.sample_rate,
        verdict=verdict,
        reasons=reasons,
    )


def gate(qc: QCReport) -> bool:
    """Return ``True`` iff downstream analysis should proceed."""

    return qc.verdict != "fail"
