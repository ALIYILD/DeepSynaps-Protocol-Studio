"""Tests for MissingDataEngine."""

import sys
import os
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

from contracts import MultimodalEvent, IntelligenceOutput
from knowledge_layer import KnowledgeLayer
from safety_governance import SafetyGovernance
from missing_data_engine import MissingDataEngine


class TestMissingDataEngine(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.db_path = "/tmp/test_missing_data.db"
        if os.path.exists(cls.db_path):
            os.remove(cls.db_path)
        cls.kl = KnowledgeLayer(cls.db_path)
        cls.engine = MissingDataEngine(cls.kl)

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls.db_path):
            os.remove(cls.db_path)

    def _insert_event(
        self,
        patient_id: str = "P200",
        modality: str = "qeeg",
        event_type: str = "cognitive_assessment",
        timestamp: datetime = None,
        data_quality: str = "high",
        confidence: float = 0.7,
        value_summary: str = "Test event",
        evidence_links: list = None,
    ) -> MultimodalEvent:
        """Helper to insert a patient event."""
        if timestamp is None:
            timestamp = datetime.utcnow() - timedelta(days=10)

        evt = MultimodalEvent(
            patient_id=patient_id,
            event_type=event_type,
            modality=modality,
            source_system="test_sys",
            source_record_id=f"rec_{modality}_{int(timestamp.timestamp())}",
            timestamp=timestamp,
            value_summary=value_summary,
            confidence=confidence,
            data_quality=data_quality,
            evidence_links=evidence_links or [],
        )
        self.kl.insert_event(evt)
        return evt

    # ------------------------------------------------------------------
    # detect_gaps
    # ------------------------------------------------------------------

    def test_detect_gaps_returns_list(self):
        """detect_gaps must return a list."""
        result = self.engine.detect_gaps("P200")
        self.assertIsInstance(result, list)

    def test_detect_gaps_completely_missing_modality(self):
        """A patient with no events at all should yield multiple gap flags."""
        result = self.engine.detect_gaps("P_EMPTY")
        self.assertGreater(len(result), 0)

        # Check that quality_flag insight_type is set
        for r in result:
            self.assertEqual(r.insight_type, "quality_flag")

    def test_detect_gaps_clinician_review_required(self):
        """All gap outputs must have clinician_review_required=True."""
        self._insert_event(patient_id="P_GAP", modality="qeeg", value_summary="qEEG test")
        result = self.engine.detect_gaps("P_GAP")

        for r in result:
            self.assertTrue(
                r.clinician_review_required,
                "clinician_review_required must be True"
            )

    def test_detect_gaps_confidence_below_095(self):
        """Confidence must NEVER be >= 0.95."""
        result = self.engine.detect_gaps("P_EMPTY")
        for r in result:
            self.assertLess(
                r.confidence, 0.95,
                f"Confidence {r.confidence} must be < 0.95"
            )

    def test_detect_gaps_uncertainty_drivers_populated(self):
        """uncertainty_drivers must be populated for all gaps."""
        result = self.engine.detect_gaps("P_EMPTY")
        for r in result:
            self.assertGreater(
                len(r.uncertainty_drivers), 0,
                "uncertainty_drivers must be populated"
            )

    def test_detect_gaps_stale_data_detected(self):
        """Old data should be flagged as stale."""
        # Insert very old qEEG data
        old_time = datetime.utcnow() - timedelta(days=120)
        self._insert_event(
            patient_id="P_STALE",
            modality="qeeg",
            timestamp=old_time,
            value_summary="Old qEEG",
        )

        result = self.engine.detect_gaps("P_STALE")
        stale_flags = [r for r in result if "stale" in r.summary.lower() or "qeeg" in r.summary.lower()]
        self.assertGreater(
            len(stale_flags), 0,
            "Should detect stale qEEG data"
        )

    def test_detect_gaps_missing_biomarker(self):
        """Patient with no biomarker data should get a quality flag."""
        # Insert only qEEG data, no biomarker
        self._insert_event(
            patient_id="P_NO_BIO",
            modality="qeeg",
            value_summary="qEEG only",
        )

        result = self.engine.detect_gaps("P_NO_BIO")
        biomarker_flags = [
            r for r in result
            if "biomarker" in r.summary.lower() or "biomarker" in r.modalities_involved
        ]
        self.assertGreater(
            len(biomarker_flags), 0,
            "Should flag missing biomarker data"
        )

    def test_detect_gaps_expected_modalities_filter(self):
        """Only check specified modalities when expected_modalities is provided."""
        self._insert_event(
            patient_id="P_FILTER",
            modality="qeeg",
            value_summary="qEEG present",
        )
        result = self.engine.detect_gaps(
            "P_FILTER", expected_modalities=["qeeg"]
        )
        self.assertIsInstance(result, list)

    def test_detect_gaps_consent_missing(self):
        """Patient without consent documentation should be flagged."""
        self._insert_event(
            patient_id="P_NO_CONSENT",
            modality="qeeg",
            value_summary="qEEG test",
        )
        result = self.engine.detect_gaps("P_NO_CONSENT")
        consent_flags = [
            r for r in result
            if "consent" in r.summary.lower()
        ]
        self.assertGreater(
            len(consent_flags), 0,
            "Should flag missing consent"
        )

    def test_detect_gaps_no_evidence_links(self):
        """Events without evidence links should be flagged."""
        self._insert_event(
            patient_id="P_NO_EVID",
            modality="qeeg",
            value_summary="No evidence link",
            evidence_links=[],
        )
        result = self.engine.detect_gaps("P_NO_EVID")
        ev_flags = [
            r for r in result
            if "evidence link" in r.summary.lower()
        ]
        self.assertGreater(
            len(ev_flags), 0,
            "Should flag events without evidence links"
        )

    def test_detect_gaps_safety_labels(self):
        """All gap outputs should have safety labels."""
        result = self.engine.detect_gaps("P_EMPTY")
        for r in result:
            self.assertGreater(
                len(r.safety_labels), 0,
                "safety_labels must be populated"
            )

    # ------------------------------------------------------------------
    # check_staleness
    # ------------------------------------------------------------------

    def test_check_staleness_true_when_old(self):
        """check_staleness should return True for old events."""
        old_event = MultimodalEvent(
            patient_id="P_TEST",
            event_type="test",
            modality="qeeg",
            source_system="test",
            source_record_id="rec_1",
            timestamp=datetime.utcnow() - timedelta(days=100),
            value_summary="Old event",
        )
        self.assertTrue(self.engine.check_staleness(old_event, 90))

    def test_check_staleness_false_when_fresh(self):
        """check_staleness should return False for fresh events."""
        fresh_event = MultimodalEvent(
            patient_id="P_TEST",
            event_type="test",
            modality="qeeg",
            source_system="test",
            source_record_id="rec_2",
            timestamp=datetime.utcnow() - timedelta(days=5),
            value_summary="Fresh event",
        )
        self.assertFalse(self.engine.check_staleness(fresh_event, 14))

    def test_check_staleness_exact_threshold(self):
        """Event exactly at threshold should not be stale."""
        now = datetime.utcnow()
        event = MultimodalEvent(
            patient_id="P_TEST",
            event_type="test",
            modality="qeeg",
            source_system="test",
            source_record_id="rec_3",
            timestamp=now - timedelta(days=6, hours=23),  # Just under 7 days
            value_summary="Just under threshold",
        )
        self.assertFalse(self.engine.check_staleness(event, 7))

    def test_check_staleness_one_day_over(self):
        """Event one day over threshold should be stale."""
        event = MultimodalEvent(
            patient_id="P_TEST",
            event_type="test",
            modality="qeeg",
            source_system="test",
            source_record_id="rec_4",
            timestamp=datetime.utcnow() - timedelta(days=8),
            value_summary="One day over",
        )
        self.assertTrue(self.engine.check_staleness(event, 7))

    # ------------------------------------------------------------------
    # check_completeness
    # ------------------------------------------------------------------

    def test_check_completeness_empty_events(self):
        """Empty event list should yield 0.0 for all modalities."""
        result = self.engine.check_completeness([])
        self.assertIsInstance(result, dict)
        for modality, score in result.items():
            self.assertEqual(score, 0.0)

    def test_check_completeness_with_events(self):
        """Events should produce non-zero completeness scores."""
        events = [
            MultimodalEvent(
                patient_id="P_TEST",
                event_type="test",
                modality="qeeg",
                source_system="test",
                source_record_id="rec_1",
                timestamp=datetime.utcnow(),
                value_summary="qEEG today",
                confidence=0.8,
                data_quality="high",
            ),
            MultimodalEvent(
                patient_id="P_TEST",
                event_type="test",
                modality="mri",
                source_system="test",
                source_record_id="rec_2",
                timestamp=datetime.utcnow() - timedelta(days=10),
                value_summary="MRI 10 days ago",
                confidence=0.7,
                data_quality="medium",
            ),
        ]
        result = self.engine.check_completeness(events)

        self.assertGreater(result.get("qeeg", 0.0), 0.0)
        self.assertGreater(result.get("mri", 0.0), 0.0)
        self.assertEqual(result.get("biomarker", 0.0), 0.0)

    def test_check_completeness_quality_weighting(self):
        """High quality data should score higher than low quality."""
        now = datetime.utcnow()
        high_quality = [
            MultimodalEvent(
                patient_id="P_TEST",
                event_type="test",
                modality="qeeg",
                source_system="test",
                source_record_id="rec_hq",
                timestamp=now,
                value_summary="High quality qEEG",
                confidence=0.9,
                data_quality="high",
            ),
        ]
        low_quality = [
            MultimodalEvent(
                patient_id="P_TEST",
                event_type="test",
                modality="qeeg",
                source_system="test",
                source_record_id="rec_lq",
                timestamp=now,
                value_summary="Low quality qEEG",
                confidence=0.3,
                data_quality="low",
            ),
        ]

        high_result = self.engine.check_completeness(high_quality)
        low_result = self.engine.check_completeness(low_quality)

        self.assertGreater(
            high_result["qeeg"],
            low_result["qeeg"],
            "High quality data should score higher"
        )

    def test_check_completeness_recency_weighting(self):
        """Recent events should score higher than old events."""
        recent = [
            MultimodalEvent(
                patient_id="P_TEST",
                event_type="test",
                modality="qeeg",
                source_system="test",
                source_record_id="rec_recent",
                timestamp=datetime.utcnow(),
                value_summary="Recent qEEG",
                confidence=0.8,
                data_quality="high",
            ),
        ]
        old = [
            MultimodalEvent(
                patient_id="P_TEST",
                event_type="test",
                modality="qeeg",
                source_system="test",
                source_record_id="rec_old",
                timestamp=datetime.utcnow() - timedelta(days=100),
                value_summary="Old qEEG",
                confidence=0.8,
                data_quality="high",
            ),
        ]

        recent_result = self.engine.check_completeness(recent)
        old_result = self.engine.check_completeness(old)

        self.assertGreater(
            recent_result["qeeg"],
            old_result["qeeg"],
            "Recent events should score higher"
        )

    def test_check_completeness_returns_dict(self):
        """check_completeness must return a dict."""
        result = self.engine.check_completeness([])
        self.assertIsInstance(result, dict)


if __name__ == "__main__":
    unittest.main()
