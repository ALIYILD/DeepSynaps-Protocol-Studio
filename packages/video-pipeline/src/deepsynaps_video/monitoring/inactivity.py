"""Prolonged-inactivity detector — low-motion windows in the patient zone."""

from __future__ import annotations

from ..motion import MotionTrack
from ..schemas import MonitoringEvent


def detect_inactivity(
    track: MotionTrack,
    *,
    camera_id: str,
    model_version: str = "v0.1",
    motion_eps: float = 0.02,
    min_window_s: float = 600.0,
) -> list[MonitoringEvent]:
    """Emit ``prolonged_inactivity`` events for sustained low-motion runs.

    TODO(impl): per-frame keypoint motion magnitude < ``motion_eps`` for at
    least ``min_window_s`` seconds within the patient-zone polygon.
    """

    _ = (track, camera_id, model_version, motion_eps, min_window_s)
    raise NotImplementedError


__all__ = ["detect_inactivity"]
