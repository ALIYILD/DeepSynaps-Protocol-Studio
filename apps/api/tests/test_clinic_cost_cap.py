"""Tests for Phase 9 — per-clinic monthly cost cap.

Covers:

* The :func:`month_to_date_spend_pence` aggregator: empty table → 0,
  multiple rows summed correctly, last-month rows excluded, other-clinic
  rows excluded.
* :func:`check_cap` behaviour for the three configurations: no row,
  ``cap_pence == 0`` (disabled), ``cap_pence > 0`` and over-cap.
* Runner integration — the LLM is NEVER called when the cap is reached.
* Router endpoints — admin role gate, GET/PUT round-trip, and Pydantic
  rejection of negative input.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor
from app.database import SessionLocal
from app.persistence.models import (
    AgentRunAudit,
    Clinic,
    ClinicMonthlyCostCap,
)
from app.services.agents import cost_cap, runner as agent_runner
from app.services.agents.registry import AGENT_REGISTRY


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def clinician_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-clinician-demo",
        display_name="Verified Clinician Demo",
        role="clinician",  # type: ignore[arg-type]
        package_id="clinician_pro",
        clinic_id="clinic-demo-default",
    )


def _seed_audit_row(
    db_session,
    *,
    clinic_id: str,
    cost_pence: int,
    created_at: datetime | None = None,
) -> None:
    """Insert one synthetic audit row.

    ``actor_id`` is left NULL — the FK uses ``ondelete="SET NULL"`` so a
    NULL value is valid and keeps the row out of any user-cascade
    cleanup.
    """
    row = AgentRunAudit(
        actor_id=None,
        clinic_id=clinic_id,
        agent_id="clinic.reception",
        message_preview="seed",
        reply_preview="seed",
        latency_ms=1,
        ok=True,
        tokens_in_used=0,
        tokens_out_used=0,
        cost_pence=cost_pence,
    )
    if created_at is not None:
        row.created_at = created_at
    db_session.add(row)
    db_session.commit()


def _ensure_clinic(db_session, clinic_id: str) -> None:
    if db_session.query(Clinic).filter_by(id=clinic_id).first() is None:
        db_session.add(Clinic(id=clinic_id, name=f"Clinic {clinic_id}"))
        db_session.commit()


# ---------------------------------------------------------------------------
# month_to_date_spend_pence
# ---------------------------------------------------------------------------


def test_mtd_spend_zero_when_audit_empty(db_session) -> None:
    assert cost_cap.month_to_date_spend_pence(db_session, "clinic-demo-default") == 0


def test_mtd_spend_sums_current_month_rows(db_session) -> None:
    _seed_audit_row(db_session, clinic_id="clinic-demo-default", cost_pence=150)
    _seed_audit_row(db_session, clinic_id="clinic-demo-default", cost_pence=200)
    assert cost_cap.month_to_date_spend_pence(db_session, "clinic-demo-default") == 350


def test_mtd_spend_excludes_prior_month_rows(db_session) -> None:
    """Rows whose ``created_at`` predates the current calendar month must
    not contribute to the running total."""
    _seed_audit_row(db_session, clinic_id="clinic-demo-default", cost_pence=100)
    # Stamp another row 60 days back — comfortably in a previous month
    # regardless of when this test runs in the calendar.
    last_month = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=60)
    _seed_audit_row(
        db_session,
        clinic_id="clinic-demo-default",
        cost_pence=999,
        created_at=last_month,
    )
    assert cost_cap.month_to_date_spend_pence(db_session, "clinic-demo-default") == 100


def test_mtd_spend_excludes_other_clinics(db_session) -> None:
    _ensure_clinic(db_session, "clinic-other")
    _seed_audit_row(db_session, clinic_id="clinic-demo-default", cost_pence=42)
    _seed_audit_row(db_session, clinic_id="clinic-other", cost_pence=999)
    assert cost_cap.month_to_date_spend_pence(db_session, "clinic-demo-default") == 42


# ---------------------------------------------------------------------------
# check_cap
# ---------------------------------------------------------------------------


def test_check_cap_with_no_row_is_ok(db_session) -> None:
    ok, spend, cap = cost_cap.check_cap(db_session, "clinic-demo-default")
    assert ok is True
    assert spend == 0
    assert cap == 0


def test_check_cap_with_zero_cap_is_disabled(db_session) -> None:
    db_session.add(
        ClinicMonthlyCostCap(clinic_id="clinic-demo-default", cap_pence=0)
    )
    db_session.commit()
    _seed_audit_row(db_session, clinic_id="clinic-demo-default", cost_pence=10_000)
    ok, spend, cap = cost_cap.check_cap(db_session, "clinic-demo-default")
    assert ok is True
    assert spend == 10_000
    # Disabled rows surface as cap=0 to the runner; the admin tile uses
    # this to render "no cap configured".
    assert cap == 0


def test_check_cap_blocks_when_spend_meets_or_exceeds_cap(db_session) -> None:
    db_session.add(
        ClinicMonthlyCostCap(clinic_id="clinic-demo-default", cap_pence=300)
    )
    db_session.commit()
    _seed_audit_row(db_session, clinic_id="clinic-demo-default", cost_pence=350)
    ok, spend, cap = cost_cap.check_cap(db_session, "clinic-demo-default")
    assert ok is False
    assert spend == 350
    assert cap == 300


def test_check_cap_allows_when_spend_below_cap(db_session) -> None:
    db_session.add(
        ClinicMonthlyCostCap(clinic_id="clinic-demo-default", cap_pence=500)
    )
    db_session.commit()
    _seed_audit_row(db_session, clinic_id="clinic-demo-default", cost_pence=100)
    ok, spend, cap = cost_cap.check_cap(db_session, "clinic-demo-default")
    assert ok is True
    assert spend == 100
    assert cap == 500


# ---------------------------------------------------------------------------
# Runner integration — gate fires before the LLM call
# ---------------------------------------------------------------------------


def test_runner_short_circuits_when_cap_reached(
    db_session,
    clinician_actor: AuthenticatedActor,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With ``cap=100`` and ``spend=200`` the runner returns the
    ``monthly_cost_cap_reached`` envelope and ``_llm_chat`` is never
    invoked."""
    calls: list[dict] = []

    def _capture(**kwargs):
        calls.append(kwargs)
        return "should-not-be-called"

    monkeypatch.setattr("app.services.chat_service._llm_chat", _capture)

    # Seed an over-cap clinic.
    db_session.add(
        ClinicMonthlyCostCap(clinic_id="clinic-demo-default", cap_pence=100)
    )
    db_session.commit()
    _seed_audit_row(db_session, clinic_id="clinic-demo-default", cost_pence=200)

    result = agent_runner.run_agent(
        AGENT_REGISTRY["clinic.reception"],
        message="Can you book a session?",
        actor=clinician_actor,
        db=db_session,
    )

    assert result["error"] == "monthly_cost_cap_reached"
    assert result["reply"] == ""
    assert result["cap_pence"] == 100
    assert result["spend_pence"] == 200
    # LLM must NOT have been called.
    assert calls == []


# ---------------------------------------------------------------------------
# Router — admin endpoints
# ---------------------------------------------------------------------------


def test_put_cost_cap_rejects_clinician(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.put(
        "/api/v1/agents/admin/cost-cap",
        headers=auth_headers["clinician"],
        json={"cap_pence": 1000},
    )
    assert resp.status_code == 403, resp.text


def test_put_then_get_cost_cap_round_trip(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """PUT 5000 as admin → GET surfaces 5000 + spend_pence_mtd = 0."""
    put_resp = client.put(
        "/api/v1/agents/admin/cost-cap",
        headers=auth_headers["admin"],
        json={"cap_pence": 5000},
    )
    assert put_resp.status_code == 200, put_resp.text
    body = put_resp.json()
    assert body["cap_pence"] == 5000
    assert body["currency"] == "GBP"
    assert body["spend_pence_mtd"] == 0

    get_resp = client.get(
        "/api/v1/agents/admin/cost-cap",
        headers=auth_headers["admin"],
    )
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["cap_pence"] == 5000


def test_put_cost_cap_rejects_negative_value(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.put(
        "/api/v1/agents/admin/cost-cap",
        headers=auth_headers["admin"],
        json={"cap_pence": -1},
    )
    # Pydantic ``ge=0`` rejection — 422 is the FastAPI default.
    assert resp.status_code == 422, resp.text
