"""Telehealth-grade quality control for incoming voice recordings.

Mirrors the SNR / loudness / VAD checks used by clinical voice apps
(Voice Analyst, OperaVOX, VoiceMed) so that downstream feature
extractors only ever see audio that meets the thresholds in
:data:`constants.QC_DEFAULTS`.
"""

from __future__ import annotations

from .schemas import QCReport, Recording


def compute_qc(recording: Recording) -> QCReport:
    """Compute LUFS, peak/clipping, SNR, and VAD speech ratio for the recording.

    TODO: implement in PR #1 (see ``AUDIO_ANALYZER_STACK.md §9`` task 1).
    Use ``pyloudnorm`` for LUFS, ``webrtcvad`` for VAD, and a simple
    silence-vs-voiced energy ratio for SNR. Compare every measurement
    to :data:`constants.QC_DEFAULTS` to populate ``verdict`` and
    ``reasons``.
    """

    raise NotImplementedError(
        "quality.compute_qc: implement in PR #1 (see AUDIO_ANALYZER_STACK.md §9)."
    )


def gate(qc: QCReport) -> bool:
    """Return ``True`` iff the recording is allowed downstream.

    A ``fail`` verdict always blocks. ``warn`` is allowed through but
    the report flags the concern in the UI.
    """

    return qc.verdict != "fail"
