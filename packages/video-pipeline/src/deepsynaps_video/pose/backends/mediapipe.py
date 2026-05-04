"""MediaPipe Pose / Holistic backend (CPU realtime, smartphone-friendly)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

BACKEND_ID = "mediapipe-pose-cpu"
MODEL_VERSION = "mediapipe-0.10"


def run(clip_path: Path) -> dict[str, Any]:
    """Run MediaPipe Pose over a clip and return a keypoint tensor.

    TODO(impl): import mediapipe lazily, iterate frames, collect 33 keypoints
    per person, write a parquet to a temp dir, and return its path with
    metadata. Holistic mode (face mesh + hands) lives in a sibling file.
    """

    raise NotImplementedError
