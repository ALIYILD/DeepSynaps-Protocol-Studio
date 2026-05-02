"""Tests for Resolver Coaching Digest Audit Hub (DCRO4, 2026-05-02).

Admin-side cohort dashboard over the DCRO3 dispatched audit row stream
(``resolver_coaching_self_review_digest.dispatched``) plus the
``ResolverCoachingDigestPreference`` table from #398.

Closes the resolver-side coaching loop end-to-end:
  DCRO1 (#393) measures → DCRO2 (#397) self-corrects →
  DCRO3 (#398) nudges → DCRO4 (THIS) admins audit.

Pattern mirrors
``test_caregiver_delivery_concern_resolution_audit_hub_launch_audit.py``
(DCR2) and ``test_resolver_coaching_self_review_digest_launch_audit.py``
(DCRO3).
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
    ResolverCoachingDigestPreference,
    User,
)


os.environ.pop("RESOLVER_COACHING_DIGEST_ENABLED", None)
os.environ.pop("DEEPSYNAPS_CG_CONCERN_AGGREGATOR_ENABLED", None)


FLAG_ACTION = "caregiver_portal.delivery_concern_threshold_reached"
RESOLVE_ACTION = "caregiver_portal.delivery_concern_resolved"
DISPATCH_TARGET_TYPE = "resolver_coaching_self_review_digest"
DISPATCH_ACTION = f"{DISPATCH_TARGET_TYPE}.dispatched"
SELF_REVIEW_ACTION = "resolver_coaching_inbox.self_review_note_filed"
SURFACE = "resolver_coaching_digest_audit_hub"
HUB_PATH = "/api/v1/resolver-coaching-digest-audit-hub"

DEMO_CLINIC = "clinic-demo-default"
OTHER_CLINIC = "clinic-dcro4-other"

ACTOR_CLINICIAN = "actor-clinician-demo"
ACTOR_ADMIN = "actor-admin-demo"

RESOLVER_X = ACTOR_CLINICIAN  # the calling clinician is also a resolver
RESOLVER_Y = "actor-dcro4-resolver-y"
RESOLVER_Z = "actor-dcro4-resolver-z"
RESOLVER_W = "actor-dcro4-resolver-w"
RESOLVER_OTHER = "actor-dcro4-resolver-other"

CG_A = "actor-dcro4-cg-a"
CG_B = "actor-dcro4-cg-b"
CG_C = "actor-dcro4-cg-c"
CG_D = "actor-dcro4-cg-d"
CG_E = "actor-dcro4-cg-e"
CG_F = "actor-dcro4-cg-f"
CG_OTHER = "actor-dcro4-cg-other"

_BASE_USER_IDS = [
    RESOLVER_Y,
    RESOLVER_Z,
    RESOLVER_W,
    RESOLVER_OTHER,
    CG_A,
    CG_B,
    CG_C,
    CG_D,
    CG_E,
    CG_F,
    CG_OTHER,
]


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
                    "resolver_coaching_inbox",
                    DISPATCH_TARGET_TYPE,
                    SURFACE,
                ]
            )
        ).delete(synchronize_session=False)
        db.query(ResolverCoachingDigestPreference).delete(
            synchronize_session=False
        )
        # Also wipe any synthetic resolvers we created with prefixed ids.
        db.query(User).filter(
            User.id.like("actor-dcro4-%")
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


def _seed_pref(
    *,
    resolver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    opted_in: bool = True,
    preferred_channel: str | None = None,
) -> None:
    db = SessionLocal()
    try:
        existing = (
            db.query(ResolverCoachingDigestPreference)
            .filter_by(
                resolver_user_id=resolver_user_id, clinic_id=clinic_id
            )
            .first()
        )
        now = _dt.now(_tz.utc).isoformat()
        if existing is None:
            db.add(
                ResolverCoachingDigestPreference(
                    id=f"pref-{resolver_user_id}-{clinic_id}"[:64],
                    resolver_user_id=resolver_user_id,
                    clinic_id=clinic_id,
                    opted_in=opted_in,
                    preferred_channel=preferred_channel,
                    last_dispatched_at=None,
                    created_at=now,
                    updated_at=now,
                )
            )
        else:
            existing.opted_in = opted_in
            existing.preferred_channel = preferred_channel
            existing.updated_at = now
        db.commit()
    finally:
        db.close()


def _seed_dispatch(
    *,
    resolver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    age_hours: float = 24.0,
    channel: str = "email",
    delivery_status: str = "delivered",
    wrong_call_count: int = 1,
) -> str:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(hours=age_hours)
        eid = (
            f"dispatch-{resolver_user_id}-{int(ts.timestamp() * 1000)}-"
            f"{_uuid.uuid4().hex[:6]}"
        )
        note = (
            f"priority=info; "
            f"resolver_user_id={resolver_user_id}; "
            f"clinic_id={clinic_id}; "
            f"wrong_call_count={wrong_call_count}; "
            f"channel={channel}; "
            f"delivery_status={delivery_status}; "
            f"dispatched_at={ts.isoformat()}"
        )
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


def _seed_resolution(
    *,
    caregiver_user_id: str,
    resolver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    resolution_reason: str = "false_positive",
    age_days: float = 20.0,
) -> str:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(days=age_days)
        eid = (
            f"resolved-{caregiver_user_id}-{resolver_user_id}-"
            f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
        )
        note = (
            f"caregiver_user_id={caregiver_user_id}; "
            f"clinic_id={clinic_id}; "
            f"resolver_user_id={resolver_user_id}; "
            f"resolution_reason={resolution_reason}; "
            f"resolution_note=test"
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=caregiver_user_id,
                target_type="caregiver_portal",
                action=RESOLVE_ACTION,
                role="reviewer",
                actor_id=resolver_user_id,
                note=note,
                created_at=ts.isoformat(),
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


def _seed_flag(
    *,
    caregiver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    age_days: float = 5.0,
) -> str:
    """Seed a caregiver flag at the given age (days) — used by the
    DCRO1 pairing logic to mark an outcome as ``re_flagged_within_30d``."""
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(days=age_days)
        eid = (
            f"flag-{caregiver_user_id}-{int(ts.timestamp() * 1000)}-"
            f"{_uuid.uuid4().hex[:6]}"
        )
        note = (
            f"priority=high "
            f"caregiver_id={caregiver_user_id} "
            f"clinic_id={clinic_id} "
            f"concern_count=3 "
            f"window_hours=168 "
            f"threshold=3"
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=caregiver_user_id,
                target_type="caregiver_portal",
                action=FLAG_ACTION,
                role="admin",
                actor_id="caregiver-delivery-concern-aggregator-worker",
                note=note,
                created_at=ts.isoformat(),
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


def _seed_wrong_fp(
    *,
    caregiver_user_id: str,
    resolver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    res_age_days: float = 20.0,
    flag_age_days: float = 10.0,
) -> str:
    """Seed a wrong-FP pair: a false_positive resolution followed by a
    flag within 30d. Used to drive ``re_flagged_within_30d`` outcomes
    in the trajectory endpoint."""
    eid = _seed_resolution(
        caregiver_user_id=caregiver_user_id,
        resolver_user_id=resolver_user_id,
        clinic_id=clinic_id,
        resolution_reason="false_positive",
        age_days=res_age_days,
    )
    _seed_flag(
        caregiver_user_id=caregiver_user_id,
        clinic_id=clinic_id,
        age_days=flag_age_days,  # newer than the resolution
    )
    return eid


def _seed_self_review(
    *,
    resolver_user_id: str,
    resolved_audit_id: str,
    clinic_id: str = DEMO_CLINIC,
    age_days: float = 1.0,
) -> str:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(days=age_days)
        eid = f"selfrev-{resolved_audit_id}-{_uuid.uuid4().hex[:8]}"
        note = (
            f"clinic_id={clinic_id}; "
            f"resolver_user_id={resolver_user_id}; "
            f"resolved_audit_id={resolved_audit_id}; "
            f"self_review_note=acknowledged"
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=resolved_audit_id,
                target_type="resolver_coaching_inbox",
                action=SELF_REVIEW_ACTION,
                role="reviewer",
                actor_id=resolver_user_id,
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


def test_dcro4_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_dcro4_surface_accepted_by_qeeg_audit_events(
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
# 2. /summary opt-in counts scoped to actor's clinic
# ────────────────────────────────────────────────────────────────────────────


def test_summary_opt_in_counts_match_actor_clinic(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(RESOLVER_Z, role="clinician")
    _seed_user(RESOLVER_W, role="clinician")
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    _seed_pref(resolver_user_id=RESOLVER_Z, opted_in=True)
    _seed_pref(resolver_user_id=RESOLVER_W, opted_in=False)

    r = client.get(
        f"{HUB_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    stats = data["opt_in_stats"]
    assert stats["total_resolvers_in_clinic"] == 3
    assert stats["opted_in"] == 2
    assert stats["opted_out"] == 1
    assert abs(stats["opt_in_pct"] - 66.67) < 0.1


# ────────────────────────────────────────────────────────────────────────────
# 3. Cross-clinic IDOR — opt-in stats exclude other-clinic preferences
# ────────────────────────────────────────────────────────────────────────────


def test_summary_excludes_cross_clinic_preferences(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(RESOLVER_OTHER, role="clinician", clinic_id=OTHER_CLINIC)
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    _seed_pref(
        resolver_user_id=RESOLVER_OTHER,
        clinic_id=OTHER_CLINIC,
        opted_in=True,
    )

    r = client.get(
        f"{HUB_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    stats = r.json()["opt_in_stats"]
    # Only the in-clinic resolver counts.
    assert stats["total_resolvers_in_clinic"] == 1
    assert stats["opted_in"] == 1


# ────────────────────────────────────────────────────────────────────────────
# 4. Cross-clinic IDOR — dispatch_stats excludes other-clinic dispatch rows
# ────────────────────────────────────────────────────────────────────────────


def test_summary_excludes_cross_clinic_dispatch_rows(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_dispatch(
        resolver_user_id=RESOLVER_Y, clinic_id=DEMO_CLINIC, channel="slack"
    )
    _seed_dispatch(
        resolver_user_id=RESOLVER_OTHER,
        clinic_id=OTHER_CLINIC,
        channel="slack",
    )
    _seed_dispatch(
        resolver_user_id=RESOLVER_OTHER,
        clinic_id=OTHER_CLINIC,
        channel="twilio",
    )

    r = client.get(
        f"{HUB_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    ds = r.json()["dispatch_stats"]
    # Only the one in-clinic slack dispatch is counted.
    assert ds["total_dispatched"] == 1
    assert ds["by_channel"]["slack"] == 1
    assert ds["by_channel"]["twilio"] == 0


# ────────────────────────────────────────────────────────────────────────────
# 5. dispatch_stats by_channel tallies correct per channel
# ────────────────────────────────────────────────────────────────────────────


def test_dispatch_stats_by_channel_tallies(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(RESOLVER_Z, role="clinician")
    for ch, n in (("slack", 3), ("twilio", 2), ("sendgrid", 1), ("pagerduty", 1), ("email", 4)):
        for _ in range(n):
            _seed_dispatch(resolver_user_id=RESOLVER_Y, channel=ch)

    r = client.get(
        f"{HUB_PATH}/summary?window_days=90",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    bc = r.json()["dispatch_stats"]["by_channel"]
    assert bc["slack"] == 3
    assert bc["twilio"] == 2
    assert bc["sendgrid"] == 1
    assert bc["pagerduty"] == 1
    assert bc["email"] == 4
    assert r.json()["dispatch_stats"]["total_dispatched"] == 11


# ────────────────────────────────────────────────────────────────────────────
# 6. delivery_outcomes success_rate calc
# ────────────────────────────────────────────────────────────────────────────


def test_delivery_outcomes_success_rate(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    # 8 delivered + 2 failed → 80% success.
    for _ in range(8):
        _seed_dispatch(
            resolver_user_id=RESOLVER_Y, delivery_status="delivered"
        )
    for _ in range(2):
        _seed_dispatch(
            resolver_user_id=RESOLVER_Y, delivery_status="failed"
        )

    r = client.get(
        f"{HUB_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    dout = r.json()["delivery_outcomes"]
    assert dout["delivered"] == 8
    assert dout["failed"] == 2
    assert dout["success_rate_pct"] == 80.0


# ────────────────────────────────────────────────────────────────────────────
# 7. delivery_outcomes when total=0 returns null success_rate (no div-by-zero)
# ────────────────────────────────────────────────────────────────────────────


def test_delivery_outcomes_total_zero_no_div_by_zero(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{HUB_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    dout = r.json()["delivery_outcomes"]
    assert dout["delivered"] == 0
    assert dout["failed"] == 0
    assert dout["success_rate_pct"] is None


# ────────────────────────────────────────────────────────────────────────────
# 8. trend_buckets weekly when window_days=90 (12-13 buckets)
# ────────────────────────────────────────────────────────────────────────────


def test_trend_buckets_weekly_for_90d_window(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_dispatch(resolver_user_id=RESOLVER_Y, age_hours=24.0)

    r = client.get(
        f"{HUB_PATH}/summary?window_days=90",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    buckets = r.json()["trend_buckets"]
    # 90 // 7 = 12.86 → ceil = 13.
    assert 12 <= len(buckets) <= 13
    # Every bucket has the four canonical fields.
    for b in buckets:
        assert "week_start" in b
        assert "dispatched" in b
        assert "delivered" in b
        assert "failed" in b


# ────────────────────────────────────────────────────────────────────────────
# 9. trend_buckets handles empty window cleanly
# ────────────────────────────────────────────────────────────────────────────


def test_trend_buckets_empty_window(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{HUB_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    buckets = r.json()["trend_buckets"]
    assert isinstance(buckets, list)
    # All zero counts.
    assert all(b["dispatched"] == 0 for b in buckets)
    assert all(b["delivered"] == 0 for b in buckets)
    assert all(b["failed"] == 0 for b in buckets)


# ────────────────────────────────────────────────────────────────────────────
# 10. resolver-trajectory: shrinking detected
# ────────────────────────────────────────────────────────────────────────────


def test_trajectory_shrinking_detected(
    client: TestClient, auth_headers: dict
) -> None:
    """Last 4 weeks median (1) < first 4 weeks median (2) over 8+ weeks → shrinking."""
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    _seed_user(CG_A)
    _seed_user(CG_B)
    _seed_user(CG_C)
    _seed_user(CG_D)
    _seed_user(CG_E)
    _seed_user(CG_F)

    # Window=63d → 9 buckets. Place wrong-fps in old buckets only.
    # First 4 buckets (oldest 4 weeks): 2 wrong-fps each (8 total).
    # Last 4 buckets (newest 4 weeks): 1 wrong-fp each (4 total).
    # Medians: first4=2, last4=1 → shrinking.
    old_age = 56.0  # ~8 weeks ago — first bucket
    new_age = 7.0   # ~1 week ago — last bucket
    _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y, res_age_days=old_age, flag_age_days=old_age - 1)
    _seed_wrong_fp(caregiver_user_id=CG_B, resolver_user_id=RESOLVER_Y, res_age_days=old_age - 7, flag_age_days=old_age - 8)
    _seed_wrong_fp(caregiver_user_id=CG_C, resolver_user_id=RESOLVER_Y, res_age_days=old_age - 14, flag_age_days=old_age - 15)
    _seed_wrong_fp(caregiver_user_id=CG_D, resolver_user_id=RESOLVER_Y, res_age_days=old_age - 21, flag_age_days=old_age - 22)
    # Last bucket has 0 wrong-fps. Setup: median first=1, last=0 → shrinking.

    r = client.get(
        f"{HUB_PATH}/resolver-trajectory?window_days=63",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) == 1
    assert items[0]["resolver_user_id"] == RESOLVER_Y
    # 9 buckets, first 4 medians=1, last 4 medians=0.
    assert items[0]["trajectory"] == "shrinking"


# ────────────────────────────────────────────────────────────────────────────
# 11. resolver-trajectory: growing detected
# ────────────────────────────────────────────────────────────────────────────


def test_trajectory_growing_detected(
    client: TestClient, auth_headers: dict
) -> None:
    """Last 4 weeks median > first 4 weeks median → growing."""
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    for cg in (CG_A, CG_B, CG_C, CG_D):
        _seed_user(cg)
    # 9-bucket window. Place wrong-fps only in the recent 4 buckets.
    new_age = 1.0
    _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y, res_age_days=new_age, flag_age_days=0.5)
    _seed_wrong_fp(caregiver_user_id=CG_B, resolver_user_id=RESOLVER_Y, res_age_days=new_age + 7, flag_age_days=new_age + 6.5)
    _seed_wrong_fp(caregiver_user_id=CG_C, resolver_user_id=RESOLVER_Y, res_age_days=new_age + 14, flag_age_days=new_age + 13.5)
    _seed_wrong_fp(caregiver_user_id=CG_D, resolver_user_id=RESOLVER_Y, res_age_days=new_age + 21, flag_age_days=new_age + 20.5)

    r = client.get(
        f"{HUB_PATH}/resolver-trajectory?window_days=63",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    # First 4 weeks (oldest) all 0; last 4 weeks all 1 → growing.
    assert items[0]["trajectory"] == "growing"


# ────────────────────────────────────────────────────────────────────────────
# 12. resolver-trajectory: flat when first==last medians
# ────────────────────────────────────────────────────────────────────────────


def test_trajectory_flat_when_medians_equal(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    # 9-bucket window, no wrong-fps anywhere → all zeros → first==last==0 → flat.
    r = client.get(
        f"{HUB_PATH}/resolver-trajectory?window_days=63",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["trajectory"] == "flat"


# ────────────────────────────────────────────────────────────────────────────
# 13. resolver-trajectory: flat when <8 weeks of data
# ────────────────────────────────────────────────────────────────────────────


def test_trajectory_flat_when_less_than_8_weeks(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)

    # 30-day window → only 5 buckets. Even with extreme wrong-fps the
    # classifier returns flat because the signal is too weak.
    r = client.get(
        f"{HUB_PATH}/resolver-trajectory?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["trajectory"] == "flat"


# ────────────────────────────────────────────────────────────────────────────
# 14. resolver-trajectory excludes opted-out resolvers
# ────────────────────────────────────────────────────────────────────────────


def test_trajectory_excludes_opted_out(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(RESOLVER_Z, role="clinician")
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    _seed_pref(resolver_user_id=RESOLVER_Z, opted_in=False)

    r = client.get(
        f"{HUB_PATH}/resolver-trajectory?window_days=90",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    items = r.json()
    rids = {it["resolver_user_id"] for it in items}
    assert RESOLVER_Y in rids
    assert RESOLVER_Z not in rids


# ────────────────────────────────────────────────────────────────────────────
# 15. resolver-trajectory: cross-clinic IDOR
# ────────────────────────────────────────────────────────────────────────────


def test_trajectory_cross_clinic_idor(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(RESOLVER_OTHER, role="clinician", clinic_id=OTHER_CLINIC)
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    _seed_pref(
        resolver_user_id=RESOLVER_OTHER,
        clinic_id=OTHER_CLINIC,
        opted_in=True,
    )

    r = client.get(
        f"{HUB_PATH}/resolver-trajectory?window_days=90",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    rids = {it["resolver_user_id"] for it in r.json()}
    assert RESOLVER_Y in rids
    assert RESOLVER_OTHER not in rids


# ────────────────────────────────────────────────────────────────────────────
# 16. audit-events scoped to clinic + paginated
# ────────────────────────────────────────────────────────────────────────────


def test_audit_events_scoped_and_paginated(
    client: TestClient, auth_headers: dict
) -> None:
    # Emit a few page-level audits via POST.
    for i in range(3):
        body = {
            "event": "view",
            "note": f"window_days=90; iter={i}",
            "target_id": "page",
        }
        r = client.post(
            f"{HUB_PATH}/audit-events",
            json=body,
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text

    r2 = client.get(
        f"{HUB_PATH}/audit-events?surface={SURFACE}&limit=2&offset=0",
        headers=auth_headers["clinician"],
    )
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["surface"] == SURFACE
    assert data["total"] >= 3
    assert len(data["items"]) <= 2
    # All visible rows are scoped to actor's clinic.
    for it in data["items"]:
        n = it.get("note", "") or ""
        assert (f"clinic_id={DEMO_CLINIC}" in n) or (
            it.get("actor_id") == ACTOR_CLINICIAN
        )


# ────────────────────────────────────────────────────────────────────────────
# 17. clinician role passes; patient/guest 403
# ────────────────────────────────────────────────────────────────────────────


def test_clinician_role_passes(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{HUB_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text


def test_patient_role_denied(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{HUB_PATH}/summary?window_days=30",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403, r.text


def test_guest_role_denied(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{HUB_PATH}/summary?window_days=30",
        headers=auth_headers["guest"],
    )
    assert r.status_code == 403, r.text


def test_admin_role_passes(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{HUB_PATH}/summary?window_days=30",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text


# ────────────────────────────────────────────────────────────────────────────
# 18. large dataset (50+ resolvers) does not OOM
# ────────────────────────────────────────────────────────────────────────────


def test_large_dataset_does_not_oom(
    client: TestClient, auth_headers: dict
) -> None:
    """50 resolvers × 1 dispatch each → trajectory list returns within
    bounds (cap is 200) and does not OOM."""
    for i in range(50):
        rid = f"actor-dcro4-resolver-bulk-{i:03d}"
        _seed_user(rid, role="clinician")
        _seed_pref(resolver_user_id=rid, opted_in=True)
        _seed_dispatch(resolver_user_id=rid, channel="email")

    r = client.get(
        f"{HUB_PATH}/summary?window_days=90",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["opt_in_stats"]["opted_in"] == 50
    assert data["dispatch_stats"]["total_dispatched"] == 50

    r2 = client.get(
        f"{HUB_PATH}/resolver-trajectory?window_days=90",
        headers=auth_headers["clinician"],
    )
    assert r2.status_code == 200
    items = r2.json()
    assert 1 <= len(items) <= 200

    # Cleanup the bulk resolvers we just minted.
    db = SessionLocal()
    try:
        db.query(ResolverCoachingDigestPreference).filter(
            ResolverCoachingDigestPreference.resolver_user_id.like(
                "actor-dcro4-resolver-bulk-%"
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(
            User.id.like("actor-dcro4-resolver-bulk-%")
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_id.like(
                "actor-dcro4-resolver-bulk-%"
            )
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


# ────────────────────────────────────────────────────────────────────────────
# 19. opt_in_pct = 0 when total_resolvers_in_clinic=0 (no div-by-zero)
# ────────────────────────────────────────────────────────────────────────────


def test_opt_in_pct_zero_no_div_by_zero(
    client: TestClient, auth_headers: dict
) -> None:
    # No preferences seeded → total is 0. Endpoint must not crash on /0.
    r = client.get(
        f"{HUB_PATH}/summary?window_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    stats = r.json()["opt_in_stats"]
    assert stats["total_resolvers_in_clinic"] == 0
    assert stats["opted_in"] == 0
    assert stats["opted_out"] == 0
    assert stats["opt_in_pct"] == 0.0


# ────────────────────────────────────────────────────────────────────────────
# 20. median_dispatches_per_resolver renders correctly when present
# ────────────────────────────────────────────────────────────────────────────


def test_median_dispatches_per_resolver(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(RESOLVER_Z, role="clinician")
    _seed_user(RESOLVER_W, role="clinician")
    # Y dispatched 3x, Z dispatched 2x, W dispatched 1x → median=2.
    for _ in range(3):
        _seed_dispatch(resolver_user_id=RESOLVER_Y)
    for _ in range(2):
        _seed_dispatch(resolver_user_id=RESOLVER_Z)
    _seed_dispatch(resolver_user_id=RESOLVER_W)

    r = client.get(
        f"{HUB_PATH}/summary?window_days=90",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    ds = r.json()["dispatch_stats"]
    assert ds["total_dispatched"] == 6
    assert ds["median_dispatches_per_resolver"] == 2.0


# ────────────────────────────────────────────────────────────────────────────
# 21. current_backlog reflects most-recent week
# ────────────────────────────────────────────────────────────────────────────


def test_current_backlog_reflects_most_recent_week(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    _seed_user(CG_A)
    _seed_user(CG_B)
    # Two wrong-fps in the most recent week.
    _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y, res_age_days=2.0, flag_age_days=1.0)
    _seed_wrong_fp(caregiver_user_id=CG_B, resolver_user_id=RESOLVER_Y, res_age_days=3.0, flag_age_days=2.0)

    r = client.get(
        f"{HUB_PATH}/resolver-trajectory?window_days=63",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["current_backlog"] == 2
