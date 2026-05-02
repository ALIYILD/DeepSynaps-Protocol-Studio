"""Tests for the Channel Auth Drift Resolution Audit Hub launch-audit
(CSAHP3, 2026-05-02).

Cohort dashboard built on the audit trail emitted by CSAHP1 (#417) and
CSAHP2 (#422). Mirrors the DCR2 → DCRO1 pattern (#392 / #393): pure
read-side analytics on already-shipped audit rows.

The suite asserts:

* the surface lands on ``KNOWN_SURFACES`` and the qeeg-analysis
  audit-events whitelist
* role gate (clinician+; patient/guest 403)
* funnel counts + funnel percentages (marked_pct out of detected,
  confirmed_pct out of marked, re_flag_pct out of confirmed)
* funnel pct returns null when the upstream count is zero
* rotation_method_distribution counts per method
* by-channel median time-to-rotate / time-to-confirm + re-flag rate
* cross-clinic IDOR exclusion on every endpoint
* top-rotators ordering, min_rotations gate, name resolution
* trend buckets render weekly when window_days=90
* empty-clinic returns clean structure (no nulls in funnel; medians
  null)
* large dataset (50+ drifts) does not OOM
* audit-events scoped + paginated
* pairing handles drift→mark→confirm→re-flag correctly
* pairing handles drift with no rotation (still counts in
  funnel.detected, not in marked)
* re-flag detection requires same channel — cross-channel re-detect is
  not counted
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
SURFACE = "channel_auth_drift_resolution_audit_hub"
HUB_PATH = "/api/v1/channel-auth-drift-resolution-audit-hub"

DRIFT_DETECTED_ACTION = f"{WORKER_SURFACE}.auth_drift_detected"
MARKED_ROTATED_ACTION = f"{WORKER_SURFACE}.auth_drift_marked_rotated"
RESOLVED_CONFIRMED_ACTION = f"{WORKER_SURFACE}.auth_drift_resolved_confirmed"


_DEMO_CLINIC = "clinic-demo-default"
_OTHER_CLINIC = "clinic-csahp3-other"

ROTATOR_X = "actor-csahp3-rotator-x"
ROTATOR_Y = "actor-csahp3-rotator-y"
ROTATOR_Z = "actor-csahp3-rotator-z"
ROTATOR_OTHER = "actor-csahp3-rotator-other-clinic"

_TEST_USER_IDS = (ROTATOR_X, ROTATOR_Y, ROTATOR_Z, ROTATOR_OTHER)


# ── Fixtures / helpers ──────────────────────────────────────────────────────


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
    email: Optional[str] = None,
    display_name: Optional[str] = None,
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
                email=email or f"{user_id}@example.com",
                display_name=display_name or user_id,
                hashed_password="x",
                role=role,
                package_id="enterprise",
                clinic_id=clinic_id,
            )
        )
        db.commit()
    finally:
        db.close()


def _isoformat_utc(when: _dt) -> str:
    return when.isoformat()


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
            created_at=_isoformat_utc(ts),
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


def _seed_mark_rotated(
    *,
    clinic_id: str = _DEMO_CLINIC,
    channel: str = "slack",
    rotator_user_id: str = ROTATOR_X,
    rotation_method: str = "manual",
    source_drift_event_id: str = "",
    error_class: str = "auth",
    rotation_note: str = "rotated via vault",
    age_hours: float = 12.0,
) -> str:
    ts = _dt.now(_tz.utc) - _td(hours=age_hours)
    eid = (
        f"{WORKER_SURFACE}-auth_drift_marked_rotated-{clinic_id}-{channel}-"
        f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
    )
    note = (
        f"priority=info clinic_id={clinic_id} channel={channel} "
        f"error_class={error_class} rotator_user_id={rotator_user_id} "
        f"rotation_method={rotation_method} "
        f"source_drift_event_id={source_drift_event_id} "
        f"rotation_note={rotation_note}"
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


def _seed_full_chain(
    *,
    clinic_id: str = _DEMO_CLINIC,
    channel: str = "slack",
    rotator_user_id: str = ROTATOR_X,
    rotation_method: str = "manual",
    drift_age_hours: float = 48.0,
    mark_age_hours: float = 24.0,
    confirm_age_hours: float = 12.0,
    add_re_flag_after_confirm_hours: Optional[float] = None,
) -> dict:
    """Helper to seed a full drift→mark→confirm chain. Returns the
    event ids so callers can spot-check."""
    drift_id, drift_eid = _seed_drift(
        clinic_id=clinic_id,
        channel=channel,
        age_hours=drift_age_hours,
    )
    mark_eid = _seed_mark_rotated(
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
        re_flag_ts = confirm_ts + _td(hours=add_re_flag_after_confirm_hours)
        # Express as age_hours backward from now.
        re_flag_age = (_dt.now(_tz.utc) - re_flag_ts).total_seconds() / 3600.0
        if re_flag_age < 0:
            re_flag_age = 0.0
        _re_id, re_flag_eid = _seed_drift(
            clinic_id=clinic_id,
            channel=channel,
            age_hours=re_flag_age,
        )
    return {
        "drift_id": drift_id,
        "drift_eid": drift_eid,
        "mark_eid": mark_eid,
        "confirmed_eid": confirmed_eid,
        "re_flag_eid": re_flag_eid,
    }


# ── 1. Surface whitelist sanity ─────────────────────────────────────────────


def test_csahp3_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_csahp3_surface_accepted_by_qeeg_audit_events(
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
    def test_patient_summary_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_guest_summary_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_clinician_can_read_summary(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text


# ── 3. Funnel counts + percentages ──────────────────────────────────────────


class TestFunnel:
    def test_funnel_counts_full_chain(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # 10 detected, 8 marked, 6 confirmed, 1 re-flagged within 30d.
        # Build incrementally:
        # - 4 drifts that progress to confirmed (with no re-flag) — drift, mark, confirm
        # - 1 drift that progresses to confirmed AND re-flags within 30d
        # - 1 drift that progresses to confirmed (no re-flag)
        # Wait — we need 6 confirmed. Re-do plan:
        # 6 confirmed chains (one of which re-flags within 30d).
        # 2 marked-but-not-confirmed (drift + mark, no confirm).
        # 2 drifts only (still in detected funnel).
        for i in range(5):
            _seed_full_chain(
                drift_age_hours=72.0 + i,
                mark_age_hours=48.0 + i,
                confirm_age_hours=24.0 + i,
                channel="slack",
            )
        _seed_full_chain(
            drift_age_hours=80.0,
            mark_age_hours=50.0,
            confirm_age_hours=30.0,
            channel="sendgrid",
            add_re_flag_after_confirm_hours=24.0,  # within 30d
        )
        # Two marked but not confirmed.
        for i in range(2):
            d_id, d_eid = _seed_drift(
                channel="twilio", age_hours=70.0 + i
            )
            _seed_mark_rotated(
                channel="twilio",
                rotator_user_id=ROTATOR_Y,
                source_drift_event_id=d_eid,
                age_hours=40.0 + i,
            )
        # Two drift-only.
        for _ in range(2):
            _seed_drift(channel="pagerduty", age_hours=10.0)

        r = client.get(
            f"{HUB_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        funnel = data["rotation_funnel"]
        # 6 chains progressed past mark (5 slack + 1 sendgrid) + 2 twilio
        # = 8 marked. Plus 2 pagerduty drift-only = 10 total drifts.
        # Plus the sendgrid chain has a re-flag drift = 11 total.
        # Actually re-flag is also a detected row in the funnel.
        assert funnel["detected"] >= 10
        assert funnel["marked_rotated"] == 8
        assert funnel["confirmed"] == 6
        assert funnel["re_flagged_within_30d"] == 1

    def test_funnel_pct_calculation(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # 10 detected, 8 marked → 80% marked_pct.
        for i in range(10):
            d_id, d_eid = _seed_drift(
                channel="slack" if i < 5 else "sendgrid",
                age_hours=80.0 - i,
            )
            if i < 8:
                m_eid = _seed_mark_rotated(
                    channel="slack" if i < 5 else "sendgrid",
                    rotator_user_id=ROTATOR_X,
                    source_drift_event_id=d_eid,
                    age_hours=40.0 - i * 0.5,
                )
                if i < 6:
                    _seed_confirmed(
                        channel="slack" if i < 5 else "sendgrid",
                        mark_rotated_event_id=m_eid,
                        age_hours=20.0 - i * 0.2,
                    )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        funnel = data["rotation_funnel"]
        pct = data["rotation_funnel_pct"]
        assert funnel["detected"] == 10
        assert funnel["marked_rotated"] == 8
        assert funnel["confirmed"] == 6
        assert pct["marked_pct"] == 80.0
        # confirmed_pct out of marked: 6/8 = 75.0
        assert pct["confirmed_pct"] == 75.0

    def test_funnel_pct_re_flag_pct(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # 6 confirmed, 1 re-flagged within 30d → ~16.67%.
        for i in range(5):
            _seed_full_chain(
                drift_age_hours=80.0 + i,
                mark_age_hours=50.0 + i,
                confirm_age_hours=20.0 + i,
                channel="slack",
            )
        _seed_full_chain(
            drift_age_hours=90.0,
            mark_age_hours=60.0,
            confirm_age_hours=40.0,
            channel="sendgrid",
            add_re_flag_after_confirm_hours=72.0,  # within 30d
        )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=180",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        pct = r.json()["rotation_funnel_pct"]
        assert pct["re_flag_pct"] is not None
        assert 16.0 <= pct["re_flag_pct"] <= 17.0

    def test_funnel_pct_null_when_zero_confirmed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Drift only — no marks, no confirms.
        _seed_drift(channel="slack", age_hours=10.0)
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        pct = r.json()["rotation_funnel_pct"]
        # marked_pct: 0/1 = 0.0 (denom non-zero), confirmed/re_flag null.
        assert pct["marked_pct"] == 0.0
        assert pct["confirmed_pct"] is None
        assert pct["re_flag_pct"] is None


# ── 4. Rotation method distribution ─────────────────────────────────────────


class TestRotationMethodDistribution:
    def test_rotation_method_distribution_counts(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # 3 manual, 2 automated_rotation, 1 key_revoked.
        for i in range(3):
            _seed_full_chain(
                drift_age_hours=80.0 + i,
                mark_age_hours=50.0 + i,
                confirm_age_hours=24.0 + i,
                channel="slack",
                rotation_method="manual",
            )
        for i in range(2):
            _seed_full_chain(
                drift_age_hours=80.0 + i,
                mark_age_hours=50.0 + i,
                confirm_age_hours=24.0 + i,
                channel="sendgrid",
                rotation_method="automated_rotation",
            )
        _seed_full_chain(
            drift_age_hours=80.0,
            mark_age_hours=50.0,
            confirm_age_hours=24.0,
            channel="twilio",
            rotation_method="key_revoked",
        )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        dist = r.json()["rotation_method_distribution"]
        assert dist["manual"] == 3
        assert dist["automated_rotation"] == 2
        assert dist["key_revoked"] == 1


# ── 5. Per-channel metrics ──────────────────────────────────────────────────


class TestByChannel:
    def test_by_channel_median_time_to_rotate_slack(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # 3 slack chains: detect at -48h, mark at -38h, -36h, -34h
        # → time-to-rotate 10h, 12h, 14h. Median = 12.
        for delta in (10.0, 12.0, 14.0):
            d_id, d_eid = _seed_drift(channel="slack", age_hours=48.0)
            _seed_mark_rotated(
                channel="slack",
                source_drift_event_id=d_eid,
                age_hours=48.0 - delta,
            )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        slack = r.json()["by_channel"]["slack"]
        assert slack["drifts"] == 3
        assert slack["rotated"] == 3
        median = slack["median_time_to_rotate_hours"]
        assert median is not None
        assert 11.0 <= median <= 13.0

    def test_by_channel_re_flag_rate_per_channel(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # 4 slack chains, 1 re-flagged within 30d → 25%.
        # Space the chains > 30d apart in time so each chain's re-flag
        # detection window only sees its OWN re-flag drift (or none).
        # confirm_age_hours decreases through time so chains are ordered
        # ancient-to-recent. The re-flag drift is added 48h after the
        # OLDEST chain's confirm; the only later drifts on slack are
        # the subsequent chains' OWN drift rows, which land >30d after
        # that confirm and so do NOT count as re-flags.
        # Chain 1 (oldest, with re-flag): drift -150d, mark -149d, confirm -148d.
        _seed_full_chain(
            drift_age_hours=24.0 * 150,
            mark_age_hours=24.0 * 149,
            confirm_age_hours=24.0 * 148,
            channel="slack",
            add_re_flag_after_confirm_hours=48.0,  # 2d → within 30d
        )
        # Chain 2: drift -100d (so ~48d after chain 1 confirm). Outside 30d.
        _seed_full_chain(
            drift_age_hours=24.0 * 100,
            mark_age_hours=24.0 * 99,
            confirm_age_hours=24.0 * 98,
            channel="slack",
        )
        # Chain 3: drift -50d.
        _seed_full_chain(
            drift_age_hours=24.0 * 50,
            mark_age_hours=24.0 * 49,
            confirm_age_hours=24.0 * 48,
            channel="slack",
        )
        # Chain 4: drift -10d (most recent). Confirm at -8d. No
        # subsequent slack drifts → no re-flag.
        _seed_full_chain(
            drift_age_hours=24.0 * 10,
            mark_age_hours=24.0 * 9,
            confirm_age_hours=24.0 * 8,
            channel="slack",
        )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=200",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        slack = r.json()["by_channel"]["slack"]
        assert slack["confirmed"] == 4
        assert slack["re_flagged_within_30d"] == 1
        assert slack["re_flag_rate_pct"] == 25.0

    def test_by_channel_zero_drifts_returns_seeded_keys(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # No data — every PROBE_CHANNELS key still present with zeros.
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        by_channel = r.json()["by_channel"]
        for ch in ("slack", "sendgrid", "twilio", "pagerduty"):
            assert ch in by_channel
            assert by_channel[ch]["drifts"] == 0
            assert by_channel[ch]["median_time_to_rotate_hours"] is None


# ── 6. Cross-clinic IDOR ────────────────────────────────────────────────────


class TestCrossClinic:
    def test_other_clinic_excluded_from_summary(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_full_chain(clinic_id=_OTHER_CLINIC, channel="slack")
        _seed_full_chain(clinic_id=_DEMO_CLINIC, channel="slack")
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Only the in-clinic chain counted.
        assert data["total_drifts"] == 1
        assert data["rotation_funnel"]["confirmed"] == 1

    def test_other_clinic_excluded_from_top_rotators(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            ROTATOR_OTHER,
            clinic_id=_OTHER_CLINIC,
            display_name="Other Clinic Rotator",
        )
        for _ in range(5):
            _seed_full_chain(
                clinic_id=_OTHER_CLINIC,
                channel="slack",
                rotator_user_id=ROTATOR_OTHER,
            )
        r = client.get(
            f"{HUB_PATH}/top-rotators?window_days=90&min_rotations=1",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        ids = [it["rotator_user_id"] for it in r.json()["items"]]
        assert ROTATOR_OTHER not in ids


# ── 7. Top rotators ─────────────────────────────────────────────────────────


class TestTopRotators:
    def test_top_rotators_ordered_by_rotations(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(ROTATOR_X, display_name="Rotator X")
        _seed_user(ROTATOR_Y, display_name="Rotator Y")
        _seed_user(ROTATOR_Z, display_name="Rotator Z")
        for rid, count in (
            (ROTATOR_X, 5),
            (ROTATOR_Y, 3),
            (ROTATOR_Z, 7),
        ):
            for i in range(count):
                _seed_full_chain(
                    rotator_user_id=rid,
                    channel="slack",
                    drift_age_hours=80.0 + i,
                    mark_age_hours=50.0 + i,
                    confirm_age_hours=24.0 + i,
                )
        r = client.get(
            f"{HUB_PATH}/top-rotators?window_days=90&min_rotations=1",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        # Strictly descending by rotations.
        counts = [it["rotations"] for it in items]
        assert counts == sorted(counts, reverse=True)
        assert items[0]["rotator_user_id"] == ROTATOR_Z
        assert items[0]["rotations"] == 7

    def test_top_rotators_min_rotations_gate(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Y has only 1 rotation; min_rotations=2 must drop them.
        _seed_user(ROTATOR_X, display_name="Rotator X")
        _seed_user(ROTATOR_Y, display_name="Rotator Y")
        for _ in range(3):
            _seed_full_chain(
                rotator_user_id=ROTATOR_X, channel="slack"
            )
        _seed_full_chain(rotator_user_id=ROTATOR_Y, channel="sendgrid")
        r = client.get(
            f"{HUB_PATH}/top-rotators?window_days=90&min_rotations=2",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        ids = [it["rotator_user_id"] for it in r.json()["items"]]
        assert ROTATOR_X in ids
        assert ROTATOR_Y not in ids

    def test_top_rotators_resolves_user_name(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(ROTATOR_X, display_name="Pretty X Name")
        for _ in range(2):
            _seed_full_chain(rotator_user_id=ROTATOR_X, channel="slack")
        r = client.get(
            f"{HUB_PATH}/top-rotators?window_days=90&min_rotations=1",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        target = next(
            (it for it in items if it["rotator_user_id"] == ROTATOR_X),
            None,
        )
        assert target is not None
        assert target["rotator_name"] == "Pretty X Name"


# ── 8. Trend buckets ────────────────────────────────────────────────────────


class TestTrendBuckets:
    def test_trend_buckets_weekly_for_90d_window(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_full_chain(channel="slack")
        r = client.get(
            f"{HUB_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        buckets = r.json()["trend_buckets"]
        # 90 / 7 = 12.86 → 13 weekly buckets capped.
        assert 12 <= len(buckets) <= 13


# ── 9. Empty / clean structure ──────────────────────────────────────────────


class TestEmpty:
    def test_empty_clinic_returns_clean_structure(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_drifts"] == 0
        funnel = data["rotation_funnel"]
        # No nulls in funnel — concrete zeros.
        for k in ("detected", "marked_rotated", "confirmed", "re_flagged_within_30d"):
            assert funnel[k] == 0
        # Per-channel medians null when no data.
        for ch in ("slack", "sendgrid", "twilio", "pagerduty"):
            assert data["by_channel"][ch]["median_time_to_rotate_hours"] is None


# ── 10. Large dataset memory bound ──────────────────────────────────────────


class TestLargeDataset:
    def test_50_drifts_does_not_oom(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        for i in range(50):
            _seed_full_chain(
                drift_age_hours=80.0 + i * 0.1,
                mark_age_hours=50.0 + i * 0.1,
                confirm_age_hours=24.0 + i * 0.1,
                channel="slack" if (i % 2 == 0) else "sendgrid",
            )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=180",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_drifts"] == 50


# ── 11. Audit-events scoped + paginated ─────────────────────────────────────


class TestAuditEvents:
    def test_audit_events_scoped_and_paginated(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        for ev in ("view", "window_changed", "top_rotators_view"):
            r = client.post(
                f"{HUB_PATH}/audit-events",
                json={"event": ev, "note": f"test {ev}"},
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200, r.text
        r = client.get(
            f"{HUB_PATH}/audit-events?surface={SURFACE}&limit=10",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["surface"] == SURFACE
        assert data["total"] >= 3
        assert data["limit"] == 10


# ── 12. Pairing — drift→mark→confirm→re-flag ────────────────────────────────


class TestPairing:
    def test_pairing_full_chain_with_re_flag(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        from app.services.auth_drift_resolution_pairing import (
            pair_drifts_with_resolutions,
        )

        _seed_full_chain(
            channel="slack",
            drift_age_hours=72.0,
            mark_age_hours=48.0,
            confirm_age_hours=24.0,
            add_re_flag_after_confirm_hours=72.0,
        )
        db = SessionLocal()
        try:
            recs = pair_drifts_with_resolutions(db, _DEMO_CLINIC, 90)
        finally:
            db.close()
        # 2 detected drifts (the original + the re-flag).
        assert len(recs) == 2
        first = next(r for r in recs if r.marked_at is not None)
        assert first.confirmed_at is not None
        assert first.re_flagged_within_30d is True
        assert first.rotation_method == "manual"

    def test_pairing_drift_with_no_rotation(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        from app.services.auth_drift_resolution_pairing import (
            pair_drifts_with_resolutions,
        )

        _seed_drift(channel="slack", age_hours=24.0)
        db = SessionLocal()
        try:
            recs = pair_drifts_with_resolutions(db, _DEMO_CLINIC, 90)
        finally:
            db.close()
        assert len(recs) == 1
        rec = recs[0]
        assert rec.marked_at is None
        assert rec.confirmed_at is None
        assert rec.re_flagged_within_30d is False

    def test_re_flag_requires_same_channel(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Slack chain confirmed; subsequent sendgrid drift must NOT count
        # as a slack re-flag.
        from app.services.auth_drift_resolution_pairing import (
            pair_drifts_with_resolutions,
        )

        chain = _seed_full_chain(
            channel="slack",
            drift_age_hours=120.0,
            mark_age_hours=96.0,
            confirm_age_hours=72.0,
        )
        # New sendgrid drift after the slack confirm.
        _seed_drift(channel="sendgrid", age_hours=24.0)

        db = SessionLocal()
        try:
            recs = pair_drifts_with_resolutions(db, _DEMO_CLINIC, 90)
        finally:
            db.close()
        slack_rec = next(
            r for r in recs if r.drift_event_id == chain["drift_eid"]
        )
        assert slack_rec.re_flagged_within_30d is False
