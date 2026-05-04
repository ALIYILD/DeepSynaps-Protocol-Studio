"""Posture / balance analyzer — sway envelope, sit-to-stand, pull-test."""

from __future__ import annotations

from ..motion import MotionTrack
from ..schemas import Side, TaskId, TaskResult


SUPPORTED_TASK_IDS: tuple[TaskId, ...] = (
    "mds_updrs_3_12_postural_stab",
    "mds_updrs_3_13_posture",
    "timed_up_and_go",
    "sit_to_stand_5x",
)


def analyze_posture(
    track: MotionTrack,
    *,
    task_id: TaskId,
    epoch_s: tuple[float, float],
    side: Side = "bilateral",
) -> TaskResult:
    """Compute postural / balance metrics for one of the supported tasks.

    Branches:

    - ``mds_updrs_3_12_postural_stab``: count recovery steps after the pull;
      estimate fall likelihood from the COM trajectory.
    - ``mds_updrs_3_13_posture``: trunk flexion angle from shoulder-hip
      vector vs. vertical.
    - ``timed_up_and_go``: total time, sit-to-stand sub-time, turn time
      detected from azimuth integration.
    - ``sit_to_stand_5x``: total time + per-rep symmetry.

    TODO(impl): segment phases (sit, stand, walk, turn) from COM + hip
    angle; cite Bohannon / Tinetti norms.
    """

    _ = (track, task_id, epoch_s, side)
    raise NotImplementedError


__all__ = ["SUPPORTED_TASK_IDS", "analyze_posture"]
