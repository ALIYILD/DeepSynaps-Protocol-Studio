"""Adapter contracts for DeepSynaps pose-estimation backends.

The pose engine follows a PosePipe-style adapter boundary: concrete model
implementations can live behind this protocol, while downstream clinical code
consumes only DeepSynaps pose schemas.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from deepsynaps_video.schemas import ProvenanceRecord, utc_now_iso

from .schemas import CameraParameters, Pose2DSequence, Pose3DSequence


class PoseEngineError(RuntimeError):
    """Raised when pose backend selection or motion processing fails."""


class PoseBackend(Protocol):
    """Protocol implemented by 2D and optional 3D pose backends."""

    name: str
    version: str
    supported_dimensions: tuple[int, ...]

    def estimate_2d(
        self,
        video_ref: str,
        *,
        frames_ref: Sequence[str] | None = None,
        frame_times: Sequence[float] = (),
        subject_id: str | None = None,
        parameters: dict[str, object] | None = None,
    ) -> Pose2DSequence:
        """Estimate normalized 2D pose from a normalized video or frame list."""

    def estimate_3d(
        self,
        pose_2d: Pose2DSequence,
        *,
        camera_params: CameraParameters | None = None,
        camera: CameraParameters | None = None,
        parameters: dict[str, object] | None = None,
    ) -> Pose3DSequence:
        """Lift 2D pose to 3D when supported."""

    def backend_info(self) -> object:
        """Return backend metadata for provenance."""

    def provenance(self, operation: str, source_ref: str) -> tuple[ProvenanceRecord, ...]:
        """Return provenance records for backend operations."""


_BACKENDS: dict[str, PoseBackend] = {}


def register_pose_backend(backend: PoseBackend) -> None:
    """Register a pose backend adapter by name."""

    _BACKENDS[backend.name] = backend


def get_pose_backend(name: str) -> PoseBackend:
    """Return a registered pose backend adapter."""

    try:
        return _BACKENDS[name]
    except KeyError as exc:
        raise PoseEngineError(f"Unknown pose backend: {name}") from exc


def backend_provenance(backend: PoseBackend, operation: str, source_ref: str) -> tuple[ProvenanceRecord, ...]:
    """Build a standard backend provenance record."""

    return (
        ProvenanceRecord(
            record_id=f"poseprov_{abs(hash((backend.name, operation, source_ref)))}",
            operation=operation,
            asset_id=source_ref,
            created_at=utc_now_iso(),
            details={
                "backend_name": backend.name,
                "backend_version": backend.version,
                "supported_dimensions": list(backend.supported_dimensions),
            },
        ),
    )

