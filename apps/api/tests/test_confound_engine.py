"""Tests for ConfoundEngine."""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

from contracts import MultimodalEvent
from knowledge_layer import KnowledgeLayer
from confound_engine import ConfoundEngine


class TestConfoundEngine(unittest.TestCase):
    """Test suite for confounder detection across all categories."""

    def setUp(self):
        self.db_path = f"/tmp/test_conf_{id(self)}.db"
        self.kl = KnowledgeLayer(db_path=self.db_path)
        self.engine = ConfoundEngine(self.kl)
        self.patient_id = "test_conf_001"

    def tearDown(self):
        import os
        try:
            os.remove(self.db_path)
        except FileNotFoundError:
            pass

    def _insert(self, **kwargs):
        """Helper to insert a single event."""
        defaults = {
            "patient_id": self.patient_id,
            "event_type": "test",
            "source_system": "test",
            "source_record_id": "rec_1",
        }
        defaults.update(kwargs)
        if "timestamp" not in defaults:
            defaults["timestamp"] = datetime.now(timezone.utc) - timedelta(days=7)
        if "value_summary" not in defaults:
            defaults["value_summary"] = "test event"
        event = MultimodalEvent(**defaults)
        self.kl.insert_event(event)
        return event

    # ── 1. Medication changes ──

    def test_detect_medication_start(self):
        self._insert(
            modality="medications", event_type="medication_start",
            value_summary="Started sertraline 25mg",
            timestamp=datetime.now(timezone.utc) - timedelta(days=5),
        )
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("medication_changes", types)

    def test_old_medication_not_detected(self):
        self._insert(
            modality="medications", event_type="medication_start",
            value_summary="Started sertraline 25mg",
            timestamp=datetime.now(timezone.utc) - timedelta(days=120),
        )
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertNotIn("medication_changes", types)

    # ── 2. Poor sleep ──

    def test_detect_poor_sleep(self):
        self._insert(
            modality="wearables", event_type="sleep_summary",
            value_summary="Sleep efficiency 70%",
            numeric_features={"sleep_efficiency": 0.70, "total_sleep_min": 340},
        )
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("poor_sleep", types)

    def test_good_sleep_not_detected(self):
        self._insert(
            modality="wearables", event_type="sleep_summary",
            value_summary="Sleep efficiency 85%",
            numeric_features={"sleep_efficiency": 0.85, "total_sleep_min": 480},
        )
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertNotIn("poor_sleep", types)

    # ── 3. Missed sessions ──

    def test_detect_missed_sessions(self):
        self._insert(
            modality="interventions", event_type="tms_session",
            value_summary="Session 1", timestamp=datetime.now(timezone.utc) - timedelta(days=20),
        )
        self._insert(
            modality="interventions", event_type="tms_session",
            value_summary="Session 2", timestamp=datetime.now(timezone.utc) - timedelta(days=5),
        )
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("missed_sessions", types)

    # ── 4. Adverse events ──

    def test_detect_adverse_event(self):
        self._insert(
            modality="patient_checkins", event_type="checkin",
            value_summary="side effects mild headache",
            timestamp=datetime.now(timezone.utc) - timedelta(days=10),
        )
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("adverse_events", types)

    # ── 5. Infection / inflammation ──

    def test_detect_infection_inflammation(self):
        self._insert(
            modality="labs", event_type="blood_panel",
            value_summary="CRP elevated", numeric_features={"crp_mg_l": 5.0, "wbc_k_ul": 6.0},
        )
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("infection_inflammation", types)

    # ── 6. Nutrition abnormalities ──

    def test_detect_vitamin_d_deficiency(self):
        self._insert(
            modality="labs", event_type="blood_panel",
            value_summary="Low vitamin D", numeric_features={"vitamin_d_ng_ml": 15.0},
        )
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("nutrition_abnormalities", types)

    # ── 7. Data gaps ──

    def test_detect_no_wearable_data(self):
        self._insert(modality="assessments", event_type="cognitive")
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("data_gaps", types)

    def test_detect_wearable_gap(self):
        now = datetime.now(timezone.utc)
        self._insert(
            modality="wearables", event_type="sleep_summary",
            value_summary="Sleep day 1", timestamp=now - timedelta(days=40),
            numeric_features={"sleep_efficiency": 0.80, "total_sleep_min": 400},
        )
        self._insert(
            modality="wearables", event_type="sleep_summary",
            value_summary="Sleep day 40", timestamp=now - timedelta(days=5),
            numeric_features={"sleep_efficiency": 0.82, "total_sleep_min": 410},
        )
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("data_gaps", types)

    # ── 8. Poor data quality ──

    def test_detect_poor_quality(self):
        self._insert(modality="assessments", event_type="test", data_quality="low")
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("poor_quality", types)

    # ── 9. Missing assessments ──

    def test_detect_missing_assessments(self):
        self._insert(modality="wearables", event_type="sleep_summary",
                     numeric_features={"sleep_efficiency": 0.80, "total_sleep_min": 400})
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("missing_assessments", types)

    # ── 10. Stale data ──

    def test_detect_stale_data(self):
        old = datetime.now(timezone.utc) - timedelta(days=45)
        self._insert(modality="assessments", event_type="test",
                     timestamp=old, value_summary="Old assessment")
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("stale_data", types)

    # ── 11. Low adherence ──

    def test_detect_low_adherence_gaps(self):
        now = datetime.now(timezone.utc)
        self._insert(
            modality="patient_checkins", event_type="weekly_checkin",
            value_summary="Check-in 1", timestamp=now - timedelta(days=30),
        )
        self._insert(
            modality="patient_checkins", event_type="weekly_checkin",
            value_summary="Check-in 2", timestamp=now - timedelta(days=5),
        )
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("low_adherence", types)

    # ── 12. Changed parameters ──

    def test_detect_changed_parameters(self):
        self._insert(
            modality="interventions", event_type="tms_session",
            value_summary="Protocol parameter adjusted to 15Hz",
            timestamp=datetime.now(timezone.utc) - timedelta(days=10),
        )
        results = self.engine.detect_confounders(self.patient_id)
        types = [r.confounders[0].get("confounder_type", "") for r in results if r.confounders]
        self.assertIn("changed_parameters", types)

    # ── Safety checks ──

    def test_clinician_review_required(self):
        self._insert(
            modality="medications", event_type="medication_start",
            value_summary="Started sertraline 25mg",
            timestamp=datetime.now(timezone.utc) - timedelta(days=5),
        )
        results = self.engine.detect_confounders(self.patient_id)
        for r in results:
            self.assertTrue(r.clinician_review_required)

    def test_research_only_true(self):
        self._insert(
            modality="medications", event_type="medication_start",
            value_summary="Started sertraline 25mg",
            timestamp=datetime.now(timezone.utc) - timedelta(days=5),
        )
        results = self.engine.detect_confounders(self.patient_id)
        for r in results:
            self.assertTrue(r.research_only)

    def test_insight_type_is_confound(self):
        self._insert(
            modality="medications", event_type="medication_start",
            value_summary="Started sertraline 25mg",
            timestamp=datetime.now(timezone.utc) - timedelta(days=5),
        )
        results = self.engine.detect_confounders(self.patient_id)
        for r in results:
            self.assertEqual(r.insight_type, "confound")

    def test_confidence_below_maximum(self):
        self._insert(
            modality="medications", event_type="medication_start",
            value_summary="Started sertraline 25mg",
            timestamp=datetime.now(timezone.utc) - timedelta(days=5),
        )
        results = self.engine.detect_confounders(self.patient_id)
        for r in results:
            self.assertLess(r.confidence, 0.95, f"Confidence {r.confidence} must be < 0.95")

    def test_uncertainty_drivers_present(self):
        self._insert(
            modality="medications", event_type="medication_start",
            value_summary="Started sertraline 25mg",
            timestamp=datetime.now(timezone.utc) - timedelta(days=5),
        )
        results = self.engine.detect_confounders(self.patient_id)
        for r in results:
            self.assertGreater(len(r.uncertainty_drivers), 0)

    def test_safety_labels_populated(self):
        self._insert(
            modality="medications", event_type="medication_start",
            value_summary="Started sertraline 25mg",
            timestamp=datetime.now(timezone.utc) - timedelta(days=5),
        )
        results = self.engine.detect_confounders(self.patient_id)
        for r in results:
            self.assertGreater(len(r.safety_labels), 0)
            labels_lower = [sl.lower() for sl in r.safety_labels]
            self.assertTrue(
                any("clinician review" in sl for sl in labels_lower),
                f"Missing clinician review label: {r.safety_labels}"
            )


if __name__ == "__main__":
    unittest.main()
