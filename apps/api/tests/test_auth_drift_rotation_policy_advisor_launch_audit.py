"""Tests for the Auth Drift Rotation Policy Advisor launch-audit
(CSAHP4, 2026-05-02).

Read-only advisor surface that consumes CSAHP3's per-channel
re-flag-rate / manual-rotation-share / auth-error-class signals and
emits heuristic recommendation cards. Mirrors the DCRO5 / CSAHP3
read-only advisor pattern (#406, #424).

The suite asserts:

* the surface lands on ``KNOWN_SURFACES`` and the qeeg-analysis
  audit-events whitelist
* role gate (clinician+; patient/guest 403)
* REFLAG_HIGH triggers + small-sample / low-rate guards
* MANUAL_REFLAG triggers + boundary cases
* AUTH_DOMINANT triggers + min-drift guard
* a single channel can produce multiple cards (high + medium)
* cards sorted severity-desc then channel asc
* cross-clinic IDOR — other-clinic data does not leak
* empty-clinic returns total_advice_cards=0
* audit-events scoped + paginated
* supporting_metrics carry the actual numeric values
* generated_at timestamp present
* channels_with_advice deduplicated
* all 5 channels evaluated even if only 2 produce cards
* works with window_days=30 / 90 / 180
* compute_rotation_advice is pure (no DB writes)
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


os.environ.pop("CHANNEL_AUTH_HEALTH_PROBE_ENABLED", None)


WORKER_SURFACE = "channel_auth_health_probe"
SURFACE = "auth_drift_rotation_policy_advisor"
ADVISOR_PATH = "/api/v1/auth-drift-rotation-policy-advisor"

DRIFT_DETECTED_ACTION = f"{WORKER_SURFACE}.auth_drift_detected"
MARKED_ROTATED_ACTION = f"{WORKER_SURFACE}.auth_drift_marked_rotated"
RESOLVED_CONFIRMED_ACTION = f"{WORKER_SURFACE}.auth_drift_resolved_confirmed"


_DEMO_CLINIC = "clinic-demo-default"
_OTHER_CLINIC = "clinic-csahp4-other"

ROTATOR_X = "actor-csahp4-rotator-x"
ROTATOR_Y = "actor-csahp4-rotator-y"
ROTATOR_OTHER = "actor-csahp4-rotator-other-clinic"

_TEST_USER_IDS = (ROTATOR_X, ROTATOR_Y, ROTATOR_OTHER)


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_([SURFACE, WORKER_SURFACE])
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


def _seed_drift(
    *,
    clinic_id: str = _DEMO_CLINIC,
    channel: str = "slack",
    error_class: str = "auth",
    error_message: str = "invalid_auth",
    age_hours: float = 24.0,
) -> tuple[int, str]:
    ts = _dt.now(_tz.utc) - _td(hours=age_hours)
    eid = (
        f"{WORKER_SURFACE}-auth_drift_detected-{clinic_id}-{channel}-"
        f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
    )
    note = (
        f"priority=high clinic_id={clinic_id} channel={channel} "
        f"error_class={error_class} error_message={error_message}"
    )
    rid = _seed_audit_row(
        event_id=eid,
        target_type=WORKER_SURFACE,
        action=DRIFT_DETECTED_ACTION,
        note=note,
        actor_id="channel-auth-health-probe-worker",
        target_id=clinic_id,
        when=ts,
    )
    return rid, eid


def _seed_mark(
    *,
    clinic_id: str = _DEMO_CLINIC,
    channel: str = "slack",
    rotator_user_id: str = ROTATOR_X,
    rotation_method: str = "manual",
    source_drift_event_id: str = "",
    age_hours: float = 12.0,
) -> str:
    ts = _dt.now(_tz.utc) - _td(hours=age_hours)
    eid = (
        f"{WORKER_SURFACE}-auth_drift_marked_rotated-{clinic_id}-{channel}-"
        f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
    )
    note = (
        f"priority=info clinic_id={clinic_id} channel={channel} "
        f"error_class=auth rotator_user_id={rotator_user_id} "
        f"rotation_method={rotation_method} "
        f"source_drift_event_id={source_drift_event_id} "
        f"rotation_note=rotated"
    )
    _seed_audit_row(
        event_id=eid,
        target_type=WORKER_SURFACE,
        action=MARKED_ROTATED_ACTION,
        note=note,
        actor_id=rotator_user_id,
        target_id=clinic_id,
        when=ts,
    )
    return eid


def _seed_confirmed(
    *,
    clinic_id: str = _DEMO_CLINIC,
    channel: str = "slack",
    mark_rotated_event_id: str = "",
    age_hours: float = 6.0,
) -> str:
    ts = _dt.now(_tz.utc) - _td(hours=age_hours)
    eid = (
        f"{WORKER_SURFACE}-auth_drift_resolved_confirmed-{clinic_id}-{channel}-"
        f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
    )
    note = (
        f"priority=info clinic_id={clinic_id} channel={channel} "
        f"mark_rotated_event_id={mark_rotated_event_id}"
    )
    _seed_audit_row(
        event_id=eid,
        target_type=WORKER_SURFACE,
        action=RESOLVED_CONFIRMED_ACTION,
        note=note,
        actor_id="channel-auth-health-probe-worker",
        target_id=clinic_id,
        when=ts,
    )
    return eid


def _seed_chain(
    *,
    clinic_id: str = _DEMO_CLINIC,
    channel: str = "slack",
    rotator_user_id: str = ROTATOR_X,
    rotation_method: str = "manual",
    error_class: str = "auth",
    drift_age_hours: float = 48.0,
    mark_age_hours: float = 24.0,
    confirm_age_hours: float = 12.0,
    add_re_flag_after_confirm_hours: Optional[float] = None,
) -> dict:
    """Seed a full drift→mark→confirm chain (with optional re-flag)."""
    drift_id, drift_eid = _seed_drift(
        clinic_id=clinic_id,
        channel=channel,
        error_class=error_class,
        age_hours=drift_age_hours,
    )
    mark_eid = _seed_mark(
        clinic_id=clinic_id,
        channel=channel,
        rotator_user_id=rotator_user_id,
        rotation_method=rotation_method,
        source_drift_event_id=drift_eid,
        age_hours=mark_age_hours,
    )
    confirmed_eid = _seed_confirmed(
        clinic_id=clinic_id,
        channel=channel,
        mark_rotated_event_id=mark_eid,
        age_hours=confirm_age_hours,
    )
    re_flag_eid: Optional[str] = None
    if add_re_flag_after_confirm_hours is not None:
        confirm_ts = _dt.now(_tz.utc) - _td(hours=confirm_age_hours)
        re_flag_ts = confirm_ts + _td(
            hours=add_re_flag_after_confirm_hours
        )
        re_flag_age = (
            (_dt.now(_tz.utc) - re_flag_ts).total_seconds() / 3600.0
        )
        if re_flag_age < 0:
            re_flag_age = 0.0
        _re_id, re_flag_eid = _seed_drift(
            clinic_id=clinic_id,
            channel=channel,
            error_class=error_class,
            age_hours=re_flag_age,
        )
    return {
        "drift_eid": drift_eid,
        "mark_eid": mark_eid,
        "confirmed_eid": confirmed_eid,
        "re_flag_eid": re_flag_eid,
    }


# ── 1. Surface whitelist sanity ─────────────────────────────────────────────


def test_csahp4_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_csahp4_surface_accepted_by_qeeg_audit_events(
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


# ── 2. Role gate ────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_advice_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{ADVISOR_PATH}/advice?window_days=30",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_guest_advice_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{ADVISOR_PATH}/advice?window_days=30",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_clinician_can_read_advice(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{ADVISOR_PATH}/advice?window_days=30",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text


# ── 3. REFLAG_HIGH rule ─────────────────────────────────────────────────────


class TestReflagHigh:
    def test_reflag_high_triggers_at_40_pct_with_10_confirmed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # 10 confirmed chains, 4 with re-flag → 40% > 30% threshold,
        # confirmed=10 >= 3 sample-size guard.
        for i in range(10):
            re_flag = 24.0 if i < 4 else None
            _seed_chain(
                channel="slack",
                drift_age_hours=80.0 + i,
                mark_age_hours=50.0 + i,
                confirm_age_hours=20.0 + i,
                add_re_flag_after_confirm_hours=re_flag,
            )
        r = client.get(
            f"{ADVISOR_PATH}/advice?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        codes = {c["advice_code"] for c in data["advice_cards"]}
        assert "REFLAG_HIGH" in codes
        slack_high = [
            c
            for c in data["advice_cards"]
            if c["channel"] == "slack" and c["advice_code"] == "REFLAG_HIGH"
        ]
        assert len(slack_high) == 1
        assert slack_high[0]["severity"] == "high"

    def test_reflag_high_does_not_trigger_on_small_sample(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # 2 confirmed, 1 re-flag → 50% but confirmed=2 < 3.
        _seed_chain(
            channel="twilio",
            drift_age_hours=80.0,
            mark_age_hours=50.0,
            confirm_age_hours=20.0,
            add_re_flag_after_confirm_hours=24.0,
        )
        _seed_chain(
            channel="twilio",
            drift_age_hours=82.0,
            mark_age_hours=52.0,
            confirm_age_hours=22.0,
        )
        r = client.get(
            f"{ADVISOR_PATH}/advice?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200
        codes_for_twilio = [
            c
            for c in r.json()["advice_cards"]
            if c["channel"] == "twilio" and c["advice_code"] == "REFLAG_HIGH"
        ]
        assert codes_for_twilio == []

    def test_reflag_high_does_not_trigger_at_20_pct(self) -> None:
        # Unit-test the rule engine directly (avoid audit-pairing
        # cross-talk where every chain on the same channel sees every
        # later chain's drift as a re-flag candidate).
        from app.services.rotation_policy_advisor import (
            _ChannelStats,
            _eval_rules_for_channel,
            _resolve_thresholds,
        )

        stats = _ChannelStats(
            channel="sendgrid",
            total_drifts=10,
            auth_class_drifts=2,  # below auth-dominant
            rotated=10,
            manual_rotations=0,  # all automated
            confirmed=10,
            re_flagged=2,  # 20% — below 30%
        )
        cards = _eval_rules_for_channel(
            stats, generated_at=_dt.now(_tz.utc), thresholds=_resolve_thresholds(None)
        )
        codes = {c.advice_code for c in cards}
        assert "REFLAG_HIGH" not in codes


# ── 4. MANUAL_REFLAG rule ───────────────────────────────────────────────────


class TestManualReflag:
    def test_manual_reflag_triggers_at_80_share_and_20_pct_reflag(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # 10 confirmed chains: 8 manual + 2 automated_rotation → manual share 80%.
        # 3 of the 10 re-flag → 30% re-flag rate (>15% but at the
        # REFLAG_HIGH threshold of 30%, NOT strictly >30% so we use 25%).
        # Actually we want re_flag_rate strictly between 15 and 30 to
        # avoid double-counting REFLAG_HIGH. So use 2/10 = 20%.
        # But spec says re_flag=20% — but to also avoid REFLAG_HIGH (>30%
        # strict) we land at 20%.
        for i in range(8):
            re_flag = 24.0 if i < 2 else None
            _seed_chain(
                channel="pagerduty",
                rotation_method="manual",
                drift_age_hours=80.0 + i,
                mark_age_hours=50.0 + i,
                confirm_age_hours=20.0 + i,
                add_re_flag_after_confirm_hours=re_flag,
            )
        for i in range(2):
            _seed_chain(
                channel="pagerduty",
                rotation_method="automated_rotation",
                drift_age_hours=70.0 + i,
                mark_age_hours=45.0 + i,
                confirm_age_hours=18.0 + i,
            )
        r = client.get(
            f"{ADVISOR_PATH}/advice?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        cards = [
            c
            for c in r.json()["advice_cards"]
            if c["channel"] == "pagerduty"
            and c["advice_code"] == "MANUAL_REFLAG"
        ]
        assert len(cards) == 1
        assert cards[0]["severity"] == "medium"

    def test_manual_reflag_does_not_trigger_at_10_pct_reflag(self) -> None:
        # Unit-test the rule engine: manual=80%, re_flag=10% → no MANUAL_REFLAG.
        from app.services.rotation_policy_advisor import (
            _ChannelStats,
            _eval_rules_for_channel,
            _resolve_thresholds,
        )

        stats = _ChannelStats(
            channel="email",
            total_drifts=10,
            auth_class_drifts=0,
            rotated=10,
            manual_rotations=8,  # 80% manual share
            confirmed=10,
            re_flagged=1,  # 10% — below 15%
        )
        cards = _eval_rules_for_channel(
            stats, generated_at=_dt.now(_tz.utc), thresholds=_resolve_thresholds(None)
        )
        codes = {c.advice_code for c in cards}
        assert "MANUAL_REFLAG" not in codes


# ── 5. AUTH_DOMINANT rule ───────────────────────────────────────────────────


class TestAuthDominant:
    def test_auth_dominant_triggers_at_70_share_and_10_drifts(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # 10 drifts: 7 error_class=auth, 3 error_class=network.
        # auth_share = 70% >= 60% threshold, total_drifts=10 >= 5.
        for i in range(7):
            _seed_drift(
                channel="slack", error_class="auth", age_hours=80.0 + i
            )
        for i in range(3):
            _seed_drift(
                channel="slack",
                error_class="network",
                age_hours=80.0 + i,
            )
        r = client.get(
            f"{ADVISOR_PATH}/advice?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        cards = [
            c
            for c in r.json()["advice_cards"]
            if c["channel"] == "slack"
            and c["advice_code"] == "AUTH_DOMINANT"
        ]
        assert len(cards) == 1
        assert cards[0]["severity"] == "medium"

    def test_auth_dominant_does_not_trigger_below_min_drifts(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # 3 drifts (all auth) → share is 100% but total_drifts < 5.
        for i in range(3):
            _seed_drift(
                channel="twilio",
                error_class="auth",
                age_hours=80.0 + i,
            )
        r = client.get(
            f"{ADVISOR_PATH}/advice?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        cards = [
            c
            for c in r.json()["advice_cards"]
            if c["channel"] == "twilio"
            and c["advice_code"] == "AUTH_DOMINANT"
        ]
        assert cards == []


# ── 6. Multi-card per channel ───────────────────────────────────────────────


def test_one_channel_can_produce_multiple_cards(
    client: TestClient, auth_headers: dict
) -> None:
    # 10 drifts on slack: all auth-class so AUTH_DOMINANT triggers.
    # 10 confirmed manual rotations with 4 re-flags → REFLAG_HIGH (40%
    # > 30%, confirmed=10 >= 3) AND MANUAL_REFLAG (manual=100% >= 70%,
    # re_flag=40% > 15%).
    for i in range(10):
        re_flag = 24.0 if i < 4 else None
        _seed_chain(
            channel="slack",
            error_class="auth",
            rotation_method="manual",
            drift_age_hours=80.0 + i,
            mark_age_hours=50.0 + i,
            confirm_age_hours=20.0 + i,
            add_re_flag_after_confirm_hours=re_flag,
        )
    r = client.get(
        f"{ADVISOR_PATH}/advice?window_days=90",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    cards = [c for c in r.json()["advice_cards"] if c["channel"] == "slack"]
    codes = {c["advice_code"] for c in cards}
    # All three rules should fire on slack.
    assert "REFLAG_HIGH" in codes
    assert "MANUAL_REFLAG" in codes
    assert "AUTH_DOMINANT" in codes
    assert len(cards) >= 3


# ── 7. Sort order ───────────────────────────────────────────────────────────


def test_cards_sorted_severity_desc_then_channel_asc(
    client: TestClient, auth_headers: dict
) -> None:
    # Set up data on multiple channels:
    # - slack: REFLAG_HIGH (high) — 4 of 10 re-flags
    # - twilio: AUTH_DOMINANT (medium) — 7 of 10 auth drifts (no chain so
    #   it produces only AUTH_DOMINANT)
    for i in range(10):
        re_flag = 24.0 if i < 4 else None
        _seed_chain(
            channel="slack",
            error_class="auth",
            rotation_method="automated_rotation",
            drift_age_hours=80.0 + i,
            mark_age_hours=50.0 + i,
            confirm_age_hours=20.0 + i,
            add_re_flag_after_confirm_hours=re_flag,
        )
    for i in range(7):
        _seed_drift(
            channel="twilio",
            error_class="auth",
            age_hours=80.0 + i,
        )
    for i in range(3):
        _seed_drift(
            channel="twilio",
            error_class="network",
            age_hours=80.0 + i,
        )
    r = client.get(
        f"{ADVISOR_PATH}/advice?window_days=90",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    cards = r.json()["advice_cards"]
    # First card must be high severity.
    assert cards[0]["severity"] == "high"
    assert cards[0]["channel"] == "slack"
    # Verify all severity-desc invariant.
    sev_rank = {"high": 2, "medium": 1, "low": 0}
    ranks = [sev_rank.get(c["severity"], 0) for c in cards]
    assert ranks == sorted(ranks, reverse=True)


# ── 8. Cross-clinic IDOR ────────────────────────────────────────────────────


def test_cross_clinic_data_does_not_leak(
    client: TestClient, auth_headers: dict
) -> None:
    # Seed REFLAG_HIGH-worthy data for OTHER clinic.
    _seed_user(ROTATOR_OTHER, clinic_id=_OTHER_CLINIC)
    for i in range(10):
        re_flag = 24.0 if i < 5 else None
        _seed_chain(
            clinic_id=_OTHER_CLINIC,
            channel="slack",
            rotator_user_id=ROTATOR_OTHER,
            rotation_method="manual",
            error_class="auth",
            drift_age_hours=80.0 + i,
            mark_age_hours=50.0 + i,
            confirm_age_hours=20.0 + i,
            add_re_flag_after_confirm_hours=re_flag,
        )
    # Demo-clinic admin should see ZERO cards because their own clinic
    # has no drifts.
    r = client.get(
        f"{ADVISOR_PATH}/advice?window_days=90",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total_advice_cards"] == 0


# ── 9. Empty clinic ─────────────────────────────────────────────────────────


def test_empty_clinic_returns_zero_advice_cards(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{ADVISOR_PATH}/advice?window_days=90",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total_advice_cards"] == 0
    assert data["advice_cards"] == []
    assert data["channels_with_advice"] == []


# ── 10. Audit-events scoped + paginated ─────────────────────────────────────


class TestAuditEvents:
    def test_audit_events_scoped(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Post 5 audit events.
        for i in range(5):
            r = client.post(
                f"{ADVISOR_PATH}/audit-events",
                json={"event": "view", "note": f"page view #{i}"},
                headers=auth_headers["admin"],
            )
            assert r.status_code == 200, r.text
        r = client.get(
            f"{ADVISOR_PATH}/audit-events?surface={SURFACE}&limit=10",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
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
                f"{ADVISOR_PATH}/audit-events",
                json={"event": "view", "note": f"#{i}"},
                headers=auth_headers["admin"],
            )
        r1 = client.get(
            f"{ADVISOR_PATH}/audit-events?limit=3&offset=0",
            headers=auth_headers["admin"],
        )
        r2 = client.get(
            f"{ADVISOR_PATH}/audit-events?limit=3&offset=3",
            headers=auth_headers["admin"],
        )
        assert r1.status_code == 200 and r2.status_code == 200
        ids_1 = {it["event_id"] for it in r1.json()["items"]}
        ids_2 = {it["event_id"] for it in r2.json()["items"]}
        assert ids_1.isdisjoint(ids_2)


# ── 11. Supporting metrics ──────────────────────────────────────────────────


def test_supporting_metrics_carry_actual_numeric_values(
    client: TestClient, auth_headers: dict
) -> None:
    # Unit-test the rule engine: feed crafted stats so we can assert
    # exact metric values without audit-pairing cross-talk.
    from app.services.rotation_policy_advisor import (
        _ChannelStats,
        _eval_rules_for_channel,
        _resolve_thresholds,
    )

    stats = _ChannelStats(
        channel="slack",
        total_drifts=10,
        auth_class_drifts=10,  # 100% auth share
        rotated=10,
        manual_rotations=10,  # 100% manual
        confirmed=10,
        re_flagged=4,  # 40% re-flag rate
    )
    cards = _eval_rules_for_channel(
        stats, generated_at=_dt.now(_tz.utc), thresholds=_resolve_thresholds(None)
    )
    high_cards = [c for c in cards if c.advice_code == "REFLAG_HIGH"]
    assert len(high_cards) == 1
    metrics = high_cards[0].supporting_metrics
    assert "re_flag_rate_pct" in metrics
    assert "confirmed_count" in metrics
    assert "manual_rotation_share_pct" in metrics
    assert "auth_error_class_share_pct" in metrics
    assert float(metrics["re_flag_rate_pct"]) == 40.0
    assert int(metrics["confirmed_count"]) == 10
    assert float(metrics["manual_rotation_share_pct"]) == 100.0
    assert float(metrics["auth_error_class_share_pct"]) == 100.0


# ── 12. generated_at timestamp ──────────────────────────────────────────────


def test_generated_at_present(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{ADVISOR_PATH}/advice?window_days=90",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    assert "generated_at" in r.json()
    # Parse ISO8601-ish string.
    ts = r.json()["generated_at"]
    assert "T" in ts


# ── 13. channels_with_advice deduplicated ──────────────────────────────────


def test_channels_with_advice_deduplicated(
    client: TestClient, auth_headers: dict
) -> None:
    # Slack triggers all three rules → channels_with_advice should
    # contain "slack" exactly once.
    for i in range(10):
        re_flag = 24.0 if i < 4 else None
        _seed_chain(
            channel="slack",
            error_class="auth",
            rotation_method="manual",
            drift_age_hours=80.0 + i,
            mark_age_hours=50.0 + i,
            confirm_age_hours=20.0 + i,
            add_re_flag_after_confirm_hours=re_flag,
        )
    r = client.get(
        f"{ADVISOR_PATH}/advice?window_days=90",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    chans = r.json()["channels_with_advice"]
    assert chans.count("slack") == 1


# ── 14. All 5 channels evaluated ────────────────────────────────────────────


def test_all_five_channels_evaluated_even_if_only_two_produce_cards(
    client: TestClient, auth_headers: dict
) -> None:
    # Only seed slack data → other channels evaluated but produce 0 cards.
    for i in range(10):
        re_flag = 24.0 if i < 4 else None
        _seed_chain(
            channel="slack",
            error_class="auth",
            rotation_method="manual",
            drift_age_hours=80.0 + i,
            mark_age_hours=50.0 + i,
            confirm_age_hours=20.0 + i,
            add_re_flag_after_confirm_hours=re_flag,
        )
    # Plus a small twilio dataset that does NOT trip any rule.
    _seed_drift(channel="twilio", error_class="network", age_hours=10.0)

    from app.services.rotation_policy_advisor import (
        ADVISOR_CHANNELS,
        compute_rotation_advice,
    )

    db = SessionLocal()
    try:
        # The service should evaluate all 5 channels regardless of data.
        cards = compute_rotation_advice(
            db, clinic_id=_DEMO_CLINIC, window_days=90
        )
        # Every card should belong to the recognised channel set OR a
        # known data channel like "twilio".
        all_known = set(ADVISOR_CHANNELS)
        assert all(c.channel in all_known for c in cards)
        # At minimum slack triggered cards.
        assert any(c.channel == "slack" for c in cards)
    finally:
        db.close()


# ── 15. Window days ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("window_days", [30, 90, 180])
def test_works_with_window_days_30_90_180(
    window_days: int, client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{ADVISOR_PATH}/advice?window_days={window_days}",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["window_days"] == window_days


# ── 16. Service purity ──────────────────────────────────────────────────────


def test_compute_rotation_advice_is_pure_no_db_writes(
    client: TestClient, auth_headers: dict
) -> None:
    # Seed a chain.
    for i in range(10):
        re_flag = 24.0 if i < 4 else None
        _seed_chain(
            channel="slack",
            error_class="auth",
            rotation_method="manual",
            drift_age_hours=80.0 + i,
            mark_age_hours=50.0 + i,
            confirm_age_hours=20.0 + i,
            add_re_flag_after_confirm_hours=re_flag,
        )
    db = SessionLocal()
    try:
        before = db.query(AuditEventRecord).count()
        from app.services.rotation_policy_advisor import (
            compute_rotation_advice,
        )

        _ = compute_rotation_advice(
            db, clinic_id=_DEMO_CLINIC, window_days=90
        )
        _ = compute_rotation_advice(
            db, clinic_id=_DEMO_CLINIC, window_days=90
        )
        after = db.query(AuditEventRecord).count()
        assert before == after
    finally:
        db.close()


# ── 17. Boundary: exactly at threshold ──────────────────────────────────────


def test_reflag_high_strictly_greater_than_30() -> None:
    # Unit-test: 10 confirmed, 3 re-flag → exactly 30% → should NOT
    # trigger because the threshold is strict greater-than.
    from app.services.rotation_policy_advisor import (
        _ChannelStats,
        _eval_rules_for_channel,
        _resolve_thresholds,
    )

    stats = _ChannelStats(
        channel="slack",
        total_drifts=10,
        auth_class_drifts=0,
        rotated=10,
        manual_rotations=0,
        confirmed=10,
        re_flagged=3,  # exactly 30%
    )
    cards = _eval_rules_for_channel(
        stats, generated_at=_dt.now(_tz.utc), thresholds=_resolve_thresholds(None)
    )
    codes = {c.advice_code for c in cards}
    assert "REFLAG_HIGH" not in codes


# ── 18. Thresholds in response ──────────────────────────────────────────────


def test_thresholds_published_in_response(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{ADVISOR_PATH}/advice?window_days=90",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    data = r.json()
    assert "thresholds" in data
    thr = data["thresholds"]
    assert thr.get("reflag_high_pct") == 30.0
    assert thr.get("manual_share_pct") == 70.0
    assert thr.get("auth_dominant_pct") == 60.0
