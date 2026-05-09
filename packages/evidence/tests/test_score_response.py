"""Tests for ``deepsynaps_evidence.score_response``.

Pins the load-bearing **decision-support, NOT diagnostic** policy:

* Confidence is capped to ``med`` when no validated assessment anchor is
  attached — the scorer cannot self-promote to ``high`` on biomarker
  evidence alone.
* Research-grade scores are capped to ``med`` regardless.
* ``uncertainty_band`` rejects an inverted (lo > hi) tuple.
* ``hash_inputs`` is deterministic across runs and falls back to ``repr``
  for non-JSON-serialisable inputs (the audit-replay contract).
* The compatibility flags surface whether the heavy optional deps are
  installed without triggering side effects.
"""
from __future__ import annotations

import pytest

from deepsynaps_evidence import _compat
from deepsynaps_evidence.score_response import (
    Caution,
    ConfidenceBand,
    EvidenceRef,
    MethodProvenance,
    ScoreResponse,
    TopContributor,
    cap_confidence,
    hash_inputs,
)


# ── ScoreResponse model ────────────────────────────────────────────────────


def _provenance() -> MethodProvenance:
    return MethodProvenance(
        model_id="gad7-anchor-v1",
        version="v1.2",
        inputs_hash="abc123",
    )


class TestScoreResponseModel:
    def test_minimal_no_data_score_constructable(self) -> None:
        # The "we couldn't score this" branch must be expressible —
        # value=None + confidence=no_data is the canonical empty state.
        resp = ScoreResponse(
            score_id="anxiety",
            scale="raw_assessment",
            method_provenance=_provenance(),
        )
        assert resp.value is None
        assert resp.confidence == "no_data"
        assert resp.has_validated_anchor() is False

    def test_validated_anchor_helper_true_when_anchor_present(self) -> None:
        resp = ScoreResponse(
            score_id="depression",
            scale="raw_assessment",
            value=8.0,
            assessment_anchor="PHQ-9",
            method_provenance=_provenance(),
        )
        assert resp.has_validated_anchor() is True

    def test_research_grade_helper_true_for_research_scale(self) -> None:
        resp = ScoreResponse(
            score_id="experimental",
            scale="research_grade",
            method_provenance=_provenance(),
        )
        assert resp.is_research_grade() is True

    def test_research_grade_helper_true_when_caution_code_present(self) -> None:
        # Even on a non-research scale, a 'research-grade-score' caution
        # bumps the helper to True.
        resp = ScoreResponse(
            score_id="something",
            scale="similarity_index",
            cautions=[
                Caution(code="research-grade-score", message="Research only"),
            ],
            method_provenance=_provenance(),
        )
        assert resp.is_research_grade() is True

    def test_research_grade_helper_false_for_clinical_scale_no_caution(self) -> None:
        resp = ScoreResponse(
            score_id="depression",
            scale="raw_assessment",
            method_provenance=_provenance(),
        )
        assert resp.is_research_grade() is False


class TestUncertaintyBandValidator:
    def test_ordered_band_accepted(self) -> None:
        resp = ScoreResponse(
            score_id="brain_age",
            scale="years",
            value=58.7,
            uncertainty_band=(55.4, 62.0),
            method_provenance=_provenance(),
        )
        assert resp.uncertainty_band == (55.4, 62.0)

    def test_none_band_accepted(self) -> None:
        resp = ScoreResponse(
            score_id="brain_age",
            scale="years",
            method_provenance=_provenance(),
        )
        assert resp.uncertainty_band is None

    def test_inverted_band_rejected(self) -> None:
        # Pin the contract — an inverted tuple is a programming bug,
        # the validator must catch it before it reaches the UI.
        with pytest.raises(ValueError, match=r"uncertainty_band\[0\] must be <= uncertainty_band\[1\]"):
            ScoreResponse(
                score_id="brain_age",
                scale="years",
                value=58.0,
                uncertainty_band=(60.0, 55.0),
                method_provenance=_provenance(),
            )

    def test_equal_band_accepted(self) -> None:
        # lo == hi is degenerate but legal (zero-width band).
        resp = ScoreResponse(
            score_id="brain_age",
            scale="years",
            uncertainty_band=(60.0, 60.0),
            method_provenance=_provenance(),
        )
        assert resp.uncertainty_band == (60.0, 60.0)


class TestSubmodels:
    def test_caution_default_severity_is_info(self) -> None:
        c = Caution(code="x", message="m")
        assert c.severity == "info"

    def test_evidence_ref_default_relation_is_informs(self) -> None:
        e = EvidenceRef(ref_id="pmid:1")
        assert e.relation == "informs"

    def test_method_provenance_defaults_version_v0_and_not_stub(self) -> None:
        p = MethodProvenance(model_id="m", inputs_hash="h")
        assert p.version == "v0"
        assert p.upstream_is_stub is False

    def test_top_contributor_optional_fields(self) -> None:
        tc = TopContributor(feature="phq9_total")
        assert tc.weight is None
        assert tc.direction is None
        assert tc.value is None


# ── hash_inputs ────────────────────────────────────────────────────────────


class TestHashInputs:
    def test_deterministic_across_calls(self) -> None:
        a = hash_inputs({"x": 1, "y": "two"})
        b = hash_inputs({"x": 1, "y": "two"})
        assert a == b
        assert len(a) == 64  # sha256 hex digest

    def test_key_order_does_not_affect_hash(self) -> None:
        # Canonical sort_keys=True means the order doesn't matter.
        a = hash_inputs({"a": 1, "b": 2})
        b = hash_inputs({"b": 2, "a": 1})
        assert a == b

    def test_different_inputs_yield_different_hashes(self) -> None:
        a = hash_inputs({"x": 1})
        b = hash_inputs({"x": 2})
        assert a != b

    def test_non_serialisable_value_falls_back_to_repr(self) -> None:
        # A custom object that json.dumps can't handle natively.
        class Opaque:
            def __repr__(self) -> str:
                return "<Opaque>"

        out = hash_inputs({"x": Opaque()})
        # Just ensure it produces a stable hex digest without raising.
        assert isinstance(out, str)
        assert len(out) == 64


# ── cap_confidence ─────────────────────────────────────────────────────────


class TestCapConfidence:
    def test_high_capped_to_med_without_validated_anchor(self) -> None:
        # Pin the policy: no validated assessment → cannot reach 'high'.
        out = cap_confidence("high", has_validated_anchor=False, research_grade=False)
        assert out == "med"

    def test_high_allowed_with_validated_anchor(self) -> None:
        out = cap_confidence("high", has_validated_anchor=True, research_grade=False)
        assert out == "high"

    def test_research_grade_capped_to_med_even_with_anchor(self) -> None:
        out = cap_confidence("high", has_validated_anchor=True, research_grade=True)
        assert out == "med"

    def test_low_passes_through_unchanged(self) -> None:
        # A request below the cap is left alone.
        out = cap_confidence("low", has_validated_anchor=False, research_grade=False)
        assert out == "low"

    def test_no_data_passes_through(self) -> None:
        out = cap_confidence("no_data", has_validated_anchor=True, research_grade=False)
        assert out == "no_data"

    def test_med_passes_through_when_capped_to_med(self) -> None:
        out = cap_confidence("med", has_validated_anchor=False, research_grade=False)
        assert out == "med"


# ── _compat module ─────────────────────────────────────────────────────────


class TestCompatFlags:
    def test_has_pgvector_is_bool(self) -> None:
        # The flag exists and is a bool — never raises at import.
        assert isinstance(_compat.HAS_PGVECTOR, bool)

    def test_has_sentence_transformers_is_bool(self) -> None:
        assert isinstance(_compat.HAS_SENTENCE_TRANSFORMERS, bool)

    def test_pgvector_attribute_exists(self) -> None:
        # PgVector is exported either as the real class or None — never raises.
        assert hasattr(_compat, "PgVector")
