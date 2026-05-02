"""Celery worker wrappers for asynchronous voice-session analysis."""

from __future__ import annotations


def register_tasks() -> None:
    """Register Celery tasks for the Audio / Voice Analyzer.

    TODO: implement in PR #5. Mirrors the worker pattern in
    ``deepsynaps_qeeg`` / ``deepsynaps_mri``: one task per session,
    chained through QC → features → indices → reporting, with a
    final DB write step.
    """

    raise NotImplementedError(
        "worker.register_tasks: implement in PR #5 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
