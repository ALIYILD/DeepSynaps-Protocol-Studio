"""Room-zone polygons and ingress/egress events.

Zones are defined per camera in the dashboard (bed, chair, door, hallway).
The zone engine produces ``ZoneTransition`` events when a tracked person's
bbox-center polygon-membership changes.
"""

from __future__ import annotations

from dataclasses import dataclass

from .detector import DetectionTrack


@dataclass
class ZonePolygon:
    zone_id: str
    camera_id: str
    polygon_xy: list[tuple[float, float]]
    label: str  # "bed" | "chair" | "door" | "restricted" | ...


@dataclass
class ZoneTransition:
    track_id: int
    camera_id: str
    from_zone: str | None
    to_zone: str | None
    timestamp_s: float


def compute_transitions(
    track: DetectionTrack,
    *,
    zones: list[ZonePolygon],
    fps: float,
) -> list[ZoneTransition]:
    """Emit ``ZoneTransition`` events for one tracked person.

    TODO(impl): point-in-polygon per detection center; debounce flicker.
    """

    _ = (track, zones, fps)
    raise NotImplementedError


__all__ = ["ZonePolygon", "ZoneTransition", "compute_transitions"]
