"""Phase 12 — onboarding wizard funnel telemetry tests.

Covers both endpoints:

* ``POST /api/v1/onboarding/events`` — anonymous + authenticated paths,
  step-name validation.
* ``GET /api/v1/onboarding/funnel`` — admin gate, empty-table totals,
  conversion arithmetic, time-window filtering, and the ``days`` clamp.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import OnboardingEvent


# ─── POST /events ────────────────────────────────────────────────────────────


def test_post_event_anonymous_records_row_with_null_actor(
    client: TestClient,
) -> None:
    """No Authorization header → 201 + row persisted with NULL actor/clinic."""
    resp = client.post(
        "/api/v1/onboarding/events",
        json={"step": "started", "payload": {"source": "landing"}},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert isinstance(body["id"], int)
    assert "recorded_at" in body

    db = SessionLocal()
    try:
        row = db.query(OnboardingEvent).filter_by(id=body["id"]).first()
        assert row is not None
        assert row.step == "started"
        assert row.actor_id is None
        assert row.clinic_id is None
        # Payload was JSON-serialised through the helper.
        assert row.payload_json is not None
        assert "landing" in row.payload_json
    finally:
        db.close()


def test_post_event_unknown_step_returns_400(client: TestClient) -> None:
    """An unknown step name must be rejected at the API boundary."""
    resp = client.post(
        "/api/v1/onboarding/events",
        json={"step": "bogus", "payload": None},
    )
    assert resp.status_code == 400, resp.text
    body = resp.json()
    # ApiServiceError shape — flat ErrorResponse.
    assert body.get("code") == "invalid_onboarding_step"


def test_post_event_authenticated_clinician_populates_actor_and_clinic(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """A logged-in clinician's row carries their actor_id and clinic_id."""
    resp = client.post(
        "/api/v1/onboarding/events",
        json={"step": "package_selected", "payload": {"package_id": "solo"}},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()

    db = SessionLocal()
    try:
        row = db.query(OnboardingEvent).filter_by(id=body["id"]).first()
        assert row is not None
        assert row.actor_id == "actor-clinician-demo"
        assert row.clinic_id == "clinic-demo-default"
        assert row.step == "package_selected"
    finally:
        db.close()


# ─── GET /funnel — auth gate ─────────────────────────────────────────────────


def test_funnel_rejects_clinician(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """Non-admin actors cannot read the funnel summary."""
    resp = client.get(
        "/api/v1/onboarding/funnel?days=7", headers=auth_headers["clinician"]
    )
    assert resp.status_code == 403, resp.text


def test_funnel_admin_empty_table_returns_zeros(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """With no events the totals dict is fully populated with zeros."""
    resp = client.get(
        "/api/v1/onboarding/funnel?days=7", headers=auth_headers["admin"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["since_days"] == 7
    totals = body["totals"]
    for step in (
        "started",
        "package_selected",
        "stripe_initiated",
        "stripe_skipped",
        "agents_enabled",
        "team_invited",
        "completed",
        "skipped",
    ):
        assert totals[step] == 0, f"expected 0 for {step}, got {totals[step]}"
    assert body["conversion"]["started_to_completed"] == 0.0
    assert body["conversion"]["started_to_skipped"] == 0.0


# ─── GET /funnel — aggregation arithmetic ────────────────────────────────────


def _seed_events(steps_with_offsets: list[tuple[str, timedelta]]) -> None:
    """Insert raw OnboardingEvent rows with explicit ``created_at`` offsets.

    Each tuple is ``(step, age_offset)`` where ``age_offset`` is subtracted
    from "now" to backdate the row.
    """
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        for step, offset in steps_with_offsets:
            row = OnboardingEvent(
                clinic_id=None,
                actor_id=None,
                step=step,
                payload_json=None,
                created_at=now - offset,
            )
            # SQLite stores naive datetimes; strip tz for compatibility with
            # the test backend (mirrors the pattern in test_agents_ops_router).
            row.created_at = (
                row.created_at.replace(tzinfo=None)
                if row.created_at.tzinfo is not None
                else row.created_at
            )
            db.add(row)
        db.commit()
    finally:
        db.close()


def test_funnel_aggregates_seeded_rows_and_computes_conversion(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """Five `started` + two `completed` in the last 24h → ratio = 0.4."""
    fresh = timedelta(hours=2)
    _seed_events(
        [("started", fresh)] * 5 + [("completed", fresh)] * 2
    )

    resp = client.get(
        "/api/v1/onboarding/funnel?days=1", headers=auth_headers["admin"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["totals"]["started"] == 5
    assert body["totals"]["completed"] == 2
    assert body["conversion"]["started_to_completed"] == pytest.approx(0.4, abs=1e-6)
    assert body["conversion"]["started_to_skipped"] == 0.0


def test_funnel_excludes_rows_outside_window(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """Rows older than ``days`` window are dropped from the totals."""
    # 3 rows in-window + 4 rows well outside.
    in_window = timedelta(hours=1)
    out_of_window = timedelta(days=30)
    _seed_events(
        [("started", in_window)] * 3
        + [("started", out_of_window)] * 4
        + [("completed", out_of_window)] * 2
    )

    resp = client.get(
        "/api/v1/onboarding/funnel?days=7", headers=auth_headers["admin"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["totals"]["started"] == 3
    assert body["totals"]["completed"] == 0


# ─── GET /funnel — days clamp ────────────────────────────────────────────────


def test_funnel_days_above_cap_returns_422(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """``days=200`` exceeds the 90-day cap → FastAPI's 422 validation error."""
    resp = client.get(
        "/api/v1/onboarding/funnel?days=200", headers=auth_headers["admin"]
    )
    assert resp.status_code == 422, resp.text


def test_funnel_days_below_min_returns_422(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """``days=0`` falls below the 1-day floor → 422."""
    resp = client.get(
        "/api/v1/onboarding/funnel?days=0", headers=auth_headers["admin"]
    )
    assert resp.status_code == 422, resp.text
