"""Tests for :mod:`deepsynaps_qeeg.ai.similar_cases`."""
from __future__ import annotations

from deepsynaps_qeeg.ai import similar_cases as sc


PHI_FIELDS = {"name", "first_name", "last_name", "email", "mrn",
              "dob", "date_of_birth", "phone", "address", "ssn",
              "nhs_number"}

EXPECTED_CASE_KEYS = {
    "case_id", "similarity_score", "age", "sex",
    "flagged_conditions", "outcome", "summary_deidentified",
}


def _embedding(n: int = 16) -> list[float]:
    return [float(i) / 10.0 for i in range(n)]


def test_find_similar_k_ge_5_returns_list():
    emb = _embedding()
    out = sc.find_similar(emb, k=10)
    assert isinstance(out, list)
    assert len(out) == 10
    for case in out:
        assert EXPECTED_CASE_KEYS.issubset(case.keys())
        assert not (PHI_FIELDS & case.keys()), "PHI must never leak"
        assert 0.0 <= case["similarity_score"] <= 1.0
        outcome = case["outcome"]
        assert "responder" in outcome
        assert "response_delta" in outcome


def test_find_similar_k_lt_5_privacy_guard_aggregate_only():
    emb = _embedding()
    out = sc.find_similar(emb, k=3)
    assert isinstance(out, dict)
    assert "aggregate" in out
    agg = out["aggregate"]
    assert set(agg.keys()) == {"n", "responder_rate", "mean_age",
                                "common_conditions"}
    assert agg["n"] == 3
    # must not include per-case records
    assert "case_id" not in out
    assert "cases" not in out


def test_find_similar_deterministic_seed_identical_results():
    emb = _embedding()
    a = sc.find_similar(emb, k=8, deterministic_seed=42)
    b = sc.find_similar(emb, k=8, deterministic_seed=42)
    assert a == b


def test_find_similar_with_filters_respects_condition():
    emb = _embedding()
    out = sc.find_similar(
        emb, k=6,
        filters={"condition": "mdd_like", "age_range": (30, 60), "sex": "F"},
    )
    assert isinstance(out, list)
    for case in out:
        assert case["sex"] == "F"
        assert 30 <= case["age"] <= 60
        assert "mdd_like" in case["flagged_conditions"]


def test_find_similar_min_cohort_constant():
    # Regression: privacy threshold must stay at 5
    assert sc.MIN_COHORT_SIZE == 5
