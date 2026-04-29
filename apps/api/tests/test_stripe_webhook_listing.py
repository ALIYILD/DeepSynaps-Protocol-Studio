"""Tests for Phase 13 — admin Stripe webhook event listing endpoint.

Covers:

* Clinician → 403 (super-admin only).
* Super-admin with empty table → 200, ``rows: []``.
* After seeding 3 rows, GET returns them DESC by ``received_at``.
* ``event_type=foo`` filter excludes non-matching rows.
* ``since_days=1`` excludes a row from 5 days ago.
* ``limit=300`` → 422 (out of range).
* ``limit=10`` returns at most 10 rows.

Mirrors the override-via-``dependency_overrides`` pattern from
``test_agents_ops_router.py`` so we get a clean super-admin
(``clinic_id=None``) without hand-minting JWTs.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import SessionLocal
from app.main import app
from app.persistence.models import StripeWebhookEvent


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
def super_admin_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-super-admin",
        display_name="Super Admin",
        role="admin",  # type: ignore[arg-type]
        package_id="enterprise",
        clinic_id=None,
    )


@pytest.fixture
def super_admin_client(super_admin_actor: AuthenticatedActor):
    app.dependency_overrides[get_authenticated_actor] = lambda: super_admin_actor
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_authenticated_actor, None)


def _seed_event(
    db,
    *,
    event_id: str,
    event_type: str = "checkout.session.completed",
    received_at: datetime | None = None,
    processed: bool = True,
) -> StripeWebhookEvent:
    row = StripeWebhookEvent(
        id=event_id,
        event_type=event_type,
        processed=processed,
    )
    if received_at is not None:
        # SQLite stores naive datetimes — strip tz for compatibility with
        # the cross-dialect filter clause.
        row.received_at = (
            received_at.replace(tzinfo=None)
            if received_at.tzinfo is not None
            else received_at
        )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Auth gating
# ---------------------------------------------------------------------------


def test_listing_rejects_clinician(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    resp = client.get(
        "/api/v1/agent-billing/admin/webhook-events",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 403, resp.text


def test_listing_rejects_clinic_bound_admin(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    """``admin-demo-token`` has clinic_id set by the conftest seed."""
    resp = client.get(
        "/api/v1/agent-billing/admin/webhook-events",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# Empty + seeded happy paths
# ---------------------------------------------------------------------------


def test_listing_empty_table_returns_empty_rows(
    super_admin_client: TestClient,
) -> None:
    resp = super_admin_client.get("/api/v1/agent-billing/admin/webhook-events")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"since_days": 7, "rows": []}


def test_listing_returns_seeded_rows_desc_by_received_at(
    super_admin_client: TestClient, db_session
) -> None:
    now = datetime.now(timezone.utc)
    _seed_event(
        db_session,
        event_id="evt_oldest",
        received_at=now - timedelta(hours=3),
    )
    _seed_event(
        db_session,
        event_id="evt_middle",
        received_at=now - timedelta(hours=2),
    )
    _seed_event(
        db_session,
        event_id="evt_newest",
        received_at=now - timedelta(hours=1),
    )

    resp = super_admin_client.get("/api/v1/agent-billing/admin/webhook-events")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["since_days"] == 7
    rows = body["rows"]
    assert len(rows) == 3
    assert [r["event_id"] for r in rows] == ["evt_newest", "evt_middle", "evt_oldest"]
    # Each row carries the documented payload shape.
    assert rows[0]["event_type"] == "checkout.session.completed"
    assert rows[0]["processed"] is True
    assert rows[0]["received_at"] is not None


def test_listing_event_type_filter_excludes_other_types(
    super_admin_client: TestClient, db_session
) -> None:
    now = datetime.now(timezone.utc)
    _seed_event(
        db_session,
        event_id="evt_foo_a",
        event_type="foo",
        received_at=now - timedelta(minutes=5),
    )
    _seed_event(
        db_session,
        event_id="evt_other",
        event_type="checkout.session.completed",
        received_at=now - timedelta(minutes=10),
    )
    _seed_event(
        db_session,
        event_id="evt_foo_b",
        event_type="foo",
        received_at=now - timedelta(minutes=15),
    )

    resp = super_admin_client.get(
        "/api/v1/agent-billing/admin/webhook-events?event_type=foo"
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    assert {r["event_id"] for r in rows} == {"evt_foo_a", "evt_foo_b"}
    assert all(r["event_type"] == "foo" for r in rows)


def test_listing_since_days_excludes_old_rows(
    super_admin_client: TestClient, db_session
) -> None:
    now = datetime.now(timezone.utc)
    _seed_event(
        db_session,
        event_id="evt_recent",
        received_at=now - timedelta(hours=1),
    )
    _seed_event(
        db_session,
        event_id="evt_5_days_old",
        received_at=now - timedelta(days=5),
    )

    resp = super_admin_client.get(
        "/api/v1/agent-billing/admin/webhook-events?since_days=1"
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["since_days"] == 1
    ids = [r["event_id"] for r in body["rows"]]
    assert "evt_recent" in ids
    assert "evt_5_days_old" not in ids


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def test_listing_rejects_limit_above_max(
    super_admin_client: TestClient,
) -> None:
    resp = super_admin_client.get(
        "/api/v1/agent-billing/admin/webhook-events?limit=300"
    )
    assert resp.status_code == 422, resp.text


def test_listing_rejects_since_days_above_max(
    super_admin_client: TestClient,
) -> None:
    resp = super_admin_client.get(
        "/api/v1/agent-billing/admin/webhook-events?since_days=91"
    )
    assert resp.status_code == 422, resp.text


def test_listing_limit_caps_returned_rows(
    super_admin_client: TestClient, db_session
) -> None:
    """Seed 15 rows, request limit=10 → at most 10 rows returned."""
    now = datetime.now(timezone.utc)
    for i in range(15):
        _seed_event(
            db_session,
            event_id=f"evt_cap_{i:02d}",
            received_at=now - timedelta(minutes=i),
        )

    resp = super_admin_client.get(
        "/api/v1/agent-billing/admin/webhook-events?limit=10"
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    assert len(rows) == 10
    # The newest 10 were returned.
    assert rows[0]["event_id"] == "evt_cap_00"
    assert rows[-1]["event_id"] == "evt_cap_09"
