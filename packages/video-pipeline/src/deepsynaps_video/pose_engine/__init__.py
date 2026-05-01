"""Pose and motion engine for DeepSynaps patient video analysis.

The module provides a PosePipe-style adapter layer. Public functions select a
registered backend, normalize backend-specific outputs into common pose schemas,
and compute basic motion signals. Heavy pose-estimation libraries are not
imported here; real backends should live under ``pose_engine/backends`` and be
registered explicitly.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import replace
from typing import Iterable

from .base import PoseBackend, PoseEngineError, get_pose_backend, register_pose_backend
from .backends.noop_backend import NoopPoseBackend
from .schemas import (
    CameraParameters,
    JointTrajectory,
    Pose2DSequence,
    Pose3DSequence,
    PoseBackendInfo,
    PoseFrame2D,
    PoseFrame3D,
    PoseJoint2D,
    PoseJoint3D,
)


def estimate_2d_pose(
    video_ref: str,
    *,
    backend: str | PoseBackend = "noop",
    frame_times: Iterable[float] | None = None,
    subject_id: str | None = None,
    parameters: dict[str, object] | None = None,
) -> Pose2DSequence:
    """Estimate 2D pose for a video or frame reference.

    ``video_ref`` is a URI/path/reference emitted by ingestion. ``backend`` can
    be a registered backend name such as ``"mediapipe"`` or a concrete backend
    instance. The default ``noop`` backend is deterministic and intended for
    tests and pipeline wiring only.
    """

    selected_backend = _resolve_backend(backend)
    return selected_backend.estimate_2d(
        video_ref=video_ref,
        frame_times=tuple(frame_times or ()),
        subject_id=subject_id,
        parameters=parameters or {},
    )


def estimate_3d_pose(
    pose_2d_ref: Pose2DSequence,
    *,
    backend: str | PoseBackend = "noop",
    camera_params: CameraParameters | None = None,
    parameters: dict[str, object] | None = None,
) -> Pose3DSequence:
    """Lift or infer 3D pose from a 2D pose sequence.

    Backends may use camera parameters, learned lifting models, multi-view
    geometry, or deterministic fixture behavior. This wrapper only enforces the
    common DeepSynaps schema.
    """

    selected_backend = _resolve_backend(backend)
    return selected_backend.estimate_3d(
        pose_2d=pose_2d_ref,
        camera_params=camera_params,
        parameters=parameters or {},
    )


def extract_joint_trajectories(
    pose_sequence: Pose2DSequence | Pose3DSequence,
    *,
    min_confidence: float = 0.0,
) -> tuple[JointTrajectory, ...]:
    """Convert a pose sequence into one trajectory per joint.

    Joint coordinates are ordered by frame time. Missing or low-confidence joints
    become ``None`` entries so downstream clinical analyzers can compute
    explicit missingness/QC instead of silently interpolating.
    """

    if min_confidence < 0.0 or min_confidence > 1.0:
        raise PoseEngineError("min_confidence must be between 0 and 1")

    frame_times = tuple(frame.timestamp_seconds for frame in pose_sequence.frames)
    grouped: dict[str, list[tuple[float, float, float | None] | None]] = defaultdict(list)

    joint_names = sorted(
        {
            joint.name
            for frame in pose_sequence.frames
            for joint in frame.joints
        }
    )
    for frame in pose_sequence.frames:
        by_name = {joint.name: joint for joint in frame.joints}
        for joint_name in joint_names:
            joint = by_name.get(joint_name)
            if joint is None or joint.confidence < min_confidence:
                grouped[joint_name].append(None)
                continue
            if isinstance(joint, PoseJoint3D):
                grouped[joint_name].append((joint.x, joint.y, joint.z))
            else:
                grouped[joint_name].append((joint.x, joint.y, None))

    return tuple(
        JointTrajectory(
            joint_name=joint_name,
            timestamps_seconds=frame_times,
            coordinates=tuple(coordinates),
        )
        for joint_name, coordinates in sorted(grouped.items())
    )


def smooth_pose_trajectories(
    pose_sequence: Pose2DSequence | Pose3DSequence,
    *,
    window_size: int = 3,
) -> Pose2DSequence | Pose3DSequence:
    """Apply centered moving-average smoothing to joint coordinates.

    This helper is intentionally simple and deterministic. It preserves frame
    order, joint names, confidence values, provenance, and dimensions. Missing
    joints are not fabricated; only coordinates present in each frame are
    smoothed using neighboring frames that contain the same joint.
    """

    if window_size <= 0:
        raise PoseEngineError("window_size must be positive")
    if window_size == 1 or not pose_sequence.frames:
        return pose_sequence

    half_window = window_size // 2
    if isinstance(pose_sequence, Pose3DSequence):
        smoothed_3d = _smooth_3d_frames(pose_sequence.frames, half_window)
        return replace(
            pose_sequence,
            sequence_id=f"{pose_sequence.sequence_id}_smoothed",
            frames=smoothed_3d,
            processing={
                **pose_sequence.processing,
                "smoothing": {"method": "centered_moving_average", "window_size": window_size},
            },
        )

    smoothed_2d = _smooth_2d_frames(pose_sequence.frames, half_window)
    return replace(
        pose_sequence,
        sequence_id=f"{pose_sequence.sequence_id}_smoothed",
        frames=smoothed_2d,
        processing={
            **pose_sequence.processing,
            "smoothing": {"method": "centered_moving_average", "window_size": window_size},
        },
    )


def _smooth_2d_frames(
    frames: tuple[PoseFrame2D, ...],
    half_window: int,
) -> tuple[PoseFrame2D, ...]:
    smoothed_frames: list[PoseFrame2D] = []
    for frame_index, frame in enumerate(frames):
        new_joints: list[PoseJoint2D] = []
        for joint in frame.joints:
            neighborhood = _matching_2d_joints(
                frames,
                joint.name,
                start=max(0, frame_index - half_window),
                end=min(len(frames), frame_index + half_window + 1),
            )
            if not neighborhood:
                new_joints.append(joint)
                continue
            smoothed = replace(
                joint,
                x=sum(item.x for item in neighborhood) / len(neighborhood),
                y=sum(item.y for item in neighborhood) / len(neighborhood),
            )
            new_joints.append(smoothed)
        smoothed_frames.append(replace(frame, joints=tuple(new_joints)))
    return tuple(smoothed_frames)


def _smooth_3d_frames(
    frames: tuple[PoseFrame3D, ...],
    half_window: int,
) -> tuple[PoseFrame3D, ...]:
    smoothed_frames: list[PoseFrame3D] = []
    for frame_index, frame in enumerate(frames):
        new_joints: list[PoseJoint3D] = []
        for joint in frame.joints:
            neighborhood = _matching_3d_joints(
                frames,
                joint.name,
                start=max(0, frame_index - half_window),
                end=min(len(frames), frame_index + half_window + 1),
            )
            if not neighborhood:
                new_joints.append(joint)
                continue
            smoothed = replace(
                joint,
                x=sum(item.x for item in neighborhood) / len(neighborhood),
                y=sum(item.y for item in neighborhood) / len(neighborhood),
                z=sum(item.z for item in neighborhood) / len(neighborhood),
            )
            new_joints.append(smoothed)
        smoothed_frames.append(replace(frame, joints=tuple(new_joints)))
    return tuple(smoothed_frames)


def _resolve_backend(backend: str | PoseBackend) -> PoseBackend:
    if isinstance(backend, str):
        return get_pose_backend(backend)
    return backend


def _matching_2d_joints(
    frames: tuple[PoseFrame2D, ...],
    joint_name: str,
    *,
    start: int,
    end: int,
) -> tuple[PoseJoint2D, ...]:
    matches: list[PoseJoint2D] = []
    for frame in frames[start:end]:
        for joint in frame.joints:
            if joint.name == joint_name:
                matches.append(joint)
                break
    return tuple(matches)


def _matching_3d_joints(
    frames: tuple[PoseFrame3D, ...],
    joint_name: str,
    *,
    start: int,
    end: int,
) -> tuple[PoseJoint3D, ...]:
    matches: list[PoseJoint3D] = []
    for frame in frames[start:end]:
        for joint in frame.joints:
            if joint.name == joint_name:
                matches.append(joint)
                break
    return tuple(matches)


register_pose_backend(NoopPoseBackend())

__all__ = [
    "CameraParameters",
    "JointTrajectory",
    "NoopPoseBackend",
    "Pose2DSequence",
    "Pose3DSequence",
    "PoseBackend",
    "PoseBackendInfo",
    "PoseEngineError",
    "PoseFrame2D",
    "PoseFrame3D",
    "PoseJoint2D",
    "PoseJoint3D",
    "estimate_2d_pose",
    "estimate_3d_pose",
    "extract_joint_trajectories",
    "get_pose_backend",
    "register_pose_backend",
    "smooth_pose_trajectories",
]
