"""Acoustic biomarker extraction: F0, jitter, shimmer, HNR, MFCC, speech rate,
pause ratio, voice breaks, and CPP via Parselmouth (Praat) + librosa.

All heavy imports (parselmouth, librosa, numpy) are lazy — inside helper
functions — so this module can be imported in CPU-only test environments
without those packages installed.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public dataclasses (stdlib only — safe at module top)
# ---------------------------------------------------------------------------


@dataclass
class BiomarkerFlags:
    elevated_jitter: bool
    reduced_hnr: bool
    flat_f0_range: bool
    high_pause_ratio: bool


@dataclass
class BiomarkerResult:
    duration_sec: float

    f0_mean_hz: Optional[float]
    f0_std_hz: Optional[float]
    f0_min_hz: Optional[float]
    f0_max_hz: Optional[float]
    f0_range_hz: Optional[float]

    jitter_local: Optional[float]
    jitter_rap: Optional[float]
    jitter_ppq5: Optional[float]
    jitter_ddp: Optional[float]

    shimmer_local: Optional[float]
    shimmer_apq3: Optional[float]
    shimmer_apq5: Optional[float]
    shimmer_apq11: Optional[float]
    shimmer_dda: Optional[float]

    hnr_db: Optional[float]

    mfcc_means: List[float]
    mfcc_stds: List[float]

    speech_rate_syllables_per_sec: Optional[float]
    pause_ratio: Optional[float]
    voice_breaks_count: Optional[int]
    cpp: Optional[float]

    flags: BiomarkerFlags
    extraction_warnings: List[str]


# ---------------------------------------------------------------------------
# Helpers — each wraps its math in try/except and returns None on failure
# ---------------------------------------------------------------------------

# Pitch floor/ceiling following Praat recommendations for adult speech.
_PITCH_FLOOR_HZ = 75.0
_PITCH_CEILING_HZ = 500.0


def _load_sound(audio_path: str) -> Any:
    """Lazy-import parselmouth and return a Sound object. Seam for monkeypatching."""
    import parselmouth  # lazy import

    return parselmouth.Sound(audio_path)


def _safe_pitch_metrics(sound: Any) -> Optional[dict]:
    """Extract F0 mean, std, min, max, range using Parselmouth.

    Returns a dict with keys f0_mean_hz, f0_std_hz, f0_min_hz, f0_max_hz,
    f0_range_hz, or None on failure.
    """
    try:
        import numpy as np  # lazy import

        pitch = sound.to_pitch(
            pitch_floor=_PITCH_FLOOR_HZ, pitch_ceiling=_PITCH_CEILING_HZ
        )
        values = pitch.selected_array["frequency"]
        # Filter out unvoiced frames (value == 0)
        voiced = values[values > 0]
        if len(voiced) == 0:
            return None

        f0_mean = float(np.mean(voiced))
        f0_std = float(np.std(voiced))
        f0_min = float(np.min(voiced))
        f0_max = float(np.max(voiced))
        f0_range = f0_max - f0_min

        return {
            "f0_mean_hz": f0_mean,
            "f0_std_hz": f0_std,
            "f0_min_hz": f0_min,
            "f0_max_hz": f0_max,
            "f0_range_hz": f0_range,
        }
    except Exception as exc:
        logger.debug("_safe_pitch_metrics failed: %s", exc)
        return None


def _safe_jitter_shimmer(sound: Any) -> Optional[dict]:
    """Extract jitter and shimmer families using Parselmouth point-process.

    Uses Praat conventional defaults (min_period=0.0001 s, max_period=0.02 s,
    max_period_factor=1.3, max_amplitude_factor=1.6).
    Returns a dict or None on failure.
    """
    try:
        # Conventional Praat defaults
        MIN_PERIOD = 0.0001
        MAX_PERIOD = 0.02
        MAX_PERIOD_FACTOR = 1.3
        MAX_AMPLITUDE_FACTOR = 1.6

        point_process = sound.to_point_process_periodic_cc(
            minimum_pitch=_PITCH_FLOOR_HZ, maximum_pitch=_PITCH_CEILING_HZ
        )

        jitter_local = sound.get_jitter(
            "local",
            period_floor=MIN_PERIOD,
            period_ceiling=MAX_PERIOD,
            maximum_period_factor=MAX_PERIOD_FACTOR,
        )
        jitter_rap = sound.get_jitter(
            "rap",
            period_floor=MIN_PERIOD,
            period_ceiling=MAX_PERIOD,
            maximum_period_factor=MAX_PERIOD_FACTOR,
        )
        jitter_ppq5 = sound.get_jitter(
            "ppq5",
            period_floor=MIN_PERIOD,
            period_ceiling=MAX_PERIOD,
            maximum_period_factor=MAX_PERIOD_FACTOR,
        )
        jitter_ddp = sound.get_jitter(
            "ddp",
            period_floor=MIN_PERIOD,
            period_ceiling=MAX_PERIOD,
            maximum_period_factor=MAX_PERIOD_FACTOR,
        )

        shimmer_local = sound.get_shimmer(
            "local",
            period_floor=MIN_PERIOD,
            period_ceiling=MAX_PERIOD,
            maximum_period_factor=MAX_PERIOD_FACTOR,
            maximum_amplitude_factor=MAX_AMPLITUDE_FACTOR,
        )
        shimmer_apq3 = sound.get_shimmer(
            "apq3",
            period_floor=MIN_PERIOD,
            period_ceiling=MAX_PERIOD,
            maximum_period_factor=MAX_PERIOD_FACTOR,
            maximum_amplitude_factor=MAX_AMPLITUDE_FACTOR,
        )
        shimmer_apq5 = sound.get_shimmer(
            "apq5",
            period_floor=MIN_PERIOD,
            period_ceiling=MAX_PERIOD,
            maximum_period_factor=MAX_PERIOD_FACTOR,
            maximum_amplitude_factor=MAX_AMPLITUDE_FACTOR,
        )
        shimmer_apq11 = sound.get_shimmer(
            "apq11",
            period_floor=MIN_PERIOD,
            period_ceiling=MAX_PERIOD,
            maximum_period_factor=MAX_PERIOD_FACTOR,
            maximum_amplitude_factor=MAX_AMPLITUDE_FACTOR,
        )
        shimmer_dda = sound.get_shimmer(
            "dda",
            period_floor=MIN_PERIOD,
            period_ceiling=MAX_PERIOD,
            maximum_period_factor=MAX_PERIOD_FACTOR,
            maximum_amplitude_factor=MAX_AMPLITUDE_FACTOR,
        )

        def _safe_float(v: Any) -> Optional[float]:
            try:
                f = float(v)
                import math
                return None if math.isnan(f) else f
            except (TypeError, ValueError):
                return None

        return {
            "jitter_local": _safe_float(jitter_local),
            "jitter_rap": _safe_float(jitter_rap),
            "jitter_ppq5": _safe_float(jitter_ppq5),
            "jitter_ddp": _safe_float(jitter_ddp),
            "shimmer_local": _safe_float(shimmer_local),
            "shimmer_apq3": _safe_float(shimmer_apq3),
            "shimmer_apq5": _safe_float(shimmer_apq5),
            "shimmer_apq11": _safe_float(shimmer_apq11),
            "shimmer_dda": _safe_float(shimmer_dda),
        }
    except Exception as exc:
        logger.debug("_safe_jitter_shimmer failed: %s", exc)
        return None


def _safe_hnr(sound: Any) -> Optional[float]:
    """Extract HNR (harmonics-to-noise ratio) in dB using Parselmouth.

    Returns a float or None on failure.
    """
    try:
        import math

        harmonicity = sound.to_harmonicity()
        hnr = harmonicity.get_value(harmonicity.t1)
        if hnr is None or math.isnan(hnr):
            return None
        return float(hnr)
    except Exception as exc:
        logger.debug("_safe_hnr failed: %s", exc)
        return None


def _safe_mfcc(audio_path: str) -> Optional[tuple]:
    """Extract 13 MFCC means and 13 MFCC stds using librosa.

    Returns (means_list, stds_list) each of length 13, or None on full failure.
    On failure the caller fills in 13 zeros per list and adds a warning.
    """
    try:
        import librosa  # lazy import
        import numpy as np  # lazy import

        y, sr = librosa.load(audio_path, sr=None, mono=True)
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        means = [float(v) for v in np.mean(mfccs, axis=1)]
        stds = [float(v) for v in np.std(mfccs, axis=1)]
        return means, stds
    except Exception as exc:
        logger.debug("_safe_mfcc failed: %s", exc)
        return None


def _estimate_pause_ratio(audio_path: str) -> Optional[float]:
    """Estimate pause ratio as fraction of total duration classified as silence.

    Heuristic: uses librosa.effects.split to find non-silent intervals; silence
    is everything outside those intervals. top_db=30 is a conservative threshold
    that works well for typical speech recordings.
    """
    try:
        import librosa  # lazy import

        y, sr = librosa.load(audio_path, sr=None, mono=True)
        if len(y) == 0:
            return None

        total_samples = len(y)
        # intervals of non-silent audio
        intervals = librosa.effects.split(y, top_db=30)
        speech_samples = sum(end - start for start, end in intervals)
        pause_samples = total_samples - speech_samples
        pause_ratio = max(0.0, min(1.0, pause_samples / total_samples))
        return float(pause_ratio)
    except Exception as exc:
        logger.debug("_estimate_pause_ratio failed: %s", exc)
        return None


def _estimate_speech_rate(audio_path: str) -> Optional[float]:
    """Approximate syllable nuclei rate (syllables per second).

    APPROXIMATION — not a validated syllable detector. Counts local energy
    peaks (potential syllable nuclei) in the RMS envelope above a noise floor.
    This correlates with speech rate but under-counts in fast/coarticulated
    speech and over-counts in noisy recordings. Treat as a relative index
    rather than an absolute syllable count.
    """
    try:
        import librosa  # lazy import
        import numpy as np  # lazy import

        y, sr = librosa.load(audio_path, sr=None, mono=True)
        if len(y) == 0:
            return None

        duration_sec = len(y) / sr
        if duration_sec <= 0:
            return None

        hop_length = 512
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]

        # Noise floor: 10th percentile of RMS
        noise_floor = float(np.percentile(rms, 10))
        threshold = max(noise_floor * 3.0, 1e-5)

        # Count peaks above threshold
        peaks = 0
        in_peak = False
        for val in rms:
            if val > threshold:
                if not in_peak:
                    peaks += 1
                    in_peak = True
            else:
                in_peak = False

        return float(peaks) / duration_sec
    except Exception as exc:
        logger.debug("_estimate_speech_rate failed: %s", exc)
        return None


def _estimate_voice_breaks(sound: Any) -> Optional[int]:
    """Count voice breaks as gaps in the voiced pitch track above a minimum duration.

    Heuristic: iterate through pitch frames; a "break" is a transition from
    voiced to unvoiced that lasts at least _MIN_BREAK_SEC seconds. This is a
    conservative heuristic — very short unvoiced segments (plosive closures,
    stops) are ignored to avoid false positives.
    """
    _MIN_BREAK_SEC = 0.050  # 50 ms minimum unvoiced gap to count as a break
    try:
        pitch = sound.to_pitch(
            pitch_floor=_PITCH_FLOOR_HZ, pitch_ceiling=_PITCH_CEILING_HZ
        )
        values = pitch.selected_array["frequency"]
        times = [pitch.get_time_from_frame_number(i + 1) for i in range(len(values))]

        breaks = 0
        in_unvoiced = False
        unvoiced_start: Optional[float] = None

        for i, (t, v) in enumerate(zip(times, values)):
            voiced = v > 0
            if not voiced:
                if not in_unvoiced:
                    in_unvoiced = True
                    unvoiced_start = t
            else:
                if in_unvoiced and unvoiced_start is not None:
                    gap_dur = t - unvoiced_start
                    if gap_dur >= _MIN_BREAK_SEC:
                        breaks += 1
                in_unvoiced = False
                unvoiced_start = None

        return breaks
    except Exception as exc:
        logger.debug("_estimate_voice_breaks failed: %s", exc)
        return None


def _safe_cpp(sound: Any) -> Optional[float]:
    """Best-effort CPP (Cepstral Peak Prominence) extraction.

    CPP is theoretically computable from the cepstrum, but Parselmouth does
    not expose a direct CPP API as of v0.4.x. A fully validated implementation
    requires careful liftering and normalization that is non-trivial to
    replicate reliably without validated reference data.

    This returns None with a warning rather than a faked value.
    """
    # Best-effort: return None — do NOT fake CPP.
    # A validated implementation should use Praat's PowerCepstrogram object
    # once Parselmouth exposes it, or a standalone cepstrum pipeline with
    # proper smoothing/normalization validated against Praat's output.
    return None


# ---------------------------------------------------------------------------
# Flag construction (transparent, tunable thresholds)
# ---------------------------------------------------------------------------


def _build_flags(result: BiomarkerResult) -> BiomarkerFlags:
    """Derive binary clinical flags from metric values.

    Thresholds are literature-informed starting points; they require tuning
    with labeled data stratified by sex, age, and speaking task before being
    used for clinical decisions.
    """
    return BiomarkerFlags(
        # ~2% local jitter — TODO tune by sex/age/task
        elevated_jitter=(result.jitter_local is not None and result.jitter_local > 0.02),
        reduced_hnr=(result.hnr_db is not None and result.hnr_db < 20.0),
        flat_f0_range=(result.f0_range_hz is not None and result.f0_range_hz < 30.0),
        high_pause_ratio=(result.pause_ratio is not None and result.pause_ratio > 0.40),
    )


# ---------------------------------------------------------------------------
# Duration helper (stdlib wave, same seam as transcription.py)
# ---------------------------------------------------------------------------


def _get_audio_duration(audio_path: str) -> float:
    """Return WAV duration in seconds.

    Falls back to 0.0 if the header can't be read. Uses stdlib wave.
    """
    import wave  # stdlib

    try:
        with wave.open(audio_path, "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            if rate <= 0:
                return 0.0
            return frames / float(rate)
    except (Exception,):
        return 0.0


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def extract_biomarkers(audio_path: str) -> BiomarkerResult:
    """Extract acoustic biomarkers from a local WAV file.

    One metric's failure does NOT crash the others. Each helper is wrapped in
    a try/except inside this function; failures append a human-readable string
    to extraction_warnings and the corresponding field stays None (or a safe
    list default).

    Raises
    ------
    FileNotFoundError
        If *audio_path* does not exist on disk.
    """
    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Audio file not found: {audio_path!r}. "
            "Ensure the file has been written before running biomarker extraction."
        )

    logger.info("extract_biomarkers: start  path=%s", audio_path)
    t0 = time.monotonic()

    warnings: List[str] = []

    # Duration via stdlib — never fails to produce a value
    duration_sec = _get_audio_duration(audio_path)

    # ------------------------------------------------------------------
    # Load Parselmouth Sound (used by multiple helpers)
    # ------------------------------------------------------------------
    sound: Optional[Any] = None
    try:
        sound = _load_sound(audio_path)
    except Exception as exc:
        warnings.append(f"parselmouth Sound load failed ({exc}); Praat metrics unavailable")
        logger.warning("extract_biomarkers: _load_sound failed: %s", exc)

    # ------------------------------------------------------------------
    # §3 F0
    # ------------------------------------------------------------------
    f0_mean_hz: Optional[float] = None
    f0_std_hz: Optional[float] = None
    f0_min_hz: Optional[float] = None
    f0_max_hz: Optional[float] = None
    f0_range_hz: Optional[float] = None

    if sound is not None:
        try:
            pitch_metrics = _safe_pitch_metrics(sound)
            if pitch_metrics is not None:
                f0_mean_hz = pitch_metrics["f0_mean_hz"]
                f0_std_hz = pitch_metrics["f0_std_hz"]
                f0_min_hz = pitch_metrics["f0_min_hz"]
                f0_max_hz = pitch_metrics["f0_max_hz"]
                f0_range_hz = pitch_metrics["f0_range_hz"]
            else:
                warnings.append("f0: no voiced frames detected (silent/unvoiced audio)")
        except Exception as exc:
            warnings.append(f"f0 extraction failed ({exc})")
            logger.warning("extract_biomarkers: _safe_pitch_metrics raised: %s", exc)

    # ------------------------------------------------------------------
    # §4 Jitter / shimmer
    # ------------------------------------------------------------------
    jitter_local: Optional[float] = None
    jitter_rap: Optional[float] = None
    jitter_ppq5: Optional[float] = None
    jitter_ddp: Optional[float] = None
    shimmer_local: Optional[float] = None
    shimmer_apq3: Optional[float] = None
    shimmer_apq5: Optional[float] = None
    shimmer_apq11: Optional[float] = None
    shimmer_dda: Optional[float] = None

    if sound is not None:
        try:
            js = _safe_jitter_shimmer(sound)
            if js is not None:
                jitter_local = js["jitter_local"]
                jitter_rap = js["jitter_rap"]
                jitter_ppq5 = js["jitter_ppq5"]
                jitter_ddp = js["jitter_ddp"]
                shimmer_local = js["shimmer_local"]
                shimmer_apq3 = js["shimmer_apq3"]
                shimmer_apq5 = js["shimmer_apq5"]
                shimmer_apq11 = js["shimmer_apq11"]
                shimmer_dda = js["shimmer_dda"]
            else:
                warnings.append("jitter/shimmer: extraction returned None (silent/unvoiced audio)")
        except Exception as exc:
            warnings.append(f"jitter/shimmer extraction failed ({exc})")
            logger.warning("extract_biomarkers: _safe_jitter_shimmer raised: %s", exc)

    # ------------------------------------------------------------------
    # §5 HNR
    # ------------------------------------------------------------------
    hnr_db: Optional[float] = None

    if sound is not None:
        try:
            hnr_db = _safe_hnr(sound)
            if hnr_db is None:
                warnings.append("hnr: extraction returned None (silent/unvoiced audio)")
        except Exception as exc:
            warnings.append(f"hnr extraction failed ({exc})")
            logger.warning("extract_biomarkers: _safe_hnr raised: %s", exc)

    # ------------------------------------------------------------------
    # §6 MFCC (librosa)
    # ------------------------------------------------------------------
    _MFCC_N = 13
    mfcc_means: List[float] = []
    mfcc_stds: List[float] = []

    try:
        mfcc_result = _safe_mfcc(audio_path)
        if mfcc_result is not None:
            mfcc_means, mfcc_stds = mfcc_result
        else:
            mfcc_means = [0.0] * _MFCC_N
            mfcc_stds = [0.0] * _MFCC_N
            warnings.append("mfcc: extraction failed; filled with zeros")
    except Exception as exc:
        mfcc_means = [0.0] * _MFCC_N
        mfcc_stds = [0.0] * _MFCC_N
        warnings.append(f"mfcc extraction failed ({exc}); filled with zeros")
        logger.warning("extract_biomarkers: _safe_mfcc raised: %s", exc)

    # ------------------------------------------------------------------
    # §7 Speech rate / pause ratio (librosa)
    # ------------------------------------------------------------------
    speech_rate_syllables_per_sec: Optional[float] = None
    pause_ratio: Optional[float] = None

    try:
        pause_ratio = _estimate_pause_ratio(audio_path)
        if pause_ratio is None:
            warnings.append("pause_ratio: estimation failed")
    except Exception as exc:
        warnings.append(f"pause_ratio estimation failed ({exc})")
        logger.warning("extract_biomarkers: _estimate_pause_ratio raised: %s", exc)

    try:
        speech_rate_syllables_per_sec = _estimate_speech_rate(audio_path)
        if speech_rate_syllables_per_sec is None:
            warnings.append("speech_rate: estimation failed")
    except Exception as exc:
        warnings.append(f"speech_rate estimation failed ({exc})")
        logger.warning("extract_biomarkers: _estimate_speech_rate raised: %s", exc)

    # ------------------------------------------------------------------
    # §8 Voice breaks (Parselmouth)
    # ------------------------------------------------------------------
    voice_breaks_count: Optional[int] = None

    if sound is not None:
        try:
            voice_breaks_count = _estimate_voice_breaks(sound)
            if voice_breaks_count is None:
                warnings.append("voice_breaks: estimation failed")
        except Exception as exc:
            warnings.append(f"voice_breaks estimation failed ({exc})")
            logger.warning("extract_biomarkers: _estimate_voice_breaks raised: %s", exc)

    # ------------------------------------------------------------------
    # §9 CPP — best-effort; returns None + warning (no faking)
    # ------------------------------------------------------------------
    cpp: Optional[float] = None

    if sound is not None:
        try:
            cpp = _safe_cpp(sound)
            if cpp is None:
                warnings.append(
                    "cpp: not computed — Parselmouth v0.4.x does not expose "
                    "PowerCepstrogram; CPP requires a validated standalone "
                    "implementation (left as None, not faked)"
                )
        except Exception as exc:
            warnings.append(f"cpp extraction failed ({exc})")
            logger.warning("extract_biomarkers: _safe_cpp raised: %s", exc)

    # ------------------------------------------------------------------
    # §10 Flags
    # ------------------------------------------------------------------
    # Build partial result for flag computation
    partial = BiomarkerResult(
        duration_sec=duration_sec,
        f0_mean_hz=f0_mean_hz,
        f0_std_hz=f0_std_hz,
        f0_min_hz=f0_min_hz,
        f0_max_hz=f0_max_hz,
        f0_range_hz=f0_range_hz,
        jitter_local=jitter_local,
        jitter_rap=jitter_rap,
        jitter_ppq5=jitter_ppq5,
        jitter_ddp=jitter_ddp,
        shimmer_local=shimmer_local,
        shimmer_apq3=shimmer_apq3,
        shimmer_apq5=shimmer_apq5,
        shimmer_apq11=shimmer_apq11,
        shimmer_dda=shimmer_dda,
        hnr_db=hnr_db,
        mfcc_means=mfcc_means,
        mfcc_stds=mfcc_stds,
        speech_rate_syllables_per_sec=speech_rate_syllables_per_sec,
        pause_ratio=pause_ratio,
        voice_breaks_count=voice_breaks_count,
        cpp=cpp,
        flags=BiomarkerFlags(
            elevated_jitter=False,
            reduced_hnr=False,
            flat_f0_range=False,
            high_pause_ratio=False,
        ),
        extraction_warnings=warnings,
    )
    flags = _build_flags(partial)

    result = BiomarkerResult(
        duration_sec=duration_sec,
        f0_mean_hz=f0_mean_hz,
        f0_std_hz=f0_std_hz,
        f0_min_hz=f0_min_hz,
        f0_max_hz=f0_max_hz,
        f0_range_hz=f0_range_hz,
        jitter_local=jitter_local,
        jitter_rap=jitter_rap,
        jitter_ppq5=jitter_ppq5,
        jitter_ddp=jitter_ddp,
        shimmer_local=shimmer_local,
        shimmer_apq3=shimmer_apq3,
        shimmer_apq5=shimmer_apq5,
        shimmer_apq11=shimmer_apq11,
        shimmer_dda=shimmer_dda,
        hnr_db=hnr_db,
        mfcc_means=mfcc_means,
        mfcc_stds=mfcc_stds,
        speech_rate_syllables_per_sec=speech_rate_syllables_per_sec,
        pause_ratio=pause_ratio,
        voice_breaks_count=voice_breaks_count,
        cpp=cpp,
        flags=flags,
        extraction_warnings=warnings,
    )

    elapsed = time.monotonic() - t0
    logger.info(
        "extract_biomarkers: done  elapsed=%.2fs  warnings=%d",
        elapsed,
        len(warnings),
    )

    return result
