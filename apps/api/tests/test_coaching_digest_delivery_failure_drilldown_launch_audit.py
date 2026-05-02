"""Tests for Coaching Digest Delivery Failure Drilldown (DCRO5, 2026-05-02).

Operational drill-down over the DCRO3 dispatched audit row stream
(``resolver_coaching_self_review_digest.dispatched``) filtered to
``delivery_status=failed`` and grouped by ``(channel, error_class)``.

DCRO4 (#402) surfaces the failure rate. DCRO5 (THIS) makes it
actionable — admins click a failure to see exactly which (channel,
error_class) cohort it belongs to, with click-through to the Channel
Misconfig Detector (#389) when a matching
``caregiver_portal.channel_misconfigured_detected`` row exists in the
same ISO week + clinic + channel.

Pattern mirrors
``test_resolver_coaching_digest_audit_hub_launch_audit.py`` (DCRO4).
"""
from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    User,
)


os.environ.pop("RESOLVER_COACHING_DIGEST_ENABLED", None)


DISPATCH_TARGET_TYPE = "resolver_coaching_self_review_digest"
DISPATCH_ACTION = f"{DISPATCH_TARGET_TYPE}.dispatched"
MISCONFIG_TARGET_TYPE = "caregiver_portal"
MISCONFIG_ACTION = f"{MISCONFIG_TARGET_TYPE}.channel_misconfigured_detected"
SURFACE = "coaching_digest_delivery_failure_drilldown"
DRILLDOWN_PATH = "/api/v1/coaching-digest-delivery-failure-drilldown"

DEMO_CLINIC = "clinic-demo-default"
OTHER_CLINIC = "clinic-dcro5-other"

ACTOR_CLINICIAN = "actor-clinician-demo"
ACTOR_ADMIN = "actor-admin-demo"

RESOLVER_X = ACTOR_CLINICIAN
RESOLVER_Y = "actor-dcro5-resolver-y"
RESOLVER_Z = "actor-dcro5-resolver-z"
RESOLVER_OTHER = "actor-dcro5-resolver-other"


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_(
                [
                    "caregiver_portal",
                    DISPATCH_TARGET_TYPE,
                    SURFACE,
                ]
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(
            User.id.like("actor-dcro5-%")
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


# ── Helpers ─────────────────────────────────────────────────────────────────


def _seed_user(
    user_id: str,
    *,
    email: str | None = None,
    display_name: str | None = None,
    role: str = "clinician",
    clinic_id: str = DEMO_CLINIC,
) -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id=user_id).first()
        if existing is not None:
            existing.clinic_id = clinic_id
            db.commit()
            return
        em = email or f"{user_id}@example.com"
        db.add(
            User(
                id=user_id,
                email=em,
                display_name=display_name or em.split("@", 1)[0],
                hashed_password="x",
                role=role,
                package_id="clinician_pro",
                clinic_id=clinic_id,
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_dispatch(
    *,
    resolver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    age_hours: float = 24.0,
    channel: str = "email",
    delivery_status: str = "failed",
    error_class: str | None = None,
    error_message: str | None = None,
    wrong_call_count: int = 1,
) -> str:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(hours=age_hours)
        eid = (
            f"dispatch-{resolver_user_id}-{int(ts.timestamp() * 1000)}-"
            f"{_uuid.uuid4().hex[:6]}"
        )
        parts = [
            "priority=info",
            f"resolver_user_id={resolver_user_id}",
            f"clinic_id={clinic_id}",
            f"wrong_call_count={wrong_call_count}",
            f"channel={channel}",
            f"delivery_status={delivery_status}",
            f"dispatched_at={ts.isoformat()}",
        ]
        if error_class is not None:
            parts.append(f"error_class={error_class}")
        if error_message is not None:
            parts.append(f"error_message={error_message}")
        note = "; ".join(parts)
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=resolver_user_id,
                target_type=DISPATCH_TARGET_TYPE,
                action=DISPATCH_ACTION,
                role="admin",
                actor_id="resolver-coaching-self-review-digest-worker",
                note=note,
                created_at=ts.isoformat(),
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


def _seed_misconfig(
    *,
    caregiver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    channel: str = "slack",
    age_hours: float = 24.0,
) -> str:
    """Seed a ``caregiver_portal.channel_misconfigured_detected`` row."""
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(hours=age_hours)
        eid = (
            f"misconfig-{caregiver_user_id}-{int(ts.timestamp() * 1000)}-"
            f"{_uuid.uuid4().hex[:6]}"
        )
        # Use the canonical worker note format (whitespace-separated
        # k=v with `channel=` carrying the preferred channel).
        note = (
            f"priority=high "
            f"adapter=slack-adapter "
            f"channel={channel} "
            f"caregiver_id={caregiver_user_id} "
            f"clinic_id={clinic_id} "
            f"hours_since_last_delivery=48.0"
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=caregiver_user_id,
                target_type=MISCONFIG_TARGET_TYPE,
                action=MISCONFIG_ACTION,
                role="admin",
                actor_id="channel-misconfiguration-detector-worker",
                note=note,
                created_at=ts.isoformat(),
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


# ────────────────────────────────────────────────────────────────────────────
# 1. Surface whitelist sanity
# ────────────────────────────────────────────────────────────────────────────


def test_dcro5_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_dcro5_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": SURFACE, "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    assert r.json().get("accepted") is True


# ────────────────────────────────────────────────────────────────────────────
# 2. summary returns correct total_failed
# ────────────────────────────────────────────────────────────────────────────


def test_summary_total_failed(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    for _ in range(3):
        _seed_dispatch(
            resolver_user_id=RESOLVER_Y, channel="slack",
            delivery_status="failed", error_class="auth",
        )
    # one delivered (should not count toward failed)
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="slack",
        delivery_status="delivered",
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=90",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total_failed"] == 3
    assert data["total_dispatched"] == 4


# ────────────────────────────────────────────────────────────────────────────
# 3. failure_rate_pct calc when failed=2 dispatched=10 → 20%
# ────────────────────────────────────────────────────────────────────────────


def test_failure_rate_calc(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    for _ in range(8):
        _seed_dispatch(
            resolver_user_id=RESOLVER_Y, delivery_status="delivered"
        )
    for _ in range(2):
        _seed_dispatch(
            resolver_user_id=RESOLVER_Y, delivery_status="failed",
            error_class="auth",
        )

    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=90",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    d = r.json()
    assert d["total_dispatched"] == 10
    assert d["total_failed"] == 2
    assert d["failure_rate_pct"] == 20.0


# ────────────────────────────────────────────────────────────────────────────
# 4. failure_rate_pct null when total_dispatched=0
# ────────────────────────────────────────────────────────────────────────────


def test_failure_rate_null_when_no_dispatches(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    d = r.json()
    assert d["total_dispatched"] == 0
    assert d["total_failed"] == 0
    assert d["failure_rate_pct"] is None


# ────────────────────────────────────────────────────────────────────────────
# 5. by_channel breakdown correct per channel
# ────────────────────────────────────────────────────────────────────────────


def test_by_channel_breakdown(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    # 3 slack auth, 2 twilio rate_limit
    for _ in range(3):
        _seed_dispatch(
            resolver_user_id=RESOLVER_Y, channel="slack",
            delivery_status="failed", error_class="auth",
        )
    for _ in range(2):
        _seed_dispatch(
            resolver_user_id=RESOLVER_Y, channel="twilio",
            delivery_status="failed", error_class="rate_limit",
        )

    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=90",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    bc = r.json()["by_channel"]
    assert bc["slack"]["failed"] == 3
    assert bc["slack"]["by_error_class"]["auth"] == 3
    assert bc["twilio"]["failed"] == 2
    assert bc["twilio"]["by_error_class"]["rate_limit"] == 2
    # Other canonical channels still rendered (zero counts).
    assert bc["sendgrid"]["failed"] == 0
    assert bc["pagerduty"]["failed"] == 0
    assert bc["email"]["failed"] == 0


# ────────────────────────────────────────────────────────────────────────────
# 6. error_class parsed from note error_class=auth (preferred)
# ────────────────────────────────────────────────────────────────────────────


def test_error_class_explicit_field_preferred(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    # error_message says rate-limit, but error_class= says auth.
    # Explicit field must win.
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="slack",
        delivery_status="failed",
        error_class="auth",
        error_message="429 rate limited",
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    bc = r.json()["by_channel"]
    assert bc["slack"]["by_error_class"]["auth"] == 1
    assert bc["slack"]["by_error_class"]["rate_limit"] == 0


# ────────────────────────────────────────────────────────────────────────────
# 7. error_class fallback from message: 401 → auth
# ────────────────────────────────────────────────────────────────────────────


def test_error_class_fallback_401_auth(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="sendgrid",
        delivery_status="failed",
        error_message="HTTP 401 Unauthorized",
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    bc = r.json()["by_channel"]
    assert bc["sendgrid"]["by_error_class"]["auth"] == 1


# ────────────────────────────────────────────────────────────────────────────
# 8. error_class fallback: rate → rate_limit
# ────────────────────────────────────────────────────────────────────────────


def test_error_class_fallback_rate_rate_limit(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="twilio",
        delivery_status="failed",
        error_message="rate limit exceeded",
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    bc = r.json()["by_channel"]
    assert bc["twilio"]["by_error_class"]["rate_limit"] == 1


# ────────────────────────────────────────────────────────────────────────────
# 9. error_class fallback: channel_left → channel_left
# ────────────────────────────────────────────────────────────────────────────


def test_error_class_fallback_channel_left(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="slack",
        delivery_status="failed",
        error_message="bot channel_left from #ops-coaching",
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    bc = r.json()["by_channel"]
    assert bc["slack"]["by_error_class"]["channel_left"] == 1


# ────────────────────────────────────────────────────────────────────────────
# 10. error_class fallback: 503 → unreachable
# ────────────────────────────────────────────────────────────────────────────


def test_error_class_fallback_503_unreachable(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="pagerduty",
        delivery_status="failed",
        error_message="HTTP 503 Service Unavailable",
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    bc = r.json()["by_channel"]
    assert bc["pagerduty"]["by_error_class"]["unreachable"] == 1


# ────────────────────────────────────────────────────────────────────────────
# 11. error_class fallback: missing → other
# ────────────────────────────────────────────────────────────────────────────


def test_error_class_fallback_other(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="email",
        delivery_status="failed",
        # No error_class, no error_message.
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    bc = r.json()["by_channel"]
    assert bc["email"]["by_error_class"]["other"] == 1


# ────────────────────────────────────────────────────────────────────────────
# 12. top_error_classes ordered by count desc, capped at 5
# ────────────────────────────────────────────────────────────────────────────


def test_top_error_classes_ordered_and_capped(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    # Seed 6 distinct (channel, error_class) cohorts with varying counts.
    cohorts = [
        ("slack", "auth", 5),
        ("twilio", "rate_limit", 4),
        ("sendgrid", "unreachable", 3),
        ("pagerduty", "channel_left", 2),
        ("email", "other", 1),
        ("slack", "rate_limit", 6),  # highest — should rank #1
    ]
    for ch, ec, n in cohorts:
        for _ in range(n):
            _seed_dispatch(
                resolver_user_id=RESOLVER_Y, channel=ch,
                delivery_status="failed", error_class=ec,
            )

    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=90",
        headers=auth_headers["clinician"],
    )
    top = r.json()["top_error_classes"]
    assert len(top) == 5  # capped
    # First entry is highest count.
    assert top[0]["channel"] == "slack"
    assert top[0]["error_class"] == "rate_limit"
    assert top[0]["count"] == 6
    # Counts strictly non-increasing.
    counts = [t["count"] for t in top]
    assert counts == sorted(counts, reverse=True)


# ────────────────────────────────────────────────────────────────────────────
# 13. cross-clinic IDOR — other-clinic failed rows excluded
# ────────────────────────────────────────────────────────────────────────────


def test_summary_cross_clinic_idor(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    _seed_user(RESOLVER_OTHER, role="clinician", clinic_id=OTHER_CLINIC)
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y,
        clinic_id=DEMO_CLINIC, channel="slack",
        delivery_status="failed", error_class="auth",
    )
    _seed_dispatch(
        resolver_user_id=RESOLVER_OTHER,
        clinic_id=OTHER_CLINIC, channel="slack",
        delivery_status="failed", error_class="auth",
    )
    _seed_dispatch(
        resolver_user_id=RESOLVER_OTHER,
        clinic_id=OTHER_CLINIC, channel="twilio",
        delivery_status="failed", error_class="rate_limit",
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=90",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    d = r.json()
    # Only the in-clinic slack/auth row counts.
    assert d["total_failed"] == 1
    bc = d["by_channel"]
    assert bc["slack"]["failed"] == 1
    assert bc["twilio"]["failed"] == 0


# ────────────────────────────────────────────────────────────────────────────
# 14. clinician role passes; patient/guest 403
# ────────────────────────────────────────────────────────────────────────────


def test_clinician_role_passes(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text


def test_patient_role_denied(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=30",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403, r.text


def test_guest_role_denied(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=30",
        headers=auth_headers["guest"],
    )
    assert r.status_code == 403, r.text


# ────────────────────────────────────────────────────────────────────────────
# 15. list paginates (page/page_size honored)
# ────────────────────────────────────────────────────────────────────────────


def test_list_paginates(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    for _ in range(7):
        _seed_dispatch(
            resolver_user_id=RESOLVER_Y, channel="email",
            delivery_status="failed", error_class="other",
        )

    r1 = client.get(
        f"{DRILLDOWN_PATH}/list?page=1&page_size=3",
        headers=auth_headers["clinician"],
    )
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["total"] == 7
    assert d1["page"] == 1
    assert d1["page_size"] == 3
    assert len(d1["items"]) == 3

    r2 = client.get(
        f"{DRILLDOWN_PATH}/list?page=3&page_size=3",
        headers=auth_headers["clinician"],
    )
    d2 = r2.json()
    assert d2["page"] == 3
    # Only one row left on page 3 (7 / 3 = 2 full pages + 1).
    assert len(d2["items"]) == 1


# ────────────────────────────────────────────────────────────────────────────
# 16. list channel filter only returns matching rows
# ────────────────────────────────────────────────────────────────────────────


def test_list_channel_filter(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="slack",
        delivery_status="failed", error_class="auth",
    )
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="email",
        delivery_status="failed", error_class="other",
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/list?channel=slack",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["channel"] == "slack"


# ────────────────────────────────────────────────────────────────────────────
# 17. list error_class filter only returns matching rows
# ────────────────────────────────────────────────────────────────────────────


def test_list_error_class_filter(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="slack",
        delivery_status="failed", error_class="auth",
    )
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="slack",
        delivery_status="failed", error_class="rate_limit",
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/list?error_class=auth",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["error_class"] == "auth"


# ────────────────────────────────────────────────────────────────────────────
# 18. has_matching_misconfig_flag true when misconfig row exists
# ────────────────────────────────────────────────────────────────────────────


def test_has_matching_misconfig_flag_true(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    _seed_user("actor-dcro5-cg-a", role="patient")
    # Both rows ~24h old → same ISO week.
    _seed_misconfig(
        caregiver_user_id="actor-dcro5-cg-a",
        clinic_id=DEMO_CLINIC,
        channel="slack",
        age_hours=24.0,
    )
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="slack",
        delivery_status="failed", error_class="auth",
        age_hours=24.0,
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/list?channel=slack",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["has_matching_misconfig_flag"] is True


# ────────────────────────────────────────────────────────────────────────────
# 19. has_matching_misconfig_flag false when no misconfig
# ────────────────────────────────────────────────────────────────────────────


def test_has_matching_misconfig_flag_false(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="slack",
        delivery_status="failed", error_class="auth",
        age_hours=24.0,
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/list?channel=slack",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["has_matching_misconfig_flag"] is False


# ────────────────────────────────────────────────────────────────────────────
# 20. trend_buckets weekly when window_days=90 → 12-13 buckets
# ────────────────────────────────────────────────────────────────────────────


def test_trend_buckets_weekly_90d(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="slack",
        delivery_status="failed", error_class="auth",
        age_hours=24.0,
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=90",
        headers=auth_headers["clinician"],
    )
    buckets = r.json()["trend_buckets"]
    # 90 // 7 = 12.86 → ceil = 13.
    assert 12 <= len(buckets) <= 13
    for b in buckets:
        assert "week_start" in b
        assert "failed" in b


# ────────────────────────────────────────────────────────────────────────────
# 21. empty clinic returns clean structure (no nulls except failure_rate)
# ────────────────────────────────────────────────────────────────────────────


def test_empty_clinic_clean_structure(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    d = r.json()
    assert d["total_failed"] == 0
    assert d["total_dispatched"] == 0
    assert d["failure_rate_pct"] is None
    assert isinstance(d["by_channel"], dict)
    # All five canonical channels rendered with zero counts.
    for ch in ("slack", "twilio", "sendgrid", "pagerduty", "email"):
        assert ch in d["by_channel"]
        assert d["by_channel"][ch]["failed"] == 0
    assert d["top_error_classes"] == []
    assert isinstance(d["trend_buckets"], list)


# ────────────────────────────────────────────────────────────────────────────
# 22. audit-events scoped + paginated
# ────────────────────────────────────────────────────────────────────────────


def test_audit_events_scoped_and_paginated(
    client: TestClient, auth_headers: dict
) -> None:
    for i in range(3):
        body = {
            "event": "view",
            "note": f"window_days=90; iter={i}",
            "target_id": "page",
        }
        r = client.post(
            f"{DRILLDOWN_PATH}/audit-events",
            json=body,
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text

    r2 = client.get(
        f"{DRILLDOWN_PATH}/audit-events?surface={SURFACE}&limit=2&offset=0",
        headers=auth_headers["clinician"],
    )
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["surface"] == SURFACE
    assert data["total"] >= 3
    assert len(data["items"]) <= 2
    for it in data["items"]:
        n = it.get("note", "") or ""
        assert (f"clinic_id={DEMO_CLINIC}" in n) or (
            it.get("actor_id") == ACTOR_CLINICIAN
        )


# ────────────────────────────────────────────────────────────────────────────
# 23. admin role passes
# ────────────────────────────────────────────────────────────────────────────


def test_admin_role_passes(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{DRILLDOWN_PATH}/summary?window_days=30",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text


# ────────────────────────────────────────────────────────────────────────────
# 24. error_message truncation in list response (120-char cap)
# ────────────────────────────────────────────────────────────────────────────


def test_error_message_truncation_120_chars(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y)
    long_msg = "auth " * 100  # well over 120 chars
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, channel="slack",
        delivery_status="failed",
        error_class="auth",
        error_message=long_msg,
    )

    r = client.get(
        f"{DRILLDOWN_PATH}/list?channel=slack",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    assert len(items) == 1
    msg = items[0]["error_message"] or ""
    assert len(msg) <= 120
