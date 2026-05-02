"""Diadochokinetic-rate analysis for /pa-ta-ka/ and /papapa/ tasks."""

from __future__ import annotations

from ..schemas import DDKMetrics, Recording


def ddk_metrics(recording: Recording) -> DDKMetrics:
    """Syllable rate, rate variability, and (when measurable) voice-onset-time.

    TODO: implement in PR #3 — onset detection via librosa onset
    strength + peak picking; regularity index from inter-syllable
    interval CV.
    """

    raise NotImplementedError(
        "neurological.ddk.ddk_metrics: implement in PR #3 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
