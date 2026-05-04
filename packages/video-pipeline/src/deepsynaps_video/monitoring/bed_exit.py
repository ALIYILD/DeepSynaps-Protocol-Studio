"""Bed-exit detector — bed-zone occupancy → exit transitions."""

from __future__ import annotations

from .detector import DetectionTrack
from .zones import ZonePolygon
from ..schemas import MonitoringEvent


def detect_bed_exits(
    track: DetectionTrack,
    *,
    bed_zone: ZonePolygon,
    fps: float,
    min_outside_frames: int = 30,
    camera_id: str,
    model_version: str = "v0.1",
) -> list[MonitoringEvent]:
    """Emit ``bed_exit`` events when the patient leaves the bed polygon.

    TODO(impl): scan ``track.detections`` for sustained outside-bed runs
    of ≥ ``min_outside_frames`` consecutive frames; emit one event per run.
    """

    _ = (track, bed_zone, fps, min_outside_frames, camera_id, model_version)
    raise NotImplementedError


__all__ = ["detect_bed_exits"]
