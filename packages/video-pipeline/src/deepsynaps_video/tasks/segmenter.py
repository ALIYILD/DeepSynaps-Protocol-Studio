"""Structured-task segmentation.

Two paths:

1. **Operator-tagged** (default for clinic): the front-end posts
   ``{start_s, end_s, task_id, side}`` epochs that are accepted as ground
   truth.
2. **Auto-detected** (smartphone self-record, VisionMD-style): an action
   classifier predicts task boundaries from the pose timeseries; the operator
   confirms or corrects on the dashboard before the pipeline scores them.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..motion import MotionTrack
from ..schemas import Side, TaskId


@dataclass
class TaskEpoch:
    task_id: TaskId
    epoch_s: tuple[float, float]
    side: Side = "n/a"
    confidence: float = 1.0
    source: str = "operator"  # "operator" | "auto"


def segment_operator(epochs: list[TaskEpoch]) -> list[TaskEpoch]:
    """Validate operator-tagged epochs (no overlaps, in-bounds).

    TODO(impl): sort, check (epoch_s[1] > epoch_s[0]), reject overlapping
    same-task epochs unless side differs.
    """

    raise NotImplementedError


def segment_auto(track: MotionTrack) -> list[TaskEpoch]:
    """Detect MDS-UPDRS-style task epochs from a pose timeseries.

    TODO(impl): wrap an action classifier (MMAction2 SlowFast or a
    bespoke 1D-CNN over joint angles). v1 keeps this experimental and
    requires operator confirmation before scoring.
    """

    raise NotImplementedError


__all__ = ["TaskEpoch", "segment_auto", "segment_operator"]
