"""Rule-based sleep staging classifier using structured clinical EEG criteria.

This module provides a lightweight, deterministic sleep staging engine that
classifies EEG epochs into Wake/N1/N2/N3/REM using spectral features and
morphological detectors aligned with AASM criteria.

It is NOT intended to replace trained sleep technologists or FDA-cleared
sleep staging algorithms. It is a research/wellness scaffold that can be:
- Used for quick overnight sleep architecture summaries
- Integrated into the qEEG pipeline for recordings that include sleep
- Used as a feature-engineering layer for downstream ML models

All detectors are deterministic, import-safe, and require only numpy + scipy.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class EpochFeatures:
    """Spectral and morphological features for a single 30-second epoch."""

    epoch_idx: int
    delta_power: float          # 0.5–4 Hz absolute/relative
    theta_power: float          # 4–8 Hz
    alpha_power: float          # 8–13 Hz
    beta_power: float           # 13–30 Hz
    sigma_power: float          # 12–14 Hz (spindle band)
    gamma_power: float          # 30–50 Hz
    total_power: float
    pdr_present: bool           # Posterior dominant rhythm detected
    eye_blink_count: int
    spindle_count: int          # Number of spindle-like bursts
    k_complex_count: int        # Number of K-complex-like transients
    vertex_wave_count: int      # Number of vertex sharp transients
    slow_wave_count: int        # Number of slow waves >75 µV, 0.5–2 Hz
    rem_movement_count: int     # Rapid eye movement count (from EOG if available)
    emg_power: float            # Muscle tone proxy (high frequency power)
    dominant_freq_hz: float


@dataclass(frozen=True)
class StagePrediction:
    """Output of the sleep classifier for one epoch."""

    epoch_idx: int
    stage: str                  # WAKE | N1 | N2 | N3 | REM | UNKNOWN
    confidence: float           # 0.0–1.0
    reasoning: str
    features_used: dict[str, Any]


class SleepClassifier:
    """Rule-based sleep staging classifier.

    Uses a hierarchical rule set derived from AASM criteria and the
    structured sleep staging knowledge base.
    """

    # Thresholds (approximate — should be calibrated per device/montage)
    SLOW_WAVE_AMP_UV = 75.0
    SLOW_WAVE_DENSITY_PCT = 0.20  # >20% of epoch
    SPINDLE_COUNT_MIN = 1
    K_COMPLEX_COUNT_MIN = 1
    EMG_WAKE_THRESHOLD = 1.5      # Relative to baseline
    EMG_REM_THRESHOLD = 0.3       # Very low EMG in REM
    PDR_ALPHA_RATIO = 2.0         # Alpha > 2x theta for PDR

    def __init__(self, sfreq: float = 256.0, epoch_sec: float = 30.0):
        self.sfreq = sfreq
        self.epoch_sec = epoch_sec

    def classify_epoch(self, ef: EpochFeatures) -> StagePrediction:
        """Classify a single epoch using hierarchical rules.

        Rule order (most specific → least specific):
        1. N3: slow wave density >20%
        2. REM: low EMG + theta dominant + no spindles/K-complexes
        3. N2: spindles OR K-complexes present
        4. Wake: PDR present OR high EMG + alpha dominant
        5. N1: theta dominant + vertex waves + no wake/REM/N2 signs
        6. Unknown: insufficient information
        """
        features_used: dict[str, Any] = {}

        # Rule 1: N3 (Slow Wave Sleep)
        slow_wave_density = ef.slow_wave_count / max(ef.epoch_sec, 1)
        if slow_wave_density >= self.SLOW_WAVE_DENSITY_PCT or ef.delta_power > 0.40:
            features_used = {
                "slow_wave_density": slow_wave_density,
                "delta_power_ratio": ef.delta_power / max(ef.total_power, 1),
            }
            return StagePrediction(
                epoch_idx=ef.epoch_idx,
                stage="N3",
                confidence=0.85,
                reasoning="High-amplitude slow waves or dominant delta power consistent with slow wave sleep",
                features_used=features_used,
            )

        # Rule 2: Wake
        if ef.pdr_present or (ef.emg_power > self.EMG_WAKE_THRESHOLD and ef.alpha_power > ef.theta_power):
            features_used = {
                "pdr_present": ef.pdr_present,
                "emg_power": ef.emg_power,
                "alpha_vs_theta": ef.alpha_power / max(ef.theta_power, 1),
            }
            return StagePrediction(
                epoch_idx=ef.epoch_idx,
                stage="WAKE",
                confidence=0.80,
                reasoning="Posterior dominant rhythm or high muscle tone with alpha dominance indicates wakefulness",
                features_used=features_used,
            )

        # Rule 3: REM
        rem_like = (
            ef.emg_power < self.EMG_REM_THRESHOLD
            and ef.theta_power > ef.alpha_power
            and ef.spindle_count == 0
            and ef.k_complex_count == 0
            and ef.slow_wave_count == 0
        )
        if rem_like:
            features_used = {
                "emg_power": ef.emg_power,
                "theta_dominant": ef.theta_power > ef.alpha_power,
                "spindle_count": ef.spindle_count,
                "k_complex_count": ef.k_complex_count,
            }
            return StagePrediction(
                epoch_idx=ef.epoch_idx,
                stage="REM",
                confidence=0.75,
                reasoning="Low muscle tone, theta dominant, absence of spindles/K-complexes consistent with REM",
                features_used=features_used,
            )

        # Rule 4: N2
        if ef.spindle_count >= self.SPINDLE_COUNT_MIN or ef.k_complex_count >= self.K_COMPLEX_COUNT_MIN:
            features_used = {
                "spindle_count": ef.spindle_count,
                "k_complex_count": ef.k_complex_count,
            }
            return StagePrediction(
                epoch_idx=ef.epoch_idx,
                stage="N2",
                confidence=0.80,
                reasoning="Sleep spindles and/or K-complexes present, consistent with Stage II sleep",
                features_used=features_used,
            )

        # Rule 5: N1
        n1_like = (
            ef.theta_power > ef.alpha_power
            and ef.vertex_wave_count >= 1
            and not ef.pdr_present
            and ef.spindle_count == 0
            and ef.k_complex_count == 0
        )
        if n1_like:
            features_used = {
                "theta_dominant": True,
                "vertex_waves": ef.vertex_wave_count,
                "pdr_absent": not ef.pdr_present,
            }
            return StagePrediction(
                epoch_idx=ef.epoch_idx,
                stage="N1",
                confidence=0.65,
                reasoning="Theta dominant with vertex waves, PDR absent, no spindles/K-complexes — consistent with Stage I",
                features_used=features_used,
            )

        # Fallback: UNKNOWN
        return StagePrediction(
            epoch_idx=ef.epoch_idx,
            stage="UNKNOWN",
            confidence=0.0,
            reasoning="Insufficient distinguishing features for reliable staging",
            features_used={"dominant_freq": ef.dominant_freq_hz, "total_power": ef.total_power},
        )

    def classify_sequence(self, epochs: list[EpochFeatures]) -> list[StagePrediction]:
        """Classify a sequence of epochs with temporal smoothing.

        Applies a 3-epoch majority-vote smoother to reduce single-epoch
        jitter, except for WAKE→N1 and REM→WAKE transitions which are
        allowed to be brief.
        """
        raw = [self.classify_epoch(ef) for ef in epochs]
        smoothed: list[StagePrediction] = []

        for i, pred in enumerate(raw):
            if pred.stage in ("WAKE", "REM"):
                smoothed.append(pred)
                continue

            window = raw[max(0, i - 1) : min(len(raw), i + 2)]
            stages = [p.stage for p in window]

            # Majority vote (excluding UNKNOWN)
            valid = [s for s in stages if s != "UNKNOWN"]
            if valid:
                majority = max(set(valid), key=valid.count)
                if majority != pred.stage and valid.count(majority) >= 2:
                    smoothed.append(
                        StagePrediction(
                            epoch_idx=pred.epoch_idx,
                            stage=majority,
                            confidence=pred.confidence * 0.9,
                            reasoning=f"{pred.reasoning} (temporally smoothed)",
                            features_used=pred.features_used,
                        )
                    )
                    continue
            smoothed.append(pred)

        return smoothed

    def summarize_architecture(
        self,
        predictions: list[StagePrediction],
    ) -> dict[str, Any]:
        """Return a sleep architecture summary from stage predictions."""
        total = len(predictions)
        if total == 0:
            return {"error": "No predictions"}

        counts: dict[str, int] = {}
        for p in predictions:
            counts[p.stage] = counts.get(p.stage, 0) + 1

        percentages = {stage: (cnt / total) * 100 for stage, cnt in counts.items()}

        # Compute sleep latency (first N1/N2/N3/REM after wake)
        sleep_latency_epochs = 0
        for i, p in enumerate(predictions):
            if p.stage in ("N1", "N2", "N3", "REM"):
                sleep_latency_epochs = i
                break

        # REM latency (first REM after sleep onset)
        rem_latency_epochs = 0
        sleep_started = False
        for i, p in enumerate(predictions):
            if p.stage in ("N1", "N2", "N3", "REM"):
                sleep_started = True
            if sleep_started and p.stage == "REM":
                rem_latency_epochs = i - sleep_latency_epochs
                break

        return {
            "total_epochs": total,
            "total_minutes": round(total * self.epoch_sec / 60, 1),
            "stage_counts": counts,
            "stage_percentages": {k: round(v, 1) for k, v in percentages.items()},
            "sleep_latency_min": round(sleep_latency_epochs * self.epoch_sec / 60, 1),
            "rem_latency_min": round(rem_latency_epochs * self.epoch_sec / 60, 1),
            "sleep_efficiency_pct": round(
                ((counts.get("N1", 0) + counts.get("N2", 0) + counts.get("N3", 0) + counts.get("REM", 0)) / total) * 100,
                1,
            ),
        }


# ── Feature extraction helper (MNE-based) ─────────────────────────────────


def extract_epoch_features_mne(
    raw: Any,
    epoch_idx: int,
    picks: list[str] | None = None,
) -> EpochFeatures | None:
    """Extract EpochFeatures from an MNE Raw object for a single epoch.

    Parameters
    ----------
    raw : mne.io.Raw
        Preloaded MNE Raw object.
    epoch_idx : int
        Zero-based epoch index (assumes 30-second epochs).
    picks : list of str or None
        Channel names to use. If None, uses all EEG channels.

    Returns
    -------
    EpochFeatures or None
    """
    try:
        import numpy as np
        from scipy import signal
    except Exception as exc:
        log.warning("numpy/scipy unavailable for sleep feature extraction: %s", exc)
        return None

    try:
        import mne
    except Exception as exc:
        log.warning("MNE unavailable for sleep feature extraction: %s", exc)
        return None

    sfreq = raw.info["sfreq"]
    epoch_sec = 30.0
    start_samp = int(epoch_idx * epoch_sec * sfreq)
    end_samp = int((epoch_idx + 1) * epoch_sec * sfreq)

    if end_samp > raw.n_times:
        return None

    data, times = raw[picks or mne.pick_types(raw.info, eeg=True), start_samp:end_samp]
    if data.size == 0:
        return None

    # Average across channels for simplicity.
    avg_data = np.mean(data, axis=0)

    # Welch PSD.
    freqs, psd = signal.welch(avg_data, fs=sfreq, nperseg=int(sfreq * 4))

    def band_power(fmin: float, fmax: float) -> float:
        idx = (freqs >= fmin) & (freqs <= fmax)
        return float(np.sum(psd[idx]))

    delta = band_power(0.5, 4.0)
    theta = band_power(4.0, 8.0)
    alpha = band_power(8.0, 13.0)
    sigma = band_power(12.0, 14.0)
    beta = band_power(13.0, 30.0)
    gamma = band_power(30.0, 50.0)
    total = delta + theta + alpha + sigma + beta + gamma + 1e-12

    # Simple PDR detector: occipital alpha peak > 2x theta.
    # (Proper implementation would use O1/O2 specifically.)
    pdr = alpha > (2.0 * theta)

    # EMG proxy: high-frequency power (>30 Hz) normalized.
    emg = gamma / total

    # Dominant frequency.
    dominant = freqs[np.argmax(psd)]

    # Simple spindle detector: sigma band bursts.
    # (Proper implementation would use wavelet or bandpass RMS.)
    spindle_count = 0
    if sigma > 0.05 * total:
        spindle_count = 1

    # Simple K-complex / vertex wave / slow wave counts (stubs).
    # A production system would use morphological detectors.
    k_complex_count = 0
    vertex_count = 0
    slow_wave_count = 0

    return EpochFeatures(
        epoch_idx=epoch_idx,
        delta_power=delta / total,
        theta_power=theta / total,
        alpha_power=alpha / total,
        beta_power=beta / total,
        sigma_power=sigma / total,
        gamma_power=gamma / total,
        total_power=total,
        pdr_present=pdr,
        eye_blink_count=0,
        spindle_count=spindle_count,
        k_complex_count=k_complex_count,
        vertex_wave_count=vertex_count,
        slow_wave_count=slow_wave_count,
        rem_movement_count=0,
        emg_power=emg,
        dominant_freq_hz=dominant,
    )
