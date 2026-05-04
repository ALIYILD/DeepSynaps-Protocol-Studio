"""Re-export original EDF bytes for bit-identical round-trip when source was EDF."""

from __future__ import annotations

from app.eeg_database.io_media import read_media_bytes


def export_raw_edf_bytes(raw_storage_key: str) -> bytes:
    return read_media_bytes(raw_storage_key)
