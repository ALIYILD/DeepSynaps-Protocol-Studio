"""Canonical qEEG tabular feature extraction.

Produces a fixed-shape feature vector from a qEEG recording. These features are
stable and clinician-readable: band powers, alpha asymmetry, coherence summaries.
The dimensionality is intentionally modest so the projector can compress to 128.

Inputs are expected to be already preprocessed (cleaned, re-referenced, filtered)
upstream by the qEEG analyzer. The encoder service does not preprocess.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.signal import coherence, welch

# Canonical 5-band definition (clinical convention)
BANDS: dict[str, tuple[float, float]] = {
    "delta": (1.0, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta": (13.0, 30.0),
    "gamma": (30.0, 45.0),
}

# Frontal asymmetry pair (10-20 montage)
ASYM_LEFT = "F3"
ASYM_RIGHT = "F4"

# Coherence pairs of clinical interest
COHERENCE_PAIRS: list[tuple[str, str]] = [
    ("F3", "F4"),
    ("C3", "C4"),
    ("P3", "P4"),
    ("O1", "O2"),
    ("Fz", "Cz"),
]


@dataclass
class CanonicalFeatures:
    """Fixed-shape canonical qEEG feature vector."""

    band_powers: dict[str, np.ndarray] = field(default_factory=dict)  # band -> (n_channels,)
    relative_powers: dict[str, np.ndarray] = field(default_factory=dict)
    frontal_alpha_asymmetry: float = 0.0
    coherence: dict[str, dict[str, float]] = field(default_factory=dict)  # pair -> band -> value

    def to_vector(self, channel_names: list[str]) -> np.ndarray:
        """Flatten to a deterministic 1-D vector (channel-order stable)."""
        parts: list[np.ndarray] = []
        for band in BANDS:
            parts.append(self.band_powers.get(band, np.zeros(len(channel_names))))
        for band in BANDS:
            parts.append(self.relative_powers.get(band, np.zeros(len(channel_names))))
        parts.append(np.array([self.frontal_alpha_asymmetry], dtype=np.float32))
        for pair in COHERENCE_PAIRS:
            key = f"{pair[0]}-{pair[1]}"
            for band in BANDS:
                parts.append(
                    np.array([self.coherence.get(key, {}).get(band, 0.0)], dtype=np.float32)
                )
        return np.concatenate([p.astype(np.float32).ravel() for p in parts])


def _band_power(psd: np.ndarray, freqs: np.ndarray, band: tuple[float, float]) -> np.ndarray:
    lo, hi = band
    mask = (freqs >= lo) & (freqs < hi)
    return np.trapezoid(psd[..., mask], freqs[mask], axis=-1)


def extract_features(
    eeg: np.ndarray,
    sfreq: float,
    channel_names: list[str],
) -> CanonicalFeatures:
    """Compute canonical features from a (channels, samples) array.

    Robust to missing channels — any channel in COHERENCE_PAIRS or asymmetry
    that is absent in `channel_names` produces a zero entry.
    """
    if eeg.ndim != 2:
        raise ValueError(f"expected (channels, samples), got {eeg.shape}")

    freqs, psd = welch(eeg, fs=sfreq, nperseg=min(int(sfreq * 4), eeg.shape[1]), axis=-1)

    out = CanonicalFeatures()
    total_power = _band_power(psd, freqs, (1.0, 45.0))
    total_power = np.where(total_power < 1e-12, 1e-12, total_power)

    for band_name, band_range in BANDS.items():
        bp = _band_power(psd, freqs, band_range)
        out.band_powers[band_name] = bp.astype(np.float32)
        out.relative_powers[band_name] = (bp / total_power).astype(np.float32)

    # Frontal alpha asymmetry: log(F4 alpha) - log(F3 alpha)
    name_to_idx = {n: i for i, n in enumerate(channel_names)}
    if ASYM_LEFT in name_to_idx and ASYM_RIGHT in name_to_idx:
        l = float(out.band_powers["alpha"][name_to_idx[ASYM_LEFT]])
        r = float(out.band_powers["alpha"][name_to_idx[ASYM_RIGHT]])
        if l > 0 and r > 0:
            out.frontal_alpha_asymmetry = float(np.log(r) - np.log(l))

    # Coherence per pair, per band
    for left, right in COHERENCE_PAIRS:
        key = f"{left}-{right}"
        out.coherence[key] = {}
        if left in name_to_idx and right in name_to_idx:
            f_c, cxy = coherence(
                eeg[name_to_idx[left]],
                eeg[name_to_idx[right]],
                fs=sfreq,
                nperseg=min(int(sfreq * 4), eeg.shape[1]),
            )
            for band_name, band_range in BANDS.items():
                lo, hi = band_range
                m = (f_c >= lo) & (f_c < hi)
                out.coherence[key][band_name] = float(np.mean(cxy[m])) if m.any() else 0.0
        else:
            for band_name in BANDS:
                out.coherence[key][band_name] = 0.0

    return out

