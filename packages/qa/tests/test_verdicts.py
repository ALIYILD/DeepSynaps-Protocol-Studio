"""Tests for scoring and verdict logic."""

from __future__ import annotations

from deepsynaps_qa.models import CheckResult, CheckSeverity, Score, Verdict
from deepsynaps_qa.verdicts import compute_score, compute_verdict


def _cr(check_id: str, severity: CheckSeverity, passed: bool) -> CheckResult:
    return CheckResult(
        check_id=check_id,
        severity=severity,
        passed=passed,
        message="ok" if passed else "fail",
    )


def test_all_passing_gives_100():
    results = [
        _cr("sections.missing_required", CheckSeverity.BLOCK, True),
        _cr("citations.no_references", CheckSeverity.BLOCK, True),
        _cr("schema.invalid", CheckSeverity.BLOCK, True),
        _cr("fabrication.unresolvable_pmid", CheckSeverity.INFO, True),
        _cr("language.reading_level_out_of_range", CheckSeverity.WARNING, True),
        _cr("banned_terms.detected", CheckSeverity.BLOCK, True),
        _cr("redaction.pii_detected", CheckSeverity.INFO, True),
        _cr("placeholders.detected", CheckSeverity.BLOCK, True),
    ]
    score = compute_score(results)
    assert score.numeric == 100.0
    assert score.block_count == 0


def test_block_failure_counts():
    results = [
        _cr("sections.missing_required", CheckSeverity.BLOCK, False),
        _cr("citations.no_references", CheckSeverity.BLOCK, True),
    ]
    score = compute_score(results)
    assert score.block_count == 1
    assert score.numeric < 100.0


def test_verdict_pass():
    score = Score(numeric=85.0, block_count=0)
    assert compute_verdict(score) == Verdict.PASS


def test_verdict_needs_review():
    score = Score(numeric=70.0, block_count=0)
    assert compute_verdict(score) == Verdict.NEEDS_REVIEW


def test_verdict_fail_low_score():
    score = Score(numeric=50.0, block_count=0)
    assert compute_verdict(score) == Verdict.FAIL


def test_verdict_fail_block_override():
    """Any BLOCK forces FAIL even with high numeric score."""
    score = Score(numeric=95.0, block_count=1)
    assert compute_verdict(score) == Verdict.FAIL


def test_verdict_boundary_80():
    score = Score(numeric=80.0, block_count=0)
    assert compute_verdict(score) == Verdict.PASS


def test_verdict_boundary_60():
    score = Score(numeric=60.0, block_count=0)
    assert compute_verdict(score) == Verdict.NEEDS_REVIEW


def test_verdict_boundary_59():
    score = Score(numeric=59.99, block_count=0)
    assert compute_verdict(score) == Verdict.FAIL
