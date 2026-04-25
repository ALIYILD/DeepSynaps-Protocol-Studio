"""Tests for demotion logic."""

from __future__ import annotations

from deepsynaps_qa.demotion import apply_demotion, check_override_rate, should_demote
from deepsynaps_qa.models import ArtifactType, QAResult, Score, Verdict


def test_should_demote_on_fail():
    result = QAResult(
        run_id="r1",
        artifact_id="a1",
        spec_id="s1",
        score=Score(numeric=50.0, block_count=0),
        verdict=Verdict.FAIL,
    )
    demote, reason = should_demote(result)
    assert demote
    assert reason == "qa_score_below_floor"


def test_should_demote_on_block():
    result = QAResult(
        run_id="r1",
        artifact_id="a1",
        spec_id="s1",
        score=Score(numeric=90.0, block_count=1),
        verdict=Verdict.FAIL,
    )
    demote, reason = should_demote(result)
    assert demote
    assert reason == "qa_block_finding"


def test_no_demote_on_pass():
    result = QAResult(
        run_id="r1",
        artifact_id="a1",
        spec_id="s1",
        score=Score(numeric=85.0, block_count=0),
        verdict=Verdict.PASS,
    )
    demote, _ = should_demote(result)
    assert not demote


def test_apply_demotion_creates_event():
    event = apply_demotion("art-1", "qa_score_below_floor", "run-1", "operator")
    assert event.artifact_id == "art-1"
    assert event.from_tier == "STANDARD"
    assert event.to_tier == "ADVISORY"
    assert event.trigger == "qa_score_below_floor"


def test_override_rate_predictive_threshold():
    """Predictive (protocol_draft): > 25% triggers demotion."""
    # Exactly 25% — should NOT trigger (exclusive boundary)
    exceeded, rate = check_override_rate(25, 100, ArtifactType.PROTOCOL_DRAFT)
    assert not exceeded
    assert rate == 0.25

    # 26% — should trigger
    exceeded, rate = check_override_rate(26, 100, ArtifactType.PROTOCOL_DRAFT)
    assert exceeded


def test_override_rate_narrative_threshold():
    """Narrative types: > 40% triggers demotion."""
    # Exactly 40% — should NOT trigger
    exceeded, _rate = check_override_rate(40, 100, ArtifactType.QEEG_NARRATIVE)
    assert not exceeded

    # 41% — should trigger
    exceeded, _rate = check_override_rate(41, 100, ArtifactType.QEEG_NARRATIVE)
    assert exceeded


def test_override_rate_zero_total():
    exceeded, rate = check_override_rate(0, 0, ArtifactType.QEEG_NARRATIVE)
    assert not exceeded
    assert rate == 0.0
