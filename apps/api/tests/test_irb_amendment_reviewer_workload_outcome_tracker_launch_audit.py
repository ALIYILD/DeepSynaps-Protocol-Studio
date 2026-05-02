"""IRB Amendment Reviewer Workload Outcome Tracker launch-audit tests
(IRB-AMD3, 2026-05-02).

Closes the loop on whether the IRB-AMD2 SLA-breach signal actually
nudges reviewer behavior. Pairs each ``irb_reviewer_sla.queue_breach_detected``
audit row at time T with the same reviewer's NEXT
``irb.amendment_decided_*`` audit row (created_at > T) within an
N-day SLA response window.

Outcome classification
======================

* ``decided_within_sla`` — next decision exists AND
  ``(next.created_at - T) <= sla_response_days``
* ``decided_late`` — next decision exists AND
  ``(next.created_at - T) > sla_response_days``
* ``still_pending`` — no next decision AND ``now() - T >= sla_response_days``
* ``pending`` — no next decision AND ``now() - T < sla_response_days``

Tests cover:

* outcome classification (4 branches)
* cross-clinic IDOR: clinic A breach not surfaced for clinic B actor
* role gating: clinician+, patient/guest 403
* by_reviewer_top sorted by calibration_score asc, capped at 5
* reviewer_calibration formula: 4 within, 1 late, 1 still_pending → 0.6
* reviewer_calibration excludes reviewers below ``min_breaches`` floor
* reviewer_calibration excludes pending from denominator
* median_days_to_next_decision computed correctly across decided pairs
* median_days_to_next_decision is null when no decided pairs
* outcome_pct excludes pending from denominator
* list paginates + filters by reviewer_user_id and outcome
* audit-events scoped + paginated
* integration: emit breach + decision rows → outcome correctly classified
* reviewer who never breached has no calibration record
* surface whitelist sanity (audit_trail + qeeg)
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz
from typing import Optional

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, User
from app.repositories.audit import create_audit_event
from app.services.irb_reviewer_sla_outcome_pairing import (
    BREACH_ACTION,
    BREACH_TARGET_TYPE,
    DECISION_ACTION_PREFIX,
    DECISION_TARGET_TYPE,
    OUTCOME_DECIDED_LATE,
    OUTCOME_DECIDED_WITHIN_SLA,
    OUTCOME_PENDING,
    OUTCOME_STILL_PENDING,
    SURFACE,
)


WL_PATH = "/api/v1/irb-amendment-reviewer-workload-outcome-tracker"


_CLINIC_A = "clinic-irbamd3-a"
_CLINIC_B = "clinic-irbamd3-b"

ADMIN_A_USER = "actor-irbamd3-admin-a"
CLIN_A_USER = "actor-irbamd3-clin-a"
CLIN_A2_USER = "actor-irbamd3-clin-a2"
CLIN_A3_USER = "actor-irbamd3-clin-a3"
CLIN_B_USER = "actor-irbamd3-clin-b"

_TEST_USER_IDS = (
    ADMIN_A_USER,
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
    """Wipe IRB-AMD3 audit + test users before/after each test."""
    yield
    db = SessionLocal()
    try:
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_(
                [SURFACE, BREACH_TARGET_TYPE, DECISION_TARGET_TYPE]
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


def _setup_clinic_a() -> None:
    _seed_user("actor-clinician-demo", role="clinician", clinic_id=_CLINIC_A)
    _seed_user("actor-admin-demo", role="admin", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A2_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A3_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(ADMIN_A_USER, role="admin", clinic_id=_CLINIC_A)


def _setup_clinic_b() -> None:
    _seed_user("actor-clinician-demo", role="clinician", clinic_id=_CLINIC_B)
    _seed_user("actor-admin-demo", role="admin", clinic_id=_CLINIC_B)
    _seed_user(CLIN_B_USER, role="clinician", clinic_id=_CLINIC_B)


def _emit_breach(
    db,
    *,
    clinic_id: str,
    reviewer_user_id: str,
    pending_count: int = 5,
    oldest_age_days: int = 10,
    when: Optional[_dt] = None,
) -> str:
    """Mirror of the IRB-AMD2 worker's _emit_breach_audit row."""
    when = when or _dt.now(_tz.utc)
    eid = (
        f"irb_reviewer_sla-queue_breach_detected-{clinic_id}-"
        f"{reviewer_user_id}-{int(when.timestamp())}-{_uuid.uuid4().hex[:6]}"
    )
    note = (
        f"clinic_id={clinic_id} reviewer_user_id={reviewer_user_id} "
        f"pending_count={pending_count} oldest_age_days={oldest_age_days} "
        f"priority=high"
    )
    create_audit_event(
        db,
        event_id=eid,
        target_id=reviewer_user_id,
        target_type=BREACH_TARGET_TYPE,
        action=BREACH_ACTION,
        role="admin",
        actor_id="irb-reviewer-sla-worker",
        note=note,
        created_at=when.isoformat(),
    )
    return eid


def _emit_decision(
    db,
    *,
    clinic_id: str,
    reviewer_user_id: str,
    decision: str = "approved",
    when: Optional[_dt] = None,
) -> str:
    """Mirror of the IRB-AMD1 ``decide_amendment`` audit row."""
    when = when or _dt.now(_tz.utc)
    aid = f"amd-irbamd3-{_uuid.uuid4().hex[:8]}"
    eid = (
        f"irb_amendment-decided_{decision}-{aid}-"
        f"{int(when.timestamp())}-{_uuid.uuid4().hex[:6]}"
    )
    note = (
        f"clinic_id={clinic_id} amendment_id={aid} "
        f"from_status=under_review to_status={decision} "
        f"actor_id={reviewer_user_id}"
    )
    create_audit_event(
        db,
        event_id=eid,
        target_id=aid,
        target_type=DECISION_TARGET_TYPE,
        action=f"{DECISION_ACTION_PREFIX}_{decision}",
        role="clinician",
        actor_id=reviewer_user_id,
        note=note,
        created_at=when.isoformat(),
    )
    return eid


# ── 1. Surface whitelist ──────────────────────────────────────────────────


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


# ── 2. Outcome classification ──────────────────────────────────────────────


def test_outcome_decided_within_sla(
    client: TestClient, auth_headers: dict
) -> None:
    """Breach with decision 5d later (sla_response=14) → decided_within_sla."""
    _setup_clinic_a()
    db = SessionLocal()
    try:
        breach_at = _dt.now(_tz.utc) - _td(days=20)
        _emit_breach(db, clinic_id=_CLINIC_A, reviewer_user_id=CLIN_A2_USER, when=breach_at)
        _emit_decision(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=breach_at + _td(days=5),
        )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/list?sla_response_days=14",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["outcome"] == OUTCOME_DECIDED_WITHIN_SLA
    assert items[0]["days_to_next_decision"] == 5.0


def test_outcome_decided_late(client: TestClient, auth_headers: dict) -> None:
    """Breach with decision 20d later → decided_late (sla_response=14)."""
    _setup_clinic_a()
    db = SessionLocal()
    try:
        breach_at = _dt.now(_tz.utc) - _td(days=40)
        _emit_breach(db, clinic_id=_CLINIC_A, reviewer_user_id=CLIN_A2_USER, when=breach_at)
        _emit_decision(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=breach_at + _td(days=20),
        )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/list?sla_response_days=14",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["outcome"] == OUTCOME_DECIDED_LATE
    assert items[0]["days_to_next_decision"] == 20.0


def test_outcome_still_pending(client: TestClient, auth_headers: dict) -> None:
    """Breach 30d ago, no decision → still_pending."""
    _setup_clinic_a()
    db = SessionLocal()
    try:
        _emit_breach(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=_dt.now(_tz.utc) - _td(days=30),
        )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/list?sla_response_days=14",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["outcome"] == OUTCOME_STILL_PENDING
    assert items[0]["days_to_next_decision"] is None


def test_outcome_pending_within_grace(
    client: TestClient, auth_headers: dict
) -> None:
    """Breach 5d ago, no decision, sla_response=14 → pending (grace)."""
    _setup_clinic_a()
    db = SessionLocal()
    try:
        _emit_breach(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=_dt.now(_tz.utc) - _td(days=5),
        )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/list?sla_response_days=14",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["outcome"] == OUTCOME_PENDING


# ── 3. Cross-clinic IDOR ──────────────────────────────────────────────────


def test_cross_clinic_idor_breach_not_surfaced_for_other_clinic(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    db = SessionLocal()
    try:
        _emit_breach(db, clinic_id=_CLINIC_A, reviewer_user_id=CLIN_A2_USER)
    finally:
        db.close()
    # Switch demo to clinic B → must NOT see clinic A breaches.
    _setup_clinic_b()
    r = client.get(f"{WL_PATH}/summary", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_breaches"] == 0
    assert body["outcome_counts"]["decided_within_sla"] == 0


# ── 4. Role gating ────────────────────────────────────────────────────────


def test_summary_clinician_passes(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    r = client.get(f"{WL_PATH}/summary", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text


def test_summary_patient_forbidden(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(f"{WL_PATH}/summary", headers=auth_headers["patient"])
    assert r.status_code == 403


def test_summary_guest_forbidden(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(f"{WL_PATH}/summary", headers=auth_headers["guest"])
    assert r.status_code == 403


# ── 5. by_reviewer_top sort + cap ─────────────────────────────────────────


def test_summary_by_reviewer_top_sorted_worst_first_capped_5(
    client: TestClient, auth_headers: dict
) -> None:
    """Worst-calibration reviewer surfaces first; cap at 5."""
    _setup_clinic_a()
    # Seed 6 distinct reviewer users.
    for i in range(6):
        _seed_user(f"rev-irbamd3-{i}", role="clinician", clinic_id=_CLINIC_A)
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc)
        # rev-0: 1 breach, all still_pending → score = (0-1)/1 = -1 (worst)
        _emit_breach(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id="rev-irbamd3-0",
            when=now - _td(days=30),
        )
        # rev-1..rev-5: 1 breach, decided_within_sla → score = 1
        for i in range(1, 6):
            uid = f"rev-irbamd3-{i}"
            breach_at = now - _td(days=20 + i)
            _emit_breach(db, clinic_id=_CLINIC_A, reviewer_user_id=uid, when=breach_at)
            _emit_decision(
                db,
                clinic_id=_CLINIC_A,
                reviewer_user_id=uid,
                when=breach_at + _td(days=2),
            )
    finally:
        db.close()
    r = client.get(f"{WL_PATH}/summary", headers=auth_headers["clinician"])
    body = r.json()
    top = body["by_reviewer_top"]
    assert len(top) == 5  # capped
    assert top[0]["reviewer_user_id"] == "rev-irbamd3-0"
    assert top[0]["calibration_score"] == -1.0


# ── 6. Calibration formula ────────────────────────────────────────────────


def test_reviewer_calibration_formula_4within_1late_1stillpending(
    client: TestClient, auth_headers: dict
) -> None:
    """4 within + 1 late + 1 still_pending → score = (4-1)/6 = 0.5.

    Pending is excluded from denom, but still_pending is NOT.
    Total=6, pending=0 → denom = max(6-0, 1) = 6. score = (4-1)/6 = 0.5.

    Test layout uses LATER (more-recent) breaches first so that each
    breach's ``first decision after T`` is the decision we paired
    with intentionally, not a stray decision from a future cycle.
    """
    _setup_clinic_a()
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc)
        # 1 still_pending FIRST: breach 60d ago, no decision strictly
        # after it (the still_pending breach must be AFTER any other
        # decision in the dataset to avoid being paired). We place the
        # still_pending breach AFTER all the decided-pair cycles below.
        # Cycle 1-4 (within): breach at -150 - i*2, decision 5d after.
        for i in range(4):
            t = now - _td(days=150 + i * 2)
            _emit_breach(db, clinic_id=_CLINIC_A, reviewer_user_id=CLIN_A2_USER, when=t)
            _emit_decision(
                db,
                clinic_id=_CLINIC_A,
                reviewer_user_id=CLIN_A2_USER,
                when=t + _td(days=5),
            )
        # Cycle 5 (late): breach -100d, decision 20d after = -80d.
        t = now - _td(days=100)
        _emit_breach(db, clinic_id=_CLINIC_A, reviewer_user_id=CLIN_A2_USER, when=t)
        _emit_decision(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=t + _td(days=20),
        )
        # Cycle 6 (still_pending): breach 30d ago. No decision after
        # this breach exists — the latest prior decision was at -80d.
        _emit_breach(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=now - _td(days=30),
        )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/reviewer-calibration?min_breaches=1",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    assert len(items) == 1
    me = items[0]
    assert me["total_breaches"] == 6
    assert me["decided_within_sla_count"] == 4
    assert me["decided_late_count"] == 1
    assert me["still_pending_count"] == 1
    assert me["pending_count"] == 0
    # (4 - 1) / max(6 - 0, 1) = 3/6 = 0.5
    assert me["calibration_score"] == 0.5


def test_reviewer_calibration_excludes_below_min_breaches(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc)
        # Reviewer A: 1 breach (below min_breaches=2).
        _emit_breach(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=now - _td(days=30),
        )
        # Reviewer B: 2 breaches (passes floor).
        for i in range(2):
            _emit_breach(
                db,
                clinic_id=_CLINIC_A,
                reviewer_user_id=CLIN_A3_USER,
                when=now - _td(days=30 + i),
            )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/reviewer-calibration?min_breaches=2",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    rids = {it["reviewer_user_id"] for it in items}
    assert CLIN_A2_USER not in rids
    assert CLIN_A3_USER in rids


def test_reviewer_calibration_excludes_pending_from_denominator(
    client: TestClient, auth_headers: dict
) -> None:
    """1 within_sla + 1 pending (within grace) → score = (1-0)/(2-1) = 1.0.

    Pending is excluded from denominator; if it were included, score
    would be (1-0)/2 = 0.5.
    """
    _setup_clinic_a()
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc)
        # Within: breach 30d ago, decided 5d after.
        t1 = now - _td(days=30)
        _emit_breach(db, clinic_id=_CLINIC_A, reviewer_user_id=CLIN_A2_USER, when=t1)
        _emit_decision(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=t1 + _td(days=5),
        )
        # Pending: breach 3d ago, no decision (sla_response_days=14).
        _emit_breach(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=now - _td(days=3),
        )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/reviewer-calibration?min_breaches=1&sla_response_days=14",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    me = next(i for i in items if i["reviewer_user_id"] == CLIN_A2_USER)
    assert me["total_breaches"] == 2
    assert me["decided_within_sla_count"] == 1
    assert me["pending_count"] == 1
    # (1 - 0) / max(2 - 1, 1) = 1.0
    assert me["calibration_score"] == 1.0


# ── 7. Median ─────────────────────────────────────────────────────────────


def test_median_days_to_next_decision_computed(
    client: TestClient, auth_headers: dict
) -> None:
    """Median over decided pairs only. Three pairs: 2d, 5d, 10d → median 5d."""
    _setup_clinic_a()
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc)
        for delta in (2, 5, 10):
            t = now - _td(days=30 + delta)
            _emit_breach(
                db, clinic_id=_CLINIC_A, reviewer_user_id=CLIN_A2_USER, when=t
            )
            _emit_decision(
                db,
                clinic_id=_CLINIC_A,
                reviewer_user_id=CLIN_A2_USER,
                when=t + _td(days=delta),
            )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/summary?sla_response_days=14",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["median_days_to_next_decision"] == 5.0


def test_median_days_to_next_decision_null_when_no_decided_pairs(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    db = SessionLocal()
    try:
        # All still_pending, no decisions.
        _emit_breach(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=_dt.now(_tz.utc) - _td(days=30),
        )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/summary?sla_response_days=14",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["median_days_to_next_decision"] is None


# ── 8. outcome_pct excludes pending ───────────────────────────────────────


def test_outcome_pct_excludes_pending_from_denominator(
    client: TestClient, auth_headers: dict
) -> None:
    """1 within + 1 pending (grace). pct = within/(within+late+still_pending) =
    1/1 = 100%. If pending were in denom it'd be 50%.
    """
    _setup_clinic_a()
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc)
        # within
        t1 = now - _td(days=30)
        _emit_breach(db, clinic_id=_CLINIC_A, reviewer_user_id=CLIN_A2_USER, when=t1)
        _emit_decision(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=t1 + _td(days=2),
        )
        # pending (grace)
        _emit_breach(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A3_USER,
            when=now - _td(days=2),
        )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/summary?sla_response_days=14",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    assert body["total_breaches"] == 2
    assert body["outcome_pct"]["decided_within_sla"] == 100.0
    assert body["outcome_pct"]["still_pending"] == 0.0


# ── 9. List paginates + filters ───────────────────────────────────────────


def test_list_filters_by_reviewer_user_id(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc)
        _emit_breach(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=now - _td(days=30),
        )
        _emit_breach(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A3_USER,
            when=now - _td(days=30),
        )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/list?reviewer_user_id={CLIN_A2_USER}",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["reviewer_user_id"] == CLIN_A2_USER


def test_list_filters_by_outcome(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc)
        # within
        t1 = now - _td(days=30)
        _emit_breach(db, clinic_id=_CLINIC_A, reviewer_user_id=CLIN_A2_USER, when=t1)
        _emit_decision(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=t1 + _td(days=2),
        )
        # still_pending
        _emit_breach(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A3_USER,
            when=now - _td(days=30),
        )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/list?outcome={OUTCOME_DECIDED_WITHIN_SLA}",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["outcome"] == OUTCOME_DECIDED_WITHIN_SLA


def test_list_paginates(client: TestClient, auth_headers: dict) -> None:
    _setup_clinic_a()
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc)
        for i in range(5):
            _emit_breach(
                db,
                clinic_id=_CLINIC_A,
                reviewer_user_id=CLIN_A2_USER,
                when=now - _td(days=30 + i),
            )
    finally:
        db.close()
    r1 = client.get(
        f"{WL_PATH}/list?page=1&page_size=2",
        headers=auth_headers["clinician"],
    )
    body1 = r1.json()
    assert body1["page"] == 1
    assert body1["page_size"] == 2
    assert body1["total"] == 5
    assert len(body1["items"]) == 2
    r2 = client.get(
        f"{WL_PATH}/list?page=3&page_size=2",
        headers=auth_headers["clinician"],
    )
    body2 = r2.json()
    assert body2["page"] == 3
    assert len(body2["items"]) == 1


# ── 10. Audit-events scoped + paginated ───────────────────────────────────


def test_audit_events_scoped_and_paginated(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    # Generate a summary_viewed audit row.
    client.get(f"{WL_PATH}/summary", headers=auth_headers["clinician"])
    r = client.get(
        f"{WL_PATH}/audit-events?limit=10",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body
    assert body["limit"] == 10
    assert body["surface"] == SURFACE
    # The summary_viewed row should be present.
    actions = {it["action"] for it in body["items"]}
    assert f"{SURFACE}.summary_viewed" in actions


# ── 11. Integration: emit breach + decision → outcome correctly classified ─


def test_integration_emit_breach_and_decision_classifies_correctly(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    db = SessionLocal()
    try:
        now = _dt.now(_tz.utc)
        breach_at = now - _td(days=20)
        _emit_breach(
            db, clinic_id=_CLINIC_A, reviewer_user_id=CLIN_A2_USER, when=breach_at
        )
        _emit_decision(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=breach_at + _td(days=3),
        )
    finally:
        db.close()
    r1 = client.get(
        f"{WL_PATH}/summary?sla_response_days=14",
        headers=auth_headers["clinician"],
    )
    body1 = r1.json()
    assert body1["total_breaches"] == 1
    assert body1["outcome_counts"]["decided_within_sla"] == 1
    r2 = client.get(
        f"{WL_PATH}/list?sla_response_days=14",
        headers=auth_headers["clinician"],
    )
    items = r2.json()["items"]
    assert len(items) == 1
    assert items[0]["outcome"] == OUTCOME_DECIDED_WITHIN_SLA
    assert items[0]["decided_audit_id"] is not None


# ── 12. Reviewer who never breached has no calibration record ──────────────


def test_reviewer_never_breached_has_no_calibration_record(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    db = SessionLocal()
    try:
        # CLIN_A2 breaches; CLIN_A3 never does.
        _emit_breach(
            db,
            clinic_id=_CLINIC_A,
            reviewer_user_id=CLIN_A2_USER,
            when=_dt.now(_tz.utc) - _td(days=30),
        )
    finally:
        db.close()
    r = client.get(
        f"{WL_PATH}/reviewer-calibration?min_breaches=1",
        headers=auth_headers["clinician"],
    )
    items = r.json()["items"]
    rids = {it["reviewer_user_id"] for it in items}
    assert CLIN_A2_USER in rids
    assert CLIN_A3_USER not in rids
