"""Pose engine — pluggable HPE backend dispatch with cached intermediates.

Inspired by the PosePipe pattern: the engine accepts a clip + backend ID, runs
the backend (or returns a cached result keyed by ``(clip_id, backend,
model_version)``), and returns a uniform keypoint tensor that all downstream
analyzers consume.

Backends live under ``backends/`` and implement a small protocol:

```python
class BackendProtocol(Protocol):
    backend_id: str
    model_version: str
    def run(self, clip_path: Path) -> KeypointTensor: ...
```

We deliberately do NOT depend on any HPE library at import time so that the
package installs cleanly on python:3.11-slim — backends import lazily.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from ..schemas import PoseBackend


@dataclass
class PoseRequest:
    clip_path: Path
    clip_id: str
    backend: PoseBackend = "mediapipe-pose-cpu"
    cache_root: Path | None = None


@dataclass
class PoseResult:
    """Uniform pose result. ``keypoints`` is laid out (T, P, K, D)."""

    clip_id: str
    backend: PoseBackend
    model_version: str
    keypoints_uri: str  # parquet/npz on S3 or local path
    n_frames: int
    n_persons: int
    n_keypoints: int
    keypoint_layout: Literal["coco17", "halpe26", "mediapipe33", "openpose25"]
    fps: float
    visibility: list[float] = field(default_factory=list)


def run_pose(request: PoseRequest) -> PoseResult:
    """Run pose estimation, with cache lookup keyed by backend + model version.

    Steps:

    1. Compute cache key ``(clip_id, backend, model_version)``.
    2. If a cached ``PoseResult`` exists, hydrate and return it.
    3. Otherwise dispatch to the named backend in ``backends/``.
    4. Write the keypoint tensor to ``cache_root / clip_id / backend.parquet``.
    5. Return a hydrated ``PoseResult`` for downstream consumers.

    TODO(impl): wire backend imports (lazy), parquet I/O, S3 client.
    """

    raise NotImplementedError("pose.engine.run_pose is not yet implemented")


def list_available_backends() -> list[PoseBackend]:
    """Return the set of backends installed in the current Python env.

    TODO(impl): try-import each backend module and return only those that
    successfully load. Used by the pipeline to fall back gracefully.
    """

    raise NotImplementedError


__all__ = [
    "PoseRequest",
    "PoseResult",
    "list_available_backends",
    "run_pose",
]
