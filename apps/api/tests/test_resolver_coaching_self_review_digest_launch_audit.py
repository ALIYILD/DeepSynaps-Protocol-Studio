"""Tests for Resolver Coaching Self-Review Digest Worker (DCRO3, 2026-05-02).

Weekly digest worker that bundles each resolver's un-self-reviewed
wrong false_positive calls and dispatches via their preferred on-call
channel (reusing EscalationPolicy + oncall_delivery adapters from #374).
Per-resolver weekly cooldown. Honest opt-in default off — opt-in only.

Closes the loop end-to-end:
  DCRO1 measures (#393) → DCRO2 self-corrects (#397) → DCRO3 nudges.

Pattern mirrors
``test_caregiver_delivery_concern_aggregator_launch_audit.py`` (#390)
and ``test_resolver_coaching_inbox_launch_audit.py`` (#397).
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
    EscalationPolicy,
    ResolverCoachingDigestPreference,
    User,
)
from app.workers.resolver_coaching_self_review_digest_worker import (
    DISPATCH_ACTION,
    SELF_REVIEW_NOTE_ACTION,
    WORKER_SURFACE,
    _reset_for_tests,
)


# Make sure the worker is OFF by default in tests; flip per-test where needed.
os.environ.pop("RESOLVER_COACHING_DIGEST_ENABLED", None)
# DCA worker must stay off — the wrong-fp seeds emit raw audit rows.
os.environ.pop("DEEPSYNAPS_CG_CONCERN_AGGREGATOR_ENABLED", None)


FLAG_ACTION = "caregiver_portal.delivery_concern_threshold_reached"
RESOLVE_ACTION = "caregiver_portal.delivery_concern_resolved"
PREF_PATH = "/api/v1/resolver-coaching-self-review-digest"

DEMO_CLINIC = "clinic-demo-default"
OTHER_CLINIC = "clinic-dcro3-other"

ACTOR_CLINICIAN = "actor-clinician-demo"
ACTOR_ADMIN = "actor-admin-demo"

# Synthetic resolver / caregiver IDs.
CG_A = "actor-dcro3-cg-a"
CG_B = "actor-dcro3-cg-b"
CG_C = "actor-dcro3-cg-c"
CG_D = "actor-dcro3-cg-d"
CG_OTHER = "actor-dcro3-cg-other"

# Calling-user resolver maps to the demo clinician token; foils are
# extra resolver users.
RESOLVER_X = ACTOR_CLINICIAN
RESOLVER_Y = "actor-dcro3-resolver-y"
RESOLVER_Z = "actor-dcro3-resolver-z"
RESOLVER_OTHER = "actor-dcro3-resolver-other"

_ALL_USER_IDS = (
    CG_A,
    CG_B,
    CG_C,
    CG_D,
    CG_OTHER,
    RESOLVER_Y,
    RESOLVER_Z,
    RESOLVER_OTHER,
)


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
                    WORKER_SURFACE,
                ]
            )
        ).delete(synchronize_session=False)
        db.query(ResolverCoachingDigestPreference).delete(
            synchronize_session=False
        )
        db.query(EscalationPolicy).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(list(_ALL_USER_IDS))).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()
    _reset_for_tests()


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


def _seed_resolution(
    *,
    caregiver_user_id: str,
    resolver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    resolution_reason: str = "false_positive",
    age_hours: float = 24.0 * 20,
) -> str:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(hours=age_hours)
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
    age_hours: float = 24.0 * 5,
) -> str:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(hours=age_hours)
        eid = (
            f"flag-{caregiver_user_id}-"
            f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
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
    res_age_hours: float = 24.0 * 20,
    flag_age_hours: float = 24.0 * 10,
) -> str:
    eid = _seed_resolution(
        caregiver_user_id=caregiver_user_id,
        resolver_user_id=resolver_user_id,
        clinic_id=clinic_id,
        resolution_reason="false_positive",
        age_hours=res_age_hours,
    )
    _seed_flag(
        caregiver_user_id=caregiver_user_id,
        clinic_id=clinic_id,
        age_hours=flag_age_hours,
    )
    return eid


def _seed_self_review_note(
    *, resolver_user_id: str, resolved_audit_id: str
) -> str:
    """Seed a DCRO2-style self-review-note row so DCRO3 treats the
    resolved_audit_id as already reviewed."""
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc)
        eid = f"selfrev-{resolved_audit_id}-{_uuid.uuid4().hex[:8]}"
        note = (
            f"clinic_id={DEMO_CLINIC}; "
            f"resolver_user_id={resolver_user_id}; "
            f"resolved_audit_id={resolved_audit_id}; "
            f"self_review_note=I should not have called this fp"
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=resolved_audit_id,
                target_type="resolver_coaching_inbox",
                action=SELF_REVIEW_NOTE_ACTION,
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


def _seed_pref(
    *,
    resolver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    opted_in: bool = True,
    preferred_channel: str | None = None,
    last_dispatched_at: str | None = None,
) -> ResolverCoachingDigestPreference:
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
            row = ResolverCoachingDigestPreference(
                id=f"pref-{resolver_user_id}-{clinic_id}",
                resolver_user_id=resolver_user_id,
                clinic_id=clinic_id,
                opted_in=opted_in,
                preferred_channel=preferred_channel,
                last_dispatched_at=last_dispatched_at,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
        else:
            existing.opted_in = opted_in
            existing.preferred_channel = preferred_channel
            existing.last_dispatched_at = last_dispatched_at
            existing.updated_at = now
            row = existing
        db.commit()
        db.refresh(row)
        return row
    finally:
        db.close()


def _seed_dispatch_audit_row(
    *,
    resolver_user_id: str,
    clinic_id: str = DEMO_CLINIC,
    age_hours: float = 1.0,
    channel: str = "email",
) -> str:
    """Seed a synthetic dispatched audit row to exercise the cooldown
    predicate."""
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(hours=age_hours)
        eid = f"dispatch-cool-{resolver_user_id}-{_uuid.uuid4().hex[:8]}"
        note = (
            f"priority=info; "
            f"resolver_user_id={resolver_user_id}; "
            f"clinic_id={clinic_id}; "
            f"wrong_call_count=1; "
            f"channel={channel}; "
            f"delivery_status=sent; "
            f"dispatched_at={ts.isoformat()}"
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=resolver_user_id,
                target_type=WORKER_SURFACE,
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


def _seed_escalation_policy(
    *, clinic_id: str, dispatch_order: list[str]
) -> None:
    import json as _json

    db = SessionLocal()
    try:
        existing = (
            db.query(EscalationPolicy)
            .filter_by(clinic_id=clinic_id)
            .one_or_none()
        )
        now = _dt.now(_tz.utc).isoformat()
        if existing is None:
            db.add(
                EscalationPolicy(
                    id=f"escpol-{clinic_id}",
                    clinic_id=clinic_id,
                    dispatch_order=_json.dumps(dispatch_order),
                    surface_overrides=None,
                    version=1,
                    note=None,
                    updated_by=None,
                    created_at=now,
                    updated_at=now,
                )
            )
        else:
            existing.dispatch_order = _json.dumps(dispatch_order)
            existing.updated_at = now
        db.commit()
    finally:
        db.close()


# ────────────────────────────────────────────────────────────────────────────
# 1. Surface whitelist sanity
# ────────────────────────────────────────────────────────────────────────────


def test_dcro3_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert WORKER_SURFACE in KNOWN_SURFACES


def test_dcro3_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": WORKER_SURFACE, "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    assert r.json().get("accepted") is True


# ────────────────────────────────────────────────────────────────────────────
# 2. my-preference GET — default opted_in=False
# ────────────────────────────────────────────────────────────────────────────


def test_my_preference_get_creates_default_opted_out(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(f"{PREF_PATH}/my-preference", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["resolver_user_id"] == ACTOR_CLINICIAN
    assert data["clinic_id"] == DEMO_CLINIC
    assert data["opted_in"] is False
    assert data["preferred_channel"] is None
    assert data["last_dispatched_at"] is None
    assert data["worker_enabled_via_env"] is False


# ────────────────────────────────────────────────────────────────────────────
# 3. my-preference PUT — updates own row
# ────────────────────────────────────────────────────────────────────────────


def test_my_preference_put_updates_own_row(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.put(
        f"{PREF_PATH}/my-preference",
        json={"opted_in": True, "preferred_channel": "slack"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["opted_in"] is True
    assert data["preferred_channel"] == "slack"
    # GET returns the same row.
    r2 = client.get(f"{PREF_PATH}/my-preference", headers=auth_headers["clinician"])
    assert r2.status_code == 200
    assert r2.json()["opted_in"] is True


def test_my_preference_put_accepts_auto_for_chain_inheritance(
    client: TestClient, auth_headers: dict
) -> None:
    """'auto' / null both clear the override → channel resolves via chain."""
    r = client.put(
        f"{PREF_PATH}/my-preference",
        json={"opted_in": True, "preferred_channel": "auto"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["preferred_channel"] is None


def test_my_preference_put_rejects_unknown_channel(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.put(
        f"{PREF_PATH}/my-preference",
        json={"opted_in": True, "preferred_channel": "carrier-pigeon"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422, r.text


# ────────────────────────────────────────────────────────────────────────────
# 4. PUT cannot edit another resolver
# ────────────────────────────────────────────────────────────────────────────


def test_admin_cannot_write_other_resolvers_preference(
    client: TestClient, auth_headers: dict
) -> None:
    """Admin tries to PUT — endpoint hard-scopes to actor.actor_id, so the
    write only ever lands on the admin's OWN preference row, never the
    other resolver's."""
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=False)

    # Admin issues a PUT.
    r = client.put(
        f"{PREF_PATH}/my-preference",
        json={"opted_in": True, "preferred_channel": "slack"},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    # The write landed on the ADMIN's own row, not RESOLVER_Y's.
    assert data["resolver_user_id"] == ACTOR_ADMIN

    # RESOLVER_Y's preference is unchanged.
    db = SessionLocal()
    try:
        row = (
            db.query(ResolverCoachingDigestPreference)
            .filter_by(resolver_user_id=RESOLVER_Y, clinic_id=DEMO_CLINIC)
            .first()
        )
        assert row is not None
        assert row.opted_in is False
        assert row.preferred_channel is None
    finally:
        db.close()


# ────────────────────────────────────────────────────────────────────────────
# 5. Admin can READ other resolver via ?resolver_user_id=
# ────────────────────────────────────────────────────────────────────────────


def test_admin_can_read_other_resolvers_preference(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_pref(
        resolver_user_id=RESOLVER_Y,
        opted_in=True,
        preferred_channel="pagerduty",
    )

    r = client.get(
        f"{PREF_PATH}/my-preference?resolver_user_id={RESOLVER_Y}",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["resolver_user_id"] == RESOLVER_Y
    assert data["opted_in"] is True
    assert data["preferred_channel"] == "pagerduty"


def test_clinician_cannot_read_other_resolvers_preference(
    client: TestClient, auth_headers: dict
) -> None:
    """Non-admin reads only their own row — passing ?resolver_user_id=
    forces an admin gate which non-admins cannot pass."""
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)

    r = client.get(
        f"{PREF_PATH}/my-preference?resolver_user_id={RESOLVER_Y}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403, r.text


# ────────────────────────────────────────────────────────────────────────────
# 6. tick scopes to actor.clinic_id
# ────────────────────────────────────────────────────────────────────────────


def test_tick_scopes_to_actor_clinic(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(CG_A)
    _seed_pref(
        resolver_user_id=RESOLVER_Y, clinic_id=DEMO_CLINIC, opted_in=True
    )
    _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)

    r = client.post(f"{PREF_PATH}/tick", json={}, headers=auth_headers["admin"])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["clinic_id"] == DEMO_CLINIC
    assert data["resolvers_scanned"] == 1
    assert data["digests_dispatched"] == 1
    assert RESOLVER_Y in data["dispatched_resolver_ids"]


# ────────────────────────────────────────────────────────────────────────────
# 7. tick cross-clinic 404 — other-clinic resolver
# ────────────────────────────────────────────────────────────────────────────


def test_tick_cross_clinic_resolver_returns_404(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician", clinic_id=OTHER_CLINIC)
    _seed_pref(
        resolver_user_id=RESOLVER_Y, clinic_id=OTHER_CLINIC, opted_in=True
    )

    r = client.post(
        f"{PREF_PATH}/tick",
        json={"resolver_user_id": RESOLVER_Y},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 404, r.text


# ────────────────────────────────────────────────────────────────────────────
# 8. tick dispatches digest for opted-in resolver with un-reviewed wrong
# ────────────────────────────────────────────────────────────────────────────


def test_tick_dispatches_for_opted_in_resolver_with_wrong_calls(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(CG_A)
    _seed_pref(
        resolver_user_id=RESOLVER_Y, opted_in=True, preferred_channel="email"
    )
    _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)

    r = client.post(
        f"{PREF_PATH}/tick",
        json={"resolver_user_id": RESOLVER_Y},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["digests_dispatched"] == 1

    # Audit row exists with priority=info + correct fields.
    db = SessionLocal()
    try:
        rows = (
            db.query(AuditEventRecord)
            .filter(AuditEventRecord.action == DISPATCH_ACTION)
            .all()
        )
        assert len(rows) == 1
        n = rows[0].note or ""
        assert "priority=info" in n
        assert f"resolver_user_id={RESOLVER_Y}" in n
        assert f"clinic_id={DEMO_CLINIC}" in n
        assert "wrong_call_count=1" in n
        assert "channel=email" in n
    finally:
        db.close()


# ────────────────────────────────────────────────────────────────────────────
# 9. tick skips opted_out resolver
# ────────────────────────────────────────────────────────────────────────────


def test_tick_skips_opted_out_resolver(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(CG_A)
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=False)
    _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)

    r = client.post(f"{PREF_PATH}/tick", json={}, headers=auth_headers["admin"])
    assert r.status_code == 200
    data = r.json()
    # Opted-out resolvers don't even surface in resolvers_scanned (the
    # query filter pre-excludes them).
    assert data["digests_dispatched"] == 0
    assert data["resolvers_scanned"] == 0


# ────────────────────────────────────────────────────────────────────────────
# 10. tick skips resolver under cooldown
# ────────────────────────────────────────────────────────────────────────────


def test_tick_skips_resolver_under_cooldown(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(CG_A)
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)

    # Plant a recent dispatch row inside the 144h cooldown window.
    _seed_dispatch_audit_row(resolver_user_id=RESOLVER_Y, age_hours=12.0)

    r = client.post(f"{PREF_PATH}/tick", json={}, headers=auth_headers["admin"])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["digests_dispatched"] == 0
    assert data["skipped_cooldown"] == 1


# ────────────────────────────────────────────────────────────────────────────
# 11. tick skips resolver below MIN_WRONG_CALLS
# ────────────────────────────────────────────────────────────────────────────


def test_tick_skips_resolver_with_zero_wrong_calls(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    # No wrong-fp seeded — resolver has zero wrong calls.

    r = client.post(f"{PREF_PATH}/tick", json={}, headers=auth_headers["admin"])
    assert r.status_code == 200
    data = r.json()
    assert data["digests_dispatched"] == 0
    assert data["skipped_below_threshold"] == 1


# ────────────────────────────────────────────────────────────────────────────
# 12. tick skips resolver whose wrong calls are all self-review-noted
# ────────────────────────────────────────────────────────────────────────────


def test_tick_skips_resolver_with_all_self_reviewed(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(CG_A)
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    rid = _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)
    _seed_self_review_note(
        resolver_user_id=RESOLVER_Y, resolved_audit_id=rid
    )

    r = client.post(f"{PREF_PATH}/tick", json={}, headers=auth_headers["admin"])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["digests_dispatched"] == 0
    assert data["skipped_all_self_reviewed"] == 1


# ────────────────────────────────────────────────────────────────────────────
# 13. dispatched audit carries correct fields
# ────────────────────────────────────────────────────────────────────────────


def test_dispatched_audit_row_fields(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(CG_A)
    _seed_user(CG_B)
    _seed_pref(
        resolver_user_id=RESOLVER_Y, opted_in=True, preferred_channel="slack"
    )
    _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)
    _seed_wrong_fp(caregiver_user_id=CG_B, resolver_user_id=RESOLVER_Y)

    r = client.post(
        f"{PREF_PATH}/tick",
        json={"resolver_user_id": RESOLVER_Y},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        rows = (
            db.query(AuditEventRecord)
            .filter(AuditEventRecord.action == DISPATCH_ACTION)
            .all()
        )
        assert len(rows) == 1
        row = rows[0]
        assert row.target_id == RESOLVER_Y
        assert row.target_type == WORKER_SURFACE
        n = row.note or ""
        assert "priority=info" in n
        assert "wrong_call_count=2" in n
        assert "channel=slack" in n
        assert "delivery_status" in n
        assert "dispatched_at=" in n
    finally:
        db.close()


# ────────────────────────────────────────────────────────────────────────────
# 14. channel resolution chain — preference → escalation → email fallback
# ────────────────────────────────────────────────────────────────────────────


class TestChannelResolutionChain:
    def test_uses_preference_preferred_channel(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(RESOLVER_Y, role="clinician")
        _seed_user(CG_A)
        _seed_pref(
            resolver_user_id=RESOLVER_Y,
            opted_in=True,
            preferred_channel="pagerduty",
        )
        _seed_escalation_policy(
            clinic_id=DEMO_CLINIC, dispatch_order=["slack", "twilio"]
        )
        _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)

        r = client.post(
            f"{PREF_PATH}/tick", json={}, headers=auth_headers["admin"]
        )
        assert r.status_code == 200
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.action == DISPATCH_ACTION)
                .one()
            )
            assert "channel=pagerduty" in (row.note or "")
        finally:
            db.close()

    def test_falls_back_to_escalation_dispatch_order(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(RESOLVER_Y, role="clinician")
        _seed_user(CG_A)
        _seed_pref(
            resolver_user_id=RESOLVER_Y,
            opted_in=True,
            preferred_channel=None,  # auto / inherit chain
        )
        _seed_escalation_policy(
            clinic_id=DEMO_CLINIC, dispatch_order=["twilio", "slack"]
        )
        _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)

        r = client.post(
            f"{PREF_PATH}/tick", json={}, headers=auth_headers["admin"]
        )
        assert r.status_code == 200
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.action == DISPATCH_ACTION)
                .one()
            )
            assert "channel=twilio" in (row.note or "")
        finally:
            db.close()

    def test_falls_back_to_email_when_no_policy_no_pref(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(RESOLVER_Y, role="clinician")
        _seed_user(CG_A)
        _seed_pref(
            resolver_user_id=RESOLVER_Y, opted_in=True, preferred_channel=None
        )
        # No escalation policy seeded — the chain ends at "email".
        _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)

        r = client.post(
            f"{PREF_PATH}/tick", json={}, headers=auth_headers["admin"]
        )
        assert r.status_code == 200
        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.action == DISPATCH_ACTION)
                .one()
            )
            assert "channel=email" in (row.note or "")
        finally:
            db.close()


# ────────────────────────────────────────────────────────────────────────────
# 15. Worker disabled (ENABLED=False) — tick still runs
# ────────────────────────────────────────────────────────────────────────────


def test_admin_can_tick_even_when_worker_disabled_via_env(
    client: TestClient, auth_headers: dict, monkeypatch
) -> None:
    monkeypatch.delenv("RESOLVER_COACHING_DIGEST_ENABLED", raising=False)
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(CG_A)
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)

    # Status should report enabled=False but tick should still dispatch.
    s = client.get(f"{PREF_PATH}/status", headers=auth_headers["clinician"])
    assert s.status_code == 200
    assert s.json()["enabled"] is False

    r = client.post(f"{PREF_PATH}/tick", json={}, headers=auth_headers["admin"])
    assert r.status_code == 200
    assert r.json()["digests_dispatched"] == 1


# ────────────────────────────────────────────────────────────────────────────
# 16. audit-events scoped to clinic
# ────────────────────────────────────────────────────────────────────────────


def test_audit_events_scoped_to_clinic(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(RESOLVER_Y, role="clinician")
    _seed_user(CG_A)
    _seed_pref(resolver_user_id=RESOLVER_Y, opted_in=True)
    _seed_wrong_fp(caregiver_user_id=CG_A, resolver_user_id=RESOLVER_Y)

    # Seed a foreign clinic dispatch row that must NOT leak.
    _seed_dispatch_audit_row(
        resolver_user_id=RESOLVER_OTHER, clinic_id=OTHER_CLINIC, age_hours=2.0
    )

    # Trigger one in-clinic dispatch.
    r = client.post(f"{PREF_PATH}/tick", json={}, headers=auth_headers["admin"])
    assert r.status_code == 200

    r2 = client.get(
        f"{PREF_PATH}/audit-events?surface={WORKER_SURFACE}",
        headers=auth_headers["clinician"],
    )
    assert r2.status_code == 200, r2.text
    data = r2.json()
    # All visible rows should carry the actor's clinic_id needle.
    for item in data["items"]:
        n = item.get("note", "") or ""
        assert (f"clinic_id={DEMO_CLINIC}" in n) or (
            item.get("target_id") == DEMO_CLINIC
        )
    # The OTHER_CLINIC dispatch row must not be returned.
    assert all(
        f"clinic_id={OTHER_CLINIC}" not in (i.get("note") or "")
        for i in data["items"]
    )


# ────────────────────────────────────────────────────────────────────────────
# 17. status endpoint returns enabled flag
# ────────────────────────────────────────────────────────────────────────────


def test_status_endpoint_returns_enabled_flag(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(f"{PREF_PATH}/status", headers=auth_headers["clinician"])
    assert r.status_code == 200
    data = r.json()
    assert "enabled" in data
    assert data["enabled"] is False  # default-off
    assert "interval_hours" in data
    assert "cooldown_hours" in data
    assert "min_wrong_calls" in data
    assert isinstance(data["disclaimers"], list) and data["disclaimers"]


# ────────────────────────────────────────────────────────────────────────────
# 18. 080 alembic up + down clean
# ────────────────────────────────────────────────────────────────────────────


def test_080_module_loads_and_has_correct_revision_metadata() -> None:
    """080 has down_revision=079 and revision=080_resolver_coaching_digest_preference."""
    import importlib.util
    from pathlib import Path

    p = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "080_resolver_coaching_digest_preference.py"
    )
    spec = importlib.util.spec_from_file_location("mig080", p)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    assert mod.revision == "080_resolver_coaching_digest_preference"
    assert mod.down_revision == "079_caregiver_preferred_channel"
    assert callable(mod.upgrade) and callable(mod.downgrade)


# ────────────────────────────────────────────────────────────────────────────
# 19. clinician (non-admin) cannot tick
# ────────────────────────────────────────────────────────────────────────────


def test_clinician_cannot_tick(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(f"{PREF_PATH}/tick", json={}, headers=auth_headers["clinician"])
    assert r.status_code == 403, r.text


# ────────────────────────────────────────────────────────────────────────────
# 20. resolver who is admin can edit own preference normally
# ────────────────────────────────────────────────────────────────────────────


def test_admin_can_edit_own_preference(
    client: TestClient, auth_headers: dict
) -> None:
    """Admin may freely edit their OWN preference row — the privacy
    gate only blocks editing OTHER resolvers' rows."""
    r = client.put(
        f"{PREF_PATH}/my-preference",
        json={"opted_in": True, "preferred_channel": "twilio"},
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["resolver_user_id"] == ACTOR_ADMIN
    assert data["opted_in"] is True
    assert data["preferred_channel"] == "twilio"


# ────────────────────────────────────────────────────────────────────────────
# 21. Audit row for preference_updated is emitted on PUT
# ────────────────────────────────────────────────────────────────────────────


def test_preference_updated_audit_emitted_on_put(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.put(
        f"{PREF_PATH}/my-preference",
        json={"opted_in": True, "preferred_channel": "sendgrid"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text

    db = SessionLocal()
    try:
        rows = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_type == WORKER_SURFACE,
                AuditEventRecord.action
                == f"{WORKER_SURFACE}.preference_updated",
                AuditEventRecord.actor_id == ACTOR_CLINICIAN,
            )
            .all()
        )
        assert len(rows) == 1
        assert "opted_in=yes" in (rows[0].note or "")
        assert "preferred_channel=sendgrid" in (rows[0].note or "")
    finally:
        db.close()
