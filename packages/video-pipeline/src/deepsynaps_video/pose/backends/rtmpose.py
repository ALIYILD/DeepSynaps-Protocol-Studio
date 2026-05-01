"""RTMPose backend (server-side, MMPose). 2D and 3D variants share this file."""

from __future__ import annotations

from pathlib import Path
from typing import Any

BACKEND_ID_2D = "rtmpose-l-2d-server"
BACKEND_ID_3D = "rtmpose-x-3d-server"
MODEL_VERSION_2D = "rtmpose-l-2024-coco"
MODEL_VERSION_3D = "rtmpose-x3d-2024"


def run_2d(clip_path: Path) -> dict[str, Any]:
    """Run RTMPose-L 2D pose. TODO(impl): import mmpose lazily."""

    raise NotImplementedError


def run_3d(clip_path: Path) -> dict[str, Any]:
    """Run RTMPose-X 3D pose. TODO(impl): import mmpose lazily."""

    raise NotImplementedError
