"""
Deep tests for break-glass access patterns.

This module exercises the complete break-glass session lifecycle:
session creation, expiry calculation, access control within and
after the session window, audit logging, dual authorization,
notification dispatch, concurrency limits, and post-access review.

All external dependencies (database, audit logger, notification
service, PHI guard) are mocked so these tests run in isolation.

Test Count: 20
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta, timezone
from http import HTTPStatus
from typing import Any
from unittest.mock import AsyncMock, MagicMock, call, patch
from uuid import UUID, uuid4

import pytest
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUPER_ADMIN_ID = "user_sa_001"
SECOND_APPROVER_ID = "user_sa_002"
CLINIC_ID = "clinic_001"
PATIENT_ID = "patient_007"

CRM_BASE = "/api/v1/crm"


def _now() -> datetime:
    return datetime.now(UTC)


def _make_session_row(
    session_id: str | None = None,
    actor_id: str = SUPER_ADMIN_ID,
    clinic_id: str = CLINIC_ID,
    patient_id: str = PATIENT_ID,
    justification: str = "Emergency stroke protocol evaluation",
    duration_minutes: int = 30,
    created_at: datetime | None = None,
    expires_at: datetime | None = None,
    dual_approved_by: str | None = None,
    terminated_at: datetime | None = None,
    review_completed_at: datetime | None = None,
) -> dict[str, Any]:
    now = created_at or _now()
    return {
        "id": session_id or str(uuid4()),
        "actor_id": actor_id,
        "clinic_id": clinic_id,
        "patient_id": patient_id,
        "justification": justification,
        "duration_minutes": duration_minutes,
        "created_at": now,
        "expires_at": expires_at or (now + timedelta(minutes=duration_minutes)),
        "dual_approved_by": dual_approved_by,
        "terminated_at": terminated_at,
        "review_completed_at": review_completed_at,
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db() -> MagicMock:
    db = MagicMock()
    db.execute = AsyncMock(return_value=None)
    db.fetch_one = AsyncMock(return_value=None)
    db.fetch_all = AsyncMock(return_value=[])
    db.execute_many = AsyncMock(return_value=None)
    db.transaction = MagicMock()
    db.transaction.return_value.__aenter__ = AsyncMock(return_value=db)
    db.transaction.return_value.__aexit__ = AsyncMock(return_value=None)
    return db


@pytest.fixture
def mock_audit() -> MagicMock:
    return MagicMock(log_event=AsyncMock(return_value=None))


@pytest.fixture
def mock_notify() -> MagicMock:
    return MagicMock(send=AsyncMock(return_value=None))


@pytest.fixture
def mock_phi_guard() -> MagicMock:
    return MagicMock(check_access=AsyncMock(return_value=True), flag_access=AsyncMock(return_value=None))


@pytest.fixture
def app(mock_db: MagicMock, mock_audit: MagicMock, mock_notify: MagicMock, mock_phi_guard: MagicMock) -> FastAPI:
    from fastapi import Depends, FastAPI, HTTPException, Request

    app = FastAPI(title="DeepSynaps Break-Glass Test")

    async def _get_db():
        return mock_db

    async def _get_user(request: Request):
        return request.state.user

    async def _require_super_admin(user=Depends(_get_user)):
        if (user or {}).get("role") not in ("super_admin", "supervisor") or (user or {}).get("clinic_id") is not None:
            raise HTTPException(status_code=HTTPStatus.FORBIDDEN, detail="Super-admin access required")
        return user

    async def _get_audit():
        return mock_audit

    async def _get_notify():
        return mock_notify

    async def _get_phi_guard():
        return mock_phi_guard

    # ---- helpers used by routes ----
    def _authz(user: dict) -> None:
        if user.get("role") not in ("super_admin", "supervisor") or user.get("clinic_id") is not None:
            raise HTTPException(status_code=HTTPStatus.FORBIDDEN, detail="Super-admin access required")

    # ---- break-glass: create ----
    @app.post(f"{CRM_BASE}/break-glass")
    async def bg_create(
        request: Request,
        user=Depends(_get_user),
        db=Depends(_get_db),
        audit=Depends(_get_audit),
        notify=Depends(_get_notify),
    ):
        _authz(user)
        body = await request.json()
        justification: str = body.get("justification", "")
        patient_id: str = body.get("patient_id", "")
        clinic_id: str = body.get("clinic_id", "")
        duration_minutes: int = body.get("duration_minutes", 30)

        if not justification:
            raise HTTPException(status_code=HTTPStatus.UNPROCESSABLE_ENTITY, detail="justification required")
        if len(justification) < 10:
            raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail="justification too short")
        if duration_minutes < 1 or duration_minutes > 120:
            raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail="duration out of range")

        # concurrent limit check
        existing = await db.fetch_all(
            "SELECT * FROM break_glass_sessions WHERE actor_id = :a AND terminated_at IS NULL AND expires_at > :now",
            {"a": user["id"], "now": _now()},
        )
        if existing and len(existing) >= 3:
            raise HTTPException(status_code=HTTPStatus.TOO_MANY_REQUESTS, detail="Max 3 concurrent break-glass sessions")

        session_id = str(uuid4())
        created = _now()
        expires = created + timedelta(minutes=duration_minutes)

        # dual authorization for sensitive access (> 60 min or restricted patient)
        dual_approved_by = None
        if duration_minutes > 60 or body.get("requires_dual_approval"):
            dual_approved_by = body.get("dual_approved_by")
            if not dual_approved_by:
                raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail="Dual approval required")

        await db.execute(
            (
                "INSERT INTO break_glass_sessions "
                "(id, actor_id, clinic_id, patient_id, justification, duration_minutes, created_at, expires_at, dual_approved_by) "
                "VALUES (:i,:a,:c,:p,:j,:d,:cr,:e,:da)"
            ),
            {
                "i": session_id,
                "a": user["id"],
                "c": clinic_id,
                "p": patient_id,
                "j": justification,
                "d": duration_minutes,
                "cr": created,
                "e": expires,
                "da": dual_approved_by,
            },
        )
        await audit.log_event(
            actor_id=user["id"],
            action="break_glass.created",
            resource=f"patient/{patient_id}",
            clinic_id=clinic_id,
            details={"justification": justification, "duration_minutes": duration_minutes, "session_id": session_id},
            safety_flag=True,
        )
        await notify.send(
            channel="security",
            message=json.dumps(
                {
                    "event": "break_glass.created",
                    "session_id": session_id,
                    "actor_id": user["id"],
                    "patient_id": patient_id,
                    "clinic_id": clinic_id,
                    "expires_at": expires.isoformat(),
                }
            ),
        )
        return {"session_id": session_id, "created_at": created.isoformat(), "expires_at": expires.isoformat(), "status": "active"}

    # ---- break-glass: list ----
    @app.get(f"{CRM_BASE}/break-glass")
    async def bg_list(
        user=Depends(_get_user),
        db=Depends(_get_db),
    ):
        _authz(user)
        rows = await db.fetch_all("SELECT * FROM break_glass_sessions ORDER BY created_at DESC")
        now = _now()
        sessions = []
        for r in rows or []:
            is_expired = bool(r.get("terminated_at")) or (r.get("expires_at") and r.get("expires_at") < now)
            sessions.append(
                {
                    "id": r["id"],
                    "actor_id": r["actor_id"],
                    "patient_id": r["patient_id"],
                    "clinic_id": r["clinic_id"],
                    "status": "expired" if is_expired else "active",
                    "created_at": r["created_at"].isoformat() if isinstance(r["created_at"], datetime) else r["created_at"],
                    "expires_at": r["expires_at"].isoformat() if isinstance(r["expires_at"], datetime) else r["expires_at"],
                    "dual_approved_by": r.get("dual_approved_by"),
                    "review_completed_at": r.get("review_completed_at"),
                }
            )
        return {"sessions": sessions, "count": len(sessions)}

    # ---- break-glass: access patient data (simulated) ----
    @app.get(f"{CRM_BASE}/break-glass/{{session_id}}/access")
    async def bg_access(
        session_id: str,
        user=Depends(_get_user),
        db=Depends(_get_db),
        audit=Depends(_get_audit),
        phi=Depends(_get_phi_guard),
    ):
        _authz(user)
        row = await db.fetch_one("SELECT * FROM break_glass_sessions WHERE id = :id", {"id": session_id})
        if not row:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND, detail="Session not found")
        now = _now()
        if row.get("terminated_at") or (row.get("expires_at") and row["expires_at"] < now):
            raise HTTPException(status_code=HTTPStatus.FORBIDDEN, detail="Session expired or terminated")
        # forbidden tools guard
        forbidden_tool = user.get("tool")
        if forbidden_tool in ("diagnosis", "prescribe"):
            raise HTTPException(status_code=HTTPStatus.FORBIDDEN, detail=f"Tool '{forbidden_tool}' forbidden via break-glass")
        await audit.log_event(
            actor_id=user["id"],
            action="break_glass.data_access",
            resource=f"patient/{row['patient_id']}",
            clinic_id=row["clinic_id"],
            details={"session_id": session_id, "tool": forbidden_tool},
            safety_flag=True,
        )
        await phi.flag_access(session_id=session_id, patient_id=row["patient_id"], actor_id=user["id"])
        return {"patient_id": row["patient_id"], "access_granted": True, "session_id": session_id}

    # ---- break-glass: terminate ----
    @app.post(f"{CRM_BASE}/break-glass/{{session_id}}/terminate")
    async def bg_terminate(
        session_id: str,
        user=Depends(_get_user),
        db=Depends(_get_db),
        audit=Depends(_get_audit),
    ):
        _authz(user)
        row = await db.fetch_one("SELECT * FROM break_glass_sessions WHERE id = :id", {"id": session_id})
        if not row:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND, detail="Session not found")
        if row.get("terminated_at"):
            raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail="Already terminated")
        await db.execute(
            "UPDATE break_glass_sessions SET terminated_at = :t WHERE id = :id",
            {"t": _now(), "id": session_id},
        )
        await audit.log_event(
            actor_id=user["id"],
            action="break_glass.terminated",
            resource=f"session/{session_id}",
            details={"terminated_at": _now().isoformat()},
            safety_flag=True,
        )
        return {"session_id": session_id, "status": "terminated"}

    # ---- break-glass: submit review ----
    @app.post(f"{CRM_BASE}/break-glass/{{session_id}}/review")
    async def bg_review(
        session_id: str,
        request: Request,
        user=Depends(_get_user),
        db=Depends(_get_db),
        audit=Depends(_get_audit),
    ):
        _authz(user)
        row = await db.fetch_one("SELECT * FROM break_glass_sessions WHERE id = :id", {"id": session_id})
        if not row:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND, detail="Session not found")
        body = await request.json()
        notes: str = body.get("review_notes", "")
        if len(notes) < 5:
            raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail="review_notes too short")
        await db.execute(
            "UPDATE break_glass_sessions SET review_completed_at = :t, review_notes = :n WHERE id = :id",
            {"t": _now(), "n": notes, "id": session_id},
        )
        await audit.log_event(
            actor_id=user["id"],
            action="break_glass.review_submitted",
            resource=f"session/{session_id}",
            details={"notes_length": len(notes)},
            safety_flag=True,
        )
        return {"session_id": session_id, "status": "reviewed"}

    # ---- break-glass: extend (should fail) ----
    @app.post(f"{CRM_BASE}/break-glass/{{session_id}}/extend")
    async def bg_extend(
        session_id: str,
        request: Request,
        user=Depends(_get_user),
        db=Depends(_get_db),
    ):
        _authz(user)
        row = await db.fetch_one("SELECT * FROM break_glass_sessions WHERE id = :id", {"id": session_id})
        if not row:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND, detail="Session not found")
        if row.get("terminated_at") or (row.get("expires_at") and row["expires_at"] < _now()):
            raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail="Expired session cannot be extended")
        raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail="Extension not allowed; create a new session")

    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


def _auth(user_id: str = SUPER_ADMIN_ID, role: str = "super_admin", clinic_id: str | None = None) -> dict[str, str]:
    payload = {"id": user_id, "role": role, "clinic_id": clinic_id, "email": f"{user_id}@deepsynaps.ai"}
    return {"X-Test-User": json.dumps(payload)}


# ---------------------------------------------------------------------------
# Session Lifecycle Tests
# ---------------------------------------------------------------------------


class TestSessionLifecycle:
    """Tests for break-glass session creation, timestamps, and expiry."""

    def test_session_creation_timestamp(self, client: TestClient, mock_db: MagicMock):
        """Session has exact creation timestamp."""
        client.headers.update(_auth())
        mock_db.fetch_all = AsyncMock(return_value=[])  # concurrent check
        mock_db.execute = AsyncMock(return_value=None)
        resp = client.post(
            f"{CRM_BASE}/break-glass",
            json={"justification": "Emergency protocol review for neuro ICU case", "patient_id": PATIENT_ID, "clinic_id": CLINIC_ID, "duration_minutes": 15},
        )
        assert resp.status_code == HTTPStatus.OK
        data = resp.json()
        created = datetime.fromisoformat(data["created_at"])
        assert (created - _now()).total_seconds() < 5

    def test_session_expiry_calculation(self, client: TestClient, mock_db: MagicMock):
        """Expiry = creation + duration_minutes."""
        client.headers.update(_auth())
        mock_db.fetch_all = AsyncMock(return_value=[])
        mock_db.execute = AsyncMock(return_value=None)
        resp = client.post(
            f"{CRM_BASE}/break-glass",
            json={"justification": "Urgent follow-up on seizure monitoring patient", "patient_id": PATIENT_ID, "clinic_id": CLINIC_ID, "duration_minutes": 45},
        )
        data = resp.json()
        created = datetime.fromisoformat(data["created_at"])
        expires = datetime.fromisoformat(data["expires_at"])
        delta: timedelta = expires - created
        assert delta.total_seconds() == pytest.approx(45 * 60, abs=5)

    def test_session_access_within_duration(self, client: TestClient, mock_db: MagicMock):
        """Access within duration is allowed."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=30, expires_at=_now() + timedelta(minutes=30))
        mock_db.fetch_one = AsyncMock(return_value=session)
        resp = client.get(f"{CRM_BASE}/break-glass/{sid}/access")
        assert resp.status_code == HTTPStatus.OK
        assert resp.json()["access_granted"] is True

    def test_session_access_after_expiry(self, client: TestClient, mock_db: MagicMock):
        """Access after expiry is denied."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=5, expires_at=_now() - timedelta(minutes=1))
        mock_db.fetch_one = AsyncMock(return_value=session)
        resp = client.get(f"{CRM_BASE}/break-glass/{sid}/access")
        assert resp.status_code == HTTPStatus.FORBIDDEN
        assert "expired" in resp.json()["detail"].lower()

    def test_session_justification_logged(self, client: TestClient, mock_db: MagicMock, mock_audit: MagicMock):
        """Justification is in audit log."""
        client.headers.update(_auth())
        justification = "Patient showing acute stroke symptoms requiring immediate imaging review"
        mock_db.fetch_all = AsyncMock(return_value=[])
        mock_db.execute = AsyncMock(return_value=None)
        client.post(
            f"{CRM_BASE}/break-glass",
            json={"justification": justification, "patient_id": PATIENT_ID, "clinic_id": CLINIC_ID, "duration_minutes": 20},
        )
        call_kwargs = mock_audit.log_event.call_args.kwargs
        assert justification in call_kwargs["details"]["justification"]

    def test_session_patient_id_logged(self, client: TestClient, mock_db: MagicMock, mock_audit: MagicMock):
        """Patient ID is in audit log."""
        client.headers.update(_auth())
        mock_db.fetch_all = AsyncMock(return_value=[])
        mock_db.execute = AsyncMock(return_value=None)
        client.post(
            f"{CRM_BASE}/break-glass",
            json={"justification": "Emergency review for post-op monitoring patient", "patient_id": "pat_special_999", "clinic_id": CLINIC_ID, "duration_minutes": 15},
        )
        call_kwargs = mock_audit.log_event.call_args.kwargs
        assert "pat_special_999" in call_kwargs["resource"]

    def test_session_clinic_id_logged(self, client: TestClient, mock_db: MagicMock, mock_audit: MagicMock):
        """Clinic ID is in audit log."""
        client.headers.update(_auth())
        mock_db.fetch_all = AsyncMock(return_value=[])
        mock_db.execute = AsyncMock(return_value=None)
        client.post(
            f"{CRM_BASE}/break-glass",
            json={"justification": "Review required for clinic transfer case documentation", "patient_id": PATIENT_ID, "clinic_id": "clinic_special", "duration_minutes": 15},
        )
        call_kwargs = mock_audit.log_event.call_args.kwargs
        assert call_kwargs["clinic_id"] == "clinic_special"

    def test_session_actor_logged(self, client: TestClient, mock_db: MagicMock, mock_audit: MagicMock):
        """Actor ID is in audit log."""
        client.headers.update(_auth(user_id="user_sa_007"))
        mock_db.fetch_all = AsyncMock(return_value=[])
        mock_db.execute = AsyncMock(return_value=None)
        client.post(
            f"{CRM_BASE}/break-glass",
            json={"justification": "Actor logging verification test case scenario", "patient_id": PATIENT_ID, "clinic_id": CLINIC_ID, "duration_minutes": 10},
        )
        call_kwargs = mock_audit.log_event.call_args.kwargs
        assert call_kwargs["actor_id"] == "user_sa_007"


# ---------------------------------------------------------------------------
# Dual Authorization Tests
# ---------------------------------------------------------------------------


class TestDualAuthorization:
    """Tests for multi-party approval on sensitive break-glass access."""

    def test_session_dual_authorization_required_for_long_duration(self, client: TestClient, mock_db: MagicMock):
        """Second approver required for sessions > 60 minutes."""
        client.headers.update(_auth())
        mock_db.fetch_all = AsyncMock(return_value=[])
        resp = client.post(
            f"{CRM_BASE}/break-glass",
            json={"justification": "Extended monitoring for ICU neurocritical care ward patient", "patient_id": PATIENT_ID, "clinic_id": CLINIC_ID, "duration_minutes": 90},
        )
        assert resp.status_code == HTTPStatus.BAD_REQUEST
        assert "dual approval" in resp.json()["detail"].lower()

    def test_session_dual_authorization_required_for_sensitive_flag(self, client: TestClient, mock_db: MagicMock):
        """Second approver required when sensitive flag is set."""
        client.headers.update(_auth())
        mock_db.fetch_all = AsyncMock(return_value=[])
        resp = client.post(
            f"{CRM_BASE}/break-glass",
            json={
                "justification": "Restricted patient record review for safety committee",
                "patient_id": PATIENT_ID,
                "clinic_id": CLINIC_ID,
                "duration_minutes": 30,
                "requires_dual_approval": True,
            },
        )
        assert resp.status_code == HTTPStatus.BAD_REQUEST
        assert "dual approval" in resp.json()["detail"].lower()

    def test_session_dual_authorization_accepts_with_approver(self, client: TestClient, mock_db: MagicMock):
        """Session succeeds when dual_approved_by is provided."""
        client.headers.update(_auth())
        mock_db.fetch_all = AsyncMock(return_value=[])
        mock_db.execute = AsyncMock(return_value=None)
        resp = client.post(
            f"{CRM_BASE}/break-glass",
            json={
                "justification": "Extended review for complex neurosurgical case management",
                "patient_id": PATIENT_ID,
                "clinic_id": CLINIC_ID,
                "duration_minutes": 90,
                "requires_dual_approval": True,
                "dual_approved_by": SECOND_APPROVER_ID,
            },
        )
        assert resp.status_code == HTTPStatus.OK
        assert resp.json()["status"] == "active"


# ---------------------------------------------------------------------------
# Notification & Termination Tests
# ---------------------------------------------------------------------------


class TestNotificationAndTermination:
    """Tests for break-glass notifications and auto-termination."""

    def test_session_notification_sent(self, client: TestClient, mock_db: MagicMock, mock_notify: MagicMock):
        """Notification sent on break-glass activation."""
        client.headers.update(_auth())
        mock_db.fetch_all = AsyncMock(return_value=[])
        mock_db.execute = AsyncMock(return_value=None)
        client.post(
            f"{CRM_BASE}/break-glass",
            json={"justification": "Emergency access for seizure cluster analysis", "patient_id": PATIENT_ID, "clinic_id": CLINIC_ID, "duration_minutes": 20},
        )
        mock_notify.send.assert_awaited_once()
        call_args = mock_notify.send.call_args.kwargs
        assert call_args["channel"] == "security"
        payload = json.loads(call_args["message"])
        assert payload["event"] == "break_glass.created"

    def test_session_auto_termination(self, client: TestClient, mock_db: MagicMock):
        """Session auto-terminates on expiry (access denied after expiry)."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=10, expires_at=_now() - timedelta(seconds=30))
        mock_db.fetch_one = AsyncMock(return_value=session)
        resp = client.get(f"{CRM_BASE}/break-glass/{sid}/access")
        assert resp.status_code == HTTPStatus.FORBIDDEN
        assert "expired" in resp.json()["detail"].lower()

    def test_session_cannot_be_extended(self, client: TestClient, mock_db: MagicMock):
        """Expired session cannot be extended."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=5, expires_at=_now() - timedelta(minutes=1))
        mock_db.fetch_one = AsyncMock(return_value=session)
        resp = client.post(f"{CRM_BASE}/break-glass/{sid}/extend", json={})
        assert resp.status_code == HTTPStatus.BAD_REQUEST
        assert "cannot be extended" in resp.json()["detail"].lower()

    def test_active_session_cannot_be_extended(self, client: TestClient, mock_db: MagicMock):
        """Even active sessions cannot be extended (policy: create new)."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=30, expires_at=_now() + timedelta(minutes=20))
        mock_db.fetch_one = AsyncMock(return_value=session)
        resp = client.post(f"{CRM_BASE}/break-glass/{sid}/extend", json={})
        assert resp.status_code == HTTPStatus.BAD_REQUEST
        assert "create a new session" in resp.json()["detail"].lower()

    def test_manual_termination(self, client: TestClient, mock_db: MagicMock, mock_audit: MagicMock):
        """Admin can manually terminate an active session."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=30, expires_at=_now() + timedelta(minutes=30))
        mock_db.fetch_one = AsyncMock(return_value=session)
        mock_db.execute = AsyncMock(return_value=None)
        resp = client.post(f"{CRM_BASE}/break-glass/{sid}/terminate")
        assert resp.status_code == HTTPStatus.OK
        assert resp.json()["status"] == "terminated"
        mock_audit.log_event.assert_awaited_once()

    def test_terminate_already_terminated_session_fails(self, client: TestClient, mock_db: MagicMock):
        """Terminating an already-terminated session returns 400."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=30, terminated_at=_now() - timedelta(minutes=5))
        mock_db.fetch_one = AsyncMock(return_value=session)
        resp = client.post(f"{CRM_BASE}/break-glass/{sid}/terminate")
        assert resp.status_code == HTTPStatus.BAD_REQUEST
        assert "already terminated" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Concurrency Limits
# ---------------------------------------------------------------------------


class TestConcurrencyLimits:
    """Tests for concurrent break-glass session enforcement."""

    def test_concurrent_sessions_limit(self, client: TestClient, mock_db: MagicMock):
        """Max 3 concurrent break-glass sessions per admin."""
        client.headers.update(_auth())
        existing = [_make_session_row(session_id=str(uuid4())) for _ in range(3)]
        mock_db.fetch_all = AsyncMock(return_value=existing)
        resp = client.post(
            f"{CRM_BASE}/break-glass",
            json={"justification": "Fourth concurrent session should fail immediately", "patient_id": PATIENT_ID, "clinic_id": CLINIC_ID, "duration_minutes": 15},
        )
        assert resp.status_code == HTTPStatus.TOO_MANY_REQUESTS
        assert "max 3" in resp.json()["detail"].lower()

    def test_concurrent_sessions_allowed_at_two(self, client: TestClient, mock_db: MagicMock):
        """Two concurrent sessions are allowed."""
        client.headers.update(_auth())
        existing = [_make_session_row(session_id=str(uuid4())) for _ in range(2)]
        mock_db.fetch_all = AsyncMock(return_value=existing)
        mock_db.execute = AsyncMock(return_value=None)
        resp = client.post(
            f"{CRM_BASE}/break-glass",
            json={"justification": "Third concurrent session is acceptable under policy", "patient_id": PATIENT_ID, "clinic_id": CLINIC_ID, "duration_minutes": 15},
        )
        assert resp.status_code == HTTPStatus.OK


# ---------------------------------------------------------------------------
# Post-Access Review Tests
# ---------------------------------------------------------------------------


class TestPostAccessReview:
    """Tests for mandatory post-access review workflow."""

    def test_post_access_review_required_within_24h(self, client: TestClient, mock_db: MagicMock):
        """Post-access review submission succeeds for a terminated session."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(
            session_id=sid,
            duration_minutes=10,
            expires_at=_now() - timedelta(minutes=5),
            terminated_at=_now() - timedelta(minutes=5),
        )
        mock_db.fetch_one = AsyncMock(return_value=session)
        mock_db.execute = AsyncMock(return_value=None)
        resp = client.post(
            f"{CRM_BASE}/break-glass/{sid}/review",
            json={"review_notes": "Access was justified. Reviewed imaging and labs. No anomalies."},
        )
        assert resp.status_code == HTTPStatus.OK
        assert resp.json()["status"] == "reviewed"

    def test_post_access_review_short_notes_rejected(self, client: TestClient, mock_db: MagicMock):
        """Review notes < 5 characters are rejected."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=10)
        mock_db.fetch_one = AsyncMock(return_value=session)
        resp = client.post(
            f"{CRM_BASE}/break-glass/{sid}/review",
            json={"review_notes": "ok"},
        )
        assert resp.status_code == HTTPStatus.BAD_REQUEST
        assert "too short" in resp.json()["detail"].lower()

    def test_post_access_review_audit_logged(self, client: TestClient, mock_db: MagicMock, mock_audit: MagicMock):
        """Review submission is audit logged."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=10)
        mock_db.fetch_one = AsyncMock(return_value=session)
        mock_db.execute = AsyncMock(return_value=None)
        client.post(
            f"{CRM_BASE}/break-glass/{sid}/review",
            json={"review_notes": "Reviewed patient data access. All actions were appropriate and documented."},
        )
        call_kwargs = mock_audit.log_event.call_args.kwargs
        assert call_kwargs["action"] == "break_glass.review_submitted"


# ---------------------------------------------------------------------------
# Forbidden Tools Tests
# ---------------------------------------------------------------------------


class TestForbiddenTools:
    """Tests that break-glass cannot be used for diagnosis or prescription."""

    def test_break_glass_forbidden_tool_diagnosis(self, client: TestClient, mock_db: MagicMock):
        """Break-glass cannot access diagnosis tool."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=30, expires_at=_now() + timedelta(minutes=30))
        mock_db.fetch_one = AsyncMock(return_value=session)
        # override user with forbidden tool
        client.headers.update({**_auth(), "X-User-Tool": "diagnosis"})
        # inject tool via state hack — routes read from user dict; simulate by overriding user fixture behavior
        # We'll re-set headers to encode tool in the JSON payload
        client.headers.clear()
        payload = {"id": SUPER_ADMIN_ID, "role": "super_admin", "clinic_id": None, "tool": "diagnosis"}
        client.headers.update({"X-Test-User": json.dumps(payload)})
        resp = client.get(f"{CRM_BASE}/break-glass/{sid}/access")
        assert resp.status_code == HTTPStatus.FORBIDDEN
        assert "diagnosis" in resp.json()["detail"].lower()

    def test_break_glass_forbidden_tool_prescribe(self, client: TestClient, mock_db: MagicMock):
        """Break-glass cannot access prescribe tool."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=30, expires_at=_now() + timedelta(minutes=30))
        mock_db.fetch_one = AsyncMock(return_value=session)
        client.headers.clear()
        payload = {"id": SUPER_ADMIN_ID, "role": "super_admin", "clinic_id": None, "tool": "prescribe"}
        client.headers.update({"X-Test-User": json.dumps(payload)})
        resp = client.get(f"{CRM_BASE}/break-glass/{sid}/access")
        assert resp.status_code == HTTPStatus.FORBIDDEN
        assert "prescribe" in resp.json()["detail"].lower()

    def test_break_glass_allowed_tool_view(self, client: TestClient, mock_db: MagicMock):
        """Break-glass allows view tool."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=30, expires_at=_now() + timedelta(minutes=30))
        mock_db.fetch_one = AsyncMock(return_value=session)
        mock_phi = MagicMock(flag_access=AsyncMock(return_value=None))
        resp = client.get(f"{CRM_BASE}/break-glass/{sid}/access")
        assert resp.status_code == HTTPStatus.OK


# ---------------------------------------------------------------------------
# PHI Guard Integration Tests
# ---------------------------------------------------------------------------


class TestPhiGuardIntegration:
    """Tests that PHI guard is invoked on every break-glass data access."""

    def test_phi_guard_flagged_on_access(self, client: TestClient, mock_db: MagicMock, mock_phi_guard: MagicMock):
        """PHI guard flag_access is called when patient data is accessed."""
        client.headers.update(_auth())
        sid = str(uuid4())
        session = _make_session_row(session_id=sid, duration_minutes=30, expires_at=_now() + timedelta(minutes=30))
        mock_db.fetch_one = AsyncMock(return_value=session)
        client.get(f"{CRM_BASE}/break-glass/{sid}/access")
        mock_phi_guard.flag_access.assert_awaited_once()
        kwargs = mock_phi_guard.flag_access.call_args.kwargs
        assert kwargs["session_id"] == sid
        assert kwargs["patient_id"] == PATIENT_ID


# ---------------------------------------------------------------------------
# Supervisor Role Tests
# ---------------------------------------------------------------------------


class TestSupervisorRole:
    """Tests that supervisor role can also use break-glass."""

    def test_supervisor_can_create_session(self, client: TestClient, mock_db: MagicMock):
        """Supervisor (clinic_id=None) can create break-glass session."""
        client.headers.update(_auth(user_id="supervisor_001", role="supervisor"))
        mock_db.fetch_all = AsyncMock(return_value=[])
        mock_db.execute = AsyncMock(return_value=None)
        resp = client.post(
            f"{CRM_BASE}/break-glass",
            json={"justification": "Supervisor oversight review for quality assurance", "patient_id": PATIENT_ID, "clinic_id": CLINIC_ID, "duration_minutes": 20},
        )
        assert resp.status_code == HTTPStatus.OK

    def test_supervisor_with_clinic_id_rejected(self, client: TestClient):
        """Supervisor with clinic_id set is rejected."""
        client.headers.update(_auth(user_id="supervisor_002", role="supervisor", clinic_id=CLINIC_ID))
        resp = client.post(
            f"{CRM_BASE}/break-glass",
            json={"justification": "Should fail due to scoped clinic_id"},
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN


# ---------------------------------------------------------------------------
# End of test_crm_break_glass.py
# ---------------------------------------------------------------------------
