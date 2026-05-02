"""Formant estimates from short-time spectrum peaks (librosa)."""

from __future__ import annotations

import numpy as np

from ..schemas import FormantFeatures, Recording


def extract_formants(recording: Recording, n: int = 4) -> FormantFeatures:
    """Estimate F1–F4 as the four strongest peaks in the band 200–4000 Hz (mean spectrum)."""

    try:
        import librosa
        from scipy.signal import find_peaks
    except ImportError as exc:
        raise ImportError(
            "extract_formants requires librosa and scipy — pip install 'packages/audio-pipeline[acoustic]'."
        ) from exc

    if recording.waveform is None:
        raise ValueError("recording.waveform required")

    y = np.asarray(recording.waveform, dtype=np.float64).ravel()
    sr = recording.sample_rate
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=256))
    mag = np.mean(S, axis=1)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    band = (freqs >= 200.0) & (freqs <= 4000.0)
    mag_b = mag[band]
    fq_b = freqs[band]
    peaks, _ = find_peaks(mag_b, prominence=np.max(mag_b) * 0.05)
    peak_freqs = fq_b[peaks]
    peak_freqs = np.sort(peak_freqs)
    if len(peak_freqs) < n:
        peak_freqs = np.pad(peak_freqs, (0, n - len(peak_freqs)))

    f1, f2, f3, f4 = [float(peak_freqs[i]) for i in range(4)]
    dispersion = float((f4 - f1) / 3.0) if f4 > f1 else 0.0

    return FormantFeatures(
        f1_hz=f1,
        f2_hz=f2,
        f3_hz=f3,
        f4_hz=f4,
        formant_dispersion_hz=dispersion,
        vowel_space_area=None,
    )
