"""Typed schemas for the DeepSynaps Audio / Voice Analyzer.

The ingestion and quality layer returns these dataclasses so downstream
acoustic, neurological, cognitive, respiratory, reporting, and workflow modules
can consume stable objects without depending on a specific audio I/O backend.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Literal
from uuid import uuid4

import numpy as np
from numpy.typing import NDArray


class UseCase(str, Enum):
    """Supported audio analysis workflow families."""

    NEUROLOGY = "neurology"
    NEUROMODULATION = "neuromodulation"
    RESPIRATORY = "respiratory"
    COGNITIVE = "cognitive"


UseCaseValue = Literal["neurology", "neuromodulation", "respiratory", "cognitive"]
QualityStatus = Literal["pass", "warn", "fail"]


@dataclass(frozen=True)
class AudioMetadata:
    """Container-level and signal-level metadata for a voice recording."""

    duration_sec: float
    sample_rate_hz: int
    channels: int
    bit_depth: int | None
    frame_count: int
    format: str | None = None
    subtype: str | None = None
    backend: str | None = None
    storage_uri: str | None = None

    @property
    def frames(self) -> int:
        """Backward-compatible alias for ``frame_count``."""

        return self.frame_count


@dataclass(frozen=True)
class VoiceAsset:
    """Immutable reference to an imported patient voice/speech recording.

    Raw audio should remain in patient-scoped storage. This object carries only
    the storage reference, safe linkage identifiers, metadata, hashes, and
    provenance needed by downstream analyzer modules.
    """

    asset_id: str
    sha256: str
    metadata: AudioMetadata
    use_case: UseCase | UseCaseValue
    source_kind: Literal["path", "bytes", "binary"] = "path"
    patient_ref: str | None = None
    session_ref: str | None = None
    task_ref: str | None = None
    storage_path: Path | None = None
    source_uri: str | None = None
    source_filename: str | None = None
    consent_ref: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def content_hash(self) -> str:
        """Alias used by provenance/reporting code."""

        return self.sha256


@dataclass(frozen=True)
class QualityConfig:
    """Configuration thresholds for basic audio quality checks."""

    expected_channels: int = 1
    clipping_threshold: float = 0.99
    max_clipping_proportion_warn: float = 0.001
    max_clipping_proportion_fail: float = 0.01
    silence_rms_threshold: float = 0.01
    max_silence_proportion_warn: float = 0.5
    max_silence_proportion_fail: float = 0.85
    min_snr_db_warn: float = 15.0
    min_snr_db_fail: float = 6.0
    min_snr_db: float | None = None
    min_loudness_range_db_warn: float = 3.0
    min_duration_sec: float = 0.25
    frame_duration_sec: float = 0.02
    channel_mismatch_threshold: float = 0.2

    def resolved_min_snr_warn(self) -> float:
        """Return compatibility override or the default warning threshold."""

        return self.min_snr_db if self.min_snr_db is not None else self.min_snr_db_warn


@dataclass(frozen=True)
class QualityWarning:
    """Machine-readable QC warning emitted by the ingestion layer."""

    code: str
    message: str
    severity: Literal["warn", "fail"] = "warn"


@dataclass(frozen=True)
class AudioQualityResult:
    """Basic QC result attached to downstream feature and analyzer outputs."""

    status: QualityStatus
    estimated_snr_db: float | None
    clipping_proportion: float
    silence_proportion: float
    loudness_range_db: float
    background_noise_rms: float
    channel_mismatch: bool
    duration_sec: float
    sample_rate_hz: int
    warnings: tuple[QualityWarning, ...] = ()
    metadata: AudioMetadata | None = None

    @property
    def snr_db(self) -> float | None:
        """Short alias for ``estimated_snr_db``."""

        return self.estimated_snr_db

    @property
    def channel_mismatch_detected(self) -> bool:
        """Boolean alias used by tests and report templates."""

        return self.channel_mismatch


@dataclass(frozen=True)
class VoiceSegment:
    """A task-specific audio segment prepared for downstream analysis."""

    segment_id: str
    task_ref: str
    start_sec: float
    end_sec: float
    duration_sec: float
    sample_rate_hz: int
    samples: NDArray[np.float64]
    metadata: AudioMetadata
    source_asset_id: str | None = None

    @property
    def waveform(self) -> NDArray[np.float64]:
        """Alias for downstream analyzers that prefer ``waveform`` terminology."""

        return self.samples


def new_asset_id() -> str:
    """Return a stable prefix for voice assets created by the ingestion layer."""

    return f"voice_asset_{uuid4().hex}"


def new_segment_id(task_ref: str) -> str:
    """Return a stable prefix for task segments created by the ingestion layer."""

    safe_task = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in task_ref)
    return f"voice_segment_{safe_task}_{uuid4().hex}"


def uri_to_path(source_uri: str) -> Path:
    """Convert a local file URI/string stored in a VoiceAsset to a Path."""

    if source_uri.startswith("file://"):
        return Path(source_uri[7:])
    return Path(source_uri)
