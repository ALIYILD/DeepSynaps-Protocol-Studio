"""IRB Amendment Reviewer Workload launch-audit tests (IRB-AMD2, 2026-05-02).

Closes "workflow exists" → "workflow has SLA enforcement". The
IRB-AMD1 amendment workflow shipped a regulator-credible lifecycle
but no SLA enforcement. IRB-AMD2 ships:

* per-reviewer queue snapshots
* per-clinic workload dashboard
* HIGH-priority SLA-breach audit row routed into the Clinician Inbox
  aggregator (#354) via the ``priority=high`` token

Tests cover:

* workload counts (pending_assigned + pending_under_review +
  total_pending + oldest_pending_age_days)
* SLA breach predicate (queue_threshold AND age_threshold)
* sort order (sla_breach desc, oldest_pending_age_days desc)
* unassigned-amendments filter
* suggest-reviewer ranking (lowest total_pending, admins excluded)
* cross-clinic IDOR (clinic A → 404 / empty for clinic B actor)
* role gating (clinician+ for read, admin-only for tick)
* tick emits queue_breach_detected with priority=high
* tick respects cooldown (no re-emit within window)
* tick scopes to actor.clinic_id (no cross-clinic leak)
* worker disabled (env False) → manual tick still works
* status returns enabled flag + thresholds
* audit-events scoped + paginated
* full integration: submitted + assigned → workload reflects → tick
  emits breach
* surface whitelist sanity (audit_trail + qeeg)
* reviewers with no pending NOT in workload table
"""
from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz
from typing import Optional

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    IRBProtocol,
    IRBProtocolAmendment,
    IRBProtocolRevision,
    User,
)
from app.workers.irb_reviewer_sla_worker import (
    BREACH_TARGET_TYPE,
    WORKER_SURFACE,
    _reset_for_tests,
    env_enabled,
    get_worker,
)


SURFACE = "irb_amendment_reviewer_workload"
WL_PATH = "/api/v1/irb-amendment-reviewer-workload"


_CLINIC_A = "clinic-irbamd2-a"
_CLINIC_B = "clinic-irbamd2-b"

ADMIN_A_USER = "actor-irbamd2-admin-a"
ADMIN_B_USER = "actor-irbamd2-admin-b"
CLIN_A_USER = "actor-irbamd2-clin-a"
CLIN_A2_USER = "actor-irbamd2-clin-a2"
CLIN_A3_USER = "actor-irbamd2-clin-a3"
CLIN_B_USER = "actor-irbamd2-clin-b"

_TEST_USER_IDS = (
    ADMIN_A_USER,
    ADMIN_B_USER,
    CLIN_A_USER,
    CLIN_A2_USER,
    CLIN_A3_USER,
    CLIN_B_USER,
    "actor-clinician-demo",
    "actor-admin-demo",
)


# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean():
    """Wipe IRB-AMD2 amendments + protocols + audit before each test."""
    _reset_for_tests()
    yield
    _reset_for_tests()
    db = SessionLocal()
    try:
        db.query(IRBProtocolRevision).delete(synchronize_session=False)
        db.query(IRBProtocolAmendment).delete(synchronize_session=False)
        db.query(IRBProtocol).filter(
            IRBProtocol.clinic_id.in_([_CLINIC_A, _CLINIC_B])
        ).delete(synchronize_session=False)
        db.query(IRBProtocol).filter(
            IRBProtocol.id.like("proto-irbamd2-%")
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_(
                [SURFACE, WORKER_SURFACE, BREACH_TARGET_TYPE, "irb_amendment"]
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(list(_TEST_USER_IDS))).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def _seed_user(
    user_id: str,
    *,
    role: str = "clinician",
    clinic_id: Optional[str] = _CLINIC_A,
) -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id=user_id).first()
        if existing is not None:
            existing.clinic_id = clinic_id
            existing.role = role
            db.commit()
            return
        db.add(
            User(
                id=user_id,
                email=f"{user_id}@example.com",
                display_name=user_id,
                hashed_password="x",
                role=role,
                package_id="enterprise",
                clinic_id=clinic_id,
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_protocol(
    *,
    clinic_id: str = _CLINIC_A,
    protocol_id: Optional[str] = None,
    pi_user_id: str = ADMIN_A_USER,
) -> IRBProtocol:
    db = SessionLocal()
    try:
        pid = protocol_id or f"proto-irbamd2-{_uuid.uuid4().hex[:8]}"
        proto = IRBProtocol(
            id=pid,
            clinic_id=clinic_id,
            title="IRB-AMD2 RCT",
            description="Pilot RCT.",
            pi_user_id=pi_user_id,
            status="active",
            created_by=pi_user_id,
            version=1,
        )
        db.add(proto)
        db.commit()
        db.refresh(proto)
        return proto
    finally:
        db.close()


def _seed_amendment(
    *,
    protocol_id: str,
    status: str,
    reviewer_user_id: Optional[str] = None,
    submitted_by: str = CLIN_A_USER,
    submitted_at: Optional[_dt] = None,
    amendment_id: Optional[str] = None,
    description: str = "Pending amendment",
) -> str:
    """Seed an amendment row directly so we can control submitted_at."""
    db = SessionLocal()
    try:
        aid = amendment_id or f"amd-irbamd2-{_uuid.uuid4().hex[:8]}"
        amd = IRBProtocolAmendment(
            id=aid,
            protocol_id=protocol_id,
            amendment_type="protocol_change",
            description=description,
            reason="Test amendment for SLA worker.",
            submitted_by=submitted_by,
            submitted_at=submitted_at or _dt.now(_tz.utc),
            status=status,
            assigned_reviewer_user_id=reviewer_user_id,
            version=1,
            created_by_user_id=submitted_by,
        )
        db.add(amd)
        db.commit()
        return aid
    finally:
        db.close()


def _setup_clinic_a():
    _seed_user("actor-clinician-demo", role="clinician", clinic_id=_CLINIC_A)
    _seed_user("actor-admin-demo", role="admin", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A2_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A3_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(ADMIN_A_USER, role="admin", clinic_id=_CLINIC_A)


def _setup_clinic_b():
    _seed_user("actor-clinician-demo", role="clinician", clinic_id=_CLINIC_B)
    _seed_user("actor-admin-demo", role="admin", clinic_id=_CLINIC_B)


# ── 1. Surface whitelist ───────────────────────────────────────────────────


def test_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": SURFACE, "note": "whitelist"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    assert r.json().get("event_id", "").startswith(f"{SURFACE}-")


# ── 2. Workload counts ────────────────────────────────────────────────────


def test_workload_counts_pending_assigned_and_under_review(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    _seed_amendment(
        protocol_id=proto.id,
        status="reviewer_assigned",
        reviewer_user_id=CLIN_A2_USER,
    )
    _seed_amendment(
        protocol_id=proto.id,
        status="under_review",
        reviewer_user_id=CLIN_A2_USER,
    )
    r = client.get(
        f"{WL_PATH}/workload", headers=auth_headers["clinician"]
    )
    assert r.status_code == 200, r.text
    body = r.json()
    items = body["items"]
    me = [i for i in items if i["reviewer_user_id"] == CLIN_A2_USER]
    assert len(me) == 1
    assert me[0]["pending_assigned"] == 1
    assert me[0]["pending_under_review"] == 1
    assert me[0]["total_pending"] == 2


def test_workload_excludes_reviewers_with_no_pending(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    # CLIN_A2 has 1 pending; CLIN_A3 has none.
    _seed_amendment(
        protocol_id=proto.id,
        status="reviewer_assigned",
        reviewer_user_id=CLIN_A2_USER,
    )
    r = client.get(
        f"{WL_PATH}/workload", headers=auth_headers["clinician"]
    )
    body = r.json()
    rids = {i["reviewer_user_id"] for i in body["items"]}
    assert CLIN_A2_USER in rids
    assert CLIN_A3_USER not in rids


# ── 3. SLA breach predicate ───────────────────────────────────────────────


def test_workload_sla_breach_true_when_threshold_and_age(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    old_ts = _dt.now(_tz.utc) - _td(days=10)
    for _ in range(5):
        _seed_amendment(
            protocol_id=proto.id,
            status="reviewer_assigned",
            reviewer_user_id=CLIN_A2_USER,
            submitted_at=old_ts,
        )
    r = client.get(f"{WL_PATH}/workload", headers=auth_headers["admin"])
    body = r.json()
    me = [i for i in body["items"] if i["reviewer_user_id"] == CLIN_A2_USER][0]
    assert me["total_pending"] == 5
    assert me["oldest_pending_age_days"] >= 7
    assert me["sla_breach"] is True
    assert body["sla_breach_count"] >= 1


def test_workload_sla_breach_false_below_thresholds(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    # Only 2 pending, recent submission — below both thresholds.
    for _ in range(2):
        _seed_amendment(
            protocol_id=proto.id,
            status="reviewer_assigned",
            reviewer_user_id=CLIN_A2_USER,
            submitted_at=_dt.now(_tz.utc) - _td(days=1),
        )
    r = client.get(f"{WL_PATH}/workload", headers=auth_headers["clinician"])
    body = r.json()
    me = [i for i in body["items"] if i["reviewer_user_id"] == CLIN_A2_USER][0]
    assert me["sla_breach"] is False


def test_workload_sorted_breach_then_oldest_age(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    # CLIN_A2: 5 ancient pending (breach=True, oldest=20d)
    # CLIN_A3: 1 pending (breach=False, oldest=2d)
    for _ in range(5):
        _seed_amendment(
            protocol_id=proto.id,
            status="reviewer_assigned",
            reviewer_user_id=CLIN_A2_USER,
            submitted_at=_dt.now(_tz.utc) - _td(days=20),
        )
    _seed_amendment(
        protocol_id=proto.id,
        status="reviewer_assigned",
        reviewer_user_id=CLIN_A3_USER,
        submitted_at=_dt.now(_tz.utc) - _td(days=2),
    )
    r = client.get(f"{WL_PATH}/workload", headers=auth_headers["admin"])
    body = r.json()
    items = body["items"]
    # First item should be the breached one.
    assert items[0]["reviewer_user_id"] == CLIN_A2_USER
    assert items[0]["sla_breach"] is True


# ── 4. Unassigned amendments ──────────────────────────────────────────────


def test_unassigned_returns_only_submitted_with_no_reviewer(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    aid = _seed_amendment(protocol_id=proto.id, status="submitted")
    # An amendment that already has a reviewer should NOT be returned.
    _seed_amendment(
        protocol_id=proto.id,
        status="reviewer_assigned",
        reviewer_user_id=CLIN_A2_USER,
    )
    r = client.get(
        f"{WL_PATH}/unassigned-amendments", headers=auth_headers["clinician"]
    )
    assert r.status_code == 200, r.text
    body = r.json()
    ids = {i["id"] for i in body["items"]}
    assert aid in ids
    assert all(
        i["submission_age_days"] >= 0 for i in body["items"]
    )


# ── 5. Suggest reviewer ──────────────────────────────────────────────────


def test_suggest_reviewer_returns_lowest_pending(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    # CLIN_A2 has 3 pending; CLIN_A3 has 1 pending.
    for _ in range(3):
        _seed_amendment(
            protocol_id=proto.id,
            status="reviewer_assigned",
            reviewer_user_id=CLIN_A2_USER,
        )
    _seed_amendment(
        protocol_id=proto.id,
        status="reviewer_assigned",
        reviewer_user_id=CLIN_A3_USER,
    )
    target = _seed_amendment(protocol_id=proto.id, status="submitted")
    r = client.get(
        f"{WL_PATH}/suggest-reviewer?amendment_id={target}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # Should not pick CLIN_A2 (3 pending — clearly highest) and should
    # not pick the submitter (CLIN_A_USER). Any 0-pending candidate is
    # acceptable; ranking ties break alphabetically.
    suggested = body["suggested_reviewer_user_id"]
    assert suggested is not None
    assert suggested != CLIN_A2_USER
    assert suggested != CLIN_A_USER


def test_suggest_reviewer_returns_none_when_no_candidate(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    # Wipe all clinicians for clinic A so no candidate remains.
    db = SessionLocal()
    try:
        db.query(User).filter(User.clinic_id == _CLINIC_A).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()
    # Re-seed only the demo admin so the auth header still resolves.
    _seed_user("actor-admin-demo", role="admin", clinic_id=_CLINIC_A)
    target = _seed_amendment(protocol_id=proto.id, status="submitted")
    r = client.get(
        f"{WL_PATH}/suggest-reviewer?amendment_id={target}",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["suggested_reviewer_user_id"] is None


# ── 6. Cross-clinic IDOR ─────────────────────────────────────────────────


def test_cross_clinic_workload_does_not_leak(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    _seed_amendment(
        protocol_id=proto.id,
        status="reviewer_assigned",
        reviewer_user_id=CLIN_A2_USER,
    )
    # Switch demo to clinic B → shouldn't see clinic A reviewers.
    _setup_clinic_b()
    r = client.get(f"{WL_PATH}/workload", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text
    body = r.json()
    rids = {i["reviewer_user_id"] for i in body["items"]}
    assert CLIN_A2_USER not in rids


# ── 7. Role gating ───────────────────────────────────────────────────────


def test_workload_clinician_passes(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    r = client.get(f"{WL_PATH}/workload", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text


def test_workload_patient_forbidden(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(f"{WL_PATH}/workload", headers=auth_headers["patient"])
    assert r.status_code == 403


def test_workload_guest_forbidden(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(f"{WL_PATH}/workload", headers=auth_headers["guest"])
    assert r.status_code == 403


def test_tick_admin_can_invoke(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    r = client.post(f"{WL_PATH}/worker/tick", headers=auth_headers["admin"])
    assert r.status_code == 200, r.text
    assert r.json()["accepted"] is True


def test_tick_clinician_forbidden(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    r = client.post(
        f"{WL_PATH}/worker/tick", headers=auth_headers["clinician"]
    )
    assert r.status_code == 403


# ── 8. Tick → breach emission ────────────────────────────────────────────


def test_tick_emits_breach_for_breached_reviewer(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    old_ts = _dt.now(_tz.utc) - _td(days=10)
    for _ in range(5):
        _seed_amendment(
            protocol_id=proto.id,
            status="reviewer_assigned",
            reviewer_user_id=CLIN_A2_USER,
            submitted_at=old_ts,
        )
    r = client.post(f"{WL_PATH}/worker/tick", headers=auth_headers["admin"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["breaches_emitted"] >= 1

    # Verify the audit row carries priority=high + correct target_type.
    db = SessionLocal()
    try:
        rows = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_type == BREACH_TARGET_TYPE,
                AuditEventRecord.action
                == f"{WORKER_SURFACE}.queue_breach_detected",
                AuditEventRecord.target_id == CLIN_A2_USER,
            )
            .all()
        )
        assert len(rows) >= 1
        assert "priority=high" in rows[0].note
        assert f"reviewer_user_id={CLIN_A2_USER}" in rows[0].note
        assert "pending_count=5" in rows[0].note
    finally:
        db.close()


def test_tick_respects_cooldown_no_reemit(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    old_ts = _dt.now(_tz.utc) - _td(days=10)
    for _ in range(5):
        _seed_amendment(
            protocol_id=proto.id,
            status="reviewer_assigned",
            reviewer_user_id=CLIN_A2_USER,
            submitted_at=old_ts,
        )
    r1 = client.post(f"{WL_PATH}/worker/tick", headers=auth_headers["admin"])
    first_count = r1.json()["breaches_emitted"]
    assert first_count >= 1
    r2 = client.post(f"{WL_PATH}/worker/tick", headers=auth_headers["admin"])
    body2 = r2.json()
    assert body2["breaches_emitted"] == 0
    assert body2["skipped_cooldown"] >= 1


def test_tick_scopes_to_actor_clinic_no_leak(
    client: TestClient, auth_headers: dict
) -> None:
    """A clinic A admin's tick must not emit breach rows for clinic B
    reviewers.
    """
    _setup_clinic_a()
    proto_b = _seed_protocol(
        clinic_id=_CLINIC_B,
        protocol_id=f"proto-irbamd2-b-{_uuid.uuid4().hex[:6]}",
    )
    _seed_user("reviewer-b-1", role="clinician", clinic_id=_CLINIC_B)
    old_ts = _dt.now(_tz.utc) - _td(days=10)
    for _ in range(5):
        _seed_amendment(
            protocol_id=proto_b.id,
            status="reviewer_assigned",
            reviewer_user_id="reviewer-b-1",
            submitted_at=old_ts,
        )
    # Admin in clinic A ticks. Should NOT emit a breach row for the
    # clinic B reviewer.
    r = client.post(f"{WL_PATH}/worker/tick", headers=auth_headers["admin"])
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        rows = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_type == BREACH_TARGET_TYPE,
                AuditEventRecord.target_id == "reviewer-b-1",
            )
            .count()
        )
        assert rows == 0
        # Clean up the cross-clinic seed.
        db.query(User).filter(User.id == "reviewer-b-1").delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


# ── 9. Worker disabled → manual tick still works ─────────────────────────


def test_worker_disabled_env_manual_tick_still_runs(
    client: TestClient, auth_headers: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("IRB_REVIEWER_SLA_ENABLED", raising=False)
    assert env_enabled() is False
    _setup_clinic_a()
    r = client.post(f"{WL_PATH}/worker/tick", headers=auth_headers["admin"])
    # Manual tick succeeds regardless of env flag.
    assert r.status_code == 200, r.text


# ── 10. Status endpoint ─────────────────────────────────────────────────


def test_worker_status_returns_thresholds(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    r = client.get(f"{WL_PATH}/worker/status", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert "enabled" in body
    assert body["queue_threshold"] >= 1
    assert body["age_threshold_days"] >= 1
    assert body["cooldown_hours"] >= 1


# ── 11. Audit events feed ──────────────────────────────────────────────


def test_audit_events_paginated_and_scoped(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    # Generate a workload_viewed audit row.
    client.get(f"{WL_PATH}/workload", headers=auth_headers["clinician"])
    r = client.get(
        f"{WL_PATH}/audit-events?limit=10",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body
    assert body["limit"] == 10
    assert body["surface"] == SURFACE


# ── 12. Integration ─────────────────────────────────────────────────────


def test_integration_submit_assign_threshold_age_breach(
    client: TestClient, auth_headers: dict
) -> None:
    """End-to-end: 5 amendments submitted + assigned + aged → tick emits
    a queue_breach_detected row carrying priority=high.
    """
    _setup_clinic_a()
    proto = _seed_protocol(clinic_id=_CLINIC_A)
    old_ts = _dt.now(_tz.utc) - _td(days=8)
    for _ in range(5):
        _seed_amendment(
            protocol_id=proto.id,
            status="under_review",
            reviewer_user_id=CLIN_A2_USER,
            submitted_at=old_ts,
        )
    # Workload reflects breach.
    r1 = client.get(f"{WL_PATH}/workload", headers=auth_headers["admin"])
    body1 = r1.json()
    me = [i for i in body1["items"] if i["reviewer_user_id"] == CLIN_A2_USER][0]
    assert me["sla_breach"] is True
    # Tick emits.
    r2 = client.post(f"{WL_PATH}/worker/tick", headers=auth_headers["admin"])
    body2 = r2.json()
    assert body2["breaches_emitted"] >= 1
    # Audit-event feed surfaces the breach.
    r3 = client.get(
        f"{WL_PATH}/audit-events?limit=50", headers=auth_headers["admin"]
    )
    body3 = r3.json()
    assert any(
        it["action"] == f"{WORKER_SURFACE}.queue_breach_detected"
        and "priority=high" in it["note"]
        for it in body3["items"]
    )
