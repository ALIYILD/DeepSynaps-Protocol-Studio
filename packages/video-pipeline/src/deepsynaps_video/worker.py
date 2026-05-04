"""Celery worker entry points.

Each pipeline mode is a Celery task. Workers run in two pools — a CPU pool for
ingest / monitoring batch chunks and a GPU pool for pose + 3D lift + YOLO.
"""

from __future__ import annotations

from typing import Any


def queue_task_run(payload: dict[str, Any]) -> str:
    """Enqueue a ``run_task`` job; return the Celery task id. TODO(impl)."""

    _ = payload
    raise NotImplementedError


def queue_monitor_run(payload: dict[str, Any]) -> str:
    """Enqueue a ``run_monitor`` job. TODO(impl). Feature-flagged."""

    _ = payload
    raise NotImplementedError


__all__ = ["queue_monitor_run", "queue_task_run"]
