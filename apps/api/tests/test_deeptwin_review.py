"""Tests for DeepTwinReviewEngine — clinician review workflow.

Every clinician action creates an immutable audit event.
Invalid actions raise ValueError.
Reviews are append-only (immutable).
All outputs carry "Decision support only. Requires clinician review."
"""

import sys
import os
import unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

from knowledge_layer import KnowledgeLayer
from deeptwin_contracts import ClinicianReview, DeepTwinAuditEvent
from deeptwin_review import DeepTwinReviewEngine, FollowUpTask, SAFETY_LABEL, VALID_ACTIONS


class TestDeepTwinReviewEngine(unittest.TestCase):
    """Comprehensive tests for the clinician review engine."""

    @classmethod
    def setUpClass(cls):
        cls.db_path = "/tmp/test_deeptwin_review.db"
        if os.path.exists(cls.db_path):
            os.remove(cls.db_path)
        cls.kl = KnowledgeLayer(cls.db_path)
        cls.engine = DeepTwinReviewEngine(cls.kl)

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls.db_path):
            os.remove(cls.db_path)

    # ------------------------------------------------------------------
    # 1. record_review with valid actions
    # ------------------------------------------------------------------
    def test_record_review_accept(self):
        """record_review with accept action succeeds and returns review_id."""
        review = ClinicianReview(
            patient_id="P001",
            clinician_id="CL_001",
            snapshot_id="SNAP_A",
            hypothesis_id="HYP_1",
            action="accept",
            note="Looks consistent with prior imaging.",
        )
        rid = self.engine.record_review(review)
        self.assertTrue(rid.startswith("rev_"))
        self.assertEqual(review.action, "accept")

    def test_record_review_reject(self):
        """record_review with reject action succeeds."""
        review = ClinicianReview(
            patient_id="P001",
            clinician_id="CL_001",
            snapshot_id="SNAP_A",
            hypothesis_id="HYP_2",
            action="reject",
            note="Insufficient evidence.",
        )
        rid = self.engine.record_review(review)
        self.assertTrue(rid.startswith("rev_"))

    def test_record_review_note(self):
        """record_review with note action succeeds."""
        review = ClinicianReview(
            patient_id="P001",
            clinician_id="CL_001",
            snapshot_id="SNAP_A",
            hypothesis_id="HYP_1",
            action="note",
            note="Consider repeating in 3 months.",
        )
        rid = self.engine.record_review(review)
        self.assertTrue(rid.startswith("rev_"))

    def test_record_review_request_data(self):
        """record_review with request_data action succeeds."""
        review = ClinicianReview(
            patient_id="P001",
            clinician_id="CL_001",
            snapshot_id="SNAP_A",
            hypothesis_id="_snapshot_",
            action="request_data",
            requested_modalities=["mri", "biomarker"],
        )
        rid = self.engine.record_review(review)
        self.assertTrue(rid.startswith("rev_"))

    def test_record_review_mark_reviewed(self):
        """record_review with mark_reviewed action succeeds."""
        review = ClinicianReview(
            patient_id="P001",
            clinician_id="CL_001",
            snapshot_id="SNAP_MR",
            hypothesis_id="_snapshot_",
            action="mark_reviewed",
        )
        rid = self.engine.record_review(review)
        self.assertTrue(rid.startswith("rev_"))

    def test_record_review_all_valid_actions(self):
        """Every VALID_ACTION can be recorded successfully."""
        snap = "SNAP_VAL"
        for i, action in enumerate(VALID_ACTIONS):
            review = ClinicianReview(
                patient_id="P_VAL",
                clinician_id="CL_VAL",
                snapshot_id=snap,
                hypothesis_id=f"HYP_{i}",
                action=action,
                note=f"Test for {action}",
            )
            rid = self.engine.record_review(review)
            self.assertTrue(rid.startswith("rev_"), f"Action {action} failed")

    # ------------------------------------------------------------------
    # 2. record_review with invalid action raises ValueError
    # ------------------------------------------------------------------
    def test_record_review_invalid_action_raises(self):
        """Invalid action in ClinicianReview.__post_init__ raises ValueError."""
        with self.assertRaises(ValueError) as ctx:
            ClinicianReview(
                patient_id="P001",
                clinician_id="CL_001",
                snapshot_id="SNAP_A",
                hypothesis_id="HYP_1",
                action="delete_everything",
            )
        self.assertIn("Invalid action", str(ctx.exception))

    def test_record_review_invalid_action_via_engine(self):
        """Passing a review with invalid action to record_review raises ValueError."""
        review = ClinicianReview.__new__(ClinicianReview)
        object.__setattr__(review, "patient_id", "P001")
        object.__setattr__(review, "clinician_id", "CL_001")
        object.__setattr__(review, "snapshot_id", "SNAP_INV")
        object.__setattr__(review, "hypothesis_id", "HYP_1")
        object.__setattr__(review, "action", "invalid_action")
        object.__setattr__(review, "review_id", "rev_test123")
        object.__setattr__(review, "note", "")
        object.__setattr__(review, "requested_modalities", [])
        object.__setattr__(review, "follow_up_tasks", [])
        object.__setattr__(review, "reviewed_at", datetime.now())
        object.__setattr__(review, "audit_reference", "audit_test")

        with self.assertRaises(ValueError) as ctx:
            self.engine.record_review(review)
        self.assertIn("Invalid action", str(ctx.exception))

    # ------------------------------------------------------------------
    # 3. get_reviews_for_patient
    # ------------------------------------------------------------------
    def test_get_reviews_for_patient(self):
        """get_reviews_for_patient returns all reviews for that patient."""
        pid = "P_PAT_QUERY"
        for i in range(3):
            review = ClinicianReview(
                patient_id=pid,
                clinician_id="CL_002",
                snapshot_id="SNAP_PQ",
                hypothesis_id=f"HYP_{i}",
                action="accept",
            )
            self.engine.record_review(review)

        reviews = self.engine.get_reviews_for_patient(pid)
        self.assertEqual(len(reviews), 3)
        for r in reviews:
            self.assertEqual(r.patient_id, pid)
            self.assertIsInstance(r, ClinicianReview)

    def test_get_reviews_for_patient_empty(self):
        """get_reviews_for_patient returns empty list for unknown patient."""
        reviews = self.engine.get_reviews_for_patient("P_NONEXISTENT")
        self.assertEqual(reviews, [])

    # ------------------------------------------------------------------
    # 4. get_reviews_for_snapshot
    # ------------------------------------------------------------------
    def test_get_reviews_for_snapshot(self):
        """get_reviews_for_snapshot returns all reviews for that snapshot."""
        snap = "SNAP_SQUERY"
        for i in range(4):
            review = ClinicianReview(
                patient_id="P_SNAP",
                clinician_id="CL_003",
                snapshot_id=snap,
                hypothesis_id=f"HYP_{i}",
                action="note" if i % 2 == 0 else "reject",
                note=f"Note {i}" if i % 2 == 0 else "",
            )
            self.engine.record_review(review)

        reviews = self.engine.get_reviews_for_snapshot(snap)
        self.assertEqual(len(reviews), 4)
        for r in reviews:
            self.assertEqual(r.snapshot_id, snap)

    def test_get_reviews_for_snapshot_empty(self):
        """get_reviews_for_snapshot returns empty list for unknown snapshot."""
        reviews = self.engine.get_reviews_for_snapshot("SNAP_NONEXISTENT")
        self.assertEqual(reviews, [])

    # ------------------------------------------------------------------
    # 5. accept_hypothesis creates audit event
    # ------------------------------------------------------------------
    def test_accept_hypothesis_creates_audit_event(self):
        """accept_hypothesis persists review and creates audit event."""
        pid = "P_AUDIT_ACC"
        snap = "SNAP_AUDIT_ACC"
        rid = self.engine.accept_hypothesis(
            patient_id=pid,
            clinician_id="CL_AUDIT",
            snapshot_id=snap,
            hypothesis_id="HYP_AUDIT_1",
            note="Accepted after review.",
        )
        self.assertTrue(rid.startswith("rev_"))

        events = self.engine.get_audit_events(patient_id=pid, snapshot_id=snap)
        self.assertTrue(len(events) > 0)
        event_types = [e.event_type for e in events]
        self.assertIn("hypothesis_accepted", event_types)

    # ------------------------------------------------------------------
    # 6. reject_hypothesis creates audit event
    # ------------------------------------------------------------------
    def test_reject_hypothesis_creates_audit_event(self):
        """reject_hypothesis persists review and creates audit event."""
        pid = "P_AUDIT_REJ"
        snap = "SNAP_AUDIT_REJ"
        rid = self.engine.reject_hypothesis(
            patient_id=pid,
            clinician_id="CL_AUDIT",
            snapshot_id=snap,
            hypothesis_id="HYP_AUDIT_2",
            note="Contradicts current meds.",
        )
        self.assertTrue(rid.startswith("rev_"))

        events = self.engine.get_audit_events(patient_id=pid, snapshot_id=snap)
        event_types = [e.event_type for e in events]
        self.assertIn("hypothesis_rejected", event_types)

    # ------------------------------------------------------------------
    # 7. add_note creates audit event
    # ------------------------------------------------------------------
    def test_add_note_creates_audit_event(self):
        """add_note persists review and creates audit event."""
        pid = "P_AUDIT_NOTE"
        snap = "SNAP_AUDIT_NOTE"
        rid = self.engine.add_note(
            patient_id=pid,
            clinician_id="CL_NOTE",
            snapshot_id=snap,
            hypothesis_id="HYP_NOTE_1",
            note="Monitor for changes over next visit.",
        )
        self.assertTrue(rid.startswith("rev_"))

        events = self.engine.get_audit_events(patient_id=pid, snapshot_id=snap)
        event_types = [e.event_type for e in events]
        self.assertIn("hypothesis_noted", event_types)

    # ------------------------------------------------------------------
    # 8. request_more_data with modalities
    # ------------------------------------------------------------------
    def test_request_more_data_with_modalities(self):
        """request_more_data stores modalities and logs audit event."""
        pid = "P_REQ_DATA"
        snap = "SNAP_REQ"
        rid = self.engine.request_more_data(
            patient_id=pid,
            clinician_id="CL_REQ",
            snapshot_id=snap,
            requested_modalities=["mri", "biomarker", "qeeg"],
            note="Need more imaging data.",
        )
        self.assertTrue(rid.startswith("rev_"))

        reviews = self.engine.get_reviews_for_snapshot(snap)
        data_reviews = [r for r in reviews if r.action == "request_data"]
        self.assertEqual(len(data_reviews), 1)
        self.assertEqual(data_reviews[0].requested_modalities, ["mri", "biomarker", "qeeg"])
        self.assertEqual(data_reviews[0].note, "Need more imaging data.")

        events = self.engine.get_audit_events(patient_id=pid, snapshot_id=snap)
        event_types = [e.event_type for e in events]
        self.assertIn("data_requested", event_types)

    # ------------------------------------------------------------------
    # 9. mark_reviewed updates status
    # ------------------------------------------------------------------
    def test_mark_reviewed_updates_status(self):
        """mark_reviewed sets reviewed=True in review status."""
        pid = "P_MR"
        snap = "SNAP_MR_STATUS"
        self.engine.accept_hypothesis(pid, "CL_MR", snap, "HYP_1")
        self.engine.add_note(pid, "CL_MR", snap, "HYP_2", "Watch this")

        rid = self.engine.mark_reviewed(pid, "CL_MR", snap)
        self.assertTrue(rid.startswith("rev_"))

        status = self.engine.get_review_status(snap)
        self.assertTrue(status["reviewed"])
        self.assertEqual(status["reviewed_by"], "CL_MR")
        self.assertIsNotNone(status["reviewed_at"])

    # ------------------------------------------------------------------
    # 10. create_follow_up_task
    # ------------------------------------------------------------------
    def test_create_follow_up_task(self):
        """create_follow_up_task creates a task and logs audit event."""
        pid = "P_TASK"
        snap = "SNAP_TASK"
        task_id = self.engine.create_follow_up_task(
            patient_id=pid,
            clinician_id="CL_TASK",
            snapshot_id=snap,
            task_description="Schedule follow-up MRI in 6 weeks",
        )
        self.assertTrue(task_id.startswith("task_"))

        tasks = self.engine.get_tasks_for_patient(pid)
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0].description, "Schedule follow-up MRI in 6 weeks")
        self.assertEqual(tasks[0].status, "pending")
        self.assertEqual(tasks[0].task_id, task_id)

        events = self.engine.get_audit_events(patient_id=pid, snapshot_id=snap)
        self.assertTrue(len(events) > 0)

    def test_complete_task(self):
        """complete_task marks a task as completed."""
        pid = "P_TASK_CMP"
        snap = "SNAP_TASK_CMP"
        task_id = self.engine.create_follow_up_task(
            patient_id=pid,
            clinician_id="CL_TASK",
            snapshot_id=snap,
            task_description="Order labs",
        )
        result = self.engine.complete_task(task_id)
        self.assertTrue(result)

        tasks = self.engine.get_tasks_for_patient(pid)
        completed = [t for t in tasks if t.task_id == task_id]
        self.assertEqual(len(completed), 1)
        self.assertEqual(completed[0].status, "completed")
        self.assertIsNotNone(completed[0].completed_at)

    def test_complete_task_nonexistent(self):
        """complete_task returns False for non-existent task."""
        result = self.engine.complete_task("task_nonexistent_123")
        self.assertFalse(result)

    # ------------------------------------------------------------------
    # 11. review_status aggregation
    # ------------------------------------------------------------------
    def test_review_status_aggregation(self):
        """get_review_status correctly aggregates all review activity."""
        pid = "P_STATUS"
        snap = "SNAP_STATUS"

        self.engine.accept_hypothesis(pid, "CL_S", snap, "HYP_A")
        self.engine.reject_hypothesis(pid, "CL_S", snap, "HYP_B")
        self.engine.add_note(pid, "CL_S", snap, "HYP_C", "Important note")
        self.engine.add_note(pid, "CL_S", snap, "HYP_C", "Second note")
        self.engine.request_more_data(pid, "CL_S", snap, ["mri"], "Need MRI")
        self.engine.mark_reviewed(pid, "CL_S", snap)

        status = self.engine.get_review_status(snap)
        self.assertTrue(status["reviewed"])
        self.assertEqual(status["reviewed_by"], "CL_S")
        self.assertIsNotNone(status["reviewed_at"])
        self.assertEqual(status["hypotheses_reviewed"], 2)
        self.assertEqual(len(status["notes"]), 2)
        self.assertIn("Important note", status["notes"])
        self.assertEqual(len(status["pending_actions"]), 1)

    def test_review_status_no_reviews(self):
        """get_review_status for snapshot with no reviews returns defaults."""
        status = self.engine.get_review_status("SNAP_EMPTY_STATUS")
        self.assertFalse(status["reviewed"])
        self.assertIsNone(status["reviewed_by"])
        self.assertIsNone(status["reviewed_at"])
        self.assertEqual(status["hypotheses_reviewed"], 0)
        self.assertEqual(status["hypotheses_total"], 0)
        self.assertEqual(status["notes"], [])
        self.assertEqual(status["pending_actions"], [])

    # ------------------------------------------------------------------
    # 12. safety labels present
    # ------------------------------------------------------------------
    def test_safety_label_constant(self):
        """SAFETY_LABEL is the expected text."""
        self.assertEqual(SAFETY_LABEL, "Decision support only. Requires clinician review.")

    def test_safety_label_in_review_status(self):
        """get_review_status includes safety_label."""
        status = self.engine.get_review_status("SNAP_SAFETY")
        self.assertIn("safety_label", status)
        self.assertEqual(status["safety_label"], SAFETY_LABEL)

    def test_safety_label_in_task_dict(self):
        """FollowUpTask.to_dict includes safety_label."""
        task = FollowUpTask(
            patient_id="P_T",
            clinician_id="CL_T",
            snapshot_id="SNAP_T",
            description="Test task",
        )
        d = task.to_dict()
        self.assertIn("safety_label", d)
        self.assertEqual(d["safety_label"], SAFETY_LABEL)

    def test_safety_label_in_audit_details(self):
        """Audit event details include safety_label."""
        pid = "P_AUDIT_SAFETY"
        snap = "SNAP_AUDIT_SAFETY"
        self.engine.accept_hypothesis(pid, "CL_AS", snap, "HYP_S1")

        events = self.engine.get_audit_events(patient_id=pid, snapshot_id=snap)
        self.assertTrue(len(events) > 0)
        for event in events:
            self.assertIn("safety_label", event.details)
            self.assertEqual(event.details["safety_label"], SAFETY_LABEL)

    # ------------------------------------------------------------------
    # 13. immutability — append-only
    # ------------------------------------------------------------------
    def test_reviews_are_append_only(self):
        """Recording the same review_id twice should fail (PRIMARY KEY)."""
        review = ClinicianReview(
            patient_id="P_IMM",
            clinician_id="CL_IMM",
            snapshot_id="SNAP_IMM",
            hypothesis_id="HYP_IMM",
            action="accept",
        )
        object.__setattr__(review, "review_id", "rev_imm_test_001")

        rid1 = self.engine.record_review(review)
        self.assertEqual(rid1, "rev_imm_test_001")

        with self.assertRaises(Exception):
            self.engine.record_review(review)

    # ------------------------------------------------------------------
    # 14. review_id and audit_reference format
    # ------------------------------------------------------------------
    def test_review_id_format(self):
        """record_review generates proper review_id format."""
        review = ClinicianReview(
            patient_id="P_FMT",
            clinician_id="CL_FMT",
            snapshot_id="SNAP_FMT",
            hypothesis_id="HYP_FMT",
            action="accept",
        )
        rid = self.engine.record_review(review)
        self.assertTrue(rid.startswith("rev_"))
        self.assertTrue(len(rid) > len("rev_"))

    def test_audit_event_has_valid_type(self):
        """Audit events have valid event types per contract."""
        pid = "P_AUDIT_TYPE"
        snap = "SNAP_AUDIT_TYPE"
        self.engine.accept_hypothesis(pid, "CL_AT", snap, "HYP_AT1")
        self.engine.reject_hypothesis(pid, "CL_AT", snap, "HYP_AT2")

        events = self.engine.get_audit_events(patient_id=pid, snapshot_id=snap)
        valid_types = DeepTwinAuditEvent.VALID_EVENT_TYPES
        for e in events:
            self.assertIn(e.event_type, valid_types)

    # ------------------------------------------------------------------
    # 15. engine initialization creates tables
    # ------------------------------------------------------------------
    def test_tables_created(self):
        """Engine initialization creates all required tables."""
        import sqlite3
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type=\'table\' AND name IN (?, ?, ?)",
            ("deeptwin_reviews", "deeptwin_tasks", "deeptwin_audit_events"),
        )
        tables = [row[0] for row in cursor.fetchall()]
        conn.close()
        self.assertIn("deeptwin_reviews", tables)
        self.assertIn("deeptwin_tasks", tables)
        self.assertIn("deeptwin_audit_events", tables)


if __name__ == "__main__":
    unittest.main()
