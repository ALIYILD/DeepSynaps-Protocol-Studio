"""DeepTwin Review Engine — clinician review workflow with immutable audit logging.

Every clinician action creates an immutable audit event.
All outputs carry: "Decision support only. Requires clinician review."
"""

from __future__ import annotations

import json
import uuid
import database
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from knowledge_layer import KnowledgeLayer
from deeptwin_contracts import ClinicianReview, DeepTwinAuditEvent


# ---------------------------------------------------------------------------
# Safety constant — appended to every outward-facing message / payload
# ---------------------------------------------------------------------------
SAFETY_LABEL = "Decision support only. Requires clinician review."

VALID_ACTIONS = [
    "accept",
    "reject",
    "note",
    "request_data",
    "report",
    "protocol",
    "export",
    "mark_reviewed",
]

ACTION_TO_EVENT_TYPE = {
    "accept": "hypothesis_accepted",
    "reject": "hypothesis_rejected",
    "note": "hypothesis_noted",
    "request_data": "data_requested",
    "report": "report_handoff",
    "protocol": "protocol_handoff",
    "export": "export_generated",
    "mark_reviewed": "review_completed",
}


# ---------------------------------------------------------------------------
# Follow-up task dataclass
# ---------------------------------------------------------------------------
@dataclass
class FollowUpTask:
    """Follow-up clinical task created by a clinician."""

    patient_id: str
    clinician_id: str
    snapshot_id: str
    description: str
    task_id: str = ""
    status: str = "pending"  # pending | completed
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None

    def __post_init__(self) -> None:
        if not self.task_id:
            self.task_id = f"task_{uuid.uuid4().hex[:12]}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "patient_id": self.patient_id,
            "clinician_id": self.clinician_id,
            "snapshot_id": self.snapshot_id,
            "description": self.description,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "safety_label": SAFETY_LABEL,
        }


# ---------------------------------------------------------------------------
# DeepTwinReviewEngine
# ---------------------------------------------------------------------------
class DeepTwinReviewEngine:
    """Manages the clinician review workflow for DeepTwin snapshots.

    Every action is append-only (immutable reviews) and emits an audit event.
    """

    def __init__(self, knowledge_layer: KnowledgeLayer) -> None:
        self.kl = knowledge_layer
        self.db_url = knowledge_layer.db_url
        self.dialect = database.check_dialect()
        self._init_tables()

    def _connect(self):
        return database.connect(self.db_url)

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------
    def _init_tables(self) -> None:
        conn = self._connect()
        if self.dialect == "sqlite":
            conn.raw.execute("PRAGMA journal_mode=WAL")
        cursor = conn.cursor()

        # -- Immutable review records (append-only) --------------------
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS deeptwin_reviews (
                review_id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL,
                clinician_id TEXT NOT NULL,
                snapshot_id TEXT NOT NULL,
                hypothesis_id TEXT NOT NULL,
                action TEXT NOT NULL,
                note TEXT DEFAULT '',
                requested_modalities TEXT DEFAULT '[]',
                follow_up_tasks TEXT DEFAULT '[]',
                reviewed_at TEXT DEFAULT CURRENT_TIMESTAMP,
                audit_reference TEXT NOT NULL
            )
        """)

        # -- Follow-up tasks --------------------------------------------
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS deeptwin_tasks (
                task_id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL,
                clinician_id TEXT NOT NULL,
                snapshot_id TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT
            )
        """)

        # -- DeepTwin audit events (immutable) --------------------------
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS deeptwin_audit_events (
                event_id TEXT PRIMARY KEY,
                patient_id TEXT NOT NULL,
                clinician_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                snapshot_id TEXT,
                details TEXT DEFAULT '{}',
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.commit()
        conn.close()

    # ------------------------------------------------------------------
    # Core: record_review
    # ------------------------------------------------------------------
    def record_review(self, review: ClinicianReview) -> str:
        """Store a clinician review action.

        Validates the action, persists the review row, and logs an audit event.
        Returns the *review_id*.
        """
        if review.action not in VALID_ACTIONS:
            raise ValueError(
                f"Invalid action '{review.action}'. Must be one of: {VALID_ACTIONS}"
            )

        # --- persist review + audit in a single transaction -----------
        event_type = ACTION_TO_EVENT_TYPE.get(review.action, "deeptwin_opened")
        audit_event = DeepTwinAuditEvent(
            patient_id=review.patient_id,
            clinician_id=review.clinician_id,
            event_type=event_type,
            snapshot_id=review.snapshot_id,
            details={
                "review_id": review.review_id,
                "hypothesis_id": review.hypothesis_id,
                "action": review.action,
                "note": review.note,
                "requested_modalities": review.requested_modalities,
                "follow_up_tasks": review.follow_up_tasks,
                "safety_label": SAFETY_LABEL,
            },
        )

        conn = self._connect()
        try:
            cursor = conn.cursor()

            # insert review
            cursor.execute(
                """
                INSERT INTO deeptwin_reviews
                    (review_id, patient_id, clinician_id, snapshot_id, hypothesis_id,
                     action, note, requested_modalities, follow_up_tasks,
                     reviewed_at, audit_reference)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    review.review_id,
                    review.patient_id,
                    review.clinician_id,
                    review.snapshot_id,
                    review.hypothesis_id,
                    review.action,
                    review.note,
                    json.dumps(review.requested_modalities),
                    json.dumps(review.follow_up_tasks),
                    review.reviewed_at.isoformat(),
                    review.audit_reference,
                ),
            )

            # insert audit event in same transaction
            cursor.execute(
                """
                INSERT INTO deeptwin_audit_events
                    (event_id, patient_id, clinician_id, event_type,
                     snapshot_id, details, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    audit_event.event_id,
                    audit_event.patient_id,
                    audit_event.clinician_id,
                    audit_event.event_type,
                    audit_event.snapshot_id,
                    json.dumps(audit_event.details),
                    audit_event.timestamp.isoformat(),
                ),
            )

            conn.commit()
        finally:
            conn.close()

        return review.review_id

    # ------------------------------------------------------------------
    # Query: by patient / snapshot
    # ------------------------------------------------------------------
    def get_reviews_for_patient(self, patient_id: str) -> List[ClinicianReview]:
        """Retrieve all reviews for a patient."""
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM deeptwin_reviews WHERE patient_id = ? ORDER BY reviewed_at ASC",
            (patient_id,),
        )
        rows = cursor.fetchall()
        conn.close()
        return [self._row_to_review(row) for row in rows]

    def get_reviews_for_snapshot(self, snapshot_id: str) -> List[ClinicianReview]:
        """Retrieve all reviews for a snapshot."""
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM deeptwin_reviews WHERE snapshot_id = ? ORDER BY reviewed_at ASC",
            (snapshot_id,),
        )
        rows = cursor.fetchall()
        conn.close()
        return [self._row_to_review(row) for row in rows]

    # ------------------------------------------------------------------
    # Status aggregation
    # ------------------------------------------------------------------
    def get_review_status(self, snapshot_id: str) -> Dict[str, Any]:
        """Return a review summary for a snapshot.

        Keys: reviewed, reviewed_by, reviewed_at, hypotheses_reviewed,
              hypotheses_total, notes, pending_actions
        """
        reviews = self.get_reviews_for_snapshot(snapshot_id)

        reviewed = False
        reviewed_by: Optional[str] = None
        reviewed_at: Optional[str] = None
        hypotheses_reviewed = set()
        notes: List[str] = []
        pending_actions: List[str] = []

        for rev in reviews:
            if rev.action in ("accept", "reject"):
                hypotheses_reviewed.add(rev.hypothesis_id)
            if rev.action == "note" and rev.note:
                notes.append(rev.note)
            if rev.action == "mark_reviewed":
                reviewed = True
                reviewed_by = rev.clinician_id
                reviewed_at = rev.reviewed_at.isoformat()
            if rev.action in ("request_data", "report", "protocol", "export"):
                pending_actions.append(f"{rev.action}:{rev.review_id}")

        return {
            "reviewed": reviewed,
            "reviewed_by": reviewed_by,
            "reviewed_at": reviewed_at,
            "hypotheses_reviewed": len(hypotheses_reviewed),
            "hypotheses_total": len({r.hypothesis_id for r in reviews}),
            "notes": notes,
            "pending_actions": pending_actions,
            "safety_label": SAFETY_LABEL,
        }

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------
    def accept_hypothesis(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        hypothesis_id: str,
        note: str = "",
    ) -> str:
        """Record that clinician accepts a hypothesis."""
        review = ClinicianReview(
            patient_id=patient_id,
            clinician_id=clinician_id,
            snapshot_id=snapshot_id,
            hypothesis_id=hypothesis_id,
            action="accept",
            note=note,
        )
        return self.record_review(review)

    def reject_hypothesis(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        hypothesis_id: str,
        note: str = "",
    ) -> str:
        """Record that clinician rejects a hypothesis."""
        review = ClinicianReview(
            patient_id=patient_id,
            clinician_id=clinician_id,
            snapshot_id=snapshot_id,
            hypothesis_id=hypothesis_id,
            action="reject",
            note=note,
        )
        return self.record_review(review)

    def add_note(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        hypothesis_id: str,
        note: str,
    ) -> str:
        """Add a clinical note to a hypothesis."""
        review = ClinicianReview(
            patient_id=patient_id,
            clinician_id=clinician_id,
            snapshot_id=snapshot_id,
            hypothesis_id=hypothesis_id,
            action="note",
            note=note,
        )
        return self.record_review(review)

    def request_more_data(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        requested_modalities: List[str],
        note: str = "",
    ) -> str:
        """Request additional data collection."""
        review = ClinicianReview(
            patient_id=patient_id,
            clinician_id=clinician_id,
            snapshot_id=snapshot_id,
            hypothesis_id="_snapshot_",
            action="request_data",
            note=note,
            requested_modalities=requested_modalities,
        )
        return self.record_review(review)

    def mark_reviewed(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
    ) -> str:
        """Mark entire snapshot as reviewed."""
        review = ClinicianReview(
            patient_id=patient_id,
            clinician_id=clinician_id,
            snapshot_id=snapshot_id,
            hypothesis_id="_snapshot_",
            action="mark_reviewed",
        )
        return self.record_review(review)

    # ------------------------------------------------------------------
    # Follow-up tasks
    # ------------------------------------------------------------------
    def create_follow_up_task(
        self,
        patient_id: str,
        clinician_id: str,
        snapshot_id: str,
        task_description: str,
    ) -> str:
        """Create a follow-up clinical task and log an audit event.

        Returns the *task_id*.
        """
        task = FollowUpTask(
            patient_id=patient_id,
            clinician_id=clinician_id,
            snapshot_id=snapshot_id,
            description=task_description,
        )

        # --- persist task + audit in a single transaction -------------
        audit_event = DeepTwinAuditEvent(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type="review_completed",
            snapshot_id=snapshot_id,
            details={
                "task_id": task.task_id,
                "task_description": task_description,
                "status": "pending",
                "safety_label": SAFETY_LABEL,
            },
        )

        conn = self._connect()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO deeptwin_tasks
                    (task_id, patient_id, clinician_id, snapshot_id,
                     description, status, created_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task.task_id,
                    task.patient_id,
                    task.clinician_id,
                    task.snapshot_id,
                    task.description,
                    task.status,
                    task.created_at.isoformat(),
                    None,
                ),
            )
            cursor.execute(
                """
                INSERT INTO deeptwin_audit_events
                    (event_id, patient_id, clinician_id, event_type,
                     snapshot_id, details, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    audit_event.event_id,
                    audit_event.patient_id,
                    audit_event.clinician_id,
                    audit_event.event_type,
                    audit_event.snapshot_id,
                    json.dumps(audit_event.details),
                    audit_event.timestamp.isoformat(),
                ),
            )
            conn.commit()
        finally:
            conn.close()

        return task.task_id

    def get_tasks_for_patient(self, patient_id: str) -> List[FollowUpTask]:
        """Retrieve follow-up tasks for a patient."""
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM deeptwin_tasks WHERE patient_id = ? ORDER BY created_at ASC",
            (patient_id,),
        )
        rows = cursor.fetchall()
        conn.close()
        return [self._row_to_task(row) for row in rows]

    def complete_task(self, task_id: str) -> bool:
        """Mark a follow-up task as completed."""
        conn = self._connect()
        cursor = conn.cursor()
        now = datetime.now().isoformat()
        cursor.execute(
            "UPDATE deeptwin_tasks SET status = 'completed', completed_at = ? WHERE task_id = ?",
            (now, task_id),
        )
        updated = cursor.rowcount > 0
        conn.commit()
        conn.close()
        return updated

    # ------------------------------------------------------------------
    # Audit
    # ------------------------------------------------------------------
    def get_audit_events(
        self,
        patient_id: Optional[str] = None,
        snapshot_id: Optional[str] = None,
    ) -> List[DeepTwinAuditEvent]:
        """Retrieve DeepTwin audit events, optionally filtered."""
        conn = self._connect()
        cursor = conn.cursor()

        query = "SELECT * FROM deeptwin_audit_events WHERE 1=1"
        params: List[Any] = []
        if patient_id:
            query += " AND patient_id = ?"
            params.append(patient_id)
        if snapshot_id:
            query += " AND snapshot_id = ?"
            params.append(snapshot_id)
        query += " ORDER BY timestamp ASC"

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [self._row_to_audit_event(row) for row in rows]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _log_audit_event(
        self,
        patient_id: str,
        clinician_id: str,
        event_type: str,
        snapshot_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Persist a DeepTwinAuditEvent row. Returns event_id."""
        event = DeepTwinAuditEvent(
            patient_id=patient_id,
            clinician_id=clinician_id,
            event_type=event_type,
            snapshot_id=snapshot_id,
            details=details or {},
        )
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO deeptwin_audit_events
                (event_id, patient_id, clinician_id, event_type,
                 snapshot_id, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.event_id,
                event.patient_id,
                event.clinician_id,
                event.event_type,
                event.snapshot_id,
                json.dumps(event.details),
                event.timestamp.isoformat(),
            ),
        )
        conn.commit()
        conn.close()
        return event.event_id

    def _row_to_review(self, row) -> ClinicianReview:
        return ClinicianReview(
            review_id=row["review_id"],
            patient_id=row["patient_id"],
            clinician_id=row["clinician_id"],
            snapshot_id=row["snapshot_id"],
            hypothesis_id=row["hypothesis_id"],
            action=row["action"],
            note=row["note"] or "",
            requested_modalities=json.loads(row["requested_modalities"] or "[]"),
            follow_up_tasks=json.loads(row["follow_up_tasks"] or "[]"),
            reviewed_at=datetime.fromisoformat(row["reviewed_at"]),
            audit_reference=row["audit_reference"],
        )

    def _row_to_task(self, row) -> FollowUpTask:
        completed_at = None
        if row["completed_at"]:
            completed_at = datetime.fromisoformat(row["completed_at"])
        return FollowUpTask(
            task_id=row["task_id"],
            patient_id=row["patient_id"],
            clinician_id=row["clinician_id"],
            snapshot_id=row["snapshot_id"],
            description=row["description"],
            status=row["status"],
            created_at=datetime.fromisoformat(row["created_at"]),
            completed_at=completed_at,
        )

    def _row_to_audit_event(self, row) -> DeepTwinAuditEvent:
        return DeepTwinAuditEvent(
            event_id=row["event_id"],
            patient_id=row["patient_id"],
            clinician_id=row["clinician_id"],
            event_type=row["event_type"],
            snapshot_id=row["snapshot_id"],
            details=json.loads(row["details"] or "{}"),
            timestamp=datetime.fromisoformat(row["timestamp"]),
        )
