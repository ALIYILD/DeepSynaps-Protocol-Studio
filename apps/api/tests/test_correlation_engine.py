"""Tests for CorrelationEngine."""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

from contracts import MultimodalEvent
from knowledge_layer import KnowledgeLayer
from correlation_engine import CorrelationEngine


class TestCorrelationEngine(unittest.TestCase):
    """Test suite for temporal correlation detection."""

    def setUp(self):
        self.db_path = f"/tmp/test_corr_{id(self)}.db"
        self.kl = KnowledgeLayer(db_path=self.db_path)
        self.engine = CorrelationEngine(self.kl)
        self.patient_id = "test_corr_001"

    def tearDown(self):
        import os
        try:
            os.remove(self.db_path)
        except FileNotFoundError:
            pass

    def _insert_pair(self, mod_a, mod_b, days_ago_a, days_ago_b,
                     val_a="test a", val_b="test b",
                     conf_a=0.9, conf_b=0.9, quality_a="high", quality_b="high"):
        """Helper to insert a correlated event pair."""
        now = datetime.now(timezone.utc)
        e1 = MultimodalEvent(
            patient_id=self.patient_id, event_type="test", modality=mod_a,
            source_system="test", source_record_id=f"rec_{mod_a}_1",
            timestamp=now - timedelta(days=days_ago_a),
            value_summary=val_a, confidence=conf_a, data_quality=quality_a,
        )
        e2 = MultimodalEvent(
            patient_id=self.patient_id, event_type="test", modality=mod_b,
            source_system="test", source_record_id=f"rec_{mod_b}_2",
            timestamp=now - timedelta(days=days_ago_b),
            value_summary=val_b, confidence=conf_b, data_quality=quality_b,
        )
        self.kl.insert_event(e1)
        self.kl.insert_event(e2)
        return e1, e2

    # ── basic detection ──

    def test_finds_correlation_within_window(self):
        self._insert_pair("interventions", "assessments", 5, 8)
        results = self.engine.find_correlations(self.patient_id, window_days=30)
        self.assertGreaterEqual(len(results), 1)

    def test_no_correlation_outside_window(self):
        self._insert_pair("interventions", "assessments", 5, 60)
        results = self.engine.find_correlations(self.patient_id, window_days=30)
        self.assertEqual(len(results), 0)

    def test_no_results_for_empty_patient(self):
        results = self.engine.find_correlations("nonexistent_patient", window_days=30)
        self.assertEqual(len(results), 0)

    # ── confidence thresholds ──

    def test_min_confidence_filters_low_scores(self):
        self._insert_pair("interventions", "assessments", 5, 8, conf_a=0.3, conf_b=0.3)
        results_low = self.engine.find_correlations(self.patient_id, window_days=30, min_confidence=0.1)
        results_high = self.engine.find_correlations(self.patient_id, window_days=30, min_confidence=0.9)
        self.assertGreater(len(results_low), len(results_high))

    def test_confidence_below_maximum(self):
        self._insert_pair("interventions", "assessments", 5, 8, conf_a=1.0, conf_b=1.0)
        results = self.engine.find_correlations(self.patient_id, window_days=30, min_confidence=0.0)
        self.assertGreaterEqual(len(results), 1)
        for r in results:
            self.assertLess(r.confidence, 0.95, f"Confidence {r.confidence} must be < 0.95")

    # ── safety labels ──

    def test_safety_labels_present(self):
        self._insert_pair("interventions", "assessments", 5, 8)
        results = self.engine.find_correlations(self.patient_id, window_days=30)
        self.assertGreaterEqual(len(results), 1)
        for r in results:
            self.assertTrue(
                any("Temporal association only" in sl for sl in r.safety_labels),
                f"Missing temporal association label in {r.safety_labels}"
            )
            self.assertTrue(
                any("clinician review" in sl.lower() for sl in r.safety_labels),
                f"Missing clinician review label in {r.safety_labels}"
            )

    def test_no_causal_certainty_language(self):
        self._insert_pair("interventions", "assessments", 5, 8)
        results = self.engine.find_correlations(self.patient_id, window_days=30)
        forbidden = ["caused by", "causes", "proven", "definitely", "certain", "guaranteed"]
        for r in results:
            summary_lower = (r.summary or "").lower()
            for word in forbidden:
                self.assertNotIn(word, summary_lower,
                                 f"Causal language '{word}' found in summary: {r.summary}")

    # ── uncertainty drivers ──

    def test_uncertainty_drivers_populated(self):
        self._insert_pair("interventions", "assessments", 5, 8)
        results = self.engine.find_correlations(self.patient_id, window_days=30)
        self.assertGreaterEqual(len(results), 1)
        for r in results:
            self.assertGreater(len(r.uncertainty_drivers), 0,
                               "uncertainty_drivers must not be empty")

    # ── research_only and clinician_review_required ──

    def test_research_only_true(self):
        self._insert_pair("interventions", "assessments", 5, 8)
        results = self.engine.find_correlations(self.patient_id, window_days=30)
        for r in results:
            self.assertTrue(r.research_only)

    def test_clinician_review_required_true(self):
        self._insert_pair("interventions", "assessments", 5, 8)
        results = self.engine.find_correlations(self.patient_id, window_days=30)
        for r in results:
            self.assertTrue(r.clinician_review_required)

    # ── insight_type ──

    def test_insight_type_is_correlation(self):
        self._insert_pair("interventions", "assessments", 5, 8)
        results = self.engine.find_correlations(self.patient_id, window_days=30)
        for r in results:
            self.assertEqual(r.insight_type, "correlation")

    # ── supporting_events populated ──

    def test_supporting_events_has_event_ids(self):
        e1, e2 = self._insert_pair("interventions", "assessments", 5, 8)
        results = self.engine.find_correlations(self.patient_id, window_days=30)
        self.assertGreaterEqual(len(results), 1)
        for r in results:
            self.assertIn(e1.event_id, r.supporting_events)
            self.assertIn(e2.event_id, r.supporting_events)

    # ── timeline_window populated ──

    def test_timeline_window_is_tuple_of_datetimes(self):
        self._insert_pair("interventions", "assessments", 5, 8)
        results = self.engine.find_correlations(self.patient_id, window_days=30)
        for r in results:
            self.assertIsInstance(r.timeline_window, tuple)
            self.assertEqual(len(r.timeline_window), 2)
            self.assertIsInstance(r.timeline_window[0], datetime)
            self.assertIsInstance(r.timeline_window[1], datetime)

    # ── no duplicate pairs ──

    def test_no_duplicate_pairs(self):
        self._insert_pair("interventions", "assessments", 5, 8)
        results = self.engine.find_correlations(self.patient_id, window_days=30)
        seen = set()
        for r in results:
            key = tuple(sorted(r.supporting_events))
            self.assertNotIn(key, seen, f"Duplicate correlation pair: {key}")
            seen.add(key)

    # ── modality pairing logic ──

    def test_only_interesting_pairs_detected(self):
        self._insert_pair("interventions", "assessments", 5, 8)   # interesting
        self._insert_pair("interventions", "mri", 50, 55)           # outside window
        results = self.engine.find_correlations(self.patient_id, window_days=30)
        for r in results:
            pair = tuple(sorted(r.modalities_involved))
            self.assertIn(pair, [
                ("assessments", "interventions"),
                ("assessments", "sessions"),
            ])


if __name__ == "__main__":
    unittest.main()
