"""Cough segmentation, counting, and wet/dry classification."""

from __future__ import annotations

from ..schemas import CoughEvents, Recording


def detect_cough(recording: Recording) -> CoughEvents:
    """Detect cough events and emit per-event timing + class.

    TODO: v2 module — energy + onset-strength threshold for
    segmentation, PANNs CNN (audioset-pretrained) for class
    confirmation and wet/dry hint.
    """

    raise NotImplementedError(
        "respiratory.cough.detect_cough: v2 module — see AUDIO_ANALYZER_STACK.md §7."
    )
