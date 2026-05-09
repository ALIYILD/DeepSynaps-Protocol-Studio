"""Unit tests for app.services.deeptwin_dashboard_audit.

DB is fully mocked — tests verify action constants, note formatting,
and that the session is always closed (even on create_audit_event error).
"""

from __future__ import annotations

from unittest.mock import MagicMock, call, patch

import pytest

from app.services.deeptwin_dashboard_audit import (
    ACTION_DASHBOARD_OPENED,
    DEEPTWIN_DASHBOARD_TARGET_TYPE,
    log_dashboard_opened,
)


# ── constants ─────────────────────────────────────────────────────────────────

def test_target_type_constant():
    assert DEEPTWIN_DASHBOARD_TARGET_TYPE == "deeptwin_dashboard"


def test_action_constant_within_32_chars():
    """AuditEventRecord.action is String(32) — constant must not overflow."""
    assert len(ACTION_DASHBOARD_OPENED) <= 32


# ── log_dashboard_opened ──────────────────────────────────────────────────────

@patch("app.services.deeptwin_dashboard_audit.create_audit_event")
@patch("app.services.deeptwin_dashboard_audit.SessionLocal")
def test_log_dashboard_opened_calls_create_audit(mock_session_local, mock_create):
    db = MagicMock()
    mock_session_local.return_value = db

    log_dashboard_opened(
        patient_id="pat-1",
        actor_id="clin-99",
        role="clinician",
    )

    mock_create.assert_called_once()
    kwargs = mock_create.call_args.kwargs
    assert kwargs["target_id"] == "pat-1"
    assert kwargs["target_type"] == DEEPTWIN_DASHBOARD_TARGET_TYPE
    assert kwargs["action"] == ACTION_DASHBOARD_OPENED
    assert kwargs["role"] == "clinician"
    assert kwargs["actor_id"] == "clin-99"


@patch("app.services.deeptwin_dashboard_audit.create_audit_event")
@patch("app.services.deeptwin_dashboard_audit.SessionLocal")
def test_log_dashboard_opened_session_always_closed(mock_session_local, mock_create):
    db = MagicMock()
    mock_session_local.return_value = db
    mock_create.side_effect = RuntimeError("DB error")

    with pytest.raises(RuntimeError):
        log_dashboard_opened(patient_id="pat-2", actor_id="clin-1", role="clinician")

    db.close.assert_called_once()


@patch("app.services.deeptwin_dashboard_audit.create_audit_event")
@patch("app.services.deeptwin_dashboard_audit.SessionLocal")
def test_log_dashboard_opened_note_contains_action_name(mock_session_local, mock_create):
    db = MagicMock()
    mock_session_local.return_value = db

    log_dashboard_opened(patient_id="pat-3", actor_id="clin-2", role="admin", note="context info")
    kwargs = mock_create.call_args.kwargs
    assert "deeptwin.dashboard.opened" in kwargs["note"]


@patch("app.services.deeptwin_dashboard_audit.create_audit_event")
@patch("app.services.deeptwin_dashboard_audit.SessionLocal")
def test_log_dashboard_opened_patient_id_truncated(mock_session_local, mock_create):
    db = MagicMock()
    mock_session_local.return_value = db
    long_id = "x" * 200

    log_dashboard_opened(patient_id=long_id, actor_id="clin-1", role="clinician")
    kwargs = mock_create.call_args.kwargs
    assert len(kwargs["target_id"]) <= 64


@patch("app.services.deeptwin_dashboard_audit.create_audit_event")
@patch("app.services.deeptwin_dashboard_audit.SessionLocal")
def test_log_dashboard_opened_actor_id_truncated(mock_session_local, mock_create):
    db = MagicMock()
    mock_session_local.return_value = db
    long_actor = "a" * 200

    log_dashboard_opened(patient_id="pat-1", actor_id=long_actor, role="clinician")
    kwargs = mock_create.call_args.kwargs
    assert len(kwargs["actor_id"]) <= 64


@patch("app.services.deeptwin_dashboard_audit.create_audit_event")
@patch("app.services.deeptwin_dashboard_audit.SessionLocal")
def test_log_dashboard_opened_role_truncated(mock_session_local, mock_create):
    db = MagicMock()
    mock_session_local.return_value = db
    long_role = "r" * 100

    log_dashboard_opened(patient_id="pat-1", actor_id="clin-1", role=long_role)
    kwargs = mock_create.call_args.kwargs
    assert len(kwargs["role"]) <= 32


@patch("app.services.deeptwin_dashboard_audit.create_audit_event")
@patch("app.services.deeptwin_dashboard_audit.SessionLocal")
def test_log_dashboard_opened_created_at_is_iso_string(mock_session_local, mock_create):
    db = MagicMock()
    mock_session_local.return_value = db

    log_dashboard_opened(patient_id="pat-4", actor_id="clin-3", role="clinician")
    kwargs = mock_create.call_args.kwargs
    # created_at must be a valid ISO 8601 string
    assert isinstance(kwargs["created_at"], str)
    assert "T" in kwargs["created_at"]
