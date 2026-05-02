from __future__ import annotations

import pytest

from deepsynaps_video.pose_engine import (
    PoseBackend,
    PoseEngineError,
    estimate_2d_pose,
    estimate_3d_pose,
    extract_joint_trajectories,
    register_pose_backend,
    smooth_pose_trajectories,
)
from deepsynaps_video.pose_engine.backends.noop_backend import NoopPoseBackend
from deepsynaps_video.pose_engine.schemas import (
    CameraParameters,
    JointTrajectory,
    PoseBackendInfo,
    PoseFrame2D,
    PoseFrame3D,
    PoseJoint2D,
    PoseJoint3D,
    Pose2DSequence,
    Pose3DSequence,
)


class FakePoseBackend(PoseBackend):
    name = "fake"
    version = "1.0"
    supported_dimensions = (2, 3)

    def backend_info(self) -> PoseBackendInfo:
        return PoseBackendInfo(name=self.name, version=self.version)

    def provenance(self, operation: str, source_ref: str):
        return ()

    def estimate_2d(
        self,
        video_ref: str,
        *,
        frames_ref=None,
        frame_times=(),
        subject_id=None,
        parameters=None,
    ) -> Pose2DSequence:
        return Pose2DSequence(
            sequence_id="pose2d_fake",
            source_ref=video_ref,
            backend=self.backend_info(),
            frames=(
                PoseFrame2D(
                    frame_number=0,
                    timestamp_seconds=0.0,
                    joints=(
                        PoseJoint2D("left_wrist", 0.0, 0.0, confidence=0.9),
                        PoseJoint2D("right_wrist", 2.0, 2.0, confidence=0.8),
                    ),
                ),
                PoseFrame2D(
                    frame_number=1,
                    timestamp_seconds=1.0,
                    joints=(
                        PoseJoint2D("left_wrist", 2.0, 2.0, confidence=0.7),
                        PoseJoint2D("right_wrist", 4.0, 4.0, confidence=0.6),
                    ),
                ),
                PoseFrame2D(
                    frame_number=2,
                    timestamp_seconds=2.0,
                    joints=(PoseJoint2D("left_wrist", 4.0, 4.0, confidence=0.5),),
                ),
            ),
        )

    def estimate_3d(
        self,
        pose_2d: Pose2DSequence,
        *,
        camera_params: CameraParameters | None = None,
        camera: CameraParameters | None = None,
        parameters: dict[str, object] | None = None,
    ) -> Pose3DSequence:
        _ = parameters
        selected_camera = camera_params or camera
        return Pose3DSequence(
            sequence_id="pose3d_fake",
            source_pose_2d_id=pose_2d.sequence_id,
            source_ref=pose_2d.source_ref,
            backend=self.backend_info(),
            frames=tuple(
                PoseFrame3D(
                    frame_number=frame.frame_number,
                    timestamp_seconds=frame.timestamp_seconds,
                    joints=tuple(
                        PoseJoint3D(joint.name, joint.x, joint.y, z=1.0, confidence=joint.confidence)
                        for joint in frame.joints
                    ),
                )
                for frame in pose_2d.frames
            ),
            camera=selected_camera,
        )


def test_estimate_2d_pose_selects_registered_backend() -> None:
    backend = FakePoseBackend()
    register_pose_backend(backend)

    pose = estimate_2d_pose("video://fixture", backend="fake")

    assert isinstance(pose, Pose2DSequence)
    assert pose.backend.name == "fake"
    assert pose.frames[0].joints[0].name == "left_wrist"
    payload = pose.to_json_dict()
    assert payload["frames"][0]["joints"][0]["confidence"] == 0.9


def test_estimate_2d_pose_unknown_backend_raises() -> None:
    with pytest.raises(PoseEngineError, match="Unknown pose backend"):
        estimate_2d_pose("video://fixture", backend="missing")


def test_noop_backend_returns_empty_sequence_with_provenance_shape() -> None:
    register_pose_backend(NoopPoseBackend())

    pose = estimate_2d_pose("video://fixture", backend="noop")

    assert pose.backend.name == "noop"
    assert pose.frames == ()
    assert pose.provenance


def test_estimate_3d_pose_delegates_to_backend() -> None:
    register_pose_backend(FakePoseBackend())
    pose_2d = estimate_2d_pose("video://fixture", backend="fake")
    camera = CameraParameters(focal_length_x=1000.0)

    pose_3d = estimate_3d_pose(pose_2d, backend="fake", camera_params=camera)

    assert isinstance(pose_3d, Pose3DSequence)
    assert isinstance(pose_3d.frames[0].joints[0], PoseJoint3D)
    assert pose_3d.camera == camera
    assert pose_3d.frames[0].joints[0].z == 1.0


def test_extract_joint_trajectories_groups_by_joint_name() -> None:
    pose = FakePoseBackend().estimate_2d(video_ref="video://fixture")

    trajectories = extract_joint_trajectories(pose)

    by_name = {trajectory.joint_name: trajectory for trajectory in trajectories}
    assert set(by_name) == {"left_wrist", "right_wrist"}
    assert isinstance(by_name["left_wrist"], JointTrajectory)
    assert by_name["left_wrist"].timestamps_seconds == (0.0, 1.0, 2.0)
    assert by_name["right_wrist"].coordinates[1] == (4.0, 4.0, None)


def test_smooth_pose_trajectories_returns_new_smoothed_sequence() -> None:
    pose = FakePoseBackend().estimate_2d(video_ref="video://fixture")

    smoothed = smooth_pose_trajectories(pose, window_size=3)

    assert smoothed.sequence_id != pose.sequence_id
    assert smoothed.backend == pose.backend
    assert smoothed.frames[1].joints[0].x == pytest.approx(2.0)
    assert smoothed.frames[1].joints[0].y == pytest.approx(2.0)
    assert smoothed.frames[1].joints[0].confidence == pytest.approx(0.7)
    assert smoothed.frames[2].joints[0].x == pytest.approx(3.0)
    assert smoothed.processing["smoothing"]["window_size"] == 3


def test_smooth_pose_trajectories_validates_window_size() -> None:
    pose = FakePoseBackend().estimate_2d(video_ref="video://fixture")

    with pytest.raises(PoseEngineError, match="window_size"):
        smooth_pose_trajectories(pose, window_size=0)
