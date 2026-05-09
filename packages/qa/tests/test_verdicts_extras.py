"""Supplementary tests for ``deepsynaps_qa.verdicts``.

The existing test_verdicts.py covers the canonical 8-result happy
path + verdict thresholds. This file fills the per-check weight
mode + the constant pinning + a couple of category-level edges:

- DEFAULT_CATEGORY_WEIGHTS sums to exactly 100.
- The 8 documented categories are pinned (refactor cannot drop one).
- SEVERITY_WEIGHT_FACTOR pinned: BLOCK=1.0, WARNING=0.5, INFO=0.1.
- compute_score (per-check mode):
  * passed check adds Check.weight to numeric + breakdown.
  * failed BLOCK / WARNING / INFO increment the right counter.
  * unknown check_id silently skipped (defensive against stale rows).
- compute_score (category-level mode):
  * severity-weighted within category (1 BLOCK pass + 1 WARN fail
    → ratio = 2/3).
  * unknown category prefix uses weight=0.
  * empty results → numeric=0, all counters=0.
  * custom category_weights dict overrides DEFAULT_CATEGORY_WEIGHTS.
"""
from __future__ import annotations

import pytest

from deepsynaps_qa.models import (
    Check,
    CheckResult,
    CheckSeverity,
    Score,
    Verdict,
)
from deepsynaps_qa.verdicts import (
    DEFAULT_CATEGORY_WEIGHTS,
    SEVERITY_WEIGHT_FACTOR,
    compute_score,
    compute_verdict,
)


# ── Constants ─────────────────────────────────────────────────────────────


class TestConstants:
    def test_default_category_weights_sum_to_100(self) -> None:
        # Pin: refactor cannot rebalance the score distribution silently.
        assert sum(DEFAULT_CATEGORY_WEIGHTS.values()) == pytest.approx(100.0)

    def test_eight_canonical_categories(self) -> None:
        # Pin the documented categories so a refactor can't drop one.
        assert set(DEFAULT_CATEGORY_WEIGHTS.keys()) == {
            "sections",
            "citations",
            "schema",
            "fabrication",
            "language",
            "banned_terms",
            "redaction",
            "placeholders",
        }

    def test_severity_factors_pinned(self) -> None:
        # Pin: BLOCK=1.0 (full), WARNING=0.5 (half), INFO=0.1 (token).
        # Refactor cannot silently demote BLOCK weight.
        assert SEVERITY_WEIGHT_FACTOR[CheckSeverity.BLOCK] == 1.0
        assert SEVERITY_WEIGHT_FACTOR[CheckSeverity.WARNING] == 0.5
        assert SEVERITY_WEIGHT_FACTOR[CheckSeverity.INFO] == 0.1


# ── Helpers ───────────────────────────────────────────────────────────────


def _result(
    *,
    check_id: str,
    passed: bool,
    severity: CheckSeverity = CheckSeverity.WARNING,
) -> CheckResult:
    return CheckResult(check_id=check_id, severity=severity, passed=passed)


def _check(
    *,
    check_id: str,
    category: str,
    severity: CheckSeverity,
    weight: float,
) -> Check:
    return Check(
        check_id=check_id,
        category=category,
        severity=severity,
        weight=weight,
    )


# ── compute_score (per-check weight mode) ────────────────────────────────


class TestComputeScorePerCheck:
    def test_passed_check_adds_weight_to_numeric_and_breakdown(self) -> None:
        checks = {
            "sections.has_clinical": _check(
                check_id="sections.has_clinical",
                category="sections",
                severity=CheckSeverity.BLOCK,
                weight=25.0,
            ),
        }
        results = [
            _result(check_id="sections.has_clinical", passed=True, severity=CheckSeverity.BLOCK),
        ]
        score = compute_score(results, checks=checks)
        assert score.numeric == 25.0
        assert score.breakdown["sections"] == 25.0
        assert score.block_count == 0

    def test_failed_block_increments_block_counter(self) -> None:
        checks = {
            "schema.valid": _check(
                check_id="schema.valid",
                category="schema",
                severity=CheckSeverity.BLOCK,
                weight=15.0,
            ),
        }
        results = [
            _result(check_id="schema.valid", passed=False, severity=CheckSeverity.BLOCK),
        ]
        score = compute_score(results, checks=checks)
        assert score.block_count == 1
        assert score.warning_count == 0
        assert score.info_count == 0
        # Failed → no weight added.
        assert score.numeric == 0.0

    def test_failed_warning_increments_warning_counter(self) -> None:
        checks = {
            "language.hedged": _check(
                check_id="language.hedged",
                category="language",
                severity=CheckSeverity.WARNING,
                weight=10.0,
            ),
        }
        results = [
            _result(check_id="language.hedged", passed=False, severity=CheckSeverity.WARNING),
        ]
        score = compute_score(results, checks=checks)
        assert score.warning_count == 1
        assert score.block_count == 0

    def test_failed_info_increments_info_counter(self) -> None:
        checks = {
            "redaction.complete": _check(
                check_id="redaction.complete",
                category="redaction",
                severity=CheckSeverity.INFO,
                weight=3.0,
            ),
        }
        results = [
            _result(check_id="redaction.complete", passed=False, severity=CheckSeverity.INFO),
        ]
        score = compute_score(results, checks=checks)
        assert score.info_count == 1

    def test_unknown_check_id_skipped(self) -> None:
        # Pin: per-check mode silently skips a CheckResult whose
        # check_id has no entry in the Check map (defensive — tolerates
        # stale results across schema versions).
        # Need a non-empty checks dict so the per-check path is taken.
        checks = {
            "known.id": _check(
                check_id="known.id",
                category="sections",
                severity=CheckSeverity.BLOCK,
                weight=10.0,
            ),
        }
        results = [_result(check_id="not.a.check", passed=False, severity=CheckSeverity.BLOCK)]
        score = compute_score(results, checks=checks)
        assert score.numeric == 0.0
        # Unknown ids do NOT increment counters in per-check mode.
        assert score.block_count == 0
        assert score.warning_count == 0


# ── compute_score (category-level weight mode) ──────────────────────────


class TestComputeScoreCategoryLevel:
    def test_severity_weighted_within_category(self) -> None:
        # 1 BLOCK pass + 1 WARNING fail in 'sections':
        # total_weighted = 1.0 + 0.5 = 1.5
        # passed_weighted = 1.0
        # ratio = 2/3 → earned = 25 * 2/3 ≈ 16.67
        results = [
            _result(check_id="sections.x", passed=True, severity=CheckSeverity.BLOCK),
            _result(check_id="sections.y", passed=False, severity=CheckSeverity.WARNING),
        ]
        score = compute_score(results)
        assert score.numeric == pytest.approx(25.0 * (2 / 3), rel=1e-3)
        assert score.warning_count == 1
        assert score.block_count == 0

    def test_unknown_category_zero_weight(self) -> None:
        # Unknown category prefix uses weight=0 — the breakdown still
        # records the 0 entry so the audit trail shows the unknown bucket.
        results = [
            _result(check_id="unknown_cat.x", passed=True, severity=CheckSeverity.BLOCK),
        ]
        score = compute_score(results)
        assert score.numeric == 0.0
        assert "unknown_cat" in score.breakdown
        assert score.breakdown["unknown_cat"] == 0.0

    def test_custom_category_weights_override_default(self) -> None:
        custom = {"sections": 50.0, "citations": 50.0}
        results = [
            _result(check_id="sections.x", passed=True, severity=CheckSeverity.BLOCK),
        ]
        score = compute_score(results, category_weights=custom)
        assert score.numeric == pytest.approx(50.0)

    def test_empty_results_returns_zero(self) -> None:
        score = compute_score([])
        assert score.numeric == 0.0
        assert score.block_count == 0
        assert score.warning_count == 0
        assert score.info_count == 0
