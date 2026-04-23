"""EDF / EEG file parser using MNE-Python.

Extracts raw signal data and header metadata from European Data Format files.
Gracefully degrades if MNE is not installed (returns structured error).
"""
from __future__ import annotations

import io
import logging
import tempfile
from pathlib import Path
from typing import Any

_log = logging.getLogger(__name__)

# Standard 10-20 system channel names (19 channels + reference variants)
STANDARD_10_20 = {
    "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
    "T3", "C3", "Cz", "C4", "T4",
    "T5", "P3", "Pz", "P4", "T6",
    "O1", "O2",
    # Extended / alternate labels
    "A1", "A2", "T7", "T8", "P7", "P8",
    "F9", "F10", "FT9", "FT10", "TP9", "TP10",
    "AFz", "FCz", "CPz", "POz", "Oz",
}

# Common alternative channel name mappings to standard 10-20
_CHANNEL_ALIASES: dict[str, str] = {
    "T7": "T3", "T8": "T4", "P7": "T5", "P8": "T6",
    "FP1": "Fp1", "FP2": "Fp2",
    "EEG Fp1": "Fp1", "EEG Fp2": "Fp2",
    "EEG F3": "F3", "EEG F4": "F4", "EEG F7": "F7", "EEG F8": "F8",
    "EEG Fz": "Fz",
    "EEG C3": "C3", "EEG C4": "C4", "EEG Cz": "Cz",
    "EEG T3": "T3", "EEG T4": "T4", "EEG T5": "T5", "EEG T6": "T6",
    "EEG T7": "T3", "EEG T8": "T4", "EEG P7": "T5", "EEG P8": "T6",
    "EEG P3": "P3", "EEG P4": "P4", "EEG Pz": "Pz",
    "EEG O1": "O1", "EEG O2": "O2",
    "EEG A1": "A1", "EEG A2": "A2",
}


def _normalize_channel_name(name: str) -> str:
    """Normalize a channel name to standard 10-20 format."""
    stripped = name.strip()
    # Try direct alias mapping
    if stripped in _CHANNEL_ALIASES:
        return _CHANNEL_ALIASES[stripped]
    # Try uppercase alias
    if stripped.upper() in _CHANNEL_ALIASES:
        return _CHANNEL_ALIASES[stripped.upper()]
    # Strip common prefixes
    for prefix in ("EEG ", "EEG-", "eeg ", "eeg-"):
        if stripped.startswith(prefix):
            base = stripped[len(prefix):].strip()
            if base in STANDARD_10_20:
                return base
            if base in _CHANNEL_ALIASES:
                return _CHANNEL_ALIASES[base]
    return stripped


def parse_edf_file(file_bytes: bytes, filename: str) -> dict[str, Any]:
    """Parse an EDF/BDF file and return header metadata + raw object.

    Returns dict with keys:
        - success: bool
        - raw: mne.io.Raw (only if success)
        - channels: list of channel names
        - standard_channels: list of 10-20 mapped channel names
        - channel_map: dict mapping original -> standard name
        - sample_rate_hz: float
        - duration_sec: float
        - n_channels: int
        - error: str (only if not success)
    """
    try:
        import mne
    except ImportError:
        return {
            "success": False,
            "error": "MNE-Python is not installed. Install with: pip install mne",
        }

    mne.set_log_level("ERROR")

    ext = Path(filename).suffix.lower()
    try:
        # Write bytes to temp file (MNE requires file path)
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        if ext in (".edf", ".edf+"):
            raw = mne.io.read_raw_edf(tmp_path, preload=True, verbose=False)
        elif ext in (".bdf", ".bdf+"):
            raw = mne.io.read_raw_bdf(tmp_path, preload=True, verbose=False)
        else:
            # Attempt EDF as default
            raw = mne.io.read_raw_edf(tmp_path, preload=True, verbose=False)

        # Build channel mapping
        all_channels = raw.ch_names
        channel_map: dict[str, str] = {}
        standard_channels: list[str] = []

        for ch in all_channels:
            normalized = _normalize_channel_name(ch)
            if normalized in STANDARD_10_20:
                channel_map[ch] = normalized
                standard_channels.append(normalized)

        return {
            "success": True,
            "raw": raw,
            "channels": all_channels,
            "standard_channels": list(dict.fromkeys(standard_channels)),  # dedupe, preserve order
            "channel_map": channel_map,
            "sample_rate_hz": raw.info["sfreq"],
            "duration_sec": raw.times[-1] if len(raw.times) > 0 else 0.0,
            "n_channels": len(all_channels),
        }

    except Exception as exc:
        _log.warning("EDF parse failed for %s: %s", filename, exc)
        return {
            "success": False,
            "error": f"Failed to parse EDF file: {exc}",
        }
    finally:
        # Cleanup temp file
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except Exception:
            pass


def extract_eeg_channels(raw: Any, channel_map: dict[str, str]) -> Any:
    """Pick only standard 10-20 EEG channels from a raw MNE object.

    Returns a new Raw object with renamed standard channels.
    """
    import mne

    # Pick channels that map to standard 10-20
    picks = list(channel_map.keys())
    if not picks:
        raise ValueError("No standard 10-20 channels found in the recording")

    raw_picked = raw.copy().pick(picks)

    # Rename to standard names
    rename_map = {orig: std for orig, std in channel_map.items() if orig != std}
    if rename_map:
        raw_picked.rename_channels(rename_map)

    return raw_picked
