"""Noop and fixture pose backend implementations.

These adapters are intentionally lightweight. They make the pose engine usable
in tests and local development without MediaPipe, OpenPose, PyTorch, GPU
drivers, webcams, or model downloads.
"""
from __future__ import annotations

from collections.abc import Sequence

from deepsynaps_video.schemas import ProvenanceRecord

from ..base import PoseBackend, backend_provenance
from ..schemas import CameraParameters, Pose2DSequence, Pose3DSequence, PoseBackendInfo


class NoopPoseBackend(PoseBackend):
    """Backend that advertises support but returns empty pose sequences."""

    name = "noop"
    version = "0.1.0"
    supported_dimensions = (2, 3)

    def backend_info(self) -> PoseBackendInfo:
        """Return stable backend metadata for noop outputs."""

        return PoseBackendInfo(name=self.name, version=self.version)

    def provenance(self, operation: str, source_ref: str) -> tuple[ProvenanceRecord, ...]:
        """Return standard provenance for noop backend operations."""

        return backend_provenance(self, operation, source_ref)

    def estimate_2d(
        self,
        video_ref: str,
        *,
        frames_ref: Sequence[str] | None = None,
        frame_times: Sequence[float] = (),
        subject_id: str | None = None,
        parameters: dict[str, object] | None = None,
    ) -> Pose2DSequence:
        _ = (frames_ref, subject_id, parameters)
        return Pose2DSequence(
            sequence_id=f"pose2d_noop_{abs(hash((video_ref, frame_times)))}",
            source_ref=video_ref,
            backend=self.backend_info(),
            frames=(),
            provenance=self.provenance("estimate_2d_pose", video_ref),
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
            sequence_id=f"pose3d_noop_{pose_2d.sequence_id}",
            source_pose_2d_id=pose_2d.sequence_id,
            source_ref=pose_2d.source_ref,
            backend=self.backend_info(),
            frames=(),
            camera=selected_camera,
            provenance=self.provenance("estimate_3d_pose", pose_2d.sequence_id),
        )
