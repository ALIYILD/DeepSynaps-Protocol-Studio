"""Tests for ``deepsynaps_qeeg.ai.similar_cases``.

Pins the load-bearing **PHI privacy contract**:

- Privacy guard: when ``k < MIN_COHORT_SIZE`` (5) the function returns
  the aggregate-only envelope, NOT per-case records.
- Privacy guard: when the real pgvector path returns fewer than 5 rows
  even though k>=5 was requested, the function downgrades to aggregate-
  only (k-anonymity safeguard against thin cohorts).
- The PHI scrubber drops every PHI-shaped key (name / mrn / dob /
  phone / email / address / ssn / nhs_number) — defensive sanitiser
  applied to BOTH stub and real-path rows.
- The aggregate envelope carries n, responder_rate, mean_age, and
  common_conditions; per-case records carry case_id, similarity_score,
  age, sex, flagged_conditions, outcome, summary_deidentified.
- Deterministic seed produces stable stub output for reproducible UI.
- Stub case_id starts with "syn-" so consumers can never confuse a
  synthetic case with a real patient.
"""
from __future__ import annotations

from typing import Any
from unittest import mock

import pytest

from deepsynaps_qeeg.ai.similar_cases import (
    MIN_COHORT_SIZE,
    _BASE_CONDITIONS,
    _PHI_KEYS,
    _aggregate_only,
    _scrub,
    _seed,
    _stub_cases,
    _stub_summary,
    find_similar,
)


# ── PHI scrubber + constants ──────────────────────────────────────────────


class TestPhiScrubber:
    def test_drops_every_phi_shaped_key(self) -> None:
        # Pin the privacy contract: every known PHI-shaped key must be
        # dropped from the case envelope before it leaves the function.
        phi_packed = {
            "case_id": "C1",
            "similarity_score": 0.9,
            "name": "John Doe",
            "first_name": "John",
            "last_name": "Doe",
            "email": "john@example.com",
            "mrn": "MRN-123",
            "dob": "1980-01-01",
            "date_of_birth": "1980-01-01",
            "phone": "555-1234",
            "address": "1 Main St",
            "ssn": "111-22-3333",
            "nhs_number": "ABC-123",
        }
        out = _scrub(phi_packed)
        # Every PHI key removed.
        for k in _PHI_KEYS:
            assert k not in out
        # Non-PHI keys preserved.
        assert out["case_id"] == "C1"
        assert out["similarity_score"] == 0.9

    def test_phi_keys_set_covers_known_identifiers(self) -> None:
        # Pin: the canonical PHI key set covers the 11 identifier types.
        for k in (
            "name", "first_name", "last_name", "email", "mrn", "dob",
            "date_of_birth", "phone", "address", "ssn", "nhs_number",
        ):
            assert k in _PHI_KEYS


class TestConstants:
    def test_min_cohort_size_is_five(self) -> None:
        # Pin the load-bearing privacy threshold: 5 is the canonical
        # k-anonymity floor used by the API to decide aggregate-vs-list.
        assert MIN_COHORT_SIZE == 5

    def test_base_conditions_use_like_suffix(self) -> None:
        # Stub cohorts only emit *_like labels — never naked condition
        # names, so the UI cannot confuse a stub for a diagnosis.
        for cond in _BASE_CONDITIONS:
            assert cond.endswith("_like")


# ── _seed determinism ─────────────────────────────────────────────────────


class TestSeed:
    def test_explicit_override_returned(self) -> None:
        assert _seed([0.0], 42) == 42

    def test_deterministic_for_same_embedding(self) -> None:
        assert _seed([1.0, 2.0], None) == _seed([1.0, 2.0], None)

    def test_different_embeddings_yield_different_seeds(self) -> None:
        assert _seed([1.0], None) != _seed([2.0], None)


# ── _stub_cases ───────────────────────────────────────────────────────────


class TestStubCases:
    def test_returns_k_cases_when_k_requested(self) -> None:
        out = _stub_cases([0.0], 6, {}, deterministic_seed=1)
        assert len(out) == 6

    def test_each_case_has_canonical_envelope(self) -> None:
        out = _stub_cases([0.0], 6, {}, deterministic_seed=1)
        for case in out:
            assert set(case.keys()) >= {
                "case_id",
                "similarity_score",
                "age",
                "sex",
                "flagged_conditions",
                "outcome",
                "summary_deidentified",
            }
            # case_id is a synthetic marker, not a real patient id.
            assert case["case_id"].startswith("syn-")

    def test_case_ids_are_distinct(self) -> None:
        out = _stub_cases([0.0], 8, {}, deterministic_seed=1)
        ids = {c["case_id"] for c in out}
        assert len(ids) == 8

    def test_sorted_by_similarity_score_desc(self) -> None:
        out = _stub_cases([0.0], 6, {}, deterministic_seed=1)
        scores = [c["similarity_score"] for c in out]
        assert scores == sorted(scores, reverse=True)

    def test_age_range_filter_respected(self) -> None:
        out = _stub_cases([0.0], 6, {"age_range": (40, 50)}, deterministic_seed=1)
        for case in out:
            assert 40 <= case["age"] <= 50

    def test_sex_filter_respected(self) -> None:
        out = _stub_cases([0.0], 6, {"sex": "F"}, deterministic_seed=1)
        for case in out:
            assert case["sex"] == "F"

    def test_condition_filter_seeds_first_condition(self) -> None:
        out = _stub_cases([0.0], 6, {"condition": "mdd_like"}, deterministic_seed=1)
        for case in out:
            assert "mdd_like" in case["flagged_conditions"]

    def test_outcome_responder_is_bool_and_delta_float(self) -> None:
        out = _stub_cases([0.0], 6, {}, deterministic_seed=1)
        for case in out:
            assert isinstance(case["outcome"]["responder"], bool)
            assert isinstance(case["outcome"]["response_delta"], float)

    def test_deterministic_seed_produces_repeatable_cases(self) -> None:
        a = _stub_cases([0.0], 6, {}, deterministic_seed=42)
        b = _stub_cases([0.0], 6, {}, deterministic_seed=42)
        assert a == b


# ── _stub_summary ─────────────────────────────────────────────────────────


class TestStubSummary:
    def test_summary_includes_session_count_and_outcome(self) -> None:
        import random

        rng = random.Random(0)
        out = _stub_summary(["mdd_like"], 0.3, rng)
        assert "mdd_like" in out
        assert "improved" in out

    def test_negative_delta_produces_stable_or_worsened(self) -> None:
        import random

        rng = random.Random(0)
        out = _stub_summary(["adhd_like"], -0.1, rng)
        assert "stable/worsened" in out


# ── _aggregate_only ──────────────────────────────────────────────────────


class TestAggregateOnly:
    def test_envelope_has_aggregate_key(self) -> None:
        # Pin the privacy contract: collapsed cohorts emit the aggregate
        # envelope, NOT per-case records.
        out = _aggregate_only([0.0], 3, {}, deterministic_seed=1)
        assert "aggregate" in out
        # No per-case records leaked in.
        assert "case_id" not in out
        assert "similarity_score" not in out

    def test_aggregate_carries_required_stats(self) -> None:
        out = _aggregate_only([0.0], 3, {}, deterministic_seed=1)
        agg = out["aggregate"]
        assert "n" in agg
        assert "responder_rate" in agg
        assert "mean_age" in agg
        assert "common_conditions" in agg
        assert isinstance(agg["common_conditions"], list)
        assert len(agg["common_conditions"]) == 3

    def test_aggregate_n_matches_requested_k(self) -> None:
        out = _aggregate_only([0.0], 4, {}, deterministic_seed=1)
        assert out["aggregate"]["n"] == 4

    def test_age_range_filter_drives_mean_age(self) -> None:
        out = _aggregate_only([0.0], 3, {"age_range": (40, 60)}, deterministic_seed=1)
        assert out["aggregate"]["mean_age"] == 50.0


# ── find_similar (top-level dispatch) ─────────────────────────────────────


class TestFindSimilar:
    def test_k_below_min_cohort_returns_aggregate(self) -> None:
        # Pin: k < 5 short-circuits to aggregate-only.
        out = find_similar([0.0], k=3, deterministic_seed=1)
        assert isinstance(out, dict)
        assert "aggregate" in out

    def test_k_at_min_cohort_returns_per_case_list(self) -> None:
        out = find_similar([0.0], k=5, deterministic_seed=1)
        assert isinstance(out, list)
        assert len(out) == 5
        for case in out:
            assert "case_id" in case

    def test_k_above_min_cohort_returns_per_case_list(self) -> None:
        out = find_similar([0.0], k=10, deterministic_seed=1)
        assert isinstance(out, list)
        assert len(out) == 10

    def test_filters_passed_through(self) -> None:
        out = find_similar(
            [0.0], k=6, filters={"sex": "F", "age_range": (25, 35)}, deterministic_seed=1
        )
        assert isinstance(out, list)
        for case in out:
            assert case["sex"] == "F"
            assert 25 <= case["age"] <= 35

    def test_no_filters_uses_default_age_range(self) -> None:
        # Default age range is (25, 70) — verify cases stay in that band.
        out = find_similar([0.0], k=8, deterministic_seed=1)
        assert isinstance(out, list)
        for case in out:
            assert 25 <= case["age"] <= 70

    def test_pgvector_bridge_preferred_when_available(self) -> None:
        # When the bridge path returns rows, find_similar uses them
        # instead of the stub.
        bridge_rows = [
            {
                "case_id": "real-1",
                "analysis_id": "real-1",
                "similarity_score": 0.95,
                "age": 42,
                "sex": "F",
                "flagged_conditions": ["mdd_like"],
                "responder": True,
                "response_delta": 0.4,
                "summary_deidentified": "real summary",
            }
        ] * 6  # 6 rows so we beat MIN_COHORT_SIZE

        with (
            mock.patch(
                "deepsynaps_qeeg.ai.similar_cases.HAS_PGVECTOR_RUNTIME", True
            ),
            mock.patch(
                "deepsynaps_qeeg.ai.similar_cases.cosine_similar",
                return_value=bridge_rows,
            ),
        ):
            out = find_similar([0.0], k=6, db_session=mock.Mock())
        assert isinstance(out, list)
        assert all(c["case_id"] == "real-1" for c in out)

    def test_pgvector_bridge_thin_cohort_collapses_to_aggregate(self) -> None:
        # Pin the k-anonymity safeguard: when the real path returns
        # fewer than MIN_COHORT_SIZE rows, the result downgrades to
        # aggregate-only even though k>=5 was requested.
        thin_rows = [
            {
                "case_id": "real-only",
                "similarity_score": 0.9,
                "age": 40,
                "sex": "M",
                "flagged_conditions": ["mdd_like"],
            }
        ] * 2

        with (
            mock.patch(
                "deepsynaps_qeeg.ai.similar_cases.HAS_PGVECTOR_RUNTIME", True
            ),
            mock.patch(
                "deepsynaps_qeeg.ai.similar_cases.cosine_similar",
                return_value=thin_rows,
            ),
        ):
            out = find_similar(
                [0.0], k=10, db_session=mock.Mock(), deterministic_seed=1
            )
        assert isinstance(out, dict)
        assert "aggregate" in out

    def test_pgvector_bridge_distance_to_similarity_conversion(self) -> None:
        # If the bridge returns 'distance' instead of 'similarity_score',
        # find_similar converts via similarity = 1.0 - distance.
        rows = [
            {"case_id": "x", "distance": 0.3, "age": 40, "sex": "F"},
        ] * 6

        with (
            mock.patch(
                "deepsynaps_qeeg.ai.similar_cases.HAS_PGVECTOR_RUNTIME", True
            ),
            mock.patch(
                "deepsynaps_qeeg.ai.similar_cases.cosine_similar",
                return_value=rows,
            ),
        ):
            out = find_similar([0.0], k=6, db_session=mock.Mock())
        assert isinstance(out, list)
        assert out[0]["similarity_score"] == pytest.approx(0.7)

    def test_bridge_unavailable_falls_back_to_stub(self) -> None:
        # When the bridge path returns None (HAS_PGVECTOR_RUNTIME is
        # False), find_similar falls back to the stub.
        out = find_similar([0.0], k=6, db_session=None, deterministic_seed=1)
        # Stub path -> per-case list, case_ids start with "syn-".
        assert isinstance(out, list)
        for case in out:
            assert case["case_id"].startswith("syn-")
