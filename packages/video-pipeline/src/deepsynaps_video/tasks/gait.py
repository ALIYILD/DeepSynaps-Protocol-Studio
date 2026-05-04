"""Gait analyzer — stride segmentation, spatiotemporal metrics, FoG flag.

Inspired by VIGMA / gaitmap / gait-analyzer family. Algorithms are
re-implemented in our own code with citations. Pure function of a
``MotionTrack`` epoch — no side effects.
"""

from __future__ import annotations

from ..motion import MotionTrack
from ..schemas import MetricValue, Side, TaskResult


def analyze_gait(
    track: MotionTrack,
    *,
    epoch_s: tuple[float, float],
    side: Side = "bilateral",
) -> TaskResult:
    """Compute spatiotemporal gait metrics over the level-walking epoch.

    Pipeline:

    1. Crop ``track`` to ``epoch_s``.
    2. Detect heel-strike / toe-off events from ankle / heel vertical
       velocity zero-crossings (Pijnappels-style heuristic).
    3. Compute cadence, stride length (world coords), step time asymmetry,
       double-support %, step-time CV.
    4. Compute Moore-Bachlin freezing index (3-8 Hz / 0.5-3 Hz power on
       shank-segment vertical motion). Cite ``10.1109/TBME.2009.2036731``.
    5. Detect a 180° turn (azimuth integration); compute turn time.
    6. Score against age + height-adjusted Hollman 2011 norms for
       ``cadence_steps_per_min`` and ``stride_length_m``.

    TODO(impl): all of the above. Return a ``TaskResult`` with ``task_id ==
    'mds_updrs_3_10_gait'``.
    """

    _ = (track, epoch_s, side)
    raise NotImplementedError


def detect_freezing(track: MotionTrack) -> list[tuple[float, float]]:
    """Return a list of ``(start_s, end_s)`` freezing-of-gait episodes.

    TODO(impl): Moore-Bachlin spectral index above threshold.
    """

    raise NotImplementedError


__all__ = ["analyze_gait", "detect_freezing"]


def _placeholder_metric() -> MetricValue:
    """Reference to keep the import alive in scaffolds. TODO(remove)."""

    return MetricValue(value=float("nan"))
