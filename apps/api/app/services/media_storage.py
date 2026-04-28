"""
Media file storage service — V1 local filesystem backend.
Swap MEDIA_STORAGE_BACKEND env to "s3" in future for cloud.
"""

from __future__ import annotations

import os
import logging

import aiofiles
import aiofiles.os

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_DEFAULT_MEDIA_MAX_BYTES = 52_428_800  # 50 MB


def _storage_root(settings) -> str:
    """Return the media storage root directory as a string."""
    return getattr(settings, "media_storage_root", None) or os.path.join(
        os.getcwd(), "media_uploads"
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def save_upload(
    patient_id: str,
    upload_id: str,
    file_bytes: bytes,
    extension: str,
    settings,
) -> str:
    """
    Persist *file_bytes* under ``{MEDIA_STORAGE_ROOT}/{patient_id}/{upload_id}.{ext}``.

    Returns the relative ``file_ref`` string (``{patient_id}/{upload_id}.{ext}``).
    Raises ``IOError`` on any write failure.
    """
    root = _storage_root(settings)
    patient_dir = os.path.join(root, patient_id)
    filename = f"{upload_id}.{extension.lstrip('.')}"
    abs_path = os.path.join(patient_dir, filename)
    file_ref = f"{patient_id}/{filename}"

    try:
        os.makedirs(patient_dir, exist_ok=True)
        async with aiofiles.open(abs_path, "wb") as fh:
            await fh.write(file_bytes)
        logger.info("Saved upload: %s (%d bytes)", file_ref, len(file_bytes))
        return file_ref
    except Exception as exc:
        raise IOError(f"Failed to save upload '{file_ref}': {exc}") from exc


def _safe_abs_path(file_ref: str, settings) -> str:
    """
    Resolve *file_ref* to an absolute path and verify it stays inside
    the media storage root.  Raises ``FileNotFoundError`` on path traversal.
    """
    root = os.path.realpath(_storage_root(settings))
    candidate = os.path.realpath(os.path.join(root, file_ref))
    # Ensure the resolved path is strictly inside the storage root
    if not candidate.startswith(root + os.sep) and candidate != root:
        raise FileNotFoundError(f"Access denied: path outside storage root: {file_ref!r}")
    return candidate


async def read_upload(file_ref: str, settings) -> bytes:
    """
    Read and return the bytes stored at ``{MEDIA_STORAGE_ROOT}/{file_ref}``.

    Raises ``FileNotFoundError`` if the path does not exist or escapes the root.
    """
    abs_path = _safe_abs_path(file_ref, settings)
    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"Media file not found: {file_ref}")

    async with aiofiles.open(abs_path, "rb") as fh:
        return await fh.read()


async def delete_upload(file_ref: str, settings) -> bool:
    """
    Delete the file at ``{MEDIA_STORAGE_ROOT}/{file_ref}``.

    Returns ``True`` if the file was deleted, ``False`` if it did not exist.
    Never raises on a missing file.
    """
    try:
        abs_path = _safe_abs_path(file_ref, settings)
    except FileNotFoundError:
        return False
    # abs_path is now guaranteed to be inside the storage root
    try:
        await aiofiles.os.remove(abs_path)
        logger.info("Deleted upload: %s", os.path.basename(file_ref))
        return True
    except FileNotFoundError:
        return False
    except Exception as exc:
        logger.warning("Could not delete upload '%s': %s", file_ref, exc)
        return False


def get_signed_url(file_ref: str, settings, ttl_seconds: int = 3600) -> str:
    """
    V1: return the API-served path for *file_ref*.

    In a future S3 backend this would generate a pre-signed URL with *ttl_seconds*.
    For now the API endpoint ``/api/v1/media/file/{file_ref}`` handles auth and
    serves the file directly.
    """
    # ttl_seconds is accepted but unused in V1; kept for API compatibility.
    _ = ttl_seconds
    return f"/api/v1/media/file/{file_ref}"


# ---------------------------------------------------------------------------
# MIME / size constraints
# ---------------------------------------------------------------------------


def allowed_audio_types() -> list[str]:
    """Return the set of accepted audio MIME types for patient uploads."""
    return [
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
    ]


def allowed_video_types() -> list[str]:
    """Return the set of accepted video MIME types for patient uploads."""
    return [
        "video/mp4",
        "video/webm",
    ]


# Pre-fix the patient-upload routes derived the on-disk extension from
# `file.filename.rsplit(".", 1)[-1]` with no allowlist — a user could
# supply ``audio.php`` (or worse, with shell metacharacters) and the
# extension would be persisted verbatim in `save_upload`. The two maps
# below pin every accepted MIME type to a known-safe extension so the
# filename written to disk is always one of a fixed set.
_AUDIO_MIME_TO_EXT = {
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
}
_VIDEO_MIME_TO_EXT = {
    "video/mp4": "mp4",
    "video/webm": "webm",
}


def safe_audio_ext(mime: str | None) -> str:
    """Return the canonical disk extension for an audio MIME type."""
    return _AUDIO_MIME_TO_EXT.get((mime or "").lower(), "webm")


def safe_video_ext(mime: str | None) -> str:
    """Return the canonical disk extension for a video MIME type."""
    return _VIDEO_MIME_TO_EXT.get((mime or "").lower(), "webm")


# Magic-byte sniffing tables. Pre-fix the upload routes accepted the
# client-supplied ``Content-Type`` header at face value — a user could
# upload arbitrary binary and tag it as ``audio/webm``. The signatures
# below are checked against the first ~32 bytes of the uploaded body
# at the boundary; mismatch => 422.
_AUDIO_MAGIC_SIGNATURES: tuple[tuple[bytes, bytes | None], ...] = (
    # WebM / Matroska — leading EBML header.
    (b"\x1a\x45\xdf\xa3", None),
    # OGG — "OggS"
    (b"OggS", None),
    # WAV — RIFF....WAVE
    (b"RIFF", b"WAVE"),
    # MP3 with ID3v2 tag.
    (b"ID3", None),
    # Bare MP3 frame sync (MPEG audio).
    (b"\xff\xfb", None),
    (b"\xff\xf3", None),
    (b"\xff\xf2", None),
    # MP4 / M4A — ISO BMFF "ftyp" box (offset 4).
    (b"\x00\x00\x00", b"ftyp"),
)
_VIDEO_MAGIC_SIGNATURES: tuple[tuple[bytes, bytes | None], ...] = (
    # WebM / Matroska
    (b"\x1a\x45\xdf\xa3", None),
    # MP4 — ftyp box
    (b"\x00\x00\x00", b"ftyp"),
)


def looks_like_audio(payload_head: bytes) -> bool:
    """Return True if the leading bytes look like an accepted audio
    container/codec. Refuses arbitrary binary masquerading as audio."""
    if len(payload_head) < 4:
        return False
    head = payload_head[:32]
    for prefix, contains in _AUDIO_MAGIC_SIGNATURES:
        if head.startswith(prefix):
            if contains is None or contains in head:
                return True
    return False


def looks_like_video(payload_head: bytes) -> bool:
    """Return True if the leading bytes look like an accepted video
    container. Refuses arbitrary binary masquerading as video."""
    if len(payload_head) < 8:
        return False
    head = payload_head[:32]
    for prefix, contains in _VIDEO_MAGIC_SIGNATURES:
        if head.startswith(prefix):
            if contains is None or contains in head:
                return True
    return False


def max_upload_bytes(settings) -> int:
    """Return the maximum allowed upload size in bytes (default 50 MB)."""
    return getattr(settings, "media_max_upload_bytes", None) or _DEFAULT_MEDIA_MAX_BYTES
