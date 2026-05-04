"""ViTPose-3D / MotionBERT backend (server-side, research path)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

BACKEND_ID = "vitpose-3d-server"
MODEL_VERSION = "vitpose-h-2023"


def run(clip_path: Path) -> dict[str, Any]:
    """TODO(impl): wire ViTPose-3D / MotionBERT inference pipeline."""

    raise NotImplementedError
