"""Pluggable pose estimation backend for video movement analysis.

Default: MediaPipe BlazePose (Apache-2.0)
- 33 keypoints, ICC=0.94 vs physiotherapists
- 30 FPS on mobile, 60+ FPS on desktop
- On-device inference, no network required

Decision-support only: pose data requires clinician review.
"""
from __future__ import annotations

import logging
from enum import Enum
from typing import Any

_log = logging.getLogger(__name__)


def _clamp01(x: float) -> float:
    """Clamp value to [0.0, 1.0] range."""
    return max(0.0, min(1.0, x))


#: MediaPipe BlazePose keypoint names (33 keypoints total)
_MEDIAPIPE_KEYPOINT_NAMES = [
    "nose",
    "left_eye_inner",
    "left_eye",
    "left_eye_outer",
    "right_eye_inner",
    "right_eye",
    "right_eye_outer",
    "left_ear",
    "right_ear",
    "mouth_left",
    "mouth_right",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_pinky",
    "right_pinky",
    "left_index",
    "right_index",
    "left_thumb",
    "right_thumb",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
    "left_heel",
    "right_heel",
    "left_foot_index",
    "right_foot_index",
]

#: Clinical movement feature schema for evidence-based assessment
_MOVEMENT_FEATURE_SCHEMA: dict[str, dict[str, str]] = {
    "gait_speed": {"unit": "m/s", "confidence_range": "0.0-1.0"},
    "stride_length": {"unit": "m", "confidence_range": "0.0-1.0"},
    "arm_swing_amplitude": {"unit": "degrees", "confidence_range": "0.0-1.0"},
    "tremor_band_power_4_6hz": {"unit": "arbitrary", "confidence_range": "0.0-1.0"},
    "postural_sway_area": {"unit": "mm\u00b2", "confidence_range": "0.0-1.0"},
    "movement_smoothness": {"unit": "dimensionless", "confidence_range": "0.0-1.0"},
    "asymmetry_index": {"unit": "ratio", "confidence_range": "0.0-1.0"},
}


class PoseBackendType(str, Enum):
    """Supported pose estimation backend implementations."""

    MEDIAPIPE = "mediapipe"
    MOVENET = "movenet"
    YOLO_POSE = "yolo_pose"
    DISABLED = "disabled"


class PoseEstimationBackend:
    """Pluggable pose estimation for video movement analysis.

    Default: MediaPipe BlazePose (Apache-2.0)
    - 33 keypoints, ICC=0.94 vs physiotherapists
    - 30 FPS on mobile, 60+ FPS on desktop
    - On-device inference, no network required

    Decision-support only: pose data requires clinician review.
    """

    def __init__(self, backend_type: PoseBackendType = PoseBackendType.DISABLED) -> None:
        self.backend_type = backend_type
        self._impl = None

    # ------------------------------------------------------------------
    # Lifecycle helpers
    # ------------------------------------------------------------------

    def is_available(self) -> bool:
        """Return True if a backend other than DISABLED is configured."""
        return self.backend_type != PoseBackendType.DISABLED

    def get_backend_info(self) -> dict[str, str]:
        """Return metadata about the configured backend."""
        backend_info = {
            PoseBackendType.MEDIAPIPE: {
                "name": "MediaPipe BlazePose",
                "license": "Apache-2.0",
                "keypoints": "33",
                "icc": "0.94",
                "fps_mobile": "30",
                "fps_desktop": "60+",
                "inference": "on-device",
                "description": "Google MediaPipe BlazePose; 33 keypoints with visibility scores",
            },
            PoseBackendType.MOVENET: {
                "name": "MoveNet",
                "license": "Apache-2.0",
                "keypoints": "17",
                "icc": "0.90",
                "fps_mobile": "30",
                "fps_desktop": "120+",
                "inference": "on-device",
                "description": "TensorFlow MoveNet; 17 keypoints, optimized for speed",
            },
            PoseBackendType.YOLO_POSE: {
                "name": "YOLO-Pose",
                "license": "AGPL-3.0",
                "keypoints": "17",
                "icc": "0.88",
                "fps_mobile": "15",
                "fps_desktop": "60+",
                "inference": "on-device",
                "description": "Ultralytics YOLO-Pose; bounding box + keypoints",
            },
            PoseBackendType.DISABLED: {
                "name": "Disabled",
                "license": "n/a",
                "keypoints": "0",
                "icc": "n/a",
                "fps_mobile": "0",
                "fps_desktop": "0",
                "inference": "none",
                "description": "Pose estimation is disabled; no pose analysis will be performed",
            },
        }
        return backend_info.get(self.backend_type, backend_info[PoseBackendType.DISABLED])

    # ------------------------------------------------------------------
    # Core API
    # ------------------------------------------------------------------

    def estimate_pose(self, video_bytes: bytes) -> dict[str, Any]:
        """Return pose keypoints for a video frame sequence.

        Returns schema::

            {
                "backend": "mediapipe",
                "version": "0.10.0",
                "frames": [
                    {
                        "frame_idx": 0,
                        "timestamp_ms": 0.0,
                        "keypoints": [
                            {"id": "nose", "x": 0.5, "y": 0.3, "z": 0.0, "confidence": 0.97},
                            ...
                        ],
                        "confidence": 0.92
                    }
                ],
                "summary": {
                    "total_frames": 100,
                    "avg_confidence": 0.91,
                    "keypoints_tracked": 33
                }
            }
        """
        if not self.is_available():
            return {"available": False, "reason": "pose_estimation_disabled"}

        # Stub: would call actual pose estimation model
        return {
            "available": True,
            "backend": self.backend_type.value,
            "version": "stub_0.1.0",
            "frames": [],
            "summary": {
                "total_frames": 0,
                "avg_confidence": 0.0,
                "keypoints_tracked": 0,
            },
            "note": (
                "Pose estimation backend is configured but running in stub mode. "
                "Install mediapipe for live inference."
            ),
        }

    def extract_movement_features(self, pose_sequence: dict[str, Any]) -> dict[str, Any]:
        """Extract clinical movement features from pose sequence.

        Features:
        - gait_speed: meters/second, from ankle displacement over time
        - stride_length: meters, from left-right ankle swing
        - arm_swing_amplitude: degrees, from shoulder-wrist angle range
        - tremor_band_power_4_6hz: arbitrary, FFT power in 4-6 Hz band
        - postural_sway_area: mm^2, from center-of-pressure proxy
        - movement_smoothness: dimensionless, log_dimensionless jerk
        - asymmetry_index: ratio, left/right symmetry
        """
        return {
            "features_extracted": False,
            "note": "Feature extraction requires live pose estimation backend.",
            "feature_schema": dict(_MOVEMENT_FEATURE_SCHEMA),
        }

    # ------------------------------------------------------------------
    # Stub helpers for testing / frontend integration
    # ------------------------------------------------------------------

    def mock_keypoints_for_frame(
        self,
        frame_idx: int = 0,
        timestamp_ms: float = 0.0,
        confidence: float = 0.92,
    ) -> dict[str, Any]:
        """Return a single frame with mock keypoint data for all 33 landmarks."""
        keypoints = []
        for i, name in enumerate(_MEDIAPIPE_KEYPOINT_NAMES):
            # Generate plausible mock coordinates (centered, spread across frame)
            import math

            angle = (i / len(_MEDIAPIPE_KEYPOINT_NAMES)) * 2 * math.pi
            base_x = 0.5 + 0.1 * math.cos(angle)
            base_y = 0.3 + 0.15 * math.sin(angle)
            # Vary per frame slightly
            x = _clamp01(base_x + frame_idx * 0.001)
            y = _clamp01(base_y + frame_idx * 0.0005)
            keypoints.append(
                {
                    "id": name,
                    "x": round(x, 4),
                    "y": round(y, 4),
                    "z": round(0.0, 4),
                    "confidence": round(confidence, 4),
                }
            )
        return {
            "frame_idx": frame_idx,
            "timestamp_ms": timestamp_ms,
            "keypoints": keypoints,
            "confidence": round(confidence, 4),
        }

    def mock_pose_result(self, num_frames: int = 10) -> dict[str, Any]:
        """Return a mock pose estimation result with synthetic keypoint data."""
        frames = []
        for i in range(num_frames):
            frame = self.mock_keypoints_for_frame(
                frame_idx=i,
                timestamp_ms=i * 33.33,  # ~30 FPS
                confidence=0.85 + 0.1 * (i % 3) / 2,  # Vary confidence
            )
            frames.append(frame)
        avg_conf = round(sum(f["confidence"] for f in frames) / len(frames), 4) if frames else 0.0
        return {
            "available": True,
            "backend": self.backend_type.value,
            "version": "stub_0.1.0",
            "frames": frames,
            "summary": {
                "total_frames": num_frames,
                "avg_confidence": avg_conf,
                "keypoints_tracked": len(_MEDIAPIPE_KEYPOINT_NAMES),
            },
        }


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def get_pose_backend() -> PoseEstimationBackend:
    """Factory: returns configured pose estimation backend.

    Reads ``pose_backend_type`` from app settings (default: ``disabled``).
    Falls back to DISABLED on unknown values.
    """
    try:
        from app.settings import get_settings

        settings = get_settings()
        backend_type_str = getattr(settings, "pose_backend_type", "disabled")
    except Exception:
        _log.warning("Could not load settings for pose backend; using disabled.")
        return PoseEstimationBackend(PoseBackendType.DISABLED)

    try:
        backend_type = PoseBackendType(str(backend_type_str).lower().strip())
    except ValueError:
        _log.warning(
            "Unknown pose backend type: %r. Using disabled. "
            "Valid options: %s",
            backend_type_str,
            ", ".join([e.value for e in PoseBackendType]),
        )
        backend_type = PoseBackendType.DISABLED

    return PoseEstimationBackend(backend_type)
