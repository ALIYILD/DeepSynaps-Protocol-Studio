# Lazy-import discipline: stdlib + fastapi at module top; pydub is imported only
# inside its seam function so this module loads in test environments that don't
# have that heavy package installed.
"""Audio ingestion: upload validation, normalisation to WAV 16 kHz mono, volume storage.

All heavy imports (pydub) are lazy — inside seam functions — so this module can
be imported in test environments without those packages installed.

Storage keys (original_storage_key / processed_storage_key — exposed on AudioMeta
as original_s3_key / processed_s3_key for backward-compatibility; "s3" is legacy
nomenclature from before the Fly volume switch) are relative paths under
DEEPSYNAPS_VOICE_DIR.  In production that env var is unset and defaults to
/data/voice (the Fly volume mount).  In local dev set it to e.g.
/tmp/deepsynaps-voice.
"""

from __future__ import annotations

import io
import logging
import os
import re
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional

from fastapi import HTTPException, UploadFile

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ID validation (path-traversal defence)
# ---------------------------------------------------------------------------

_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _validate_id(name: str, value: str) -> None:
    """Raise HTTPException(400) if *value* is not a safe slug.

    Prevents path-traversal attacks: patient_id/session_id must only contain
    alphanumerics, hyphens, and underscores (1-64 characters).
    """
    if not value or _SAFE_ID.fullmatch(value) is None:
        raise HTTPException(status_code=400, detail=f"Invalid {name}")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS: frozenset[str] = frozenset({".wav", ".mp3", ".m4a", ".ogg", ".flac"})
MAX_FILE_BYTES: int = 100 * 1024 * 1024  # 100 MB
MAX_DURATION_SEC: float = 30 * 60  # 30 minutes
TARGET_SAMPLE_RATE: int = 16_000
TARGET_CHANNELS: int = 1

# ---------------------------------------------------------------------------
# Public dataclass
# ---------------------------------------------------------------------------


@dataclass
class AudioMeta:
    patient_id: str
    session_id: str
    original_filename: str
    content_type: Optional[str]
    duration_sec: float
    sample_rate: int
    channels: int
    file_size_bytes: int
    # Field names retain "s3_key" suffix for backward compatibility; they now
    # hold relative paths under the Fly volume (DEEPSYNAPS_VOICE_DIR).
    original_s3_key: str
    processed_s3_key: str


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def _validate_extension(filename: str) -> str:
    """Return the lowercase dot-prefixed extension or raise HTTPException(400)."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file extension '{ext}'. "
                f"Allowed: {sorted(ALLOWED_EXTENSIONS)}"
            ),
        )
    return ext


def _measure_upload_size(upload_file: UploadFile, max_bytes: int = MAX_FILE_BYTES) -> int:
    """Read upload in 1 MB chunks, accumulate total, seek(0) to reset."""
    chunk_size = 1 << 20  # 1 MB
    total = 0
    while True:
        chunk = upload_file.file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds maximum size of {max_bytes // (1024 * 1024)} MB",
            )
    upload_file.file.seek(0)
    return total


def _ensure_duration_limit(segment: Any) -> None:
    """Raise HTTPException(400) if the audio segment exceeds MAX_DURATION_SEC."""
    duration = getattr(segment, "duration_seconds", None)
    if duration is None:
        duration = len(segment) / 1000.0
    if duration > MAX_DURATION_SEC:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Audio exceeds 30 minute maximum "
                f"(duration={duration:.1f}s, limit={MAX_DURATION_SEC}s)"
            ),
        )


# ---------------------------------------------------------------------------
# Audio loading / export seams (monkeypatch here in tests)
# ---------------------------------------------------------------------------


def _load_audio_segment(data: bytes, ext: str) -> Any:
    """Load audio bytes into a pydub AudioSegment. Monkeypatch seam."""
    import pydub  # lazy
    return pydub.AudioSegment.from_file(io.BytesIO(data), format=ext.lstrip("."))


def _export_to_wav_bytes(segment: Any) -> bytes:
    """Export a pydub AudioSegment to WAV bytes. Monkeypatch seam."""
    buf = io.BytesIO()
    segment.export(buf, format="wav")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Volume storage seams (monkeypatch here in tests)
# ---------------------------------------------------------------------------


def _get_voice_storage_dir() -> Path:
    """Return the base Path for voice storage. Monkeypatch seam."""
    return Path(os.environ.get("DEEPSYNAPS_VOICE_DIR", "/data/voice"))


def _write_audio_blob(relative_key: str, data: bytes, content_type: Optional[str] = None) -> None:
    """Write *data* atomically to the Fly volume at *relative_key*. Monkeypatch seam."""
    base = _get_voice_storage_dir()
    dest = base / relative_key

    # Defense-in-depth: ensure the resolved destination stays inside base.
    # Catches any future caller that bypasses _validate_id.
    try:
        dest.resolve().relative_to(base.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid storage path")

    dest.parent.mkdir(parents=True, exist_ok=True)

    # Write to a sibling temp file then rename — atomic on POSIX (same filesystem).
    tmp_fd, tmp_path = tempfile.mkstemp(dir=dest.parent)
    try:
        with os.fdopen(tmp_fd, "wb") as fh:
            fh.write(data)
        os.replace(tmp_path, dest)
    except Exception:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        raise


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def preprocess_upload(
    upload_file: UploadFile,
    patient_id: str,
    session_id: Optional[str] = None,
) -> AudioMeta:
    """Validate, normalise, and store an audio file on the Fly volume.

    Raises HTTPException(400) for bad patient_id/session_id slug, bad extension,
    undecodable audio, or excessive duration. HTTPException(413) for >100 MB.
    """
    # Validate IDs before any path construction (path-traversal defence).
    _validate_id("patient_id", patient_id)
    if session_id is not None:
        _validate_id("session_id", session_id)

    filename = upload_file.filename or "upload"
    ext = _validate_extension(filename)

    if session_id is None:
        session_id = uuid.uuid4().hex

    file_size_bytes = _measure_upload_size(upload_file)

    raw_bytes = upload_file.file.read()
    upload_file.file.seek(0)

    try:
        segment = _load_audio_segment(raw_bytes, ext)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unable to decode audio file") from exc

    _ensure_duration_limit(segment)

    duration_seconds = getattr(segment, "duration_seconds", None)
    if duration_seconds is None:
        duration_seconds = len(segment) / 1000.0

    normalised = segment.set_frame_rate(TARGET_SAMPLE_RATE).set_channels(TARGET_CHANNELS)
    processed_bytes = _export_to_wav_bytes(normalised)

    original_key = f"voice/{patient_id}/{session_id}/original{ext}"
    processed_key = f"voice/{patient_id}/{session_id}/processed.wav"

    _write_audio_blob(original_key, raw_bytes, upload_file.content_type)
    _write_audio_blob(processed_key, processed_bytes, "audio/wav")

    return AudioMeta(
        patient_id=patient_id,
        session_id=session_id,
        original_filename=filename,
        content_type=upload_file.content_type,
        duration_sec=duration_seconds,
        sample_rate=TARGET_SAMPLE_RATE,
        channels=TARGET_CHANNELS,
        file_size_bytes=file_size_bytes,
        original_s3_key=original_key,
        processed_s3_key=processed_key,
    )
