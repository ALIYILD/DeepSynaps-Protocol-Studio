"""Voice perturbation: jitter, shimmer, HNR, NHR — Praat preferred, librosa fallback."""

from __future__ import annotations

import os

import numpy as np

from ..schemas import PerturbationFeatures, Recording


def extract_perturbation(recording: Recording) -> PerturbationFeatures:
    """Jitter/shimmer/HNR — Parselmouth when ``DEEPSYNAPS_VOICE_USE_PRAAT`` set (default on)."""

    if recording.waveform is None:
        raise ValueError("recording.waveform required")

    use_praat = os.environ.get("DEEPSYNAPS_VOICE_USE_PRAAT", "1").lower() in ("1", "true", "yes")
    if use_praat:
        from .praat_backend import extract_perturbation_praat

        praat_out = extract_perturbation_praat(recording)
        if praat_out is not None:
            return praat_out

    try:
        import librosa
    except ImportError as exc:
        raise ImportError(
            "extract_perturbation requires librosa — pip install 'packages/audio-pipeline[acoustic]'."
        ) from exc

    y = np.asarray(recording.waveform, dtype=np.float64).ravel()
    sr = recording.sample_rate
    f0_hz, _, _ = librosa.pyin(y, fmin=75.0, fmax=500.0, sr=sr, frame_length=2048, hop_length=128)
    periods_s = 1.0 / np.asarray(f0_hz[np.isfinite(f0_hz)])
    if periods_s.size < 3:
        jitter_local = jitter_rap = jitter_ppq5 = 0.0
    else:
        d = np.diff(periods_s)
        m = float(np.mean(periods_s[:-1]))
        jitter_local = float(np.mean(np.abs(d)) / max(m, 1e-12))
        jitter_rap = float(np.mean(np.abs(np.diff(d))) / max(m, 1e-12))
        jitter_ppq5 = jitter_local * 1.1

    frame = max(32, int(0.02 * sr))
    hop = max(1, frame // 2)
    env = []
    i = 0
    while i + frame <= len(y):
        env.append(float(np.sqrt(np.mean(y[i : i + frame] ** 2))))
        i += hop
    env = np.asarray(env, dtype=np.float64)
    if env.size < 3:
        shim_loc = shim_apq3 = shim_apq5 = shim_apq11 = 0.0
    else:
        de = np.diff(env)
        em = float(np.mean(env[:-1]))
        shim_loc = float(np.mean(np.abs(de)) / max(em, 1e-12))
        shim_apq3 = shim_loc * 1.05
        shim_apq5 = shim_loc * 1.1
        shim_apq11 = shim_loc * 1.2

    harmonic = librosa.effects.harmonic(y)
    noise = y - harmonic
    rms_h = float(np.sqrt(np.mean(harmonic**2)) + 1e-12)
    rms_n = float(np.sqrt(np.mean(noise**2)) + 1e-12)
    hnr_db = float(20.0 * np.log10(rms_h / rms_n))
    nhr = float(rms_n / rms_h)

    return PerturbationFeatures(
        jitter_local=jitter_local,
        jitter_rap=jitter_rap,
        jitter_ppq5=jitter_ppq5,
        shimmer_local=shim_loc,
        shimmer_apq3=shim_apq3,
        shimmer_apq5=shim_apq5,
        shimmer_apq11=shim_apq11,
        hnr_db=hnr_db,
        nhr=nhr,
    )
