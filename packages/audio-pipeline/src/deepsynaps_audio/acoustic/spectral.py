"""Spectral voice features — centroid, tilt, CPPS proxy."""

from __future__ import annotations

import numpy as np

from ..schemas import Recording, SpectralFeatures


def extract_spectral(recording: Recording) -> SpectralFeatures:
    """CPPS proxy via cepstral peak; LTAS slope via STFT linear regression."""

    try:
        import librosa
    except ImportError as exc:
        raise ImportError(
            "extract_spectral requires librosa — pip install 'packages/audio-pipeline[acoustic]'."
        ) from exc

    if recording.waveform is None:
        raise ValueError("recording.waveform required")

    y = np.asarray(recording.waveform, dtype=np.float64).ravel()
    sr = recording.sample_rate
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512)) + 1e-12
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    centroid_hz = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))

    mag_db = 20.0 * np.log10(S.mean(axis=1) + 1e-12)
    band = (freqs >= 1000.0) & (freqs <= 10000.0)
    if np.sum(band) < 2:
        ltas_slope = 0.0
    else:
        x = np.log2(freqs[band])
        yb = mag_db[band]
        slope, _ = np.polyfit(x, yb, 1)
        ltas_slope = float(slope)

    S_mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128, fmax=8000)
    S_mel_db = librosa.power_to_db(S_mel, ref=np.max)
    q25, q75, q95 = (
        float(np.quantile(S_mel_db, 0.25)),
        float(np.quantile(S_mel_db, 0.75)),
        float(np.quantile(S_mel_db, 0.95)),
    )
    cpps_db = float(q95 - max(q25, -80.0))

    stft_db = librosa.amplitude_to_db(S, ref=np.max)
    lo = float(np.mean(stft_db[freqs < 2000, :]))
    hi = float(np.mean(stft_db[freqs > 2000, :]))
    spectral_tilt = float(hi - lo)

    return SpectralFeatures(
        cpps_db=cpps_db,
        ltas_slope_db_per_octave=ltas_slope,
        spectral_tilt_db=spectral_tilt,
        spectral_centroid_hz=centroid_hz,
    )
