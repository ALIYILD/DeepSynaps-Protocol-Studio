"""Video ingestion utilities for DeepSynaps Video Analyzer.

This module is intentionally limited to ingestion concerns:

* registering patient video files or upload blobs
* extracting JSON-friendly video metadata
* normalizing videos for downstream pose/analysis stages
* sampling frames for QC thumbnails or later annotation workflows

Pose estimation, clinical movement analysis, monitoring event detection, and
report generation belong in downstream modules. The concrete video IO layer is
adapter-based so unit tests and cloud development do not require OpenCV, FFmpeg,
GPU libraries, or external model downloads.
"""
from __future__ import annotations

import json
import logging
import mimetypes
import shutil
import subprocess
import uuid
from dataclasses import replace
from pathlib import Path
from typing import Any, BinaryIO, cast, Protocol

from .schemas import (
    CameraInfo,
    FrameSample,
    NormalizationConfig,
    NormalizedVideo,
    ProvenanceRecord,
    VideoAsset,
    VideoMetadata,
    VideoSourceType,
    utc_now_iso,
)

logger = logging.getLogger(__name__)

SUPPORTED_VIDEO_EXTENSIONS = frozenset({".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"})
DEFAULT_SOURCE_RETENTION_POLICY = "retain_source_per_patient_policy"
DEFAULT_DERIVED_RETENTION_POLICY = "retain_derived_metrics_and_review_assets"


class IngestionError(RuntimeError):
    """Raised when video ingestion cannot safely complete."""

    def __init__(self, message: str, *, code: str = "ingestion_error") -> None:
        super().__init__(message)
        self.code = code


class UnsupportedVideoFormatError(IngestionError):
    """Raised when a source extension or MIME type is not supported."""


class VideoIOBackend(Protocol):
    """Adapter interface for video probing, normalization, and frame sampling."""

    name: str

    def probe(self, source_path: Path) -> VideoMetadata:
        """Return container/video metadata for ``source_path``."""

    def normalize(
        self,
        asset: VideoAsset,
        config: NormalizationConfig,
        output_dir: Path,
    ) -> NormalizedVideo:
        """Create an analysis-ready proxy video."""

    def sample_frames(
        self,
        video: NormalizedVideo,
        count: int,
        output_dir: Path,
    ) -> list[FrameSample]:
        """Create frame images for QC or annotation."""


VideoBackend = VideoIOBackend


class FFmpegVideoIOBackend:
    """Small FFmpeg/ffprobe adapter used when binaries are installed.

    The package does not depend on FFmpeg at import time. If ``ffprobe`` or
    ``ffmpeg`` is unavailable, public ingestion functions raise
    :class:`IngestionError` with ``code="backend_unavailable"``.
    """

    name = "ffmpeg"

    def __init__(self, ffprobe_binary: str = "ffprobe", ffmpeg_binary: str = "ffmpeg") -> None:
        self.ffprobe_binary = ffprobe_binary
        self.ffmpeg_binary = ffmpeg_binary

    def probe(self, source_path: Path) -> VideoMetadata:
        self._require_binary(self.ffprobe_binary)
        cmd = [
            self.ffprobe_binary,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(source_path),
        ]
        try:
            completed = subprocess.run(cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as exc:
            raise IngestionError(
                "Video metadata probe failed",
                code="metadata_probe_failed",
            ) from exc

        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise IngestionError(
                "Video metadata probe returned invalid JSON",
                code="metadata_probe_invalid_json",
            ) from exc

        return _metadata_from_ffprobe(payload, source_path)

    def normalize(
        self,
        asset: VideoAsset,
        config: NormalizationConfig,
        output_dir: Path,
    ) -> NormalizedVideo:
        self._require_binary(self.ffmpeg_binary)
        source_path = Path(asset.source_uri)
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{asset.asset_id}_normalized.mp4"

        filter_parts = [f"fps={config.target_fps}"]
        if config.target_resolution is not None:
            width, height = config.target_resolution
            if config.preserve_aspect_ratio:
                filter_parts.extend(
                    [
                        f"scale={width}:{height}:force_original_aspect_ratio=decrease",
                        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
                    ]
                )
            else:
                filter_parts.append(f"scale={width}:{height}")
        filter_parts.append("format=rgb24" if config.target_color_space == "rgb" else "format=yuv420p")

        cmd = [
            self.ffmpeg_binary,
            "-y",
            "-i",
            str(source_path),
            "-vf",
            ",".join(filter_parts),
            "-an",
            "-c:v",
            config.target_codec,
            str(output_path),
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as exc:
            raise IngestionError(
                "Video normalization failed",
                code="normalization_failed",
            ) from exc

        metadata = self.probe(output_path)
        return NormalizedVideo(
            normalized_id=_new_id("norm"),
            source_asset_id=asset.asset_id,
            path=str(output_path),
            metadata=metadata,
            config=config,
            frame_index=_frame_times(metadata),
            provenance=(
                _provenance(
                    "normalize_video_stream",
                    asset.asset_id,
                    {
                        "backend": self.name,
                        "source_uri": asset.source_uri,
                        "output_path": str(output_path),
                        "config": config.to_json_dict(),
                    },
                ),
            ),
        )

    def sample_frames(
        self,
        video: NormalizedVideo,
        count: int,
        output_dir: Path,
    ) -> list[FrameSample]:
        self._require_binary(self.ffmpeg_binary)
        output_dir.mkdir(parents=True, exist_ok=True)
        timestamps = _default_sample_timestamps(video.metadata.duration_seconds or 0.0, count)
        samples: list[FrameSample] = []
        for index, timestamp in enumerate(timestamps):
            output_path = output_dir / f"frame_{index:04d}.jpg"
            cmd = [
                self.ffmpeg_binary,
                "-y",
                "-ss",
                f"{timestamp:.3f}",
                "-i",
                video.path,
                "-frames:v",
                "1",
                str(output_path),
            ]
            try:
                subprocess.run(cmd, check=True, capture_output=True, text=True)
            except subprocess.CalledProcessError as exc:
                raise IngestionError(
                    "Video frame sampling failed",
                    code="frame_sampling_failed",
                ) from exc
            samples.append(
                FrameSample(
                    sample_id=_new_id("sample"),
                    normalized_id=video.normalized_id,
                    frame_number=_frame_index_from_timestamp(timestamp, video.metadata.fps or 0.0),
                    timestamp_seconds=timestamp,
                    path=str(output_path),
                    width=video.metadata.width,
                    height=video.metadata.height,
                )
            )
        return samples

    @staticmethod
    def _require_binary(binary: str) -> None:
        if shutil.which(binary) is None:
            raise IngestionError(
                f"Required video backend binary is unavailable: {binary}",
                code="backend_unavailable",
            )


def import_patient_video(
    source: str | Path | bytes | BinaryIO,
    *,
    patient_ref: str | None = None,
    session_ref: str | None = None,
    task_ref: str | None = None,
    use_case: str = "clinical_task",
    source_type: VideoSourceType | str | None = None,
    source_filename: str | None = None,
    storage_dir: str | Path | None = None,
    consent_ref: str | None = None,
    retention_policy: str = DEFAULT_SOURCE_RETENTION_POLICY,
    backend: VideoIOBackend | None = None,
) -> VideoAsset:
    """Register a local video file or persist an uploaded blob.

    ``bytes`` and file-like inputs are copied into ``storage_dir``. Local paths
    are referenced in place to avoid unnecessary raw-video duplication. The
    returned :class:`VideoAsset` includes metadata when the backend can probe it.
    """

    backend = backend or FFmpegVideoIOBackend()
    now = utc_now_iso()
    resolved_source_type = _resolve_source_type(source, source_type)
    source_path = _materialize_source(source, resolved_source_type, source_filename, storage_dir)
    _validate_video_extension(source_path)

    asset_id = _new_id("asset")
    imported = _provenance(
        "import_patient_video",
        asset_id,
        {
            "source_type": resolved_source_type.value,
            "extension": source_path.suffix.lower(),
            "has_patient_ref": patient_ref is not None,
            "has_session_ref": session_ref is not None,
        },
    )
    metadata = extract_video_metadata(source_path, backend=backend)
    probed = _provenance(
        "extract_video_metadata",
        asset_id,
        {
            "backend": backend.name,
            "duration_seconds": metadata.duration_seconds,
            "fps": metadata.fps,
            "width": metadata.width,
            "height": metadata.height,
        },
    )
    asset = VideoAsset(
        asset_id=asset_id,
        source_uri=str(source_path),
        source_type=resolved_source_type,
        use_case=use_case,  # type: ignore[arg-type]
        created_at=now,
        original_filename=source_filename or source_path.name,
        patient_ref=patient_ref,
        session_ref=session_ref,
        task_ref=task_ref,
        consent_ref=consent_ref,
        retention_policy=retention_policy,
        metadata=metadata,
        provenance=(imported, probed),
    )
    _log_info(
        "video_imported",
        asset_id=asset.asset_id,
        source_type=asset.source_type.value,
        extension=source_path.suffix.lower(),
    )
    return asset


def extract_video_metadata(
    video: VideoAsset | str | Path,
    *,
    backend: VideoIOBackend | None = None,
) -> VideoMetadata:
    """Extract JSON-friendly metadata from a registered video or path."""

    backend = backend or FFmpegVideoIOBackend()
    source_path = _path_from_video(video)
    _ensure_readable_video(source_path)
    try:
        metadata = backend.probe(source_path)
    except IngestionError:
        raise
    except Exception as exc:  # pragma: no cover - defensive adapter boundary.
        raise IngestionError(
            "Video metadata backend failed unexpectedly",
            code="metadata_probe_failed",
        ) from exc
    _log_info(
        "video_metadata_extracted",
        backend=backend.name,
        duration_seconds=metadata.duration_seconds,
        fps=metadata.fps,
        width=metadata.width,
        height=metadata.height,
    )
    return metadata


def normalize_video_stream(
    video: VideoAsset | str | Path,
    *,
    output_dir: str | Path,
    config: NormalizationConfig | None = None,
    backend: VideoIOBackend | None = None,
) -> NormalizedVideo:
    """Normalize a video into a downstream-analysis proxy asset.

    The default FFmpeg backend converts fps, resolution, color space, and codec.
    Tests and cloud agents can pass a fixture backend to avoid codec/runtime
    dependencies.
    """

    config = config or NormalizationConfig()
    backend = backend or FFmpegVideoIOBackend()
    asset = _asset_from_video(video, backend)
    output_dir_path = Path(output_dir)
    output_dir_path.mkdir(parents=True, exist_ok=True)

    try:
        normalized = backend.normalize(asset, config, output_dir_path)
    except IngestionError:
        raise
    except Exception as exc:  # pragma: no cover - defensive adapter boundary.
        raise IngestionError(
            "Video normalization backend failed unexpectedly",
            code="normalization_failed",
        ) from exc
    if not normalized.provenance:
        normalized = replace(
            normalized,
            provenance=(
                _provenance(
                    "normalize_video_stream",
                    asset.asset_id,
                    {
                        "backend": backend.name,
                        "source_uri": asset.source_uri,
                        "output_path": normalized.path,
                        "config": config.to_json_dict(),
                    },
                ),
            ),
        )
    _log_info(
        "video_normalized",
        asset_id=asset.asset_id,
        normalized_id=normalized.normalized_id,
        backend=backend.name,
        target_fps=config.target_fps,
        target_resolution=config.target_resolution,
    )
    return normalized


def sample_video_frames(
    video: VideoAsset | NormalizedVideo | str | Path,
    *,
    output_dir: str | Path,
    count: int = 5,
    timestamps_sec: list[float] | None = None,
    backend: VideoIOBackend | None = None,
) -> list[FrameSample]:
    """Sample frames from a source or normalized video.

    If explicit timestamps are omitted, samples are spread across the video
    duration using available metadata.  ``count`` must be positive.
    """

    if count <= 0:
        raise IngestionError("Frame sample count must be greater than zero", code="invalid_sample_count")

    backend = backend or FFmpegVideoIOBackend()
    normalized = _normalized_from_video(video, backend)

    output_dir_path = Path(output_dir)
    output_dir_path.mkdir(parents=True, exist_ok=True)
    try:
        if timestamps_sec is None:
            samples = backend.sample_frames(normalized, count, output_dir_path)
        else:
            samples = _sample_explicit_timestamps(normalized, timestamps_sec, output_dir_path, backend)
    except IngestionError:
        raise
    except Exception as exc:  # pragma: no cover - defensive adapter boundary.
        raise IngestionError(
            "Video frame sampling backend failed unexpectedly",
            code="frame_sampling_failed",
        ) from exc
    _log_info(
        "video_frames_sampled",
        normalized_id=normalized.normalized_id,
        backend=backend.name,
        sample_count=len(samples),
    )
    return samples


def _metadata_from_ffprobe(payload: dict[str, object], source_path: Path) -> VideoMetadata:
    streams = payload.get("streams")
    video_stream: dict[str, Any] | None = None
    if isinstance(streams, list):
        for stream in streams:
            if isinstance(stream, dict) and stream.get("codec_type") == "video":
                video_stream = cast(dict[str, Any], stream)
                break
    if video_stream is None:
        raise IngestionError("No video stream found in source", code="no_video_stream")

    raw_format_payload = payload.get("format")
    format_payload = (
        cast(dict[str, Any], raw_format_payload) if isinstance(raw_format_payload, dict) else {}
    )
    duration_sec = _float_or_none(video_stream.get("duration")) or _float_or_none(
        format_payload.get("duration")
    )
    fps = _parse_frame_rate(str(video_stream.get("avg_frame_rate") or "0/0")) or _parse_frame_rate(
        str(video_stream.get("r_frame_rate") or "0/0")
    )
    if duration_sec is None or duration_sec <= 0:
        raise IngestionError("Video duration is missing or invalid", code="invalid_duration")
    if fps is None or fps <= 0:
        raise IngestionError("Video frame rate is missing or invalid", code="invalid_fps")

    width = _int_or_none(video_stream.get("width"))
    height = _int_or_none(video_stream.get("height"))
    if width is None or height is None or width <= 0 or height <= 0:
        raise IngestionError("Video resolution is missing or invalid", code="invalid_resolution")

    audio_present = False
    if isinstance(streams, list):
        audio_present = any(
            isinstance(stream, dict) and stream.get("codec_type") == "audio" for stream in streams
        )

    raw_tags = video_stream.get("tags")
    tags = cast(dict[str, Any], raw_tags) if isinstance(raw_tags, dict) else {}
    rotation = _int_or_none(tags.get("rotate"))
    nb_frames = _int_or_none(video_stream.get("nb_frames"))
    frame_count = nb_frames or int(round(duration_sec * fps))
    codec = str(video_stream.get("codec_name") or "") or None
    container = str(format_payload.get("format_name") or source_path.suffix.lstrip(".") or "") or None

    return VideoMetadata(
        duration_seconds=duration_sec,
        fps=fps,
        width=width,
        height=height,
        codec=codec,
        container=container,
        frame_count=frame_count,
        audio_present=audio_present,
        timebase=str(video_stream.get("time_base") or "") or None,
        camera=CameraInfo(orientation_degrees=rotation),
    )


def _resolve_source_type(
    source: str | Path | bytes | BinaryIO,
    source_type: VideoSourceType | str | None,
) -> VideoSourceType:
    if source_type is not None:
        if isinstance(source_type, VideoSourceType):
            return source_type
        try:
            return VideoSourceType(source_type)
        except ValueError as exc:
            raise IngestionError(
                f"Unsupported video source type: {source_type}",
                code="invalid_source_type",
            ) from exc
    if isinstance(source, bytes) or hasattr(source, "read"):
        return VideoSourceType.UPLOAD_BLOB
    return VideoSourceType.FILE


def _materialize_source(
    source: str | Path | bytes | BinaryIO,
    source_type: VideoSourceType,
    upload_filename: str | None,
    storage_dir: str | Path | None,
) -> Path:
    if source_type == VideoSourceType.FILE:
        source_path = Path(source) if isinstance(source, (str, Path)) else None
        if source_path is None:
            raise IngestionError(
                "Disk video source must be a string or Path",
                code="invalid_source",
            )
        _ensure_readable_video(source_path)
        return source_path

    if upload_filename is None:
        raise IngestionError(
            "Upload blob ingestion requires upload_filename",
            code="missing_upload_filename",
        )
    if storage_dir is None:
        raise IngestionError(
            "Upload blob ingestion requires storage_dir",
            code="missing_storage_dir",
        )

    safe_filename = Path(upload_filename).name
    output_dir = Path(storage_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{uuid.uuid4().hex}_{safe_filename}"
    if isinstance(source, bytes):
        output_path.write_bytes(source)
        return output_path
    if hasattr(source, "read"):
        with output_path.open("wb") as destination:
            shutil.copyfileobj(source, destination)
        return output_path
    raise IngestionError("Upload source must be bytes or a binary file", code="invalid_source")


def _path_from_video(video: VideoAsset | NormalizedVideo | str | Path) -> Path:
    if isinstance(video, VideoAsset):
        return Path(video.source_uri)
    if isinstance(video, NormalizedVideo):
        return Path(video.path)
    return Path(video)


def _ensure_readable_video(path: Path) -> None:
    if not path.exists():
        raise IngestionError(
            "Video source does not exist",
            code="source_not_found",
        )
    if not path.is_file():
        raise IngestionError(
            "Video source is not a file",
            code="source_not_file",
        )
    _validate_video_extension(path)


def _validate_video_extension(path: Path) -> None:
    extension = path.suffix.lower()
    if extension not in SUPPORTED_VIDEO_EXTENSIONS:
        media_type, _encoding = mimetypes.guess_type(path.name)
        if not (media_type or "").startswith("video/"):
            raise UnsupportedVideoFormatError(
                f"Unsupported video format: {extension or '<none>'}",
                code="unsupported_format",
            )


def _default_sample_timestamps(duration_sec: float, count: int) -> list[float]:
    if duration_sec <= 0:
        raise IngestionError("Cannot sample frames from invalid duration", code="invalid_duration")
    if count == 1:
        return [duration_sec / 2]
    step = duration_sec / (count + 1)
    return [round(step * (index + 1), 6) for index in range(count)]


def _frame_index_from_timestamp(timestamp_sec: float, fps: float) -> int:
    if fps <= 0:
        return 0
    return max(0, int(round(timestamp_sec * fps)))


def _parse_frame_rate(value: str) -> float | None:
    if "/" in value:
        numerator, denominator = value.split("/", 1)
        num = _float_or_none(numerator)
        den = _float_or_none(denominator)
        if num is None or den is None or den == 0:
            return None
        return num / den
    return _float_or_none(value)


def _float_or_none(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _int_or_none(value: object) -> int | None:
    try:
        return int(float(value))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _frame_times(metadata: VideoMetadata) -> tuple[float, ...]:
    if metadata.duration_seconds is None or metadata.fps is None or metadata.fps <= 0:
        return ()
    frame_count = metadata.frame_count or int(round(metadata.duration_seconds * metadata.fps))
    return tuple(round(index / metadata.fps, 6) for index in range(max(0, frame_count)))


def _provenance(operation: str, asset_id: str, details: dict[str, object] | None = None) -> ProvenanceRecord:
    return ProvenanceRecord(
        record_id=_new_id("prov"),
        operation=operation,
        asset_id=asset_id,
        created_at=utc_now_iso(),
        details=details or {},
    )


def _asset_from_video(video: VideoAsset | str | Path, backend: VideoIOBackend) -> VideoAsset:
    if isinstance(video, VideoAsset):
        return video
    return import_patient_video(video, backend=backend)


def _normalized_from_video(
    video: VideoAsset | NormalizedVideo | str | Path,
    backend: VideoIOBackend,
) -> NormalizedVideo:
    if isinstance(video, NormalizedVideo):
        return video
    return normalize_video_stream(video, output_dir=Path(_path_from_video(video)).parent, backend=backend)


def _sample_explicit_timestamps(
    video: NormalizedVideo,
    timestamps_sec: list[float],
    output_dir: Path,
    backend: VideoIOBackend,
) -> list[FrameSample]:
    if not timestamps_sec:
        raise IngestionError("Frame sampling requires at least one timestamp", code="invalid_timestamps")
    if any(timestamp < 0 for timestamp in timestamps_sec):
        raise IngestionError("Frame sampling timestamps must be non-negative", code="invalid_timestamps")

    # The generic backend protocol samples by count. For explicit timestamps, the
    # built-in FFmpeg backend can honor exact times; other backends can provide
    # deterministic count-based samples for tests and local development.
    if isinstance(backend, FFmpegVideoIOBackend):
        output_dir.mkdir(parents=True, exist_ok=True)
        samples: list[FrameSample] = []
        backend._require_binary(backend.ffmpeg_binary)
        for index, timestamp in enumerate(timestamps_sec):
            output_path = output_dir / f"frame_{index:04d}.jpg"
            cmd = [
                backend.ffmpeg_binary,
                "-y",
                "-ss",
                f"{timestamp:.3f}",
                "-i",
                video.path,
                "-frames:v",
                "1",
                str(output_path),
            ]
            try:
                subprocess.run(cmd, check=True, capture_output=True, text=True)
            except subprocess.CalledProcessError as exc:
                raise IngestionError("Video frame sampling failed", code="frame_sampling_failed") from exc
            samples.append(
                FrameSample(
                    sample_id=_new_id("sample"),
                    normalized_id=video.normalized_id,
                    frame_number=_frame_index_from_timestamp(timestamp, video.metadata.fps or 0.0),
                    timestamp_seconds=timestamp,
                    path=str(output_path),
                    width=video.metadata.width,
                    height=video.metadata.height,
                )
            )
        return samples
    return backend.sample_frames(video, len(timestamps_sec), output_dir)


def _log_info(event: str, **fields: object) -> None:
    # Keep logs structured without requiring a non-stdlib logging dependency.
    logger.info(event, extra={"event": event, **fields})

