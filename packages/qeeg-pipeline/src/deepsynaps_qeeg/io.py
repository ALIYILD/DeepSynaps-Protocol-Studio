"""File I/O — read EDF / BrainVision / BDF / EEGLAB / FIF and validate.

Each reader returns a `mne.io.Raw` with:
- a standardized montage applied
- channel names mapped to canonical 10-20 labels
- validated sampling rate

This module has ZERO side-effects other than loading. Preprocessing lives in preprocess.py.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Literal

import mne

log = logging.getLogger(__name__)

# Canonical 10-20 synonyms that appear in real clinical files
CHANNEL_SYNONYMS: dict[str, str] = {
    "T3": "T7", "T4": "T8",
    "T5": "P7", "T6": "P8",
}

MIN_SAMPLING_HZ = 128.0
MIN_CHANNELS   = 16


class EEGIngestError(ValueError):
    """Raised when an input file cannot be safely ingested for qEEG."""


def detect_format(path: Path) -> Literal["edf", "brainvision", "bdf", "eeglab", "fif"]:
    """Infer file format from extension."""
    ext = path.suffix.lower()
    if ext in (".edf", ".rec"):
        return "edf"
    if ext == ".vhdr":
        return "brainvision"
    if ext == ".bdf":
        return "bdf"
    if ext == ".set":
        return "eeglab"
    if ext in (".fif", ".fif.gz"):
        return "fif"
    # BrainVision triplets may be pointed at the .eeg data file — redirect to .vhdr
    if ext == ".eeg":
        vhdr = path.with_suffix(".vhdr")
        if vhdr.exists():
            return "brainvision"
    raise EEGIngestError(f"Unsupported file extension: {ext}")


def load_raw(path: str | Path, preload: bool = True) -> mne.io.Raw:
    """Load an EEG file and return a validated, montaged `mne.io.Raw`.

    Parameters
    ----------
    path : str | Path
        Path to the EEG file.
    preload : bool
        If True, loads data into memory (required for most downstream steps).

    Returns
    -------
    mne.io.Raw
    """
    path = Path(path)
    if not path.exists():
        raise EEGIngestError(f"File not found: {path}")

    fmt = detect_format(path)
    log.info("Loading %s file: %s", fmt, path)

    if fmt == "edf":
        raw = mne.io.read_raw_edf(path, preload=preload)
    elif fmt == "brainvision":
        if path.suffix.lower() == ".eeg":
            path = path.with_suffix(".vhdr")
        raw = mne.io.read_raw_brainvision(path, preload=preload)
    elif fmt == "bdf":
        raw = mne.io.read_raw_bdf(path, preload=preload)
    elif fmt == "eeglab":
        raw = mne.io.read_raw_eeglab(path, preload=preload)
    elif fmt == "fif":
        raw = mne.io.read_raw_fif(path, preload=preload)
    else:
        raise EEGIngestError(f"No reader for {fmt}")

    _validate(raw)
    raw = _canonicalize_channels(raw)
    _apply_montage(raw)
    return raw


def _validate(raw: mne.io.BaseRaw) -> None:
    sfreq = raw.info["sfreq"]
    if sfreq < MIN_SAMPLING_HZ:
        raise EEGIngestError(
            f"Sampling rate {sfreq} Hz is below the minimum {MIN_SAMPLING_HZ} Hz."
        )
    n_eeg = len(mne.pick_types(raw.info, eeg=True))
    if n_eeg < MIN_CHANNELS:
        raise EEGIngestError(
            f"Only {n_eeg} EEG channels found; need ≥ {MIN_CHANNELS}."
        )
    if raw.times[-1] < 30.0:
        raise EEGIngestError(
            f"Recording is only {raw.times[-1]:.1f} s; need at least 30 s for qEEG."
        )


def _canonicalize_channels(raw: mne.io.BaseRaw) -> mne.io.BaseRaw:
    renames = {ch: CHANNEL_SYNONYMS[ch] for ch in raw.ch_names if ch in CHANNEL_SYNONYMS}
    if renames:
        log.info("Renaming channels to canonical 10-20 names: %s", renames)
        raw.rename_channels(renames)
    return raw


def _apply_montage(raw: mne.io.BaseRaw) -> None:
    montage = mne.channels.make_standard_montage("standard_1020")
    try:
        raw.set_montage(montage, on_missing="warn")
    except ValueError as exc:  # unreachable with on_missing='warn' but belt-and-braces
        raise EEGIngestError(f"Cannot apply standard_1020 montage: {exc}") from exc
