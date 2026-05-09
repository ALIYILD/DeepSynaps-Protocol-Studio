"""Pin the public contracts of app/services/assessment_scoring.py.

All functions under test are pure (no DB session required).
"""
from __future__ import annotations

import pytest

from app.services.assessment_scoring import (
    _coerce_item_value,
    _sum_items,
    compute_canonical_score,
    detect_red_flags,
    severity_for_score,
    validate_submitted_score,
)


# ── _coerce_item_value ────────────────────────────────────────────────────────

class TestCoerceItemValue:
    def test_none_returns_none(self):
        assert _coerce_item_value(None) is None

    def test_empty_string_returns_none(self):
        assert _coerce_item_value("") is None

    def test_integer_passthrough(self):
        assert _coerce_item_value(3) == 3

    def test_float_truncated(self):
        assert _coerce_item_value(2.9) == 2

    def test_bool_true(self):
        assert _coerce_item_value(True) == 1

    def test_bool_false(self):
        assert _coerce_item_value(False) == 0

    def test_numeric_string(self):
        assert _coerce_item_value("2") == 2

    def test_likert4_several_days(self):
        assert _coerce_item_value("Several days") == 1

    def test_likert4_nearly_every_day(self):
        assert _coerce_item_value("Nearly every day") == 3

    def test_likert5_extremely(self):
        assert _coerce_item_value("Extremely") == 4

    def test_dass_often(self):
        assert _coerce_item_value("Often") == 2

    def test_ybocs_severe(self):
        assert _coerce_item_value("Severe") == 3

    def test_unknown_string_returns_none(self):
        assert _coerce_item_value("SomethingUnknown") is None


# ── _sum_items ────────────────────────────────────────────────────────────────

class TestSumItems:
    def test_basic_sum(self):
        items = {"phq9_1": 2, "phq9_2": 1, "phq9_3": 3}
        assert _sum_items(items, "phq9_", 1, 3) == 6

    def test_missing_items_treated_as_zero(self):
        # item 2 missing — should be skipped (not added)
        items = {"phq9_1": 2, "phq9_3": 1}
        assert _sum_items(items, "phq9_", 1, 3) == 3

    def test_string_values_coerced(self):
        items = {"phq9_1": "Several days", "phq9_2": "Not at all"}
        assert _sum_items(items, "phq9_", 1, 2) == 1  # 1 + 0


# ── compute_canonical_score ───────────────────────────────────────────────────

class TestComputeCanonicalScore:
    def test_phq9_full_score(self):
        items = {f"phq9_{i}": 3 for i in range(1, 10)}
        result = compute_canonical_score("PHQ-9", items)
        assert result is not None
        assert result["score"] == 27.0
        assert result["max"] == 27

    def test_phq9_minimal_score(self):
        items = {f"phq9_{i}": 0 for i in range(1, 10)}
        result = compute_canonical_score("phq9", items)
        assert result is not None
        assert result["score"] == 0.0

    def test_gad7_computes(self):
        items = {f"gad7_{i}": 2 for i in range(1, 8)}
        result = compute_canonical_score("GAD-7", items)
        assert result is not None
        assert result["score"] == 14.0
        assert result["max"] == 21

    def test_ybocs_has_subscales(self):
        items = {f"ybocs_{i}": 1 for i in range(1, 11)}
        result = compute_canonical_score("ybocs", items)
        assert result is not None
        assert "subscales" in result
        assert result["subscales"]["obsessions"] == 5
        assert result["subscales"]["compulsions"] == 5

    def test_score_only_instrument_returns_none(self):
        # wabr, midas, bpi, eq5d are score-only — no canonical computation
        assert compute_canonical_score("wabr", {"wabr_1": 10}) is None
        assert compute_canonical_score("midas", {"midas_1": 5}) is None

    def test_empty_items_returns_none(self):
        assert compute_canonical_score("phq9", {}) is None

    def test_none_items_returns_none(self):
        assert compute_canonical_score("phq9", None) is None

    def test_unknown_template_returns_none(self):
        assert compute_canonical_score("unknown_xyz", {"q1": 1}) is None


# ── severity_for_score / normalize_assessment_score ───────────────────────────

class TestSeverityForScore:
    def test_phq9_minimal(self):
        r = severity_for_score("phq9", 2.0)
        assert r["severity"] == "minimal"
        assert r["label"] == "Minimal"

    def test_phq9_mild(self):
        r = severity_for_score("phq9", 7.0)
        assert r["severity"] == "mild"

    def test_phq9_moderate(self):
        r = severity_for_score("phq9", 12.0)
        assert r["severity"] == "moderate"

    def test_phq9_moderately_severe(self):
        r = severity_for_score("phq9", 18.0)
        assert r["severity"] == "severe"

    def test_phq9_severe(self):
        r = severity_for_score("phq9", 27.0)
        assert r["severity"] == "critical"

    def test_gad7_severe(self):
        r = severity_for_score("gad7", 15.0)
        assert r["severity"] == "severe"

    def test_pcl5_below_threshold(self):
        r = severity_for_score("pcl5", 30.0)
        assert r["severity"] == "mild"
        # The label is "Below probable PTSD threshold"
        assert "probable ptsd threshold" in r["label"].lower()

    def test_pcl5_probable_ptsd(self):
        r = severity_for_score("pcl5", 33.0)
        assert r["severity"] == "severe"

    def test_c_ssrs_no_ideation(self):
        # _template_key removes hyphens; the band key is "c_ssrs" (underscore)
        r = severity_for_score("c_ssrs", 0.0)
        assert r["severity"] == "minimal"

    def test_c_ssrs_active_ideation(self):
        # Must use underscore form so _template_key resolves to "c_ssrs"
        r = severity_for_score("c_ssrs", 2.0)
        assert r["severity"] == "severe"

    def test_null_score_returns_unknown(self):
        r = severity_for_score("phq9", None)
        assert r["severity"] == "unknown"
        assert r["level"] is None

    def test_unknown_template_returns_unknown(self):
        r = severity_for_score("zz_unknown", 10.0)
        assert r["severity"] == "unknown"


# ── validate_submitted_score ──────────────────────────────────────────────────

class TestValidateSubmittedScore:
    def test_score_only_instrument_always_ok(self):
        result = validate_submitted_score("wabr", 50.0, {"wabr_total": 50})
        assert result["ok"] is True
        assert result["canonical_score"] is None

    def test_exact_match_ok(self):
        items = {f"phq9_{i}": 1 for i in range(1, 10)}
        result = validate_submitted_score("phq9", 9.0, items)
        assert result["ok"] is True
        assert result["canonical_score"] == 9.0

    def test_within_tolerance_ok(self):
        # PHQ-9 max=27, 5% = 1.35; allowed=max(1.0, 1.35)=1.35
        # canonical=9, submitted=10 → delta=1 ≤ 1.35 → ok
        items = {f"phq9_{i}": 1 for i in range(1, 10)}
        result = validate_submitted_score("phq9", 10.0, items)
        assert result["ok"] is True

    def test_outside_tolerance_fails(self):
        items = {f"phq9_{i}": 1 for i in range(1, 10)}  # canonical = 9
        result = validate_submitted_score("phq9", 15.0, items)
        assert result["ok"] is False
        assert result["reason"] is not None
        assert "canonical" in result["reason"].lower() or "differs" in result["reason"].lower()

    def test_non_numeric_submitted_fails(self):
        items = {f"phq9_{i}": 1 for i in range(1, 10)}
        result = validate_submitted_score("phq9", "notanumber", items)
        assert result["ok"] is False
        assert result["reason"] == "submitted_score is not numeric"

    def test_none_submitted_accepted_with_canonical(self):
        items = {f"phq9_{i}": 2 for i in range(1, 10)}
        result = validate_submitted_score("phq9", None, items)
        assert result["ok"] is True
        assert result["canonical_score"] == 18.0
        assert result["submitted_score"] is None


# ── detect_red_flags ──────────────────────────────────────────────────────────

class TestDetectRedFlags:
    def test_phq9_item9_positive_generates_flag(self):
        items = {"phq9_9": 1}
        flags = detect_red_flags("phq9", items, 5.0)
        assert len(flags) == 1
        assert "PHQ-9 Item 9" in flags[0]
        assert "suicidality" in flags[0]

    def test_phq9_item9_zero_no_flag(self):
        items = {"phq9_9": 0}
        flags = detect_red_flags("phq9", items, 5.0)
        assert flags == []

    def test_phq9_item9_missing_no_flag(self):
        flags = detect_red_flags("phq9", {}, 5.0)
        assert flags == []

    def test_cssrs_active_ideation_flag(self):
        flags = detect_red_flags("c_ssrs", {}, 2.0)
        assert any("C-SSRS" in f for f in flags)
        assert any("crisis protocol" in f for f in flags)

    def test_cssrs_below_threshold_no_flag(self):
        flags = detect_red_flags("c_ssrs", {}, 1.0)
        assert flags == []

    def test_pcl5_above_threshold_flag(self):
        flags = detect_red_flags("pcl5", {}, 33.0)
        assert any("PCL-5" in f for f in flags)
        assert any("33" in f for f in flags)

    def test_pcl5_below_threshold_no_flag(self):
        flags = detect_red_flags("pcl5", {}, 32.0)
        assert flags == []

    def test_none_items_safe(self):
        flags = detect_red_flags("phq9", None, 10.0)
        # item 9 missing → no flag
        assert flags == []
