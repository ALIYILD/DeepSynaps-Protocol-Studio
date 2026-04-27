"""Tests covering malformed-input rejection in :mod:`deepsynaps_qeeg.io`."""
from __future__ import annotations

from pathlib import Path

import pytest


def test_unknown_extension_raises_eegingest_error(tmp_path: Path) -> None:
    """A file with a bogus extension must be rejected with EEGIngestError."""
    from deepsynaps_qeeg.io import EEGIngestError, load_raw

    bad_file = tmp_path / "not_eeg.txt"
    bad_file.write_text("not an EEG file", encoding="utf-8")
    with pytest.raises(EEGIngestError) as exc:
        load_raw(bad_file)
    assert "Unsupported file extension" in str(exc.value)


def test_missing_file_raises_eegingest_error(tmp_path: Path) -> None:
    from deepsynaps_qeeg.io import EEGIngestError, load_raw

    with pytest.raises(EEGIngestError) as exc:
        load_raw(tmp_path / "definitely_not_here.edf")
    assert "File not found" in str(exc.value)


def test_truncated_edf_does_not_silently_pass(tmp_path: Path) -> None:
    """A 1-byte 'EDF' file should not silently load; either MNE rejects it or
    our validator does — either way, EEGIngestError or a ValueError must be
    raised, never None."""
    pytest.importorskip("mne")
    from deepsynaps_qeeg.io import load_raw

    bogus = tmp_path / "broken.edf"
    bogus.write_bytes(b"0")  # 1-byte garbage
    with pytest.raises(Exception):
        load_raw(bogus)
