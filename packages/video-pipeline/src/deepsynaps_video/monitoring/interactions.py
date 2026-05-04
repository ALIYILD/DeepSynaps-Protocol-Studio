"""Patient-staff interaction logging.

Two-or-more tracked persons within proximity threshold for at least N
seconds. Role inference (patient vs staff) is heuristic in v1: the longest-
lived bed-zone-resident track in a session is tagged as ``patient``; others
as ``staff``. v2 promotes role inference to a learned classifier.
"""

from __future__ import annotations

from .detector import DetectionTrack
from ..schemas import MonitoringEvent


def detect_interactions(
    tracks: list[DetectionTrack],
    *,
    camera_id: str,
    model_version: str = "v0.1",
    proximity_eps: float = 0.5,  # bbox-IoU or distance threshold
    min_window_s: float = 5.0,
) -> list[MonitoringEvent]:
    """Emit ``staff_interaction`` events for sustained multi-person proximity.

    TODO(impl): pairwise-distance scan across tracks; emit one event per
    sustained proximity run.
    """

    _ = (tracks, camera_id, model_version, proximity_eps, min_window_s)
    raise NotImplementedError


__all__ = ["detect_interactions"]
