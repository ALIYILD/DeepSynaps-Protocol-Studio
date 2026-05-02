"""Clinical voice-quality composites — AVQI-v3-inspired linear score + DSI proxy."""

from __future__ import annotations

from .schemas import AVQIScore, DSIScore, GRBASScore, Recording, VoiceBreakStats, VoiceQualityBand


def compute_avqi(rec_vowel: Recording, rec_speech: Recording) -> AVQIScore:
    """AVQI-v3-inspired composite from seven acoustic markers (research/wellness).

    Uses Praat-backed perturbation when available via :func:`acoustic.perturbation.extract_perturbation`.
    The linear weights follow the structure of Barsties et al. / Van Luchene AVQI-v3 (dimensionless).
    """

    try:
        from .acoustic.perturbation import extract_perturbation
        from .acoustic.spectral import extract_spectral
    except ImportError:
        raise ImportError("compute_avqi requires acoustic extras")

    p_v = extract_perturbation(rec_vowel)
    s_v = extract_spectral(rec_vowel)
    p_s = extract_perturbation(rec_speech)
    s_s = extract_spectral(rec_speech)

    # Seven markers (vowel-heavy perturbation + spectral quality cues).
    cpps_v = max(0.0, min(25.0, s_v.cpps_db))
    hnr_v = max(-10.0, min(35.0, p_v.hnr_db))
    ltas_v = abs(s_v.ltas_slope_db_per_octave)
    shim_loc_v = max(0.0, min(0.5, p_v.shimmer_local))
    shim_11_v = max(0.0, min(0.5, p_v.shimmer_apq11))
    jit_loc_v = max(0.0, min(0.1, p_v.jitter_local))
    jit_ppq_v = max(0.0, min(0.1, p_v.jitter_ppq5))

    # Literature-style weighted sum (signs: higher dysphonia → higher AVQI).
    raw = (
        -0.56 * (hnr_v / 25.0)
        + 0.07 * cpps_v
        + 0.31 * ltas_v
        + 12.0 * shim_loc_v
        + 9.0 * shim_11_v
        + 35.0 * jit_loc_v
        + 28.0 * jit_ppq_v
        + 0.08 * max(0.0, -p_s.hnr_db / 30.0)
        + 0.05 * max(0.0, s_s.spectral_centroid_hz / 5000.0)
        + 2.8
    )

    band: VoiceQualityBand = "normal"
    if raw > 4.5:
        band = "severe"
    elif raw > 3.2:
        band = "moderate"
    elif raw > 2.0:
        band = "mild"

    return AVQIScore(
        value=float(raw),
        severity_band=band,
        sub_features={
            "cpps_vowel_db": s_v.cpps_db,
            "hnr_vowel_db": p_v.hnr_db,
            "ltas_slope_abs": ltas_v,
            "shimmer_local_vowel": p_v.shimmer_local,
            "shimmer_apq11_vowel": p_v.shimmer_apq11,
            "jitter_local_vowel": p_v.jitter_local,
            "jitter_ppq5_vowel": p_v.jitter_ppq5,
            "model_note": "avqi_v3_inspired_linear/v1",
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
