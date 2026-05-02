"""End-to-end orchestrator for a clinical voice session."""

from __future__ import annotations

from .schemas import ReportBundle, Session


def run_full_pipeline(session: Session) -> ReportBundle:
    """Run ingestion → QC → acoustic → indices → neurological → normative → reporting.

    TODO: implement in PR #4 (see ``AUDIO_ANALYZER_STACK.md §9`` task
    4). Sequence:

    1. Validate every recording in ``session.recordings`` against its
       declared task protocol.
    2. ``quality.compute_qc`` per recording; ``quality.gate`` to drop
       any ``fail`` recordings (and emit a structured re-record
       envelope when nothing usable remains).
    3. ``acoustic.*`` per surviving recording.
    4. ``clinical_indices.*`` for sustained-vowel + reading-passage
       pairs.
    5. ``neurological.*`` for the merged feature dict.
    6. ``cognitive.*`` (v2) when transcripts are available.
    7. ``respiratory.*`` (v2) when cough / breath tasks present.
    8. ``normative.zscore`` per feature, ``longitudinal.delta_vs_baseline``
       against the patient's last session.
    9. ``reporting.generate_report`` and ``db.write_audio_analysis``.
    """

    raise NotImplementedError(
        "pipeline.run_full_pipeline: implement in PR #4 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
