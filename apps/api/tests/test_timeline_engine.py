"""Tests for MultimodalTimelineEngine."""

import os
import sys
import unittest
from datetime import datetime, timedelta

# Ensure deepsynaps package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

from contracts import MultimodalEvent
from knowledge_layer import KnowledgeLayer
from timeline_engine import MultimodalTimelineEngine


class TestMultimodalTimelineEngine(unittest.TestCase):
    """Test suite for timeline building, filtering, and seed data."""

    def setUp(self):
        self.db_path = f"/tmp/test_timeline_{id(self)}.db"
        self.kl = KnowledgeLayer(db_path=self.db_path)
        self.engine = MultimodalTimelineEngine(self.kl)
        self.patient_id = "test_pt_001"

    def tearDown(self):
        import os
        try:
            os.remove(self.db_path)
        except FileNotFoundError:
            pass

    # ── seed_sample_events tests ──

    def test_seed_returns_event_ids(self):
        ids = self.engine.seed_sample_events(self.patient_id)
        self.assertIsInstance(ids, list)
        self.assertGreaterEqual(len(ids), 5)
        self.assertTrue(all(isinstance(eid, str) and eid.startswith("evt_") for eid in ids))

    def test_seed_creates_multiple_modalities(self):
        self.engine.seed_sample_events(self.patient_id)
        all_events = self.kl.get_events_for_patient(self.patient_id)
        modalities = {e.modality for e in all_events}
        self.assertGreaterEqual(len(modalities), 5)

    def test_seed_events_are_sorted(self):
        self.engine.seed_sample_events(self.patient_id)
        timeline = self.engine.build_timeline(self.patient_id)
        self.assertTrue(all(
            timeline[i].timestamp <= timeline[i + 1].timestamp
            for i in range(len(timeline) - 1)
        ))

    # ── build_timeline ordering ──

    def test_build_timeline_sorted_ascending(self):
        self.engine.seed_sample_events(self.patient_id)
        timeline = self.engine.build_timeline(self.patient_id)
        for i in range(len(timeline) - 1):
            self.assertLessEqual(timeline[i].timestamp, timeline[i + 1].timestamp)

    # ── modality filter ──

    def test_modality_filter_single(self):
        self.engine.seed_sample_events(self.patient_id)
        filtered = self.engine.build_timeline(self.patient_id, modality_filter=["wearable"])
        self.assertTrue(all(e.modality == "wearable" for e in filtered))

    def test_modality_filter_multiple(self):
        self.engine.seed_sample_events(self.patient_id)
        filtered = self.engine.build_timeline(self.patient_id, modality_filter=["wearable", "medication"])
        self.assertTrue(all(e.modality in ("wearable", "medication") for e in filtered))

    def test_modality_filter_unknown_raises(self):
        with self.assertRaises(ValueError) as ctx:
            self.engine.build_timeline(self.patient_id, modality_filter=["nonexistent_modality"])
        self.assertIn("Unknown modalities", str(ctx.exception))

    # ── date range filter ──

    def test_date_range_filter(self):
        self.engine.seed_sample_events(self.patient_id)
        now = datetime.now()
        start = now - timedelta(days=45)
        end = now - timedelta(days=25)
        filtered = self.engine.build_timeline(self.patient_id, date_range=(start, end))
        for e in filtered:
            self.assertGreaterEqual(e.timestamp, start)
            self.assertLessEqual(e.timestamp, end)

    def test_date_range_no_overlap(self):
        self.engine.seed_sample_events(self.patient_id)
        now = datetime.now()
        start = now - timedelta(days=365)
        end = now - timedelta(days=300)
        filtered = self.engine.build_timeline(self.patient_id, date_range=(start, end))
        self.assertEqual(len(filtered), 0)

    # ── combined filter ──

    def test_combined_modality_and_date_filter(self):
        self.engine.seed_sample_events(self.patient_id)
        now = datetime.now()
        start = now - timedelta(days=45)
        end = now - timedelta(days=25)
        filtered = self.engine.build_timeline(
            self.patient_id,
            modality_filter=["wearable"],
            date_range=(start, end),
        )
        self.assertTrue(all(e.modality == "wearable" for e in filtered))
        for e in filtered:
            self.assertGreaterEqual(e.timestamp, start)
            self.assertLessEqual(e.timestamp, end)

    # ── field completeness ──

    def test_event_has_required_fields(self):
        self.engine.seed_sample_events(self.patient_id)
        timeline = self.engine.build_timeline(self.patient_id)
        for e in timeline:
            self.assertIsNotNone(e.timestamp)
            self.assertIsNotNone(e.source_system)
            self.assertEqual(e.patient_id, self.patient_id)
            self.assertIsNotNone(e.modality)
            self.assertIn(e.data_quality, ["high", "medium", "low", "missing", "unknown"])
            self.assertIsNotNone(e.confidence)
            self.assertTrue(0.0 <= e.confidence <= 1.0)
            self.assertIsInstance(e.provenance, dict)
            self.assertIsInstance(e.evidence_links, list)
            self.assertTrue(e.audit_reference.startswith("audit_"))

    # ── deterministic ordering with tie-breaker ──

    def test_deterministic_order_same_timestamp(self):
        base = datetime.now() - timedelta(days=10)
        for i in range(3):
            self.kl.insert_event(MultimodalEvent(
                patient_id=self.patient_id,
                event_type="test_event",
                modality="assessments",
                source_system="test",
                source_record_id=f"test_{i}",
                timestamp=base,
                value_summary=f"Test event {i}",
                event_id=f"evt_test_{i:03d}",
            ))
        timeline = self.engine.build_timeline(self.patient_id)
        event_ids = [e.event_id for e in timeline]
        self.assertEqual(event_ids, sorted(event_ids))


if __name__ == "__main__":
    unittest.main()
