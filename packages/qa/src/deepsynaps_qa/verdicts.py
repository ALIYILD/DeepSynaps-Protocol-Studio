"""Score computation and verdict logic."""

from __future__ import annotations

from deepsynaps_qa.models import Check, CheckResult, CheckSeverity, Score, Verdict

# Default weight allocation by category (sums to 100)
DEFAULT_CATEGORY_WEIGHTS: dict[str, float] = {
    "sections": 25.0,
    "citations": 20.0,
    "schema": 15.0,
    "fabrication": 15.0,
    "language": 10.0,
    "banned_terms": 10.0,
    "redaction": 3.0,
    "placeholders": 2.0,
}

# Weight factor by severity (for distributing category weight among checks)
SEVERITY_WEIGHT_FACTOR: dict[CheckSeverity, float] = {
    CheckSeverity.BLOCK: 1.0,
    CheckSeverity.WARNING: 0.5,
    CheckSeverity.INFO: 0.1,
}


def compute_score(
    results: list[CheckResult],
    checks: dict[str, Check] | None = None,
    category_weights: dict[str, float] | None = None,
) -> Score:
    """Compute a 0-100 numeric score from check results.

    If *checks* is provided, uses per-check weights.  Otherwise, distributes
    category weights (from *category_weights* or :data:`DEFAULT_CATEGORY_WEIGHTS`)
    among the results based on severity factors.
    """
    weights = category_weights or DEFAULT_CATEGORY_WEIGHTS

    if checks:
        # Per-check weight mode
        numeric = 0.0
        breakdown: dict[str, float] = {}
        blocks = warnings = infos = 0

        for result in results:
            check = checks.get(result.check_id)
            if check is None:
                continue
            category = check.category
            if result.passed:
                numeric += check.weight
                breakdown[category] = breakdown.get(category, 0.0) + check.weight
            else:
                if result.severity == CheckSeverity.BLOCK:
                    blocks += 1
                elif result.severity == CheckSeverity.WARNING:
                    warnings += 1
                else:
                    infos += 1

        return Score(
            numeric=round(numeric, 2),
            breakdown=breakdown,
            block_count=blocks,
            warning_count=warnings,
            info_count=infos,
        )

    # Category-level weight mode (default path)
    # Group results by category (derived from check_id prefix)
    by_category: dict[str, list[CheckResult]] = {}
    for r in results:
        cat = r.check_id.split(".")[0]
        by_category.setdefault(cat, []).append(r)

    numeric = 0.0
    breakdown = {}
    blocks = warnings = infos = 0

    for cat, cat_results in by_category.items():
        cat_weight = weights.get(cat, 0.0)

        # Count total severity-weighted items and passed ones
        total_weighted = 0.0
        passed_weighted = 0.0
        for r in cat_results:
            factor = SEVERITY_WEIGHT_FACTOR.get(r.severity, 0.1)
            total_weighted += factor
            if r.passed:
                passed_weighted += factor
            else:
                if r.severity == CheckSeverity.BLOCK:
                    blocks += 1
                elif r.severity == CheckSeverity.WARNING:
                    warnings += 1
                else:
                    infos += 1

        if total_weighted > 0:
            ratio = passed_weighted / total_weighted
        else:
            ratio = 1.0

        earned = cat_weight * ratio
        numeric += earned
        breakdown[cat] = round(earned, 2)

    return Score(
        numeric=round(numeric, 2),
        breakdown=breakdown,
        block_count=blocks,
        warning_count=warnings,
        info_count=infos,
    )


def compute_verdict(score: Score) -> Verdict:
    """Determine the verdict from a computed score.

    - Any BLOCK finding forces FAIL regardless of numeric score.
    - >= 80 => PASS
    - 60-79 => NEEDS_REVIEW
    - < 60 => FAIL
    """
    if score.block_count > 0:
        return Verdict.FAIL
    if score.numeric >= 80.0:
        return Verdict.PASS
    if score.numeric >= 60.0:
        return Verdict.NEEDS_REVIEW
    return Verdict.FAIL
