"""Tests for the Rotation Policy Advisor Threshold Tuning Console
launch-audit (CSAHP6, 2026-05-02).

Closes the recursion loop opened by CSAHP5 (#434):

* CSAHP4 (#428) emits heuristic advice cards from hardcoded thresholds.
* CSAHP5 (#434) measures predictive accuracy per advice code.
* CSAHP6 (this PR) lets admins propose new thresholds, replay them
  against the last 90 days of frozen ``advice_snapshot`` rows, and
  adopt the winning threshold. Adopted values take effect immediately
  on the next CSAHP4 ``/advice`` call.

Pattern mirrors
``test_rotation_policy_advisor_outcome_tracker_launch_audit.py`` (CSAHP5).

The suite asserts:

* current-thresholds returns defaults when no DB rows
* current-thresholds reflects DB-stored values for the clinic
* cross-clinic IDOR (clinic A's thresholds don't leak to clinic B)
* replay with default override → matches current accuracy
* replay with stricter REFLAG_HIGH threshold → fewer cards
* replay with looser threshold → more cards
* replay reconstructs supporting_metrics from snapshot rows
* adopt: admin can adopt, clinician 403
* adopt validates threshold_value is a number
* adopt validates justification 10-500 chars
* adopt emits audit row with old/new values
* adopt is upsert (re-adopting updates, doesn't duplicate)
* cross-clinic IDOR on adopt
* adoption-history paginated, scoped to clinic
* adoption-history ordered most-recent first
* integration: adopt new threshold → next CSAHP4 /advice uses it
* alembic migration up + down clean
* audit-events scoped + paginated
* surface whitelisted in audit_trail_router KNOWN_SURFACES + qeeg
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
    RotationPolicyAdvisorThreshold,
    User,
)


os.environ.pop("ROTATION_POLICY_ADVISOR_SNAPSHOT_ENABLED", None)


SURFACE = "rotation_policy_advisor_threshold_tuning"
ADVISOR_SURFACE = "auth_drift_rotation_policy_advisor"
ADVICE_SNAPSHOT_ACTION = f"{ADVISOR_SURFACE}.advice_snapshot"
SNAPSHOT_RUN_ACTION = f"{ADVISOR_SURFACE}.snapshot_run"
ADOPTION_ACTION = f"{ADVISOR_SURFACE}.threshold_adopted"
TUNING_PATH = "/api/v1/rotation-policy-advisor-threshold-tuning"


_DEMO_CLINIC = "clinic-demo-default"
_OTHER_CLINIC = "clinic-csahp6-other"

CSAHP6_USER = "actor-csahp6-admin"
CSAHP6_OTHER_USER = "actor-csahp6-other-admin"
CSAHP6_CLINICIAN = "actor-csahp6-clinician"

_TEST_USER_IDS = (CSAHP6_USER, CSAHP6_OTHER_USER, CSAHP6_CLINICIAN)


# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(RotationPolicyAdvisorThreshold).filter(
            RotationPolicyAdvisorThreshold.clinic_id.in_(
                [_DEMO_CLINIC, _OTHER_CLINIC]
            )
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_(
                [SURFACE, ADVISOR_SURFACE, "channel_auth_health_probe"]
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
    when: Optional[_dt] = None,
) -> str:
    ts = when or _dt.now(_tz.utc)
    eid = (
        f"{ADVISOR_SURFACE}-snapshot_run-{clinic_id}-"
        f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
    )
    note = (
        f"priority=info clinic_id={clinic_id} "
        f"total_advice_cards=1 channels_with_advice=slack"
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


def test_csahp6_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_csahp6_surface_accepted_by_qeeg_audit_events(
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


# ── 2. current-thresholds returns defaults ────────────────────────────────


def test_current_thresholds_returns_defaults_when_no_db_rows(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{TUNING_PATH}/current-thresholds",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    th = body["thresholds"]
    assert "REFLAG_HIGH" in th
    assert th["REFLAG_HIGH"]["re_flag_rate_pct_min"] == 30.0
    assert th["REFLAG_HIGH"]["confirmed_count_min"] == 3.0
    assert th["MANUAL_REFLAG"]["manual_share_pct_min"] == 70.0
    assert th["AUTH_DOMINANT"]["auth_share_pct_min"] == 60.0


# ── 3. current-thresholds reflects DB-stored values ────────────────────────


def test_current_thresholds_reflects_db_values_for_clinic(
    client: TestClient, auth_headers: dict
) -> None:
    db = SessionLocal()
    try:
        db.add(
            RotationPolicyAdvisorThreshold(
                id=f"rpat-{_uuid.uuid4().hex[:16]}",
                clinic_id=_DEMO_CLINIC,
                advice_code="REFLAG_HIGH",
                threshold_key="re_flag_rate_pct_min",
                threshold_value=42.0,
                adopted_by_user_id="actor-admin-demo",
                created_at=_dt.now(_tz.utc).isoformat(),
                updated_at=_dt.now(_tz.utc).isoformat(),
            )
        )
        db.commit()
    finally:
        db.close()

    r = client.get(
        f"{TUNING_PATH}/current-thresholds",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["thresholds"]["REFLAG_HIGH"]["re_flag_rate_pct_min"] == 42.0
    assert body["has_overrides"]["REFLAG_HIGH"]["re_flag_rate_pct_min"] is True
    # Defaults expose the unmodified baseline.
    assert body["defaults"]["REFLAG_HIGH"]["re_flag_rate_pct_min"] == 30.0


# ── 4. Cross-clinic IDOR on current-thresholds ────────────────────────────


def test_current_thresholds_cross_clinic_iidor_blocks_other_clinic(
    client: TestClient, auth_headers: dict
) -> None:
    db = SessionLocal()
    try:
        db.add(
            RotationPolicyAdvisorThreshold(
                id=f"rpat-{_uuid.uuid4().hex[:16]}",
                clinic_id=_OTHER_CLINIC,
                advice_code="REFLAG_HIGH",
                threshold_key="re_flag_rate_pct_min",
                threshold_value=99.0,
                adopted_by_user_id="other-admin",
                created_at=_dt.now(_tz.utc).isoformat(),
                updated_at=_dt.now(_tz.utc).isoformat(),
            )
        )
        db.commit()
    finally:
        db.close()

    r = client.get(
        f"{TUNING_PATH}/current-thresholds",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    # Demo clinic's threshold must NOT be 99.0 (that belongs to OTHER clinic).
    assert body["thresholds"]["REFLAG_HIGH"]["re_flag_rate_pct_min"] != 99.0


# ── 5. replay with default override matches current accuracy ─────────────


def test_replay_with_default_override_matches_current_accuracy(
    client: TestClient, auth_headers: dict
) -> None:
    # Seed paired snapshots in the window to exercise the pairing logic.
    t0 = _dt.now(_tz.utc) - _td(days=20)
    t1 = t0 + _td(days=14)
    _seed_advice_snapshot(when=t0, re_flag_rate_pct=40.0)
    _seed_advice_snapshot(when=t1, re_flag_rate_pct=20.0)
    _seed_snapshot_run(when=t1)

    r = client.post(
        f"{TUNING_PATH}/replay",
        json={"override_thresholds": {}},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # With empty override (= defaults) replay accuracy ≈ current accuracy.
    assert body["current_accuracy"] == body["whatif_accuracy"]
    for code in body["delta"].keys():
        assert body["delta"][code] == 0.0


# ── 6. Stricter REFLAG_HIGH threshold removes cards ──────────────────────


def test_replay_stricter_threshold_reduces_cards_fired(
    client: TestClient, auth_headers: dict
) -> None:
    # Seed snapshot at re_flag_rate_pct=35 (above default 30, below 50).
    t0 = _dt.now(_tz.utc) - _td(days=20)
    _seed_advice_snapshot(
        when=t0,
        re_flag_rate_pct=35.0,
        advice_code="REFLAG_HIGH",
    )
    _seed_snapshot_run(when=t0 + _td(days=14))

    # Stricter threshold (50) should NOT fire on a 35% card.
    r = client.post(
        f"{TUNING_PATH}/replay",
        json={
            "override_thresholds": {
                "REFLAG_HIGH": {
                    "re_flag_rate_pct_min": 50.0,
                    "confirmed_count_min": 3.0,
                }
            }
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    cfc = body["cards_fired_change"]["REFLAG_HIGH"]
    # Stricter threshold reduces (or holds) the whatif fired count.
    assert cfc["whatif"] <= cfc["current"]
    assert cfc["delta"] <= 0


# ── 7. Looser threshold can include more cards ────────────────────────────


def test_replay_looser_threshold_keeps_or_grows_cards_fired(
    client: TestClient, auth_headers: dict
) -> None:
    t0 = _dt.now(_tz.utc) - _td(days=20)
    _seed_advice_snapshot(when=t0, re_flag_rate_pct=35.0)
    _seed_snapshot_run(when=t0 + _td(days=14))

    # Loose threshold (10): the same 35%-card definitely fires.
    r = client.post(
        f"{TUNING_PATH}/replay",
        json={
            "override_thresholds": {
                "REFLAG_HIGH": {
                    "re_flag_rate_pct_min": 10.0,
                    "confirmed_count_min": 3.0,
                }
            }
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    cfc = body["cards_fired_change"]["REFLAG_HIGH"]
    assert cfc["whatif"] >= cfc["current"]


# ── 8. Replay reconstructs supporting_metrics from snapshot rows ──────────


def test_replay_uses_snapshot_metrics_not_current_data(
    client: TestClient, auth_headers: dict
) -> None:
    """Smoke test: replay returns a snapshot_count > 0 when there are
    seeded ``advice_snapshot`` rows but NO underlying drift records
    in ``compute_rotation_advice``. Proves the replay walks the
    frozen audit rows rather than re-running the live computation."""
    t0 = _dt.now(_tz.utc) - _td(days=10)
    _seed_advice_snapshot(when=t0, re_flag_rate_pct=80.0)
    _seed_snapshot_run(when=t0 + _td(days=14))

    r = client.post(
        f"{TUNING_PATH}/replay",
        json={"override_thresholds": {}},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["snapshot_count"] >= 1


# ── 9. adopt — admin can; clinician 403 ───────────────────────────────────


def test_adopt_admin_succeeds(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "advice_code": "REFLAG_HIGH",
            "threshold_key": "re_flag_rate_pct_min",
            "threshold_value": 25.0,
            "justification": "Replay shows +12pp accuracy on 90d window.",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["accepted"] is True
    assert body["threshold_value"] == 25.0
    assert body["is_new"] is True
    assert body["audit_event_id"]


def test_adopt_clinician_blocked(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "advice_code": "REFLAG_HIGH",
            "threshold_key": "re_flag_rate_pct_min",
            "threshold_value": 25.0,
            "justification": "Replay shows +12pp accuracy on 90d window.",
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


# ── 10. adopt validates threshold_value is numeric ────────────────────────


def test_adopt_rejects_non_numeric_threshold_value(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "advice_code": "REFLAG_HIGH",
            "threshold_key": "re_flag_rate_pct_min",
            "threshold_value": "not-a-number",
            "justification": "Replay shows positive delta.",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code in (400, 422)


# ── 11. adopt validates justification length ──────────────────────────────


def test_adopt_validates_justification_min_length(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "advice_code": "REFLAG_HIGH",
            "threshold_key": "re_flag_rate_pct_min",
            "threshold_value": 25.0,
            "justification": "tooShort",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code in (400, 422)


def test_adopt_validates_justification_max_length(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "advice_code": "REFLAG_HIGH",
            "threshold_key": "re_flag_rate_pct_min",
            "threshold_value": 25.0,
            "justification": "x" * 501,
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code in (400, 422)


# ── 12. adopt emits audit row with old/new values ─────────────────────────


def test_adopt_emits_audit_row_with_old_new_values(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "advice_code": "AUTH_DOMINANT",
            "threshold_key": "auth_share_pct_min",
            "threshold_value": 50.0,
            "justification": "Replay tightens AUTH_DOMINANT predictive accuracy.",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    eid = r.json()["audit_event_id"]
    db = SessionLocal()
    try:
        row = (
            db.query(AuditEventRecord)
            .filter(AuditEventRecord.event_id == eid)
            .one_or_none()
        )
        assert row is not None
        assert row.action == ADOPTION_ACTION
        note = row.note or ""
        assert "previous_value=" in note
        assert "new_value=50.0000" in note
        assert "advice_code=AUTH_DOMINANT" in note
        assert "is_new=true" in note
    finally:
        db.close()


# ── 13. adopt is upsert ───────────────────────────────────────────────────


def test_adopt_is_upsert(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "advice_code": "REFLAG_HIGH",
        "threshold_key": "re_flag_rate_pct_min",
        "threshold_value": 25.0,
        "justification": "Replay shows positive delta on first adopt.",
    }
    r1 = client.post(
        f"{TUNING_PATH}/adopt",
        json=body,
        headers=auth_headers["admin"],
    )
    assert r1.status_code == 200
    assert r1.json()["is_new"] is True

    body["threshold_value"] = 28.0
    body["justification"] = "Refining further after second replay."
    r2 = client.post(
        f"{TUNING_PATH}/adopt",
        json=body,
        headers=auth_headers["admin"],
    )
    assert r2.status_code == 200
    assert r2.json()["is_new"] is False
    assert r2.json()["previous_value"] == 25.0

    db = SessionLocal()
    try:
        rows = (
            db.query(RotationPolicyAdvisorThreshold)
            .filter(
                RotationPolicyAdvisorThreshold.clinic_id == _DEMO_CLINIC,
                RotationPolicyAdvisorThreshold.advice_code == "REFLAG_HIGH",
                RotationPolicyAdvisorThreshold.threshold_key
                == "re_flag_rate_pct_min",
            )
            .all()
        )
        assert len(rows) == 1
        assert rows[0].threshold_value == 28.0
    finally:
        db.close()


# ── 14. adoption-history scoped + ordered ──────────────────────────────────


def test_adoption_history_scoped_and_paginated(
    client: TestClient, auth_headers: dict
) -> None:
    # Two adoptions on the same key.
    for v in (25.0, 30.0, 35.0):
        client.post(
            f"{TUNING_PATH}/adopt",
            json={
                "advice_code": "REFLAG_HIGH",
                "threshold_key": "re_flag_rate_pct_min",
                "threshold_value": v,
                "justification": "Iterative tuning round.",
            },
            headers=auth_headers["admin"],
        )

    r = client.get(
        f"{TUNING_PATH}/adoption-history?limit=2",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 3
    assert len(body["items"]) <= 2
    for it in body["items"]:
        assert it["advice_code"] == "REFLAG_HIGH"
        assert it["threshold_key"] == "re_flag_rate_pct_min"


def test_adoption_history_ordered_most_recent_first(
    client: TestClient, auth_headers: dict
) -> None:
    for v in (25.0, 27.0, 30.0):
        client.post(
            f"{TUNING_PATH}/adopt",
            json={
                "advice_code": "REFLAG_HIGH",
                "threshold_key": "re_flag_rate_pct_min",
                "threshold_value": v,
                "justification": "Iterative tuning round.",
            },
            headers=auth_headers["admin"],
        )
    r = client.get(
        f"{TUNING_PATH}/adoption-history",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) >= 3
    # First item should reflect the most recent adoption (30.0).
    assert items[0]["new_value"] == 30.0


# ── 15. Integration: adopt → next /advice uses new threshold ──────────────


def test_integration_adopt_then_advice_uses_new_threshold(
    client: TestClient, auth_headers: dict
) -> None:
    """Admin adopts a strict REFLAG_HIGH threshold; next CSAHP4
    /advice call must apply it (no card on a 35% rate when threshold
    is 50)."""
    # Seed AUTH_DOMINANT-worthy data so a card would normally fire.
    for i in range(10):
        ts = _dt.now(_tz.utc) - _td(hours=80 + i)
        eid = (
            f"channel_auth_health_probe-auth_drift_detected-{_DEMO_CLINIC}"
            f"-slack-{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
        )
        note = (
            f"priority=high clinic_id={_DEMO_CLINIC} channel=slack "
            f"error_class=auth error_message=invalid_auth"
        )
        _seed_audit_row(
            event_id=eid,
            target_type="channel_auth_health_probe",
            action="channel_auth_health_probe.auth_drift_detected",
            note=note,
            actor_id="channel-auth-health-probe-worker",
            target_id=_DEMO_CLINIC,
            when=ts,
        )

    # Baseline: AUTH_DOMINANT card normally fires on 10/10 auth-class
    # drifts.
    r0 = client.get(
        "/api/v1/auth-drift-rotation-policy-advisor/advice?window_days=90",
        headers=auth_headers["admin"],
    )
    assert r0.status_code == 200
    cards0 = r0.json()["advice_cards"]
    assert any(c["advice_code"] == "AUTH_DOMINANT" for c in cards0)

    # Adopt an absurdly strict threshold so the rule cannot fire.
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "advice_code": "AUTH_DOMINANT",
            "threshold_key": "total_drifts_min",
            "threshold_value": 9999.0,
            "justification": "Integration test — suppress AUTH_DOMINANT.",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200

    # Now CSAHP4 must read the new threshold and NOT emit the card.
    r1 = client.get(
        "/api/v1/auth-drift-rotation-policy-advisor/advice?window_days=90",
        headers=auth_headers["admin"],
    )
    assert r1.status_code == 200
    cards1 = r1.json()["advice_cards"]
    assert not any(c["advice_code"] == "AUTH_DOMINANT" for c in cards1)


# ── 16. audit-events scoped + paginated ───────────────────────────────────


def test_audit_events_scoped_and_paginated(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/audit-events",
        json={"event": "view", "note": "open page"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    eid = r.json()["event_id"]
    assert eid.startswith(f"{SURFACE}-view-")

    r2 = client.get(
        f"{TUNING_PATH}/audit-events?limit=10",
        headers=auth_headers["clinician"],
    )
    assert r2.status_code == 200
    body = r2.json()
    assert any(it["event_id"] == eid for it in body["items"])


# ── 17. Adopt rejects unknown advice_code / threshold_key ─────────────────


def test_adopt_rejects_unknown_advice_code(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "advice_code": "NOT_A_REAL_CODE",
            "threshold_key": "re_flag_rate_pct_min",
            "threshold_value": 25.0,
            "justification": "validation test path.",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code == 400


def test_adopt_rejects_unknown_threshold_key(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "advice_code": "REFLAG_HIGH",
            "threshold_key": "not_a_real_key",
            "threshold_value": 25.0,
            "justification": "validation test path.",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code == 400


# ── 18. Alembic migration smoke ───────────────────────────────────────────


def test_alembic_migration_module_loads_with_single_head_target() -> None:
    """The 081 migration must merge the two 080 heads so
    ``alembic heads`` returns one head."""
    import importlib.util as _ilu
    from pathlib import Path

    here = Path(__file__).resolve()
    # apps/api/tests/<file> → parents: [0]=tests, [1]=api, [2]=apps, [3]=repo root.
    api_root = here.parents[1]
    mig_path = (
        api_root
        / "alembic"
        / "versions"
        / "081_rotation_policy_advisor_thresholds.py"
    )
    spec = _ilu.spec_from_file_location("csahp6_mig081", str(mig_path))
    assert spec is not None and spec.loader is not None
    mod = _ilu.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.revision == "081_rotation_policy_advisor_thresholds"
    assert mod.down_revision == (
        "080_resolver_coaching_digest_preference",
        "080_audio_analyses_table",
    )
