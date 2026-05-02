"""Tests for the Rotation Policy Advisor Outcome Tracker launch-audit
(CSAHP5, 2026-05-02).

Closes the section I rec from the Rotation Policy Advisor launch-audit
(CSAHP4, #428). Pairs each ``advice_snapshot`` audit row at time T
(emitted by the CSAHP5 background snapshot worker) with the same-key
snapshot at ``T + 14d`` (±2d tolerance) and reports per-advice-code
predictive accuracy (card_disappeared_pct = how often the card stopped
appearing 14 days after the clinic acted on it).

Pattern mirrors
``test_caregiver_delivery_concern_resolution_outcome_tracker_launch_audit.py``
(DCRO1) and ``test_channel_auth_health_probe_launch_audit.py`` (CSAHP1).

The suite asserts:

* worker tick emits one advice_snapshot per advice card
* worker tick emits one snapshot_run per clinic
* cooldown skips re-emission within 23h
* cross-clinic IDOR on tick (other clinic snapshot rows do not leak
  into this clinic's outcome data)
* admin can call run-snapshot-now, clinician cannot (403)
* pair_advice_with_outcomes correctly pairs T → T+14d snapshots within
  ±2d tolerance
* card_disappeared=True when card present at T but absent at T+14d
* card_disappeared=False when card present at both
* re_flag_rate_delta calculated correctly (negative when improving)
* pending classification when no T+14d pair yet AND elapsed < 14d
* by_advice_code aggregates correctly per code
* predictive_accuracy_pct = card_disappeared_pct
* cross-clinic IDOR on summary
* clinician passes; patient/guest 403
* audit-events scoped + paginated
* empty clinic returns clean structure
* integration: cards emitted at T → 14d later T+14 snapshot shows
  fewer cards → predictive_accuracy increases
* surface whitelisted in audit_trail_router KNOWN_SURFACES + qeeg-analysis
  audit-events ingestion
"""
from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz
from typing import Optional

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, User


# Suppress the env-gated background scheduler so pytest never spins up
# a real APScheduler thread.
os.environ.pop("ROTATION_POLICY_ADVISOR_SNAPSHOT_ENABLED", None)


SURFACE = "rotation_policy_advisor_outcome_tracker"
ADVISOR_SURFACE = "auth_drift_rotation_policy_advisor"
ADVICE_SNAPSHOT_ACTION = f"{ADVISOR_SURFACE}.advice_snapshot"
SNAPSHOT_RUN_ACTION = f"{ADVISOR_SURFACE}.snapshot_run"
TRACKER_PATH = "/api/v1/rotation-policy-advisor-outcome-tracker"

WORKER_SURFACE = "channel_auth_health_probe"


_DEMO_CLINIC = "clinic-demo-default"
_OTHER_CLINIC = "clinic-csahp5-other"

ROTATOR_X = "actor-csahp5-rotator-x"
ROTATOR_OTHER = "actor-csahp5-rotator-other-clinic"

_TEST_USER_IDS = (ROTATOR_X, ROTATOR_OTHER)


# ── Fixtures / helpers ─────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_worker_singleton():
    from app.workers.rotation_policy_advisor_snapshot_worker import (
        _reset_for_tests,
    )

    _reset_for_tests()
    yield
    _reset_for_tests()


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_(
                [SURFACE, ADVISOR_SURFACE, WORKER_SURFACE]
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
    role: str = "admin",
    clinic_id: str = _DEMO_CLINIC,
) -> None:
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(id=user_id).first()
        if existing is not None:
            existing.clinic_id = clinic_id
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


def _seed_audit_row(
    *,
    event_id: str,
    target_type: str,
    action: str,
    note: str,
    actor_id: str,
    role: str = "admin",
    target_id: str = "",
    when: Optional[_dt] = None,
) -> int:
    db = SessionLocal()
    try:
        ts = when or _dt.now(_tz.utc)
        from app.repositories.audit import create_audit_event

        create_audit_event(
            db,
            event_id=event_id,
            target_id=target_id or actor_id,
            target_type=target_type,
            action=action,
            role=role,
            actor_id=actor_id,
            note=note,
            created_at=ts.isoformat(),
        )
        row = (
            db.query(AuditEventRecord)
            .filter(AuditEventRecord.event_id == event_id)
            .first()
        )
        return int(row.id) if row else 0
    finally:
        db.close()


def _seed_advice_snapshot(
    *,
    clinic_id: str = _DEMO_CLINIC,
    channel: str = "slack",
    advice_code: str = "REFLAG_HIGH",
    severity: str = "high",
    re_flag_rate_pct: float = 40.0,
    confirmed_count: int = 10,
    manual_rotation_share_pct: float = 100.0,
    auth_error_class_share_pct: float = 100.0,
    total_drifts: int = 10,
    rotations: int = 10,
    when: Optional[_dt] = None,
) -> str:
    ts = when or _dt.now(_tz.utc)
    eid = (
        f"{ADVISOR_SURFACE}-advice_snapshot-{clinic_id}-{channel}-"
        f"{advice_code}-{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
    )
    note = (
        f"priority=info clinic_id={clinic_id} channel={channel} "
        f"advice_code={advice_code} severity={severity} "
        f"re_flag_rate_pct={re_flag_rate_pct:.2f} "
        f"confirmed_count={int(confirmed_count)} "
        f"manual_rotation_share_pct={manual_rotation_share_pct:.2f} "
        f"auth_error_class_share_pct={auth_error_class_share_pct:.2f} "
        f"total_drifts={int(total_drifts)} "
        f"rotations={int(rotations)}"
    )
    _seed_audit_row(
        event_id=eid,
        target_type=ADVISOR_SURFACE,
        action=ADVICE_SNAPSHOT_ACTION,
        note=note,
        actor_id="rotation-policy-advisor-snapshot-worker",
        target_id=clinic_id,
        when=ts,
    )
    return eid


def _seed_snapshot_run(
    *,
    clinic_id: str = _DEMO_CLINIC,
    total_advice_cards: int = 1,
    channels_with_advice: tuple[str, ...] = ("slack",),
    when: Optional[_dt] = None,
) -> str:
    ts = when or _dt.now(_tz.utc)
    eid = (
        f"{ADVISOR_SURFACE}-snapshot_run-{clinic_id}-"
        f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
    )
    note = (
        f"priority=info clinic_id={clinic_id} "
        f"total_advice_cards={total_advice_cards} "
        f"channels_with_advice={','.join(channels_with_advice)}"
    )
    _seed_audit_row(
        event_id=eid,
        target_type=ADVISOR_SURFACE,
        action=SNAPSHOT_RUN_ACTION,
        note=note,
        actor_id="rotation-policy-advisor-snapshot-worker",
        target_id=clinic_id,
        when=ts,
    )
    return eid


# ── 1. Surface whitelist sanity ────────────────────────────────────────────


def test_csahp5_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_csahp5_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": SURFACE, "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    assert r.json().get("event_id", "").startswith(f"{SURFACE}-")


# ── 2. Worker tick: one advice_snapshot per advice_card ───────────────────


def test_worker_tick_emits_one_advice_snapshot_per_advice_card() -> None:
    """Seed CSAHP4-eligible audit data so compute_rotation_advice
    returns at least one card; assert that worker.tick emits the
    matching number of advice_snapshot rows."""
    from app.workers.rotation_policy_advisor_snapshot_worker import (
        get_worker,
    )

    # Seed 10 drift events on slack with all error_class=auth → triggers
    # AUTH_DOMINANT card.
    for i in range(10):
        ts = _dt.now(_tz.utc) - _td(hours=80 + i)
        eid = (
            f"{WORKER_SURFACE}-auth_drift_detected-{_DEMO_CLINIC}-slack-"
            f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
        )
        note = (
            f"priority=high clinic_id={_DEMO_CLINIC} channel=slack "
            f"error_class=auth error_message=invalid_auth"
        )
        _seed_audit_row(
            event_id=eid,
            target_type=WORKER_SURFACE,
            action=f"{WORKER_SURFACE}.auth_drift_detected",
            note=note,
            actor_id="channel-auth-health-probe-worker",
            target_id=_DEMO_CLINIC,
            when=ts,
        )

    worker = get_worker()
    result = worker.tick(only_clinic_id=_DEMO_CLINIC)

    # AUTH_DOMINANT (slack) — 10/10 auth share, 10 drifts.
    assert result.total_advice_cards >= 1
    assert len(result.advice_snapshot_audit_event_ids) == result.total_advice_cards
    # And the snapshot_run row exists.
    assert result.snapshot_runs == 1
    assert len(result.snapshot_run_audit_event_ids) == 1


# ── 3. Worker tick: one snapshot_run per clinic ────────────────────────────


def test_worker_tick_emits_one_snapshot_run_per_clinic() -> None:
    from app.workers.rotation_policy_advisor_snapshot_worker import (
        get_worker,
    )

    # Even with NO advice cards, the snapshot_run row should still be
    # emitted so the outcome tracker can pair "snapshot at T+14d exists
    # but card not in it" → card_disappeared.
    worker = get_worker()
    result = worker.tick(only_clinic_id=_DEMO_CLINIC)
    assert result.snapshot_runs == 1
    assert result.total_advice_cards == 0
    assert result.clinics_scanned == 1


# ── 4. Cooldown skips re-emission within 23h ───────────────────────────────


def test_worker_tick_cooldown_skips_within_23h() -> None:
    from app.workers.rotation_policy_advisor_snapshot_worker import (
        get_worker,
    )

    worker = get_worker()
    r1 = worker.tick(only_clinic_id=_DEMO_CLINIC)
    assert r1.snapshot_runs == 1

    # Second immediate tick — cooldown should fire.
    r2 = worker.tick(only_clinic_id=_DEMO_CLINIC)
    assert r2.skipped_cooldown >= 1
    assert r2.snapshot_runs == 0


# ── 5. Cross-clinic IDOR on tick ───────────────────────────────────────────


def test_worker_tick_only_clinic_id_does_not_leak_cross_clinic() -> None:
    from app.workers.rotation_policy_advisor_snapshot_worker import (
        get_worker,
    )

    _seed_user(ROTATOR_OTHER, clinic_id=_OTHER_CLINIC)
    # Seed AUTH_DOMINANT-worthy data for OTHER clinic.
    for i in range(10):
        ts = _dt.now(_tz.utc) - _td(hours=80 + i)
        eid = (
            f"{WORKER_SURFACE}-auth_drift_detected-{_OTHER_CLINIC}-slack-"
            f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
        )
        note = (
            f"priority=high clinic_id={_OTHER_CLINIC} channel=slack "
            f"error_class=auth error_message=invalid_auth"
        )
        _seed_audit_row(
            event_id=eid,
            target_type=WORKER_SURFACE,
            action=f"{WORKER_SURFACE}.auth_drift_detected",
            note=note,
            actor_id="channel-auth-health-probe-worker",
            target_id=_OTHER_CLINIC,
            when=ts,
        )

    worker = get_worker()
    # tick scoped to _DEMO_CLINIC — should NOT pick up _OTHER_CLINIC data.
    result = worker.tick(only_clinic_id=_DEMO_CLINIC)
    assert result.clinics_scanned == 1
    assert result.total_advice_cards == 0  # no demo-clinic data


# ── 6. Admin can run-snapshot-now; clinician cannot ───────────────────────


class TestRunSnapshotNow:
    def test_admin_can_run_snapshot_now(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            f"{TRACKER_PATH}/run-snapshot-now",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["snapshot_runs"] >= 1

    def test_clinician_cannot_run_snapshot_now(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            f"{TRACKER_PATH}/run-snapshot-now",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 403

    def test_patient_cannot_run_snapshot_now(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            f"{TRACKER_PATH}/run-snapshot-now",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403


# ── 7. pair_advice_with_outcomes pairs T → T+14d ──────────────────────────


def test_pair_advice_pairs_t_to_t_plus_14d_within_tolerance() -> None:
    from app.services.advisor_outcome_pairing import (
        OUTCOME_PAIRED_PRESENT,
        pair_advice_with_outcomes,
    )

    # Seed two advice_snapshot rows: one at T, one at T+14d.
    t0 = _dt.now(_tz.utc) - _td(days=20)
    t1 = t0 + _td(days=14)
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="slack",
        advice_code="REFLAG_HIGH",
        re_flag_rate_pct=40.0,
        when=t0,
    )
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="slack",
        advice_code="REFLAG_HIGH",
        re_flag_rate_pct=20.0,
        when=t1,
    )
    # Need a snapshot_run at T+14d so pairing logic doesn't classify
    # as pending.
    _seed_snapshot_run(clinic_id=_DEMO_CLINIC, when=t1)

    db = SessionLocal()
    try:
        records = pair_advice_with_outcomes(
            db, clinic_id=_DEMO_CLINIC, window_days=90
        )
    finally:
        db.close()

    paired = [r for r in records if r.outcome == OUTCOME_PAIRED_PRESENT]
    assert len(paired) >= 1
    p = paired[0]
    assert p.channel == "slack"
    assert p.advice_code == "REFLAG_HIGH"
    assert p.card_disappeared is False
    # Improvement: T+14d (20%) - T (40%) = -20%
    assert p.re_flag_rate_delta == -20.0


# ── 8. card_disappeared=True when card absent at T+14d ────────────────────


def test_card_disappeared_true_when_card_absent_at_t_plus_14d() -> None:
    from app.services.advisor_outcome_pairing import (
        OUTCOME_PAIRED_DISAPPEARED,
        pair_advice_with_outcomes,
    )

    t0 = _dt.now(_tz.utc) - _td(days=20)
    t1 = t0 + _td(days=14)
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="slack",
        advice_code="REFLAG_HIGH",
        re_flag_rate_pct=40.0,
        when=t0,
    )
    # No matching advice_snapshot at T+14d, but a snapshot_run row exists.
    _seed_snapshot_run(clinic_id=_DEMO_CLINIC, when=t1)

    db = SessionLocal()
    try:
        records = pair_advice_with_outcomes(
            db, clinic_id=_DEMO_CLINIC, window_days=90
        )
    finally:
        db.close()

    disappeared = [
        r for r in records if r.outcome == OUTCOME_PAIRED_DISAPPEARED
    ]
    assert len(disappeared) == 1
    assert disappeared[0].card_disappeared is True


# ── 9. card_disappeared=False when present at both ────────────────────────


def test_card_disappeared_false_when_present_at_both_t_and_t_plus_14d() -> None:
    from app.services.advisor_outcome_pairing import (
        pair_advice_with_outcomes,
    )

    t0 = _dt.now(_tz.utc) - _td(days=20)
    t1 = t0 + _td(days=14)
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="slack",
        advice_code="REFLAG_HIGH",
        re_flag_rate_pct=40.0,
        when=t0,
    )
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="slack",
        advice_code="REFLAG_HIGH",
        re_flag_rate_pct=35.0,
        when=t1,
    )
    _seed_snapshot_run(clinic_id=_DEMO_CLINIC, when=t1)

    db = SessionLocal()
    try:
        records = pair_advice_with_outcomes(
            db, clinic_id=_DEMO_CLINIC, window_days=90
        )
    finally:
        db.close()

    paired = [r for r in records if r.snapshot_at == t0.replace(tzinfo=_tz.utc)
              or abs((r.snapshot_at - t0).total_seconds()) < 60]
    assert len(paired) >= 1
    assert all(r.card_disappeared is False for r in paired)


# ── 10. re_flag_rate_delta calculated correctly ───────────────────────────


def test_re_flag_rate_delta_calculated_correctly() -> None:
    from app.services.advisor_outcome_pairing import (
        pair_advice_with_outcomes,
    )

    t0 = _dt.now(_tz.utc) - _td(days=20)
    t1 = t0 + _td(days=14)
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="twilio",
        advice_code="REFLAG_HIGH",
        re_flag_rate_pct=50.0,
        when=t0,
    )
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="twilio",
        advice_code="REFLAG_HIGH",
        re_flag_rate_pct=15.0,
        when=t1,
    )
    _seed_snapshot_run(clinic_id=_DEMO_CLINIC, when=t1)

    db = SessionLocal()
    try:
        records = pair_advice_with_outcomes(
            db, clinic_id=_DEMO_CLINIC, window_days=90
        )
    finally:
        db.close()

    twilio = [r for r in records if r.channel == "twilio"]
    assert len(twilio) >= 1
    assert twilio[0].re_flag_rate_delta == -35.0


# ── 11. Pending classification when no T+14d pair yet ─────────────────────


def test_pending_classification_when_no_pair_within_lookahead() -> None:
    from app.services.advisor_outcome_pairing import (
        OUTCOME_PENDING,
        pair_advice_with_outcomes,
    )

    # Card seeded just 3 days ago — no pair possible yet.
    t0 = _dt.now(_tz.utc) - _td(days=3)
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="sendgrid",
        advice_code="MANUAL_REFLAG",
        re_flag_rate_pct=20.0,
        when=t0,
    )

    db = SessionLocal()
    try:
        records = pair_advice_with_outcomes(
            db, clinic_id=_DEMO_CLINIC, window_days=90
        )
    finally:
        db.close()

    pending = [r for r in records if r.outcome == OUTCOME_PENDING]
    assert len(pending) >= 1
    assert pending[0].channel == "sendgrid"


# ── 12. by_advice_code aggregates correctly ───────────────────────────────


def test_by_advice_code_aggregates_correctly(
    client: TestClient, auth_headers: dict
) -> None:
    # Seed three REFLAG_HIGH cards on different channels: 2 disappear,
    # 1 remains.
    t0 = _dt.now(_tz.utc) - _td(days=20)
    t1 = t0 + _td(days=14)
    for ch in ("slack", "sendgrid"):
        _seed_advice_snapshot(
            clinic_id=_DEMO_CLINIC,
            channel=ch,
            advice_code="REFLAG_HIGH",
            re_flag_rate_pct=40.0,
            when=t0,
        )
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="twilio",
        advice_code="REFLAG_HIGH",
        re_flag_rate_pct=40.0,
        when=t0,
    )
    # T+14d: only twilio card remains (slack + sendgrid disappeared).
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="twilio",
        advice_code="REFLAG_HIGH",
        re_flag_rate_pct=35.0,
        when=t1,
    )
    _seed_snapshot_run(clinic_id=_DEMO_CLINIC, when=t1)

    r = client.get(
        f"{TRACKER_PATH}/summary?window_days=90",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    code = data["by_advice_code"]["REFLAG_HIGH"]
    assert code["total_cards"] == 3
    assert code["card_disappeared_count"] == 2
    # 2/3 = 66.67%
    assert code["card_disappeared_pct"] >= 66.0
    assert code["card_disappeared_pct"] <= 67.0


# ── 13. predictive_accuracy_pct = card_disappeared_pct ────────────────────


def test_predictive_accuracy_pct_alias_for_card_disappeared_pct(
    client: TestClient, auth_headers: dict
) -> None:
    t0 = _dt.now(_tz.utc) - _td(days=20)
    t1 = t0 + _td(days=14)
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="slack",
        advice_code="AUTH_DOMINANT",
        when=t0,
    )
    _seed_snapshot_run(clinic_id=_DEMO_CLINIC, when=t1)

    r = client.get(
        f"{TRACKER_PATH}/summary",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    code = r.json()["by_advice_code"]["AUTH_DOMINANT"]
    assert code["predictive_accuracy_pct"] == code["card_disappeared_pct"]


# ── 14. Cross-clinic IDOR on summary ──────────────────────────────────────


def test_cross_clinic_data_does_not_leak_into_summary(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_user(ROTATOR_OTHER, clinic_id=_OTHER_CLINIC)
    t0 = _dt.now(_tz.utc) - _td(days=20)
    t1 = t0 + _td(days=14)
    # Seed cards for OTHER clinic only.
    _seed_advice_snapshot(
        clinic_id=_OTHER_CLINIC,
        channel="slack",
        advice_code="REFLAG_HIGH",
        when=t0,
    )
    _seed_snapshot_run(clinic_id=_OTHER_CLINIC, when=t1)

    # Demo-clinic admin should see ZERO paired cards.
    r = client.get(
        f"{TRACKER_PATH}/summary",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total_paired_cards"] == 0
    assert data["total_pending_cards"] == 0


# ── 15. Role gate ─────────────────────────────────────────────────────────


class TestRoleGate:
    def test_clinician_can_read_summary(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{TRACKER_PATH}/summary",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text

    def test_patient_summary_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{TRACKER_PATH}/summary",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_guest_summary_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{TRACKER_PATH}/summary",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403


# ── 16. Audit-events scoped + paginated ───────────────────────────────────


class TestAuditEvents:
    def test_audit_events_scoped(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        for i in range(5):
            r = client.post(
                f"{TRACKER_PATH}/audit-events",
                json={"event": "view", "note": f"page view #{i}"},
                headers=auth_headers["admin"],
            )
            assert r.status_code == 200, r.text
        r = client.get(
            f"{TRACKER_PATH}/audit-events?surface={SURFACE}&limit=10",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200
        data = r.json()
        assert data["surface"] == SURFACE
        assert data["total"] >= 5
        for item in data["items"]:
            assert item["target_type"] == SURFACE

    def test_audit_events_paginated(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        for i in range(7):
            client.post(
                f"{TRACKER_PATH}/audit-events",
                json={"event": "view", "note": f"#{i}"},
                headers=auth_headers["admin"],
            )
        r1 = client.get(
            f"{TRACKER_PATH}/audit-events?limit=3&offset=0",
            headers=auth_headers["admin"],
        )
        r2 = client.get(
            f"{TRACKER_PATH}/audit-events?limit=3&offset=3",
            headers=auth_headers["admin"],
        )
        assert r1.status_code == 200 and r2.status_code == 200
        ids_1 = {it["event_id"] for it in r1.json()["items"]}
        ids_2 = {it["event_id"] for it in r2.json()["items"]}
        assert ids_1.isdisjoint(ids_2)


# ── 17. Empty clinic returns clean structure ──────────────────────────────


def test_empty_clinic_returns_clean_summary_structure(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{TRACKER_PATH}/summary",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total_paired_cards"] == 0
    assert data["total_pending_cards"] == 0
    assert data["total_disappeared_cards"] == 0
    # All known advice codes present.
    assert "REFLAG_HIGH" in data["by_advice_code"]
    assert "MANUAL_REFLAG" in data["by_advice_code"]
    assert "AUTH_DOMINANT" in data["by_advice_code"]
    assert data["by_channel"] == {}
    assert data["trend_buckets"] == []
    # mean_re_flag_rate_delta is 0.0 (not null) by spec.
    for code, agg in data["by_advice_code"].items():
        assert isinstance(agg["mean_re_flag_rate_delta"], (int, float))


# ── 18. Integration — predictive accuracy increases ───────────────────────


def test_integration_cards_disappear_over_14d_window(
    client: TestClient, auth_headers: dict
) -> None:
    """Seed 4 cards at T, only 1 at T+14d → 3 disappear → 75%
    predictive accuracy."""
    t0 = _dt.now(_tz.utc) - _td(days=20)
    t1 = t0 + _td(days=14)
    for ch in ("slack", "sendgrid", "twilio", "pagerduty"):
        _seed_advice_snapshot(
            clinic_id=_DEMO_CLINIC,
            channel=ch,
            advice_code="MANUAL_REFLAG",
            severity="medium",
            re_flag_rate_pct=20.0,
            when=t0,
        )
    # Only slack card remains at T+14d.
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="slack",
        advice_code="MANUAL_REFLAG",
        severity="medium",
        re_flag_rate_pct=18.0,
        when=t1,
    )
    _seed_snapshot_run(
        clinic_id=_DEMO_CLINIC,
        total_advice_cards=1,
        channels_with_advice=("slack",),
        when=t1,
    )

    r = client.get(
        f"{TRACKER_PATH}/summary",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    code = data["by_advice_code"]["MANUAL_REFLAG"]
    assert code["total_cards"] == 4
    assert code["card_disappeared_count"] == 3
    # 3/4 = 75% predictive accuracy.
    assert code["predictive_accuracy_pct"] == 75.0


# ── 19. List endpoint returns paginated paired records ────────────────────


def test_list_endpoint_paginates_paired_records(
    client: TestClient, auth_headers: dict
) -> None:
    t0 = _dt.now(_tz.utc) - _td(days=20)
    t1 = t0 + _td(days=14)
    # Seed 5 cards.
    for ch in ("slack", "sendgrid", "twilio", "pagerduty", "email"):
        _seed_advice_snapshot(
            clinic_id=_DEMO_CLINIC,
            channel=ch,
            advice_code="REFLAG_HIGH",
            when=t0,
        )
    _seed_snapshot_run(clinic_id=_DEMO_CLINIC, when=t1)

    r1 = client.get(
        f"{TRACKER_PATH}/list?page=1&page_size=2",
        headers=auth_headers["admin"],
    )
    assert r1.status_code == 200, r1.text
    body = r1.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2
    assert body["page"] == 1
    assert body["page_size"] == 2

    r2 = client.get(
        f"{TRACKER_PATH}/list?page=2&page_size=2",
        headers=auth_headers["admin"],
    )
    assert r2.status_code == 200
    body2 = r2.json()
    assert len(body2["items"]) == 2

    ids_1 = {it["snapshot_event_id"] for it in body["items"]}
    ids_2 = {it["snapshot_event_id"] for it in body2["items"]}
    assert ids_1.isdisjoint(ids_2)


# ── 20. List endpoint advice_code filter ──────────────────────────────────


def test_list_endpoint_advice_code_filter(
    client: TestClient, auth_headers: dict
) -> None:
    t0 = _dt.now(_tz.utc) - _td(days=20)
    t1 = t0 + _td(days=14)
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="slack",
        advice_code="REFLAG_HIGH",
        when=t0,
    )
    _seed_advice_snapshot(
        clinic_id=_DEMO_CLINIC,
        channel="slack",
        advice_code="AUTH_DOMINANT",
        when=t0,
    )
    _seed_snapshot_run(clinic_id=_DEMO_CLINIC, when=t1)

    r = client.get(
        f"{TRACKER_PATH}/list?advice_code=REFLAG_HIGH",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["advice_code"] == "REFLAG_HIGH"
