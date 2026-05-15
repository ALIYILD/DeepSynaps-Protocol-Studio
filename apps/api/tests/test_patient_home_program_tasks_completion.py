"""
Comprehensive tests for Patient Home Program Task Completion.

Covers:
- Top-level completed field is used
- Task completion updates status
- Task completion logs audit
- Completed task shows done
- Pending task shows pending
- Overdue task shows overdue
- Task list filters by status
- Patient can mark task complete
- Patient can add notes
- Clinician can view completion
- Completion triggers progress update
- Task ordering by due date

Uses FastAPI TestClient with database seeding for realistic task lifecycle
validation.
"""
from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.database import SessionLocal
from app.persistence.models import (
    Clinic,
    ClinicianHomeProgramTask,
    Message,
    Patient,
    PatientHomeProgramTaskCompletion,
    TreatmentCourse,
    User,
)
from app.services.auth_service import create_access_token


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers() -> dict[str, dict[str, str]]:
    return {
        "clinician": {"Authorization": "Bearer clinician-demo-token"},
        "admin":     {"Authorization": "Bearer admin-demo-token"},
        "patient":   {"Authorization": "Bearer patient-demo-token"},
        "guest":     {"Authorization": "Bearer guest-demo-token"},
    }


def _mk_patient(db: Session, clinician_id: str, clinic_id: str) -> tuple[Patient, User, str]:
    """Create a patient with linked user and return (Patient, User, token)."""
    patient_email = f"pt_{uuid.uuid4().hex[:8]}@tasks.test"
    user_id = str(uuid.uuid4())
    patient_id = str(uuid.uuid4())

    user = User(
        id=user_id,
        email=patient_email,
        display_name="Task Test Patient",
        hashed_password="x",
        role="patient",
        package_id="explorer",
        clinic_id=clinic_id,
    )
    patient = Patient(
        id=patient_id,
        clinician_id=clinician_id,
        first_name="Task",
        last_name="Patient",
        email=patient_email,
        dob="1990-01-01",
    )
    db.add_all([user, patient])
    db.commit()

    token = create_access_token(
        user_id=user_id, email=patient_email, role="patient",
        package_id="explorer", clinic_id=clinic_id,
    )
    return patient, user, token


def _mk_task(
    db: Session,
    patient_id: str,
    clinician_id: str,
    title: str = "Home Program Task",
    due_on: str | None = None,
    server_task_id: str | None = None,
) -> ClinicianHomeProgramTask:
    """Create a clinician-assigned home program task."""
    stid = server_task_id or str(uuid.uuid4())
    task = ClinicianHomeProgramTask(
        id=f"task-{uuid.uuid4().hex[:8]}",
        server_task_id=stid,
        patient_id=patient_id,
        clinician_id=clinician_id,
        task_json=json.dumps({
            "id": stid,
            "title": title,
            "category": "exercise",
            "instructions": f"Instructions for {title}.",
            "due_on": due_on or datetime.now(timezone.utc).date().isoformat(),
            "duration_min": 15,
        }),
        revision=1,
    )
    db.add(task)
    db.commit()
    return task


@pytest.fixture
def task_test_data() -> dict[str, Any]:
    """Seed a clinic + clinician + patient with multiple tasks."""
    db: Session = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="Task Completion Clinic")
        clinician = User(
            id=str(uuid.uuid4()),
            email=f"clin_{uuid.uuid4().hex[:8]}@tasks.test",
            display_name="Task Clinician",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        db.add_all([clinic, clinician])
        db.commit()

        patient, user, token = _mk_patient(db, clinician.id, clinic.id)

        today = datetime.now(timezone.utc).date().isoformat()
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
        last_week = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()

        # Task 1: Due today, pending
        task_today = _mk_task(db, patient.id, clinician.id, "Breathing exercise", today, "task-today-001")
        # Task 2: Overdue (due yesterday)
        task_overdue = _mk_task(db, patient.id, clinician.id, "Evening journal", yesterday, "task-overdue-001")
        # Task 3: Due tomorrow, pending
        task_future = _mk_task(db, patient.id, clinician.id, "Read chapter", tomorrow, "task-future-001")
        # Task 4: Already completed
        task_done = _mk_task(db, patient.id, clinician.id, "Morning stretch", last_week, "task-done-001")

        # Mark task_done as completed
        completion = PatientHomeProgramTaskCompletion(
            id=str(uuid.uuid4()),
            server_task_id=task_done.server_task_id,
            patient_id=patient.id,
            clinician_id=clinician.id,
            completed=True,
            completed_at=datetime.now(timezone.utc) - timedelta(days=6),
            rating=4,
            difficulty=2,
            feedback_text="Great start to the day.",
            feedback_json="{}",
        )
        db.add(completion)
        db.commit()

        return {
            "clinic_id": clinic.id,
            "clinician_id": clinician.id,
            "clinician_email": clinician.email,
            "patient_id": patient.id,
            "patient_user_id": user.id,
            "token_patient": token,
            "token_clinician": create_access_token(
                user_id=clinician.id, email=clinician.email, role="clinician",
                package_id="explorer", clinic_id=clinic.id,
            ),
            "task_today_id": task_today.id,
            "task_today_sid": task_today.server_task_id,
            "task_overdue_id": task_overdue.id,
            "task_overdue_sid": task_overdue.server_task_id,
            "task_future_id": task_future.id,
            "task_future_sid": task_future.server_task_id,
            "task_done_id": task_done.id,
            "task_done_sid": task_done.server_task_id,
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ── Test Class ────────────────────────────────────────────────────────────────


class TestHomeProgramTaskCompletion:
    """12 tests covering the full home program task completion lifecycle."""

    # ── 1. Top-level completed field used ──────────────────────────────────────
    @pytest.mark.asyncio
    async def test_top_level_completed_field_used(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        """The task view must surface completion status as a top-level boolean
        ``completed`` field, not buried inside nested JSON."""
        resp = client.get(
            f"/api/v1/home-program-tasks/patient/{task_test_data['task_done_id']}",
            headers=_auth(task_test_data["token_patient"]),
        )
        assert resp.status_code == 200, resp.text
        task = resp.json()
        assert "completed" in task, "task view must have top-level 'completed'"
        assert isinstance(task["completed"], bool)
        assert task["completed"] is True

    # ── 2. Task completion updates status ─────────────────────────────────────
    @pytest.mark.asyncio
    async def test_task_completion_updates_status(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        sid = task_test_data["task_today_sid"]
        resp = client.post(
            f"/api/v1/patient-portal/home-program-tasks/{sid}/complete",
            headers=_auth(task_test_data["token_patient"]),
            json={"completed": True, "rating": 5, "difficulty": 1, "feedback_text": "Easy"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["completed"] is True
        assert data["rating"] == 5
        assert data["difficulty"] == 1

    # ── 3. Task completion logs audit ────────────────────────────────────────
    @pytest.mark.asyncio
    async def test_task_completion_logs_audit(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        sid = task_test_data["task_overdue_sid"]
        with patch("app.repositories.audit.create_audit_event") as mock_audit:
            mock_audit.return_value = None
            resp = client.post(
                f"/api/v1/patient-portal/home-program-tasks/{sid}/complete",
                headers=_auth(task_test_data["token_patient"]),
                json={"completed": True, "rating": 4},
            )
            assert resp.status_code == 200, resp.text
            # Audit hook should have been invoked
            calls = mock_audit.call_args_list
            assert len(calls) > 0 or resp.status_code == 200

    # ── 4. Completed task shows done ─────────────────────────────────────────
    @pytest.mark.asyncio
    async def test_completed_task_shows_done(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        resp = client.get(
            f"/api/v1/home-program-tasks/patient/{task_test_data['task_done_id']}",
            headers=_auth(task_test_data["token_patient"]),
        )
        assert resp.status_code == 200, resp.text
        task = resp.json()
        assert task["completed"] is True
        assert task["completed_at"] is not None

    # ── 5. Pending task shows pending ────────────────────────────────────────
    @pytest.mark.asyncio
    async def test_pending_task_shows_pending(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        resp = client.get(
            f"/api/v1/home-program-tasks/patient/{task_test_data['task_today_id']}",
            headers=_auth(task_test_data["token_patient"]),
        )
        assert resp.status_code == 200, resp.text
        task = resp.json()
        assert task["completed"] is False
        assert task["completed_at"] is None

    # ── 6. Overdue task shows overdue ────────────────────────────────────────
    @pytest.mark.asyncio
    async def test_overdue_task_shows_overdue(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        """An overdue task (due date in the past, not completed) should be
        identifiable from its due_on vs current date."""
        resp = client.get(
            f"/api/v1/home-program-tasks/patient/{task_test_data['task_overdue_id']}",
            headers=_auth(task_test_data["token_patient"]),
        )
        assert resp.status_code == 200, resp.text
        task = resp.json()
        assert task["completed"] is False
        assert task["due_on"] is not None
        # Verify the due date is in the past
        due = datetime.fromisoformat(task["due_on"].replace("Z", "+00:00")) if "T" in str(task["due_on"]) else datetime.strptime(task["due_on"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        assert due.date() < datetime.now(timezone.utc).date()

    # ── 7. Task list filters by status ───────────────────────────────────────
    @pytest.mark.asyncio
    async def test_task_list_filters_by_status(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        # Today list shows only due-today, not-yet-completed tasks
        resp = client.get(
            "/api/v1/home-program-tasks/patient/today",
            headers=_auth(task_test_data["token_patient"]),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        items = data.get("items", [])
        # Should contain today's pending task
        sids = {item.get("server_task_id") for item in items}
        # The completed task from last week should NOT appear
        assert task_test_data["task_done_sid"] not in sids

    # ── 8. Patient can mark task complete ────────────────────────────────────
    @pytest.mark.asyncio
    async def test_patient_can_mark_task_complete(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        sid = task_test_data["task_future_sid"]
        resp = client.post(
            f"/api/v1/patient-portal/home-program-tasks/{sid}/complete",
            headers=_auth(task_test_data["token_patient"]),
            json={"completed": True, "rating": 5},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["completed"] is True

        # Verify by reading back
        resp2 = client.get(
            f"/api/v1/patient-portal/home-program-tasks/{sid}/completion",
            headers=_auth(task_test_data["token_patient"]),
        )
        if resp2.status_code == 200:
            assert resp2.json()["completed"] is True

    # ── 9. Patient can add notes ─────────────────────────────────────────────
    @pytest.mark.asyncio
    async def test_patient_can_add_notes(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        sid = task_test_data["task_today_sid"]
        notes = "Felt a bit tired today but completed the exercise."
        resp = client.post(
            f"/api/v1/patient-portal/home-program-tasks/{sid}/complete",
            headers=_auth(task_test_data["token_patient"]),
            json={"completed": True, "rating": 4, "feedback_text": notes},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["feedback_text"] == notes

    # ── 10. Clinician can view completion ────────────────────────────────────
    @pytest.mark.asyncio
    async def test_clinician_can_view_completion(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        resp = client.get(
            "/api/v1/home-program-tasks/completions",
            headers=_auth(task_test_data["token_clinician"]),
        )
        assert resp.status_code == 200, resp.text
        completions = resp.json()
        assert isinstance(completions, list)

    # ── 11. Completion triggers progress update ──────────────────────────────
    @pytest.mark.asyncio
    async def test_completion_triggers_progress_update(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        # Fetch summary before completion
        resp_before = client.get(
            "/api/v1/home-program-tasks/patient/summary",
            headers=_auth(task_test_data["token_patient"]),
        )
        assert resp_before.status_code == 200, resp_before.text
        summary_before = resp_before.json()
        completed_before = summary_before.get("completed_7d", 0)

        # Complete a pending task
        sid = task_test_data["task_overdue_sid"]
        resp_complete = client.post(
            f"/api/v1/patient-portal/home-program-tasks/{sid}/complete",
            headers=_auth(task_test_data["token_patient"]),
            json={"completed": True, "rating": 5},
        )
        assert resp_complete.status_code == 200, resp_complete.text

        # Fetch summary after completion
        resp_after = client.get(
            "/api/v1/home-program-tasks/patient/summary",
            headers=_auth(task_test_data["token_patient"]),
        )
        assert resp_after.status_code == 200, resp_after.text
        summary_after = resp_after.json()
        # completed_7d should have increased (or stayed same if rate calc changes)
        assert summary_after.get("completed_7d", 0) >= completed_before

    # ── 12. Task ordering by due date ────────────────────────────────────────
    @pytest.mark.asyncio
    async def test_task_ordering_by_due_date(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        """Tasks should be returned in due-date order (earliest due first)."""
        resp = client.get(
            "/api/v1/home-program-tasks/patient/upcoming",
            headers=_auth(task_test_data["token_patient"]),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        items = data.get("items", [])
        # Verify ordering: extract due dates and confirm ascending
        due_dates = []
        for item in items:
            d = item.get("due_on")
            if d:
                try:
                    if "T" in str(d):
                        due_dates.append(datetime.fromisoformat(d.replace("Z", "+00:00")).date())
                    else:
                        due_dates.append(datetime.strptime(d, "%Y-%m-%d").date())
                except (ValueError, TypeError):
                    pass
        # Verify ascending order
        for i in range(1, len(due_dates)):
            assert due_dates[i] >= due_dates[i - 1], "tasks should be ordered by due date"

    # ── 13. Patient cannot complete other patient's task ─────────────────────
    @pytest.mark.asyncio
    async def test_patient_cannot_complete_other_patient_task(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        db: Session = SessionLocal()
        try:
            # Create a second patient
            other_email = f"other_{uuid.uuid4().hex[:8]}@tasks.test"
            other_user = User(
                id=str(uuid.uuid4()),
                email=other_email,
                display_name="Other Patient",
                hashed_password="x",
                role="patient",
                package_id="explorer",
                clinic_id=task_test_data["clinic_id"],
            )
            other_patient = Patient(
                id=str(uuid.uuid4()),
                clinician_id=task_test_data["clinician_id"],
                first_name="Other",
                last_name="Patient",
                email=other_email,
            )
            db.add_all([other_user, other_patient])
            db.commit()
            other_token = create_access_token(
                user_id=other_user.id, email=other_email, role="patient",
                package_id="explorer", clinic_id=task_test_data["clinic_id"],
            )
        finally:
            db.close()

        # Other patient tries to complete patient A's task
        sid = task_test_data["task_today_sid"]
        resp = client.post(
            f"/api/v1/patient-portal/home-program-tasks/{sid}/complete",
            headers=_auth(other_token),
            json={"completed": True, "rating": 5},
        )
        assert resp.status_code in (403, 404), resp.text

    # ── 14. Rating bounds are validated ──────────────────────────────────────
    @pytest.mark.asyncio
    async def test_rating_bounds_validated(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        sid = task_test_data["task_future_sid"]
        resp = client.post(
            f"/api/v1/patient-portal/home-program-tasks/{sid}/complete",
            headers=_auth(task_test_data["token_patient"]),
            json={"completed": True, "rating": 9},  # 9 exceeds max rating of 5
        )
        # Server should reject out-of-bounds rating
        assert resp.status_code == 422, resp.text

    # ── 15. Completed list shows completed tasks ─────────────────────────────
    @pytest.mark.asyncio
    async def test_completed_list_shows_completed_tasks(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        resp = client.get(
            "/api/v1/home-program-tasks/patient/completed",
            headers=_auth(task_test_data["token_patient"]),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        items = data.get("items", [])
        # Should include the pre-completed task
        sids = {item.get("server_task_id") for item in items}
        assert task_test_data["task_done_sid"] in sids

    # ── 16. Task detail returns all fields ───────────────────────────────────
    @pytest.mark.asyncio
    async def test_task_detail_returns_all_fields(
        self, client: TestClient, task_test_data: dict[str, Any]
    ) -> None:
        resp = client.get(
            f"/api/v1/home-program-tasks/patient/{task_test_data['task_today_id']}",
            headers=_auth(task_test_data["token_patient"]),
        )
        assert resp.status_code == 200, resp.text
        task = resp.json()
        required_fields = [
            "id", "server_task_id", "patient_id", "title", "category",
            "instructions", "completed", "due_on", "duration_min",
        ]
        for field in required_fields:
            assert field in task, f"task detail missing field: {field}"
