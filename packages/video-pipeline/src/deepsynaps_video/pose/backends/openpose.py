"""OpenPose backend — kept for cross-validation against published baselines."""

from __future__ import annotations

from pathlib import Path
from typing import Any

BACKEND_ID = "openpose-server"
MODEL_VERSION = "openpose-1.7"


def run(clip_path: Path) -> dict[str, Any]:
    """TODO(impl): subprocess into the OpenPose binary or its Python wrapper."""

    raise NotImplementedError
