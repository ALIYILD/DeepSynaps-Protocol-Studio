"""Tremor analyzer — spectral analysis of joint trajectories.

Computes dominant frequency, amplitude, and side asymmetry for rest /
postural / kinetic tremor tasks.
"""

from __future__ import annotations

from ..motion import MotionTrack
from ..schemas import Side, TaskId, TaskResult


SUPPORTED_TASK_IDS: tuple[TaskId, ...] = (
    "mds_updrs_3_15_tremor_postural",
    "mds_updrs_3_17_tremor_rest",
)


def analyze_tremor(
    track: MotionTrack,
    *,
    task_id: TaskId,
    epoch_s: tuple[float, float],
    side: Side = "bilateral",
) -> TaskResult:
    """Spectral tremor metrics for a hand or chin keypoint over an epoch.

    1. Crop ``track`` to ``epoch_s``.
    2. Pick the relevant keypoint (wrist for hand tremor; chin for jaw).
    3. Detrend, then compute Welch PSD (4-second segments, 50 % overlap).
    4. Report ``dominant_freq_hz`` in 3-12 Hz band, ``amplitude_mm`` from
       integrated power, and side ``asymmetry_index``.
    5. Flag ``tremor_rest_4_6hz`` biomarker if dominant freq ∈ [4, 6] Hz
       on the rest task.

    TODO(impl): scipy.signal.welch + amplitude integration; lift to mm via
    motion.lift_to_world.
    """

    _ = (track, task_id, epoch_s, side)
    raise NotImplementedError


__all__ = ["SUPPORTED_TASK_IDS", "analyze_tremor"]
