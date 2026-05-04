"""Sync writes under ``MEDIA_STORAGE_ROOT`` (matches ``media_storage`` layout)."""

from __future__ import annotations

import os

from app.services.media_storage import _safe_abs_path
from app.settings import get_settings


def write_media_bytes(file_ref: str, data: bytes) -> str:
    """Persist *data* at *file_ref* (relative). Returns *file_ref*."""
    settings = get_settings()
    abs_path = _safe_abs_path(file_ref, settings)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "wb") as fh:
        fh.write(data)
    return file_ref


def read_media_bytes(file_ref: str) -> bytes:
    settings = get_settings()
    abs_path = _safe_abs_path(file_ref, settings)
    with open(abs_path, "rb") as fh:
        return fh.read()
