"""Tests for HypothesisRankingEngine."""

import sys
import os
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

from contracts import MultimodalEvent, IntelligenceOutput
from knowledge_layer import KnowledgeLayer
from safety_governance import SafetyGovernance
from hypothesis_engine import HypothesisRankingEngine


class TestHypothesisRankingEngine(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.db_path = "/tmp/test_hypothesis.db"
        if os.path.exists(cls.db_path):
            os.remove(cls.db_path)
        cls.kl = KnowledgeLayer(cls.db_path)
        cls.engine = HypothesisRankingEngine(cls.kl)

        # Seed some patient events for ranking context
        cls._seed_patient_events(cls.kl)

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls.db_path):
            os.remove(cls.db_path)

    @classmethod
    def _seed_patient_events(cls, kl: KnowledgeLayer):
        """Insert sample events for patient P100."""
        now = datetime.now(timezone.utc)
        base_events = [
            ("medication", "medication", "med_change", "Dosage increased"),
            ("wearable", "wearable", "sleep", "Poor sleep detected"),
            ("qeeg", "qeeg", "cognitive_assessment", "Delta power elevated"),
            ("biomarker", "biomarker", "lab", "NfL elevated"),
            ("assessment", "assessment", "cognitive_assessment", "MMSE score drop"),
            ("mri", "mri", "imaging", "Hippocampal atrophy noted"),
        ]
        for i, (modality, modality_val, event_type, summary) in enumerate(base_events):
            evt = MultimodalEvent(
                patient_id="P100",
                event_type=event_type,
                modality=modality_val,
                source_system="test_sys",
                source_record_id=f"rec_{i}",
                timestamp=now - timedelta(days=i * 5),
                value_summary=summary,
                confidence=0.7 + (i % 3) * 0.05,
                data_quality="high" if i % 2 == 0 else "medium",
            )
            kl.insert_event(evt)

    def _make_observation(self, **kwargs) -> MultimodalEvent:
        defaults = dict(
            patient_id="P100",
            event_type="cognitive_assessment",
            modality="qeeg",
            source_system="test_sys",
            source_record_id="obs_001",
            timestamp=datetime.now(timezone.utc) - timedelta(days=3),
            value_summary="Cognitive decline observed",
            confidence=0.75,
            data_quality="high",
        )
        defaults.update(kwargs)
        return MultimodalEvent(**defaults)

    # ------------------------------------------------------------------
    # rank_hypotheses
    # ------------------------------------------------------------------

    def test_rank_hypotheses_returns_list(self):
        """rank_hypotheses must return a list."""
        obs = self._make_observation()
        result = self.engine.rank_hypotheses("P100", obs)
        self.assertIsInstance(result, list)

    def test_rank_hypotheses_max_hypotheses(self):
        """rank_hypotheses should respect max_hypotheses."""
        obs = self._make_observation()
        result = self.engine.rank_hypotheses("P100", obs, max_hypotheses=3)
        self.assertLessEqual(len(result), 3)

    def test_rank_hypotheses_descending_order(self):
        """Results should be sorted by confidence descending."""
        obs = self._make_observation()
        result = self.engine.rank_hypotheses("P100", obs, max_hypotheses=5)

        for i in range(1, len(result)):
            self.assertGreaterEqual(
                result[i - 1].confidence,
                result[i].confidence,
                "Hypotheses should be sorted descending by confidence"
            )

    def test_rank_hypotheses_confidence_below_095(self):
        """Confidence must NEVER be >= 0.95."""
        obs = self._make_observation()
        result = self.engine.rank_hypotheses("P100", obs, max_hypotheses=5)

        for r in result:
            self.assertLess(
                r.confidence, 0.95,
                f"Confidence {r.confidence} must be < 0.95"
            )

    def test_rank_hypotheses_clinician_review_required(self):
        """clinician_review_required must be True for all outputs."""
        obs = self._make_observation()
        result = self.engine.rank_hypotheses("P100", obs, max_hypotheses=5)

        for r in result:
            self.assertTrue(
                r.clinician_review_required,
                "clinician_review_required must be True"
            )

    def test_rank_hypotheses_research_only(self):
        """research_only must be True for all outputs."""
        obs = self._make_observation()
        result = self.engine.rank_hypotheses("P100", obs, max_hypotheses=5)

        for r in result:
            self.assertTrue(
                r.research_only,
                "research_only must be True"
            )

    def test_rank_hypotheses_uncertainty_drivers_populated(self):
        """uncertainty_drivers must be populated for all outputs."""
        obs = self._make_observation()
        result = self.engine.rank_hypotheses("P100", obs, max_hypotheses=5)

        for r in result:
            self.assertGreater(
                len(r.uncertainty_drivers), 0,
                "uncertainty_drivers must be populated"
            )

    def test_rank_hypotheses_safety_labels(self):
        """All hypotheses must have the required safety label."""
        obs = self._make_observation()
        result = self.engine.rank_hypotheses("P100", obs, max_hypotheses=5)

        for r in result:
            self.assertIn(
                SafetyGovernance.REQUIRED_HYPOTHESIS_LABEL,
                r.safety_labels,
                f"Safety labels should include '{SafetyGovernance.REQUIRED_HYPOTHESIS_LABEL}'"
            )

    def test_rank_hypotheses_insight_type(self):
        """All outputs must have insight_type='hypothesis'."""
        obs = self._make_observation()
        result = self.engine.rank_hypotheses("P100", obs, max_hypotheses=5)

        for r in result:
            self.assertEqual(
                r.insight_type, "hypothesis",
                f"insight_type should be 'hypothesis', got '{r.insight_type}'"
            )

    def test_rank_hypotheses_with_no_patient_events(self):
        """Should handle a patient with no events gracefully."""
        obs = self._make_observation(patient_id="P999")
        result = self.engine.rank_hypotheses("P999", obs, max_hypotheses=5)
        self.assertIsInstance(result, list)
        self.assertGreater(len(result), 0)

    def test_rank_hypotheses_default_max(self):
        """Default max_hypotheses should be 5."""
        obs = self._make_observation()
        result = self.engine.rank_hypotheses("P100", obs)
        self.assertLessEqual(len(result), 5)

    def test_rank_hypotheses_evidence_links_present(self):
        """Each hypothesis should have evidence links."""
        obs = self._make_observation()
        result = self.engine.rank_hypotheses("P100", obs, max_hypotheses=5)

        for r in result:
            self.assertIsInstance(r.evidence_links, list)

    def test_rank_hypotheses_modalities_present(self):
        """Each hypothesis should involve at least one modality."""
        obs = self._make_observation()
        result = self.engine.rank_hypotheses("P100", obs, max_hypotheses=5)

        for r in result:
            self.assertGreater(
                len(r.modalities_involved), 0,
                "modalities_involved must not be empty"
            )


if __name__ == "__main__":
    unittest.main()
