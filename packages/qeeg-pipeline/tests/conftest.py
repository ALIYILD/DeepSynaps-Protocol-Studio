"""Shared pytest fixtures."""
from __future__ import annotations

from typing import Any

import pytest


@pytest.fixture
def synthetic_raw() -> Any:
    """Generate a 60-second 19-channel 10-20 ``mne.io.RawArray``.

    Each channel is pink noise + a 10 Hz alpha bump. Returns a preloaded
    :class:`mne.io.RawArray` sampled at 250 Hz with the standard_1020
    montage applied.
    """
    mne = pytest.importorskip("mne")
    np = pytest.importorskip("numpy")

    ch_names = [
        "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
        "T7", "C3", "Cz", "C4", "T8",
        "P7", "P3", "Pz", "P4", "P8",
        "O1", "O2",
    ]
    sfreq = 250.0
    duration = 60.0
    n_samples = int(sfreq * duration)
    rng = np.random.default_rng(12345)

    # 1/f-ish pink noise via random walk + band-limited alpha sine
    t = np.arange(n_samples) / sfreq
    data = np.zeros((len(ch_names), n_samples))
    for i, ch in enumerate(ch_names):
        white = rng.standard_normal(n_samples)
        # cumulative sum approximates pink noise
        pink = np.cumsum(white)
        pink -= pink.mean()
        pink /= np.std(pink) or 1.0
        alpha_amp = 2.0
        alpha = alpha_amp * np.sin(2 * np.pi * 10.0 * t + rng.uniform(0, 2 * np.pi))
        data[i] = (pink + alpha) * 1e-6  # convert to volts (MNE convention)

    info = mne.create_info(ch_names=ch_names, sfreq=sfreq, ch_types="eeg")
    raw = mne.io.RawArray(data, info, verbose="WARNING")
    montage = mne.channels.make_standard_montage("standard_1020")
    raw.set_montage(montage, on_missing="ignore")
    return raw


@pytest.fixture
def asymmetric_raw() -> Any:
    """60 s, 19-channel raw with stronger alpha on F4 than F3 → positive FAA."""
    mne = pytest.importorskip("mne")
    np = pytest.importorskip("numpy")

    ch_names = [
        "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
        "T7", "C3", "Cz", "C4", "T8",
        "P7", "P3", "Pz", "P4", "P8",
        "O1", "O2",
    ]
    sfreq = 250.0
    duration = 60.0
    n_samples = int(sfreq * duration)
    rng = np.random.default_rng(9876)

    t = np.arange(n_samples) / sfreq
    data = np.zeros((len(ch_names), n_samples))
    # default alpha amplitude = 1; boost for F4, reduce for F3 so ln(F4)-ln(F3) > 0
    alpha_scale = {ch: 1.0 for ch in ch_names}
    alpha_scale["F4"] = 4.0
    alpha_scale["F3"] = 0.5
    alpha_scale["F8"] = 4.0
    alpha_scale["F7"] = 0.5

    for i, ch in enumerate(ch_names):
        white = rng.standard_normal(n_samples)
        pink = np.cumsum(white)
        pink -= pink.mean()
        pink /= np.std(pink) or 1.0
        amp = alpha_scale[ch]
        alpha = amp * np.sin(2 * np.pi * 10.0 * t + rng.uniform(0, 2 * np.pi))
        data[i] = (pink + alpha) * 1e-6

    info = mne.create_info(ch_names=ch_names, sfreq=sfreq, ch_types="eeg")
    raw = mne.io.RawArray(data, info, verbose="WARNING")
    montage = mne.channels.make_standard_montage("standard_1020")
    raw.set_montage(montage, on_missing="ignore")
    return raw
