"""Person / bed / object detection + multi-object tracking for room cameras.

YOLOv8/v9/v11 weights via Ultralytics; ByteTrack / BoT-SORT for ID stability.
This is the substrate the rest of ``monitoring/`` builds on.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Detection:
    frame_idx: int
    bbox_xyxy: tuple[float, float, float, float]
    cls: str
    score: float
    track_id: int | None = None


@dataclass
class DetectionTrack:
    track_id: int
    cls: str
    detections: list[Detection] = field(default_factory=list)


def detect_and_track(
    clip_path: Path,
    *,
    weights: str = "yolov8x.pt",
    classes: list[str] | None = None,
    tracker: str = "bytetrack",
) -> list[DetectionTrack]:
    """Run YOLO + tracker over a clip, return per-track detection sequences.

    TODO(impl): import ultralytics + bytetrack lazily, batch inference,
    persist a parquet of detections keyed by ``(camera_id, clip_id)``.
    """

    _ = (clip_path, weights, classes, tracker)
    raise NotImplementedError


__all__ = ["Detection", "DetectionTrack", "detect_and_track"]
