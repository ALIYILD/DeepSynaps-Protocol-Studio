"""Auto-demotion logic for artifacts that fail QA thresholds."""

from __future__ import annotations

from datetime import UTC, datetime

from deepsynaps_qa.models import (
    ArtifactType,
    DemotionEvent,
    QAResult,
    Verdict,
)


def should_demote(result: QAResult) -> tuple[bool, str]:
    """Check whether a QA result warrants automatic demotion to ADVISORY.

    Returns ``(should_demote, reason)`` tuple.
    """
    if result.verdict == Verdict.FAIL:
        if result.score.block_count > 0:
            return True, "qa_block_finding"
        return True, "qa_score_below_floor"
    return False, ""


def apply_demotion(
    artifact_id: str,
    trigger: str,
    qa_run_id: str,
    operator: str = "",
) -> DemotionEvent:
    """Create a demotion event record."""
    return DemotionEvent(
        artifact_id=artifact_id,
        from_tier="STANDARD",
        to_tier="ADVISORY",
        trigger=trigger,
        qa_run_id=qa_run_id,
        operator=operator,
        timestamp_utc=datetime.now(tz=UTC).isoformat(),
        hash_chain="",  # Populated by the audit layer if needed
    )


def check_override_rate(
    override_count: int,
    total_count: int,
    artifact_type: ArtifactType,
) -> tuple[bool, float]:
    """Check whether the override rate exceeds the threshold for demotion.

    Thresholds (exclusive boundary — demotion triggers at > threshold):
    - Predictive artifacts (protocol_draft): > 25%
    - Narrative artifacts (qeeg_narrative, mri_report, brain_twin_summary): > 40%

    Returns ``(exceeded, rate)`` tuple.
    """
    if total_count == 0:
        return False, 0.0

    rate = override_count / total_count

    predictive_types = {ArtifactType.PROTOCOL_DRAFT}
    if artifact_type in predictive_types:
        threshold = 0.25
    else:
        threshold = 0.40

    return rate > threshold, rate
