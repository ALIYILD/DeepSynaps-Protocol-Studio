"""Common pose schemas for DeepSynaps Video Analyzer.

Every pose backend is normalized into these dataclasses so downstream clinical
analyzers do not depend on MediaPipe, OpenPose, RTMPose, or any other
model-specific output shape.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from deepsynaps_video.schemas import ProvenanceRecord, json_ready, utc_now_iso


@dataclass(frozen=True)
class CameraParameters:
    """Optional camera calibration used for 3D lifting or projection."""

    width: int | None = None
    height: int | None = None
    focal_length_x: float | None = None
    focal_length_y: float | None = None
    principal_point_x: float | None = None
    principal_point_y: float | None = None
    extrinsics: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class PoseBackendInfo:
    """Backend identity and version metadata attached to every pose output."""

    name: str
    version: str
    model_name: str | None = None
    model_version: str | None = None
    parameters: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class PoseJoint2D:
    """A normalized 2D joint/keypoint in a single frame."""

    name: str
    x: float
    y: float
    confidence: float
    visibility: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class PoseJoint3D:
    """A normalized 3D joint/keypoint in a single frame."""

    name: str
    x: float
    y: float
    z: float
    confidence: float
    visibility: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class PoseFrame2D:
    """All visible 2D joints for one subject at one timestamp."""

    frame_number: int
    timestamp_seconds: float
    joints: tuple[PoseJoint2D, ...]
    subject_id: str = "subject_0"

    def joint_map(self) -> dict[str, PoseJoint2D]:
        """Return joints keyed by canonical joint name."""

        return {joint.name: joint for joint in self.joints}

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class PoseFrame3D:
    """All visible 3D joints for one subject at one timestamp."""

    frame_number: int
    timestamp_seconds: float
    joints: tuple[PoseJoint3D, ...]
    subject_id: str = "subject_0"

    def joint_map(self) -> dict[str, PoseJoint3D]:
        """Return joints keyed by canonical joint name."""

        return {joint.name: joint for joint in self.joints}

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class Pose2DSequence:
    """Backend-normalized 2D pose sequence for one video or frame collection."""

    sequence_id: str
    source_ref: str
    backend: PoseBackendInfo
    frames: tuple[PoseFrame2D, ...]
    joint_schema: str = "deepsynaps_common_v1"
    created_at: str = field(default_factory=utc_now_iso)
    provenance: tuple[ProvenanceRecord, ...] = ()
    processing: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class Pose3DSequence:
    """Backend-normalized 3D pose sequence linked to a source 2D sequence."""

    sequence_id: str
    source_pose_2d_id: str
    source_ref: str
    backend: PoseBackendInfo
    frames: tuple[PoseFrame3D, ...]
    joint_schema: str = "deepsynaps_common_v1"
    created_at: str = field(default_factory=utc_now_iso)
    camera: CameraParameters | None = None
    provenance: tuple[ProvenanceRecord, ...] = ()
    processing: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class JointTrajectory:
    """Time series for a single joint across a pose sequence."""

    joint_name: str
    timestamps_seconds: tuple[float, ...]
    coordinates: tuple[tuple[float, float, float | None] | None, ...]

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()

