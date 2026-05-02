"""Breath-cycle metrics from a deep-breath task."""

from __future__ import annotations

from ..schemas import BreathStats, Recording


def breath_cycle_metrics(recording: Recording) -> BreathStats:
    """Breath rate, inspiration:expiration ratio, mean inspiration / expiration.

    TODO: v2 module — envelope-based breath-cycle detection on the
    deep-breath task recording.
    """

    raise NotImplementedError(
        "respiratory.breath.breath_cycle_metrics: v2 module — see AUDIO_ANALYZER_STACK.md §7."
    )
