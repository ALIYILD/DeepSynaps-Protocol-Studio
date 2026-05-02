"""Clinical voice-quality composites — lightweight proxies for MVP."""

from __future__ import annotations

import math

from .schemas import AVQIScore, DSIScore, GRBASScore, Recording, VoiceBreakStats, VoiceQualityBand


def compute_avqi(rec_vowel: Recording, rec_speech: Recording) -> AVQIScore:
    """Proxy AVQI-like index from spectral centroid spread + jitter proxy (not AVQI-v3 paper-exact)."""

    try:
        from .acoustic.perturbation import extract_perturbation
        from .acoustic.spectral import extract_spectral
    except ImportError:
        raise ImportError("compute_avqi requires acoustic extras")

    p_v = extract_perturbation(rec_vowel)
    s_v = extract_spectral(rec_vowel)
    p_s = extract_perturbation(rec_speech)
    s_s = extract_spectral(rec_speech)

    raw = (
        0.35 * max(0.0, s_v.spectral_centroid_hz / 4000.0)
        + 0.25 * max(0.0, -p_v.hnr_db / 40.0)
        + 0.2 * max(0.0, p_v.shimmer_local * 10)
        + 0.2 * max(0.0, abs(s_v.ltas_slope_db_per_octave))
    )
    band: VoiceQualityBand = "normal"
    if raw > 2.5:
        band = "severe"
    elif raw > 1.8:
        band = "moderate"
    elif raw > 1.0:
        band = "mild"

    return AVQIScore(
        value=float(raw),
        severity_band=band,
        sub_features={
            "hnr_vowel_db": p_v.hnr_db,
            "centroid_vowel_hz": s_v.spectral_centroid_hz,
            "shimmer_vowel": p_v.shimmer_local,
            "hnr_speech_db": p_s.hnr_db,
            "centroid_speech_hz": s_s.spectral_centroid_hz,
        },
    )


def compute_dsi(recording: Recording) -> DSIScore:
    """DSI-like composite (negative = rougher voice in DSI convention — simplified)."""

    try:
        from .acoustic.pitch import extract_pitch
        from .acoustic.perturbation import extract_perturbation
    except ImportError:
        raise ImportError("compute_dsi requires acoustic extras")

    p = extract_perturbation(recording)
    pk = extract_pitch(recording)
    dsi_val = float(-0.8 * p.hnr_db + 0.02 * pk.f0_mean_hz + 15 * p.jitter_local)
    band: VoiceQualityBand = "normal"
    if dsi_val > 5:
        band = "severe"
    elif dsi_val > 2:
        band = "moderate"
    elif dsi_val > 0:
        band = "mild"

    return DSIScore(value=dsi_val, severity_band=band)


def estimate_grbas(recording: Recording) -> GRBASScore:
    """Stub GRBAS — uniform mid scores until CNN model ships."""

    return GRBASScore(grade=1, roughness=1, breathiness=1, asthenia=1, strain=1, confidence=0.2)


def voice_break_metrics(recording: Recording) -> VoiceBreakStats:
    """Voice breaks from pyin voiced-flag gaps."""

    try:
        import librosa
        import numpy as np
    except ImportError as exc:
        raise ImportError("voice_break_metrics requires librosa") from exc

    if recording.waveform is None:
        raise ValueError("recording.waveform required")

    y = np.asarray(recording.waveform, dtype=np.float64).ravel()
    sr = recording.sample_rate
    f0_hz, voiced_flag, _ = librosa.pyin(y, fmin=75.0, fmax=500.0, sr=sr, frame_length=2048, hop_length=256)
    hop_s = 256 / sr
    if voiced_flag is None:
        return VoiceBreakStats(voice_break_rate_per_s=0.0, voice_break_ratio=0.0, longest_break_s=0.0)

    breaks = 0
    longest = 0.0
    run = 0.0
    for v in voiced_flag:
        if not v:
            run += hop_s
        else:
            if run >= 0.08:
                breaks += 1
                longest = max(longest, run)
            run = 0.0
    dur = len(y) / sr
    ratio = float((~voiced_flag).sum() / max(len(voiced_flag), 1))

    return VoiceBreakStats(
        voice_break_rate_per_s=float(breaks / max(dur, 1e-6)),
        voice_break_ratio=ratio,
        longest_break_s=float(longest),
    )
