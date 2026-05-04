"""Bradykinesia analyzer — finger tap, hand open-close, pron-sup, leg agility.

Mirrors the VisionMD task family. Pure function of a ``MotionTrack`` epoch
plus a task ID + side. Returns a ``TaskResult`` with rate / amplitude /
decrement / hesitation metrics and a suggested 0–4 score (decision support).
"""

from __future__ import annotations

from ..motion import MotionTrack
from ..schemas import Side, TaskId, TaskResult


SUPPORTED_TASK_IDS: tuple[TaskId, ...] = (
    "mds_updrs_3_4_finger_tap",
    "mds_updrs_3_5_hand_open_close",
    "mds_updrs_3_6_pronation_sup",
    "mds_updrs_3_7_toe_tap",
    "mds_updrs_3_8_leg_agility",
)


def analyze_bradykinesia(
    track: MotionTrack,
    *,
    task_id: TaskId,
    epoch_s: tuple[float, float],
    side: Side,
) -> TaskResult:
    """Score a bradykinesia task from pose.

    Pipeline (finger tap shown; others adapt the keypoint pair):

    1. Crop ``track`` to ``epoch_s``.
    2. Compute the inter-tip distance ``d(t)`` between thumb tip and index
       fingertip, smoothed.
    3. Detect tap events (peaks/valleys of ``d(t)``); ``tap_rate_hz`` =
       events per second.
    4. Compute ``amplitude_norm`` = mean peak-valley distance, normalized by
       the median hand width across the epoch.
    5. Compute ``decrement_pct`` = relative drop in amplitude between
       first-third and last-third tap windows.
    6. Detect ``hesitation_count`` = inter-tap intervals > 1.5 × median.
    7. Map to a suggested 0–4 score using the published anchor table.

    TODO(impl): all of the above for each ``task_id`` in
    ``SUPPORTED_TASK_IDS``. Treat the suggested score as decision support
    only — every suggestion ships with an ``uncertainty`` and a clinician
    review flag.
    """

    _ = (track, task_id, epoch_s, side)
    raise NotImplementedError


__all__ = ["SUPPORTED_TASK_IDS", "analyze_bradykinesia"]
