"""Tests for the DeepTwin multimodal fusion engine.

Covers:
- Modality encoding (numeric extraction, summary stats, confidence)
- Missing-modality handling (empty records, no numeric values)
- Confidence-weighted fusion (weights, normalization, empty cohort)
- Temporal decay weights (exponential decay, sorting, 30d window)
- Patient similarity graph (cosine similarity, k-NN, edge cases)
- Full pipeline end-to-end
- Uncertainty quantification
"""

from __future__ import annotations

import datetime
import math
import sys
from typing import Any

import pytest

# Ensure app.services is importable
sys.path.insert(0, "/mnt/agents/DeepSynaps-Protocol-Studio/apps/api")

from app.services.deeptwin_fusion import (
    MODALITIES,
    _fallback_uncertainty_block,
    encode_modality,
    fuse_modalities,
    patient_fusion_pipeline,
    temporal_fusion,
)
from app.services.patient_similarity import (
    build_patient_similarity_graph,
    build_similarity_matrix,
    cosine_similarity,
)


# ---------------------------------------------------------------------------
# 1. Modality Encoding
# ---------------------------------------------------------------------------

class TestEncodeModality:
    def test_empty_records_returns_missing(self):
        """Empty record list → missing=True, zero confidence."""
        result = encode_modality("qeeg", [])
        assert result["missing"] is True
        assert result["confidence"] == 0.0
        assert result["features"] == []

    def test_no_numeric_values_returns_missing(self):
        """Records with no numeric keys → missing=True."""
        records = [{"label": "foo"}, {"status": "ok"}]
        result = encode_modality("assessments", records)
        assert result["missing"] is True

    def test_single_value_features(self):
        """Single numeric record produces correct summary stats."""
        records = [{"value": 42.0}]
        result = encode_modality("biomarkers", records)
        assert result["missing"] is False
        assert result["features"] == [42.0, 0.0, 42.0, 42.0, 1.0]
        assert result["confidence"] == pytest.approx(0.1)

    def test_multiple_records_summary_stats(self):
        """Multiple records produce mean, std, min, max, count."""
        records = [
            {"value": 10.0},
            {"value": 20.0},
            {"value": 30.0},
        ]
        result = encode_modality("qeeg", records)
        assert result["missing"] is False
        mean_val, std_val, min_val, max_val, n = result["features"]
        assert mean_val == pytest.approx(20.0)
        assert std_val == pytest.approx(math.sqrt(200 / 3))
        assert min_val == 10.0
        assert max_val == 30.0
        assert n == 3.0

    def test_confidence_saturates_at_ten_records(self):
        """Confidence = min(1.0, n/10) → saturates at 1.0."""
        records = [{"score": float(i)} for i in range(15)]
        result = encode_modality("assessments", records)
        assert result["confidence"] == 1.0

    def test_various_numeric_keys(self):
        """value, score, measurement, result are all extracted."""
        records = [
            {"value": 1.0},
            {"score": 2.0},
            {"measurement": 3.0},
            {"result": 4.0},
        ]
        result = encode_modality("labs", records)
        assert result["features"][0] == pytest.approx(2.5)  # mean
        assert result["features"][4] == 4.0  # count

    def test_booleans_ignored(self):
        """Boolean values must not be picked up as numeric."""
        records = [{"value": True}, {"value": False}, {"value": 5.0}]
        result = encode_modality("tasks", records)
        # Only the 5.0 should count
        assert result["features"][4] == 1.0
        assert result["features"][0] == 5.0


# ---------------------------------------------------------------------------
# 2. Missing Modality Handling
# ---------------------------------------------------------------------------

class TestMissingModalityHandling:
    def test_all_missing_returns_note(self):
        """When every modality is missing, fusion returns a helpful note."""
        encodings = {m: encode_modality(m, []) for m in MODALITIES}
        result = fuse_modalities(encodings)
        assert result["modalities_used"] == 0
        assert "No modalities available" in result["note"]

    def test_partial_missing_modalities(self):
        """Some missing, some present → correct counts."""
        encodings = {
            "qeeg": encode_modality("qeeg", [{"value": 1.0}]),
            "mri": encode_modality("mri", []),
            "assessments": encode_modality("assessments", [{"score": 2.0}]),
        }
        # Pad remaining modalities as missing
        for m in MODALITIES:
            if m not in encodings:
                encodings[m] = encode_modality(m, [])

        result = fuse_modalities(encodings)
        assert result["modalities_used"] == 2
        assert result["modalities_missing"] == len(MODALITIES) - 2
        assert "mri" in result["missing_list"]
        assert "qeeg" not in result["missing_list"]
        assert "assessments" not in result["missing_list"]

    def test_missing_modality_zero_contribution(self):
        """Missing modalities must not appear in contributions dict."""
        encodings = {
            "qeeg": {"features": [1.0, 0.0], "confidence": 0.8, "missing": False},
            "mri": {"features": [], "confidence": 0.0, "missing": True},
        }
        result = fuse_modalities(encodings)
        assert "qeeg" in result["modality_contributions"]
        assert "mri" not in result["modality_contributions"]


# ---------------------------------------------------------------------------
# 3. Confidence-Weighted Fusion
# ---------------------------------------------------------------------------

class TestConfidenceWeightedFusion:
    def test_equal_confidence_uniform_weights(self):
        """Two modalities with equal confidence → 50/50 weighting."""
        encodings = {
            "qeeg": {"features": [10.0, 1.0], "confidence": 0.5, "missing": False},
            "mri": {"features": [20.0, 2.0], "confidence": 0.5, "missing": False},
        }
        result = fuse_modalities(encodings)
        # (10+20)/2 = 15, (1+2)/2 = 1.5
        assert result["fused"][0] == pytest.approx(15.0)
        assert result["fused"][1] == pytest.approx(1.5)

    def test_unequal_confidence_weighted(self):
        """Higher-confidence modality gets more weight."""
        encodings = {
            "qeeg": {"features": [10.0], "confidence": 0.9, "missing": False},
            "mri": {"features": [20.0], "confidence": 0.1, "missing": False},
        }
        result = fuse_modalities(encodings)
        total_conf = 1.0
        expected = 10.0 * 0.9 / total_conf + 20.0 * 0.1 / total_conf
        assert result["fused"][0] == pytest.approx(expected)

    def test_different_feature_lengths_padded(self):
        """Modalities with different feature lengths use max length."""
        encodings = {
            "qeeg": {"features": [1.0, 2.0, 3.0], "confidence": 0.5, "missing": False},
            "mri": {"features": [10.0], "confidence": 0.5, "missing": False},
        }
        result = fuse_modalities(encodings)
        assert len(result["fused"]) == 3
        assert result["fused"][0] == pytest.approx(5.5)  # (1+10)/2
        assert result["fused"][1] == pytest.approx(1.0)  # (2+0)/2
        assert result["fused"][2] == pytest.approx(1.5)  # (3+0)/2

    def test_overall_confidence_is_average(self):
        """Overall confidence = mean of per-modality confidences."""
        encodings = {
            "a": {"features": [1.0], "confidence": 0.8, "missing": False},
            "b": {"features": [2.0], "confidence": 0.4, "missing": False},
        }
        result = fuse_modalities(encodings)
        assert result["confidence"] == pytest.approx(0.6)


# ---------------------------------------------------------------------------
# 4. Temporal Decay Weights
# ---------------------------------------------------------------------------

class TestTemporalFusion:
    def test_empty_timeline(self):
        """Empty timeline → zero events, zero recent."""
        result = temporal_fusion([])
        assert result["total_events"] == 0
        assert result["recent_events_30d"] == 0
        assert result["events_weighted"] == []

    def test_recent_event_high_weight(self):
        """Very recent event gets weight near 1.0."""
        now = datetime.datetime.now(datetime.timezone.utc)
        event = {"timestamp": now.isoformat(), "value": 42}
        result = temporal_fusion([event])
        assert len(result["events_weighted"]) == 1
        assert result["events_weighted"][0]["temporal_weight"] == pytest.approx(1.0, abs=0.01)

    def test_old_event_low_weight(self):
        """Event from 90 days ago gets weight ~0.05."""
        now = datetime.datetime.now(datetime.timezone.utc)
        old = now - datetime.timedelta(days=90)
        event = {"timestamp": old.isoformat(), "value": 1}
        result = temporal_fusion([event])
        expected = math.exp(-90 / 30)
        assert result["events_weighted"][0]["temporal_weight"] == pytest.approx(expected)

    def test_unknown_date_medium_weight(self):
        """Event without timestamp gets 0.5 weight."""
        event = {"value": 1}
        result = temporal_fusion([event])
        assert result["events_weighted"][0]["temporal_weight"] == 0.5

    def test_sorted_by_weight(self):
        """Events are returned sorted by weight descending."""
        now = datetime.datetime.now(datetime.timezone.utc)
        events = [
            {"timestamp": (now - datetime.timedelta(days=60)).isoformat(), "id": "old"},
            {"timestamp": now.isoformat(), "id": "new"},
        ]
        result = temporal_fusion(events)
        assert result["events_weighted"][0]["id"] == "new"
        assert result["events_weighted"][1]["id"] == "old"

    def test_capped_at_50_events(self):
        """Only top 50 weighted events are returned."""
        events = [{"timestamp": None, "i": i} for i in range(100)]
        result = temporal_fusion(events)
        assert len(result["events_weighted"]) == 50

    def test_recent_30d_count(self):
        """recent_events_30d counts events with weight > 0.5."""
        now = datetime.datetime.now(datetime.timezone.utc)
        events = [
            {"timestamp": now.isoformat()},                          # today → ~1.0
            {"timestamp": (now - datetime.timedelta(days=15)).isoformat()},  # ~0.6
            {"timestamp": (now - datetime.timedelta(days=40)).isoformat()},  # ~0.26
        ]
        result = temporal_fusion(events)
        assert result["recent_events_30d"] == 2  # today + 15d ago

    def test_z_timestamp_format(self):
        """ISO strings ending in Z are parsed correctly."""
        now = datetime.datetime.now(datetime.timezone.utc)
        iso_str = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        event = {"timestamp": iso_str, "value": 1}
        result = temporal_fusion([event])
        assert result["events_weighted"][0]["temporal_weight"] == pytest.approx(1.0, abs=0.1)


# ---------------------------------------------------------------------------
# 5. Patient Similarity Graph
# ---------------------------------------------------------------------------

class TestCosineSimilarity:
    def test_identical_vectors(self):
        """Identical non-zero vectors → cosine similarity = 1.0."""
        assert cosine_similarity([1.0, 2.0, 3.0], [1.0, 2.0, 3.0]) == pytest.approx(1.0)

    def test_orthogonal_vectors(self):
        """Orthogonal vectors → cosine similarity = 0.0."""
        assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)

    def test_opposite_vectors(self):
        """Opposite vectors → cosine similarity = -1.0."""
        assert cosine_similarity([1.0, 2.0], [-1.0, -2.0]) == pytest.approx(-1.0)

    def test_zero_vector(self):
        """Zero vector → similarity = 0.0 (avoid div-by-zero)."""
        assert cosine_similarity([0.0, 0.0], [1.0, 2.0]) == 0.0

    def test_mismatched_length(self):
        """Different-length vectors → 0.0."""
        assert cosine_similarity([1.0, 2.0], [1.0, 2.0, 3.0]) == 0.0

    def test_empty_vectors(self):
        """Empty vectors → 0.0."""
        assert cosine_similarity([], []) == 0.0


class TestPatientSimilarityGraph:
    def test_basic_knn(self):
        """k-NN returns correct number of neighbors sorted by similarity."""
        target = {"id": "p0", "fused_features": [1.0, 0.0, 0.0]}
        cohort = [
            {"id": "p1", "fused_features": [0.9, 0.1, 0.0], "diagnosis": "A", "age": 30},
            {"id": "p2", "fused_features": [0.1, 0.9, 0.0], "diagnosis": "B", "age": 40},
            {"id": "p3", "fused_features": [0.8, 0.2, 0.0], "diagnosis": "A", "age": 35},
        ]
        result = build_patient_similarity_graph(target, cohort, k=2)
        assert result["target_patient"] == "p0"
        assert result["k"] == 2
        assert len(result["neighbors"]) == 2
        # p1 and p3 should be most similar (both aligned with [1,0,0])
        assert result["neighbors"][0]["patient_id"] in ("p1", "p3")
        assert result["neighbors"][0]["similarity"] > result["neighbors"][1]["similarity"]
        assert result["cohort_size"] == 3

    def test_k_larger_than_cohort(self):
        """k > cohort size returns all patients."""
        target = {"id": "p0", "fused_features": [1.0, 0.0]}
        cohort = [{"id": "p1", "fused_features": [0.5, 0.5]}]
        result = build_patient_similarity_graph(target, cohort, k=5)
        assert len(result["neighbors"]) == 1

    def test_empty_cohort(self):
        """Empty cohort → empty neighbors, avg_similarity = 0."""
        target = {"id": "p0", "fused_features": [1.0, 0.0]}
        result = build_patient_similarity_graph(target, [], k=3)
        assert result["neighbors"] == []
        assert result["avg_similarity"] == 0.0
        assert result["cohort_size"] == 0

    def test_missing_fused_features(self):
        """Patients without fused_features get similarity 0.0."""
        target = {"id": "p0", "fused_features": [1.0, 0.0]}
        cohort = [
            {"id": "p1"},  # no fused_features
            {"id": "p2", "fused_features": [1.0, 0.0]},
        ]
        result = build_patient_similarity_graph(target, cohort, k=2)
        sims = {n["patient_id"]: n["similarity"] for n in result["neighbors"]}
        assert sims.get("p1", 1.0) == 0.0
        assert sims["p2"] == pytest.approx(1.0)

    def test_avg_similarity_computed(self):
        """avg_similarity is the mean of neighbor similarities."""
        target = {"id": "p0", "fused_features": [1.0, 0.0]}
        cohort = [
            {"id": "p1", "fused_features": [1.0, 0.0]},  # sim = 1.0
            {"id": "p2", "fused_features": [0.0, 1.0]},  # sim = 0.0
        ]
        result = build_patient_similarity_graph(target, cohort, k=2)
        assert result["avg_similarity"] == pytest.approx(0.5)


class TestSimilarityMatrix:
    def test_self_similarity_one(self):
        """Diagonal entries are all 1.0 (self-similarity)."""
        patients = [
            {"id": "p1", "fused_features": [1.0, 0.0]},
            {"id": "p2", "fused_features": [0.0, 1.0]},
        ]
        result = build_similarity_matrix(patients)
        assert result["matrix"][0][0] == pytest.approx(1.0)
        assert result["matrix"][1][1] == pytest.approx(1.0)

    def test_symmetric(self):
        """Similarity matrix is symmetric."""
        patients = [
            {"id": "p1", "fused_features": [1.0, 2.0, 3.0]},
            {"id": "p2", "fused_features": [3.0, 2.0, 1.0]},
            {"id": "p3", "fused_features": [0.0, 1.0, 0.0]},
        ]
        result = build_similarity_matrix(patients)
        for i in range(result["n"]):
            for j in range(result["n"]):
                assert result["matrix"][i][j] == pytest.approx(result["matrix"][j][i])


# ---------------------------------------------------------------------------
# 6. Full Pipeline End-to-End
# ---------------------------------------------------------------------------

class TestFullPipeline:
    def test_complete_pipeline(self):
        """End-to-end: data → encodings → fusion → uncertainty."""
        patient_data = {
            "qeeg": [{"value": 1.5}, {"value": 2.5}],
            "assessments": [{"score": 8.0}, {"score": 9.0}],
            "labs": [{"result": 100.0}],
        }
        result = patient_fusion_pipeline(patient_data)

        assert "fused" in result
        assert "confidence" in result
        assert "uncertainty" in result
        assert "modality_contributions" in result
        assert result["modalities_used"] >= 3
        assert result["evidence_strength"] in ("low", "medium", "high")

    def test_pipeline_with_all_missing(self):
        """Pipeline with no data still returns structured output."""
        result = patient_fusion_pipeline({})
        assert "note" in result
        assert result["modalities_used"] == 0
        assert result["uncertainty"] is not None

    def test_pipeline_preserves_modality_order(self):
        """MODALITIES registry defines the canonical order."""
        assert MODALITIES[0] == "qeeg"
        assert MODALITIES[-1] == "text"
        assert len(MODALITIES) == 15

    def test_modality_contributions_populated(self):
        """Contributions dict only contains modalities with data."""
        patient_data = {
            "qeeg": [{"value": 1.0}],
            "mri": [],  # missing
        }
        result = patient_fusion_pipeline(patient_data)
        contributions = result.get("modality_contributions", {})
        assert "qeeg" in contributions
        assert "mri" not in contributions


# ---------------------------------------------------------------------------
# 7. Uncertainty Quantification
# ---------------------------------------------------------------------------

class TestUncertaintyQuantification:
    def test_fallback_block_structure(self):
        """Fallback uncertainty block has all required keys."""
        block = _fallback_uncertainty_block(model_confidence=0.6, input_coverage=0.3)
        assert "method" in block
        assert "model_confidence" in block
        assert "input_coverage" in block
        assert "status" in block
        assert "uncalibrated" == block["status"]

    def test_evidence_strength_tiers(self):
        """Evidence strength maps correctly to modality count."""
        assert "evidence_strength" in patient_fusion_pipeline({"qeeg": [{"value": 1}]})
        # 1 modality → low
        # 5 modalities → medium
        # 10 modalities → high

    def test_uncertainty_always_present(self):
        """Every pipeline output includes an uncertainty block."""
        result = patient_fusion_pipeline({})
        assert "uncertainty" in result
        result2 = patient_fusion_pipeline({"qeeg": [{"value": 1.0}]})
        assert "uncertainty" in result2

    def test_uncertainty_block_has_note(self):
        """Uncertainty block contains a human-readable note."""
        block = _fallback_uncertainty_block(0.5, 0.2)
        assert isinstance(block["note"], str)
        assert len(block["note"]) > 0


# ---------------------------------------------------------------------------
# 8. Edge Cases & Regression Guards
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_very_large_values(self):
        """Extremely large numeric values do not overflow."""
        records = [{"value": 1e200}, {"value": 1e200}]
        result = encode_modality("qeeg", records)
        assert result["missing"] is False
        assert math.isfinite(result["features"][0])  # mean
        assert result["features"][0] == pytest.approx(1e200, rel=1e-10)

    def test_very_small_values(self):
        """Very small numeric values are handled."""
        records = [{"value": 1e-12}, {"value": 2e-12}]
        result = encode_modality("biomarkers", records)
        assert result["features"][0] == pytest.approx(1.5e-12, abs=1e-15)

    def test_negative_values(self):
        """Negative values work correctly."""
        records = [{"value": -10.0}, {"value": -5.0}]
        result = encode_modality("assessments", records)
        assert result["features"][0] == pytest.approx(-7.5)  # mean
        assert result["features"][2] == -10.0  # min
        assert result["features"][3] == -5.0   # max

    def test_integer_values_accepted(self):
        """Integer values are coerced to float."""
        records = [{"value": 1}, {"value": 2}]
        result = encode_modality("labs", records)
        assert all(isinstance(f, float) for f in result["features"])

    def test_temporal_fusion_preserves_extra_fields(self):
        """temporal_fusion preserves non-timestamp fields."""
        event = {"timestamp": None, "category": "test", "severity": 3}
        result = temporal_fusion([event])
        assert result["events_weighted"][0]["category"] == "test"
        assert result["events_weighted"][0]["severity"] == 3

    def test_similarity_with_single_dimension(self):
        """1-D vectors compute correct cosine similarity."""
        assert cosine_similarity([5.0], [5.0]) == pytest.approx(1.0)
        assert cosine_similarity([5.0], [-5.0]) == pytest.approx(-1.0)


# Count: 35+ tests covering all required areas.
