# Lazy-import discipline: stdlib + fastapi at module top; pydub and boto3 are
# imported only inside their seam functions so this module loads in test
# environments that don't have those heavy packages installed.
"""Audio ingestion: upload validation, normalisation to WAV 16 kHz mono, S3 storage.

All heavy imports (pydub, boto3) are lazy — inside seam functions — so this
module can be imported in test environments without those packages installed.
"""

from __future__ import annotations

import io
import logging
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional

from fastapi import HTTPException, UploadFile

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS: frozenset[str] = frozenset({".wav", ".mp3", ".m4a", ".ogg", ".flac"})
MAX_FILE_BYTES: int = 100 * 1024 * 1024  # 100 MB
MAX_DURATION_SEC: float = 30 * 60  # 30 minutes
TARGET_SAMPLE_RATE: int = 16_000
TARGET_CHANNELS: int = 1

VOICE_BUCKET: str = os.environ.get("DEEPSYNAPS_VOICE_BUCKET", "deepsynaps-voice")

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
    """Read upload in 1 MB chunks, accumulate total, seek(0) to reset.

    Short-circuits and raises HTTPException(413) as soon as the cumulative
    read exceeds *max_bytes* — avoids loading the entire oversize file into memory.
    """
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
        # pydub stores duration in milliseconds via len(segment)
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
# S3 seams (monkeypatch here in tests)
# ---------------------------------------------------------------------------


def _get_s3_client() -> Any:
    """Return a boto3 S3 client. Monkeypatch seam."""
    import boto3  # lazy

    return boto3.client("s3")


def _upload_bytes_to_s3(
    bucket: str,
    key: str,
    data: bytes,
    content_type: Optional[str],
) -> None:
    """Upload *data* to S3 at *bucket*/*key*. Monkeypatch seam."""
    client = _get_s3_client()
    kwargs: dict[str, Any] = {"Bucket": bucket, "Key": key, "Body": data}
    if content_type is not None:
        kwargs["ContentType"] = content_type
    client.put_object(**kwargs)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def preprocess_upload(
    upload_file: UploadFile,
    patient_id: str,
    session_id: Optional[str] = None,
) -> AudioMeta:
    """Validate, normalise, and upload an audio file to S3.

    Steps
    -----
    1. Validate filename extension.
    2. Generate session_id (uuid4 hex) if None.
    3. Measure stream size — reject > 100 MB → HTTPException(413).
    4. Read raw bytes, decode via ``_load_audio_segment`` seam.
    5. Validate duration ≤ 30 min.
    6. Normalise: 16 kHz mono, export to WAV bytes via ``_export_to_wav_bytes``.
    7. Upload original + processed WAV to S3 via ``_upload_bytes_to_s3``.
    8. Build and return AudioMeta.

    Raises
    ------
    HTTPException(400)
        Bad extension, undecodable audio, or excessive duration.
    HTTPException(413)
        File exceeds 100 MB.
    """
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
        raise HTTPException(
            status_code=400,
            detail="Unable to decode audio file",
        ) from exc

    _ensure_duration_limit(segment)

    duration_seconds = getattr(segment, "duration_seconds", None)
    if duration_seconds is None:
        duration_seconds = len(segment) / 1000.0

    normalised = segment.set_frame_rate(TARGET_SAMPLE_RATE).set_channels(TARGET_CHANNELS)
    processed_bytes = _export_to_wav_bytes(normalised)

    original_s3_key = f"voice/{patient_id}/{session_id}/original{ext}"
    processed_s3_key = f"voice/{patient_id}/{session_id}/processed.wav"

    _upload_bytes_to_s3(VOICE_BUCKET, original_s3_key, raw_bytes, upload_file.content_type)
    _upload_bytes_to_s3(VOICE_BUCKET, processed_s3_key, processed_bytes, "audio/wav")

    return AudioMeta(
        patient_id=patient_id,
        session_id=session_id,
        original_filename=filename,
        content_type=upload_file.content_type,
        duration_sec=duration_seconds,
        sample_rate=TARGET_SAMPLE_RATE,
        channels=TARGET_CHANNELS,
        file_size_bytes=file_size_bytes,
        original_s3_key=original_s3_key,
        processed_s3_key=processed_s3_key,
    )
