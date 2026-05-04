"""Motion processing — smoothing, gap fill, world-coord lift, segment angles.

Sits between the pose engine and the per-task analyzers. Every task analyzer
in ``tasks/`` consumes a ``MotionTrack`` rather than the raw keypoint tensor —
this is where we centralize numerical hygiene (Savitzky-Golay smoothing,
small-gap interpolation, outlier rejection, segment-angle computation, COM
proxy lift).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class MotionTrack:
    """Cleaned-up motion track for one person across a clip."""

    person_id: int
    fps: float
    n_frames: int
    keypoints_world_xyz: Any  # numpy array (T, K, 3) — TODO: type as np.ndarray
    keypoints_image_xy: Any  # numpy array (T, K, 2)
    visibility: Any  # numpy array (T, K)
    segment_angles_deg: dict[str, Any]  # e.g. {"knee_L": (T,)}
    com_xy: Any  # numpy array (T, 2) — center-of-mass proxy
    smoothed: bool = False


def smooth_track(track: MotionTrack, *, window_s: float = 0.25) -> MotionTrack:
    """Savitzky-Golay smoothing on each keypoint trajectory.

    TODO(impl): scipy.signal.savgol_filter, length tied to fps * window_s.
    """

    raise NotImplementedError


def fill_gaps(track: MotionTrack, *, max_gap_frames: int = 10) -> MotionTrack:
    """Linear interpolation across short visibility gaps. TODO(impl)."""

    raise NotImplementedError


def lift_to_world(track: MotionTrack, *, height_m: float | None) -> MotionTrack:
    """Scale image-space keypoints to world coords using anthropometric heuristics.

    TODO(impl): use limb-length priors (Drillis & Contini 1966) to assign a
    metric scale when no calibration object is present in frame.
    """

    raise NotImplementedError


def compute_segment_angles(track: MotionTrack) -> MotionTrack:
    """Populate ``track.segment_angles_deg`` for elbow, knee, hip, shoulder, ankle.

    TODO(impl): vector dot-product of adjacent segment vectors.
    """

    raise NotImplementedError


__all__ = [
    "MotionTrack",
    "compute_segment_angles",
    "fill_gaps",
    "lift_to_world",
    "smooth_track",
]
