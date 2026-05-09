"""Unit tests for app.services.biometrics_evidence_bridge.

All tests are pure-logic — no DB, no HTTP. query_evidence is patched
so the evidence-intelligence layer isn't exercised.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services.biometrics_evidence_bridge import (
    BiometricsEvidenceRequest,
    _map_context,
    build_evidence_query_from_biometrics,
    provenance_note,
)


# ── _map_context ──────────────────────────────────────────────────────────────

class TestMapContext:
    def test_known_contexts_pass_through(self):
        for ctx in ("prediction", "biomarker", "risk_score", "recommendation", "multimodal_summary"):
            assert _map_context(ctx) == ctx

    def test_unknown_defaults_to_biomarker(self):
        assert _map_context("nonsense_ctx") == "biomarker"

    def test_empty_string_defaults_to_biomarker(self):
        assert _map_context("") == "biomarker"

    def test_none_defaults_to_biomarker(self):
        assert _map_context(None) == "biomarker"

    def test_case_insensitive(self):
        assert _map_context("PREDICTION") == "prediction"
        assert _map_context("Biomarker") == "biomarker"


# ── build_evidence_query_from_biometrics ──────────────────────────────────────

def _base_req(**overrides) -> BiometricsEvidenceRequest:
    defaults = dict(
        patient_id="pat-1",
        evidence_target="stress_load",
        context_type="biomarker",
        max_results=8,
    )
    defaults.update(overrides)
    return BiometricsEvidenceRequest(**defaults)


class TestBuildEvidenceQuery:
    def test_target_name_matches_request(self):
        req = _base_req(evidence_target="wearable_sleep_circadian")
        q = build_evidence_query_from_biometrics(req)
        assert q.target_name == "wearable_sleep_circadian"

    def test_max_results_propagated(self):
        req = _base_req(max_results=15)
        q = build_evidence_query_from_biometrics(req)
        assert q.max_results == 15

    def test_no_features_when_no_snapshots(self):
        req = _base_req()
        q = build_evidence_query_from_biometrics(req)
        assert q.feature_summary == []

    def test_correlation_matrix_produces_feature(self):
        req = _base_req(
            correlation_snapshot={"matrix": {"hrv:sleep_efficiency": 0.72}}
        )
        q = build_evidence_query_from_biometrics(req)
        assert len(q.feature_summary) == 1
        feat = q.feature_summary[0]
        assert feat.name == "strongest_bivariate_correlation"
        assert "0.720" in feat.value or "0.72" in feat.value

    def test_correlation_matrix_picks_strongest(self):
        req = _base_req(
            correlation_snapshot={"matrix": {"a:b": 0.3, "c:d": 0.9, "e:f": -0.5}}
        )
        q = build_evidence_query_from_biometrics(req)
        feat = next(f for f in q.feature_summary if f.name == "strongest_bivariate_correlation")
        # Strongest absolute is c:d = 0.9
        assert "0.900" in feat.value or "0.9" in feat.value

    def test_features_snapshot_daily_produces_features(self):
        req = _base_req(
            features_snapshot={"daily": {"heart_rate_avg": 72.5, "steps": 8000}}
        )
        q = build_evidence_query_from_biometrics(req)
        names = [f.name for f in q.feature_summary]
        assert any("daily_mean_heart_rate_avg" in n for n in names)

    def test_features_snapshot_rolling_7d(self):
        req = _base_req(
            features_snapshot={"rolling_7d": {"hrv_mean": 45.0}}
        )
        q = build_evidence_query_from_biometrics(req)
        names = [f.name for f in q.feature_summary]
        assert any("rolling_7d_hrv_mean" in n for n in names)

    def test_wearables_modality_filter_always_present(self):
        req = _base_req()
        q = build_evidence_query_from_biometrics(req)
        assert "wearables" in q.modality_filters

    def test_diagnosis_filters_propagated(self):
        req = _base_req(diagnosis_filters=["MDD", "Insomnia"])
        q = build_evidence_query_from_biometrics(req)
        assert "MDD" in q.diagnosis_filters
        assert "Insomnia" in q.diagnosis_filters

    def test_phenotype_tags_propagated(self):
        req = _base_req(phenotype_tags=["hyperarousal", "anhedonia"])
        q = build_evidence_query_from_biometrics(req)
        assert "hyperarousal" in q.phenotype_tags

    def test_counter_evidence_always_true(self):
        req = _base_req()
        q = build_evidence_query_from_biometrics(req)
        assert q.include_counter_evidence is True

    def test_non_numeric_matrix_values_skipped(self):
        req = _base_req(
            correlation_snapshot={"matrix": {"a:b": "strong", "c:d": None}}
        )
        # Should not raise
        q = build_evidence_query_from_biometrics(req)
        # No valid numeric pair → no strongest_bivariate_correlation feature
        bivar = [f for f in q.feature_summary if f.name == "strongest_bivariate_correlation"]
        assert bivar == []


# ── provenance_note ────────────────────────────────────────────────────────────

def test_provenance_note_contains_corpus_name():
    note = provenance_note("87k EuropePMC corpus")
    assert "87k EuropePMC corpus" in note


def test_provenance_note_disclaimer_present():
    note = provenance_note("corpus")
    assert "not individualized prognosis" in note


def test_provenance_note_no_clinical_treatment_claim():
    note = provenance_note("test-corpus")
    # Must say "discussion only" — not "diagnose" or "treat"
    assert "discussion only" in note
    assert "diagnose" not in note.lower()
    assert "treat" not in note.lower()
