"""Facial-motor analyzer — landmark-based expression amplitude, asymmetry,
blink rate, and a hypomimia score.

Uses MediaPipe FaceMesh (468 landmarks) by default, with OpenFace as the
optional high-accuracy backend (adds AU intensities for the FAB / FACS-PD
hypomimia model).
"""

from __future__ import annotations

from pathlib import Path

from ..schemas import Side, TaskId, TaskResult


def analyze_facial_battery(
    clip_path: Path,
    *,
    task_id: TaskId = "facial_expression_battery",
    epoch_s: tuple[float, float] | None = None,
    side: Side = "n/a",
) -> TaskResult:
    """Facial-motor metrics over a clip.

    1. Run MediaPipe FaceMesh (or OpenFace) to extract per-frame landmarks.
    2. Compute expression amplitude per AU group (smile, brow raise,
       eye closure).
    3. Compute left-right asymmetry from mirrored landmark pairs.
    4. Detect blinks (eye-aspect-ratio threshold) → ``blink_rate_per_min``.
    5. Compute ``hypomimia_score`` against the Bandini 2017 reference cohort.

    TODO(impl): wire FaceMesh / OpenFace, AU mapping, asymmetry math,
    blink detector. Cite ``10.1109/TAFFC.2017.2768026``.
    """

    _ = (clip_path, task_id, epoch_s, side)
    raise NotImplementedError


__all__ = ["analyze_facial_battery"]
