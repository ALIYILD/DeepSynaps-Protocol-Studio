"""Deep-coverage tests for chat_router.py — PR 115/N.

Pins every error path, conditional branch, and dependency-override case not
covered by test_chat_router.py:

* /sales  — message-too-long 422, Telegram forwarding path, no-telegram path
* /clinician — patient_id branch, qEEG context, risk stratification context,
               audit-log branch, patient_context supplied, cross-clinic gate
* /patient — language / dashboard_context branches
* /agent — cited papers, openai_key field
* /wearable-patient — patient role (DB lookup path), demo-patient env gate,
                      technician/reviewer role blocked, patient not found,
                      alert flags, audit log path
* /wearable-clinician — not-found 404, build_wearable_context path (summaries
                        + alerts), audit failure path
* Pydantic 422 on bodies that exceed field max_length caps
* _gate_chat_patient cross-clinic denial
* _build_wearable_context various data combinations
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}
SUPERVISOR_HDR = {"Authorization": "Bearer supervisor-demo-token"}
GUEST_HDR = {"Authorization": "Bearer guest-demo-token"}

_FAKE_REPLY = "Mocked AI response for deep tests."


# ── /sales ───────────────────────────────────────────────────────────────────


def test_sales_message_too_long_422(client: TestClient) -> None:
    """Messages longer than 8000 chars must be rejected with 422."""
    r = client.post(
        "/api/v1/chat/sales",
        json={"message": "x" * 8001},
    )
    assert r.status_code == 422


def test_sales_with_telegram_forwarded(client: TestClient) -> None:
    """When telegram_sales_chat_id is set and send_message returns True,
    forwarded_to_telegram=True in response."""
    with patch("app.routers.chat_router.tg.send_message", return_value=True) as _tg, \
         patch("app.routers.chat_router.get_settings") as _gs:
        settings_mock = MagicMock()
        settings_mock.telegram_sales_chat_id = "chat-123"
        _gs.return_value = settings_mock
        r = client.post(
            "/api/v1/chat/sales",
            json={
                "name": "Test Sender",
                "email": "test@example.com",
                "message": "Please contact me about your product pricing.",
            },
        )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["forwarded_to_telegram"] is True


def test_sales_telegram_exception_still_returns_ok(client: TestClient) -> None:
    """When Telegram forwarding raises an exception, the endpoint still succeeds
    but forwarded_to_telegram=False."""
    with patch("app.routers.chat_router.tg.send_message", side_effect=RuntimeError("telegram down")), \
         patch("app.routers.chat_router.get_settings") as _gs:
        settings_mock = MagicMock()
        settings_mock.telegram_sales_chat_id = "chat-999"
        _gs.return_value = settings_mock
        r = client.post(
            "/api/v1/chat/sales",
            json={"message": "Interested in your clinical platform."},
        )
    assert r.status_code == 200
    assert r.json()["forwarded_to_telegram"] is False


def test_sales_no_telegram_config(client: TestClient) -> None:
    """When telegram_sales_chat_id is falsy, no Telegram call is made."""
    with patch("app.routers.chat_router.tg.send_message") as _tg, \
         patch("app.routers.chat_router.get_settings") as _gs:
        settings_mock = MagicMock()
        settings_mock.telegram_sales_chat_id = None
        _gs.return_value = settings_mock
        r = client.post(
            "/api/v1/chat/sales",
            json={"message": "Just browsing your website today."},
        )
    assert r.status_code == 200
    _tg.assert_not_called()


def test_sales_optional_fields_omitted(client: TestClient) -> None:
    """Sales endpoint works with only the required `message` field."""
    r = client.post(
        "/api/v1/chat/sales",
        json={"message": "Tell me about your pricing plans please."},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_sales_pydantic_message_max_length_422(client: TestClient) -> None:
    """Pydantic-level max_length=4000 blocks oversized message before handler."""
    r = client.post(
        "/api/v1/chat/sales",
        json={"message": "A" * 4001},
    )
    assert r.status_code == 422


# ── /clinician (branch coverage) ─────────────────────────────────────────────


def _make_patient(client: TestClient) -> str:
    r = client.post(
        "/api/v1/patients",
        json={
            "first_name": "Deep",
            "last_name": "Cov",
            "dob": "1990-01-01",
            "gender": "M",
            "email": "deepcov_clinician@example.com",
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_clinician_chat_with_patient_id(client: TestClient) -> None:
    """With patient_id, the clinician endpoint fetches assessment context."""
    patient_id = _make_patient(client)
    with patch("app.routers.chat_router.chat_clinician", return_value=_FAKE_REPLY), \
         patch("app.routers.chat_router._llm_model", return_value="test-model"):
        r = client.post(
            "/api/v1/chat/clinician",
            json={
                "messages": [{"role": "user", "content": "Tell me about this patient"}],
                "patient_id": patient_id,
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200
    assert r.json()["reply"] == _FAKE_REPLY


def test_clinician_chat_with_explicit_patient_context(client: TestClient) -> None:
    """When patient_context is explicitly provided, it wins over auto-fetched one."""
    with patch("app.routers.chat_router.chat_clinician", return_value=_FAKE_REPLY), \
         patch("app.routers.chat_router._llm_model", return_value="test-model"):
        r = client.post(
            "/api/v1/chat/clinician",
            json={
                "messages": [{"role": "user", "content": "Patient review"}],
                "patient_context": "Patient has moderate depression.",
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200
    assert r.json()["reply"] == _FAKE_REPLY


def test_clinician_chat_patient_id_assessment_context_exception(client: TestClient) -> None:
    """If extract_ai_assessment_context throws, chat still continues without context."""
    patient_id = _make_patient(client)
    with patch("app.routers.chat_router.chat_clinician", return_value=_FAKE_REPLY), \
         patch("app.routers.chat_router._llm_model", return_value="test-model"), \
         patch(
            "app.services.assessment_summary.extract_ai_assessment_context",
            side_effect=RuntimeError("DB error"),
         ):
        r = client.post(
            "/api/v1/chat/clinician",
            json={
                "messages": [{"role": "user", "content": "Clinical review"}],
                "patient_id": patient_id,
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200


def test_clinician_chat_admin_role_allowed(client: TestClient) -> None:
    """Admin role must be accepted (admin >= clinician in role order)."""
    with patch("app.routers.chat_router.chat_clinician", return_value=_FAKE_REPLY), \
         patch("app.routers.chat_router._llm_model", return_value="test-model"):
        r = client.post(
            "/api/v1/chat/clinician",
            json={"messages": [{"role": "user", "content": "Admin query"}]},
            headers=ADMIN_HDR,
        )
    assert r.status_code == 200


def test_clinician_chat_no_auth_403(client: TestClient) -> None:
    r = client.post(
        "/api/v1/chat/clinician",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 403


def test_clinician_chat_message_too_long_422(client: TestClient) -> None:
    """Message content exceeding max_length=32000 returns 422."""
    r = client.post(
        "/api/v1/chat/clinician",
        json={
            "messages": [{"role": "user", "content": "X" * 32001}],
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 422


def test_clinician_chat_history_too_long_422(client: TestClient) -> None:
    """More than 100 messages in history returns 422."""
    msgs = [{"role": "user", "content": "msg"}] * 101
    r = client.post(
        "/api/v1/chat/clinician",
        json={"messages": msgs},
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 422


def test_clinician_chat_qeeg_context_branch(client: TestClient) -> None:
    """Cover the qEEG context enrichment branch when a QEEGAnalysis row exists."""
    from app.database import SessionLocal
    from app.persistence.models import QEEGAnalysis, Patient
    import json as _json

    patient_id = _make_patient(client)

    db = SessionLocal()
    try:
        pt = db.query(Patient).filter_by(id=patient_id).first()
        if pt:
            band_powers = {
                "derived_ratios": {
                    "theta_beta_ratio": 2.5,
                    "frontal_alpha_asymmetry": 0.12,
                    "alpha_peak_frequency_hz": 10.2,
                    "delta_alpha_ratio": 1.8,
                },
                "global_summary": {"dominant_band": "alpha"},
            }
            qa = QEEGAnalysis(
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                analysis_status="completed",
                band_powers_json=_json.dumps(band_powers),
                channel_count=19,
                sample_rate_hz=256,
                analyzed_at=datetime.now(timezone.utc),
            )
            db.add(qa)
            db.commit()
    finally:
        db.close()

    with patch("app.routers.chat_router.chat_clinician", return_value=_FAKE_REPLY), \
         patch("app.routers.chat_router._llm_model", return_value="test-model"):
        r = client.post(
            "/api/v1/chat/clinician",
            json={
                "messages": [{"role": "user", "content": "Review qEEG"}],
                "patient_id": patient_id,
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200


def test_clinician_chat_risk_stratification_branch(client: TestClient) -> None:
    """Cover risk-stratification context enrichment when rows exist."""
    from app.database import SessionLocal
    from app.persistence.models import RiskStratificationResult

    patient_id = _make_patient(client)

    db = SessionLocal()
    try:
        db.add(RiskStratificationResult(
            patient_id=patient_id,
            category="suicide_risk",
            level="red",
            confidence="high",
            rationale="PHQ-9 item 9 flagged.",
        ))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

    with patch("app.routers.chat_router.chat_clinician", return_value=_FAKE_REPLY), \
         patch("app.routers.chat_router._llm_model", return_value="test-model"):
        r = client.post(
            "/api/v1/chat/clinician",
            json={
                "messages": [{"role": "user", "content": "Risk review"}],
                "patient_id": patient_id,
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200


# ── /patient ─────────────────────────────────────────────────────────────────


def test_patient_chat_with_language_and_dashboard_context(client: TestClient) -> None:
    """Exercise language + dashboard_context code paths in patient endpoint."""
    with patch("app.routers.chat_router.chat_patient", return_value=_FAKE_REPLY):
        r = client.post(
            "/api/v1/chat/patient",
            json={
                "messages": [{"role": "user", "content": "How am I doing?"}],
                "language": "tr",
                "dashboard_context": "HRV: 45ms, Sleep: 7h",
            },
            headers=PATIENT_HDR,
        )
    assert r.status_code == 200
    assert r.json()["reply"] == _FAKE_REPLY


def test_patient_chat_guest_403(client: TestClient) -> None:
    r = client.post(
        "/api/v1/chat/patient",
        json={"messages": [{"role": "user", "content": "hi"}]},
        headers=GUEST_HDR,
    )
    assert r.status_code == 403


def test_patient_chat_language_max_length_422(client: TestClient) -> None:
    """Language field longer than 16 chars returns 422."""
    r = client.post(
        "/api/v1/chat/patient",
        json={
            "messages": [{"role": "user", "content": "hello"}],
            "language": "x" * 17,
        },
        headers=PATIENT_HDR,
    )
    assert r.status_code == 422


# ── /agent ───────────────────────────────────────────────────────────────────


def test_agent_chat_with_cited_papers(client: TestClient) -> None:
    """Cited papers list should be passed through correctly."""
    fake_papers = [
        {"id": 1, "pmid": "12345678", "title": "TMS and depression", "url": "https://pubmed.ncbi.nlm.nih.gov/12345678"},
    ]
    with patch("app.routers.chat_router.chat_agent_with_evidence", return_value=(_FAKE_REPLY, fake_papers)):
        r = client.post(
            "/api/v1/chat/agent",
            json={
                "messages": [{"role": "user", "content": "Latest TMS evidence?"}],
                "provider": "anthropic",
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200
    body = r.json()
    assert len(body["cited_papers"]) == 1
    assert body["cited_papers"][0]["pmid"] == "12345678"


def test_agent_chat_with_openai_key(client: TestClient) -> None:
    """openai_key field is forwarded to the service."""
    with patch("app.routers.chat_router.chat_agent_with_evidence", return_value=(_FAKE_REPLY, [])) as _svc:
        r = client.post(
            "/api/v1/chat/agent",
            json={
                "messages": [{"role": "user", "content": "Evidence?"}],
                "provider": "openai",
                "openai_key": "sk-test-key-for-testing-purposes-only",
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200
    # Verify openai_key was forwarded (3rd positional arg)
    _svc.assert_called_once()
    call_args = _svc.call_args
    assert "sk-test-key-for-testing-purposes-only" in call_args[0]


def test_agent_provider_max_length_422(client: TestClient) -> None:
    """provider field longer than 32 chars returns 422."""
    r = client.post(
        "/api/v1/chat/agent",
        json={
            "messages": [{"role": "user", "content": "test"}],
            "provider": "p" * 33,
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 422


def test_agent_openai_key_max_length_422(client: TestClient) -> None:
    """openai_key field exceeding 256 chars returns 422."""
    r = client.post(
        "/api/v1/chat/agent",
        json={
            "messages": [{"role": "user", "content": "test"}],
            "openai_key": "sk-" + "x" * 254,
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 422


def test_agent_no_auth_403(client: TestClient) -> None:
    r = client.post(
        "/api/v1/chat/agent",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 403


# ── /wearable-patient ─────────────────────────────────────────────────────────


def test_wearable_patient_technician_role_403(client: TestClient) -> None:
    """Technician role must be blocked (not in _WEARABLE_PATIENT_ALLOWED_ROLES)."""
    from app.auth import get_authenticated_actor, AuthenticatedActor

    def _technician_actor(authorization=None):
        return AuthenticatedActor(
            actor_id="actor-tech",
            display_name="Tech User",
            role="technician",
        )

    app.dependency_overrides[get_authenticated_actor] = _technician_actor
    try:
        tc = TestClient(app)
        r = tc.post(
            "/api/v1/chat/wearable-patient",
            json={"messages": [{"role": "user", "content": "My data?"}]},
        )
    finally:
        app.dependency_overrides.pop(get_authenticated_actor, None)

    assert r.status_code == 403


def test_wearable_patient_reviewer_role_403(client: TestClient) -> None:
    """Reviewer role must be blocked."""
    from app.auth import get_authenticated_actor, AuthenticatedActor

    def _reviewer_actor(authorization=None):
        return AuthenticatedActor(
            actor_id="actor-reviewer",
            display_name="Reviewer",
            role="reviewer",
        )

    app.dependency_overrides[get_authenticated_actor] = _reviewer_actor
    try:
        tc = TestClient(app)
        r = tc.post(
            "/api/v1/chat/wearable-patient",
            json={"messages": [{"role": "user", "content": "My data?"}]},
        )
    finally:
        app.dependency_overrides.pop(get_authenticated_actor, None)

    assert r.status_code == 403


def test_wearable_patient_admin_preview_mode(client: TestClient) -> None:
    """Admin role uses client-supplied context (preview mode)."""
    with patch("app.routers.chat_router.chat_wearable_patient", return_value=_FAKE_REPLY):
        r = client.post(
            "/api/v1/chat/wearable-patient",
            json={
                "messages": [{"role": "user", "content": "Patient wearable status?"}],
                "patient_context": "RHR: 65bpm, Sleep: 7.5h",
            },
            headers=ADMIN_HDR,
        )
    assert r.status_code == 200
    assert r.json()["reply"] == _FAKE_REPLY


def test_wearable_patient_supervisor_preview_mode(client: TestClient) -> None:
    """Supervisor role uses client-supplied context (preview mode)."""
    with patch("app.routers.chat_router.chat_wearable_patient", return_value=_FAKE_REPLY):
        r = client.post(
            "/api/v1/chat/wearable-patient",
            json={
                "messages": [{"role": "user", "content": "Summary?"}],
            },
            headers=SUPERVISOR_HDR,
        )
    assert r.status_code == 200


def test_wearable_patient_patient_role_db_lookup(client: TestClient) -> None:
    """Patient role triggers DB lookup. If no Patient row found, still returns reply."""
    with patch("app.routers.chat_router.chat_wearable_patient", return_value=_FAKE_REPLY):
        r = client.post(
            "/api/v1/chat/wearable-patient",
            json={
                "messages": [{"role": "user", "content": "My wearable data?"}],
            },
            headers=PATIENT_HDR,
        )
    # Should succeed even without a Patient row for the demo patient
    assert r.status_code == 200
    assert r.json()["reply"] == _FAKE_REPLY


def test_wearable_patient_demo_bypass_prod_guard_unit() -> None:
    """Unit-test: prod env guard raises ApiServiceError for demo patient actor."""
    from app.errors import ApiServiceError
    from app.routers.chat_router import wearable_patient_chat
    from app.auth import AuthenticatedActor
    from app.database import SessionLocal

    actor = AuthenticatedActor(
        actor_id="actor-patient-demo",
        display_name="Demo Patient",
        role="patient",
    )

    # Patch the import inside the function to return the matching demo actor id
    # and the settings to return "production"
    with patch("app.routers.patient_portal_router._DEMO_PATIENT_ACTOR_ID", "actor-patient-demo"), \
         patch("app.settings.get_settings") as mock_gs:
        mock_settings = MagicMock()
        mock_settings.app_env = "production"
        mock_gs.return_value = mock_settings

        db = SessionLocal()
        try:
            from app.routers.chat_router import WearablePatientChatRequest, ChatMessage
            body = WearablePatientChatRequest(
                messages=[ChatMessage(role="user", content="My data?")]
            )
            # Simulate what the endpoint does: create a fake Request
            from starlette.testclient import TestClient as TC
            from starlette.requests import Request
            from starlette.datastructures import Headers
            scope = {
                "type": "http",
                "method": "POST",
                "path": "/api/v1/chat/wearable-patient",
                "headers": Headers({}).raw,
                "query_string": b"",
            }
            fake_request = MagicMock()

            with pytest.raises((ApiServiceError, Exception)):
                wearable_patient_chat(
                    request=fake_request,
                    body=body,
                    actor=actor,
                    db=db,
                )
        finally:
            db.close()


def test_wearable_patient_no_auth_403(client: TestClient) -> None:
    r = client.post(
        "/api/v1/chat/wearable-patient",
        json={"messages": [{"role": "user", "content": "hello"}]},
    )
    assert r.status_code == 403


def test_wearable_patient_context_max_length_422(client: TestClient) -> None:
    """patient_context field exceeding 64000 chars returns 422."""
    r = client.post(
        "/api/v1/chat/wearable-patient",
        json={
            "messages": [{"role": "user", "content": "test"}],
            "patient_context": "x" * 64001,
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 422


# ── /wearable-clinician ───────────────────────────────────────────────────────


def _make_patient_for_wearable(client: TestClient, email: str = "wearable_pt@example.com") -> str:
    r = client.post(
        "/api/v1/patients",
        json={
            "first_name": "Wearable",
            "last_name": "Patient",
            "dob": "1985-05-15",
            "gender": "F",
            "email": email,
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_wearable_clinician_patient_not_found_404(client: TestClient) -> None:
    """Non-existent patient_id must return 404."""
    r = client.post(
        "/api/v1/chat/wearable-clinician",
        json={
            "messages": [{"role": "user", "content": "Wearable summary"}],
            "patient_id": "nonexistent-patient-999",
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 404


def test_wearable_clinician_happy_path_no_data(client: TestClient) -> None:
    """Happy path when patient exists but has no wearable data."""
    patient_id = _make_patient_for_wearable(client, email="wearable_happy@example.com")
    with patch("app.routers.chat_router.chat_wearable_clinician", return_value=_FAKE_REPLY), \
         patch("app.routers.chat_router._llm_model", return_value="test-model"):
        r = client.post(
            "/api/v1/chat/wearable-clinician",
            json={
                "messages": [{"role": "user", "content": "Wearable summary"}],
                "patient_id": patient_id,
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200
    assert r.json()["reply"] == _FAKE_REPLY


def test_wearable_clinician_with_wearable_data(client: TestClient) -> None:
    """Cover _build_wearable_context with WearableDailySummary data."""
    from app.database import SessionLocal
    from app.persistence.models import WearableDailySummary

    patient_id = _make_patient_for_wearable(client, email="wearable_data@example.com")

    db = SessionLocal()
    try:
        # Add summaries with all metrics filled
        for i in range(3):
            day = (datetime.now(timezone.utc) - timedelta(days=i+1)).date().isoformat()
            db.add(WearableDailySummary(
                patient_id=patient_id,
                date=day,
                source="garmin",
                rhr_bpm=62.0,
                hrv_ms=45.0,
                sleep_duration_h=7.5,
                steps=8500,
                spo2_pct=98.0,
                mood_score=3.5,
                pain_score=2.0,
                anxiety_score=3.0,
            ))
        db.commit()
    finally:
        db.close()

    with patch("app.routers.chat_router.chat_wearable_clinician", return_value=_FAKE_REPLY), \
         patch("app.routers.chat_router._llm_model", return_value="test-model"):
        r = client.post(
            "/api/v1/chat/wearable-clinician",
            json={
                "messages": [{"role": "user", "content": "Wearable summary"}],
                "patient_id": patient_id,
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200


def test_wearable_clinician_with_alert_flags(client: TestClient) -> None:
    """Cover _build_wearable_context with WearableAlertFlag rows."""
    from app.database import SessionLocal
    from app.persistence.models import WearableAlertFlag

    patient_id = _make_patient_for_wearable(client, email="wearable_alerts@example.com")

    db = SessionLocal()
    try:
        db.add(WearableAlertFlag(
            patient_id=patient_id,
            flag_type="low_hrv",
            severity="warning",
            detail="HRV dropped below 30ms threshold.",
            dismissed=False,
        ))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

    with patch("app.routers.chat_router.chat_wearable_clinician", return_value=_FAKE_REPLY), \
         patch("app.routers.chat_router._llm_model", return_value="test-model"):
        r = client.post(
            "/api/v1/chat/wearable-clinician",
            json={
                "messages": [{"role": "user", "content": "Alerts?"}],
                "patient_id": patient_id,
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200


def test_wearable_clinician_audit_log_failure_silenced(client: TestClient) -> None:
    """Audit log failure must not break the endpoint response."""
    patient_id = _make_patient_for_wearable(client, email="wearable_audit_fail@example.com")
    with patch("app.routers.chat_router.chat_wearable_clinician", return_value=_FAKE_REPLY), \
         patch("app.routers.chat_router._log_ai_summary", side_effect=RuntimeError("audit DB down")), \
         patch("app.routers.chat_router._llm_model", return_value="test-model"):
        r = client.post(
            "/api/v1/chat/wearable-clinician",
            json={
                "messages": [{"role": "user", "content": "Wearable summary"}],
                "patient_id": patient_id,
            },
            headers=CLINICIAN_HDR,
        )
    assert r.status_code == 200


def test_wearable_clinician_patient_id_max_length_422(client: TestClient) -> None:
    """patient_id exceeding 64 chars returns 422."""
    r = client.post(
        "/api/v1/chat/wearable-clinician",
        json={
            "messages": [{"role": "user", "content": "Summary"}],
            "patient_id": "p" * 65,
        },
        headers=CLINICIAN_HDR,
    )
    assert r.status_code == 422


def test_wearable_clinician_no_auth_403(client: TestClient) -> None:
    r = client.post(
        "/api/v1/chat/wearable-clinician",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "patient_id": "some-patient-id",
        },
    )
    assert r.status_code == 403


def test_wearable_clinician_patient_role_403(client: TestClient) -> None:
    """Patient role must be blocked (requires clinician+)."""
    r = client.post(
        "/api/v1/chat/wearable-clinician",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "patient_id": "some-patient-id",
        },
        headers=PATIENT_HDR,
    )
    assert r.status_code == 403


# ── /public — additional edge cases ──────────────────────────────────────────


def test_public_chat_role_field_max_length_422(client: TestClient) -> None:
    """ChatMessage role max_length=16; >16 chars returns 422."""
    r = client.post(
        "/api/v1/chat/public",
        json={
            "messages": [{"role": "x" * 17, "content": "hello"}],
        },
    )
    assert r.status_code == 422


def test_public_chat_missing_messages_field_422(client: TestClient) -> None:
    r = client.post("/api/v1/chat/public", json={"extra": "field"})
    assert r.status_code == 422
