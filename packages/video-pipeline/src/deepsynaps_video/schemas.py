"""JSON-friendly schemas for DeepSynaps video ingestion.

The video package keeps its base install dependency-light. These dataclasses are
small, typed contracts for ingestion outputs and can be serialized without
Pydantic, OpenCV, FFmpeg bindings, or model runtimes.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Literal, cast


VideoUseCase = Literal["clinical_task", "monitoring"]
VideoColorSpace = Literal["rgb", "bgr", "grayscale", "unknown"]


class VideoSourceType(str, Enum):
    """Supported source categories for ingestion."""

    FILE = "file"
    UPLOAD_BLOB = "upload_blob"


def utc_now_iso() -> str:
    """Return an ISO-8601 UTC timestamp with second precision."""

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def path_to_uri(path: str | Path) -> str:
    """Return a portable file URI for a local path."""

    return Path(path).expanduser().resolve().as_uri()


def json_ready(value: Any) -> Any:
    """Recursively convert dataclasses/enums/paths into JSON-friendly values."""

    if is_dataclass(value) and not isinstance(value, type):
        return {key: json_ready(item) for key, item in asdict(cast(Any, value)).items()}
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, tuple):
        return [json_ready(item) for item in value]
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    if isinstance(value, dict):
        return {str(key): json_ready(item) for key, item in value.items()}
    return value


@dataclass(frozen=True)
class CameraInfo:
    """Optional camera/device context captured at upload or probe time."""

    device_model: str | None = None
    device_label: str | None = None
    camera_position: str | None = None
    orientation_degrees: int | None = None
    capture_app: str | None = None
    notes: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class VideoMetadata:
    """Container and stream metadata needed before pose or analysis runs."""

    duration_seconds: float | None
    fps: float | None
    frame_count: int | None
    width: int | None
    height: int | None
    codec: str | None = None
    container: str | None = None
    color_space: VideoColorSpace = "unknown"
    audio_present: bool | None = None
    timebase: str | None = None
    camera: CameraInfo = field(default_factory=CameraInfo)
    warnings: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class VideoAsset:
    """Registered patient video asset.

    ``patient_ref`` is an opaque caller-provided reference. Do not place names,
    MRNs, or other PHI in this field.
    """

    asset_id: str
    source_type: VideoSourceType
    source_uri: str
    use_case: VideoUseCase
    created_at: str
    original_filename: str | None = None
    patient_ref: str | None = None
    session_ref: str | None = None
    task_ref: str | None = None
    consent_ref: str | None = None
    retention_policy: str = "derived_metrics_preferred"
    metadata: VideoMetadata | None = None
    provenance: tuple["ProvenanceRecord", ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class NormalizationConfig:
    """Requested analysis format for downstream pose estimation."""

    target_fps: float = 30.0
    target_resolution: tuple[int, int] | None = None
    target_color_space: VideoColorSpace = "rgb"
    target_codec: str = "libx264"
    preserve_aspect_ratio: bool = True

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class FrameSample:
    """Reference to a sampled frame prepared for QC or annotation."""

    sample_id: str
    normalized_id: str
    frame_number: int
    timestamp_seconds: float
    path: str
    width: int | None = None
    height: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class NormalizedVideo:
    """Analysis-ready video reference and deterministic frame index."""

    normalized_id: str
    source_asset_id: str
    path: str
    metadata: VideoMetadata
    config: NormalizationConfig = field(default_factory=NormalizationConfig)
    frame_index: tuple[float, ...] = ()
    created_at: str = field(default_factory=utc_now_iso)
    provenance: tuple["ProvenanceRecord", ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class ProvenanceRecord:
    """Minimal ingestion provenance record for auditability."""

    record_id: str
    operation: str
    asset_id: str
    created_at: str
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()

