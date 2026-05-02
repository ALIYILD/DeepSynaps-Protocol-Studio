"""Spectral voice features: CPPS, LTAS slope, spectral tilt, spectral centroid."""

from __future__ import annotations

from ..schemas import Recording, SpectralFeatures


def extract_spectral(recording: Recording) -> SpectralFeatures:
    """Compute CPPS (smoothed cepstral peak prominence), LTAS slope, spectral tilt, centroid.

    TODO: implement in PR #2. CPPS via Parselmouth
    ``To PowerCepstrogram`` → ``Get CPPS``. LTAS slope across
    :data:`constants.LTAS_SLOPE_BAND_HZ` (1–10 kHz) via least-squares
    fit on a long-term average spectrum. Spectral tilt and centroid via
    librosa.
    """

    raise NotImplementedError(
        "acoustic.spectral.extract_spectral: implement in PR #2 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
