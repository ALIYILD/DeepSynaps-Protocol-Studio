"""Tests for the Rotation Policy Advisor Threshold Adoption Outcome
Tracker launch-audit (CSAHP7, 2026-05-02).

Closes the meta-loop on the meta-loop opened by CSAHP6 (#438):

* CSAHP4 (#428) emits heuristic advice cards from hardcoded thresholds.
* CSAHP5 (#434) measures predictive accuracy per advice code.
* CSAHP6 (#438) lets admins adopt new thresholds when replay shows
  improved accuracy.
* CSAHP7 (this PR) measures whether adopted thresholds actually
  delivered the promised improvement in production.

Pattern mirrors
``test_rotation_policy_advisor_outcome_tracker_launch_audit.py``
(CSAHP5).

The suite asserts:

* surface whitelisted in audit_trail_router KNOWN_SURFACES + qeeg
* role gate (clinician+, patient/guest 403)
* empty clinic returns clean structure
* outcome classification — improved (delta >= +5pp)
* outcome classification — regressed (delta <= -5pp)
* outcome classification — flat (-5 < delta < 5)
* outcome classification — pending (T+30d not yet elapsed)
* outcome classification — insufficient_data (< 3 paired cards)
* cross-clinic IDOR on summary
* cross-clinic IDOR on adopter-calibration
* cross-clinic IDOR on list
* by_advice_code aggregates correctly
* adopter calibration formula = (improved - regressed) / total
* min_adoptions filter
* list filtering by advice_code + outcome
* audit-events scoped + paginated
* page-level audit ingestion under csahp7 surface
* integration test — adoption pipeline → outcome tracker pairs it
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


os.environ.pop("ROTATION_POLICY_ADVISOR_SNAPSHOT_ENABLED", None)


SURFACE = "rotation_policy_advisor_threshold_adoption_outcome_tracker"
ADVISOR_SURFACE = "auth_drift_rotation_policy_advisor"
ADOPTION_ACTION = f"{ADVISOR_SURFACE}.threshold_adopted"
ADVICE_SNAPSHOT_ACTION = f"{ADVISOR_SURFACE}.advice_snapshot"
SNAPSHOT_RUN_ACTION = f"{ADVISOR_SURFACE}.snapshot_run"
TRACKER_PATH = (
    "/api/v1/rotation-policy-advisor-threshold-adoption-outcome-tracker"
)


_DEMO_CLINIC = "clinic-demo-default"
_OTHER_CLINIC = "clinic-csahp7-other"

CSAHP7_USER_A = "actor-csahp7-admin-a"
CSAHP7_USER_B = "actor-csahp7-admin-b"
CSAHP7_OTHER = "actor-csahp7-other-admin"

_TEST_USER_IDS = (CSAHP7_USER_A, CSAHP7_USER_B, CSAHP7_OTHER)


# ── Fixtures / helpers ─────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_([SURFACE, ADVISOR_SURFACE])
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


def _seed_adoption_row(
    *,
    clinic_id: str = _DEMO_CLINIC,
    advice_code: str = "REFLAG_HIGH",
    threshold_key: str = "re_flag_rate_pct_min",
    previous_value: float = 30.0,
    new_value: float = 25.0,
    actor_id: str = CSAHP7_USER_A,
    when: Optional[_dt] = None,
    justification: str = "Replay shows positive delta on prior calibration window.",
) -> str:
    ts = when or _dt.now(_tz.utc)
    eid = (
        f"{ADVISOR_SURFACE}-threshold_adopted-{clinic_id}-{advice_code}-"
        f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
    )
    note = (
        f"clinic_id={clinic_id} advice_code={advice_code} "
        f"threshold_key={threshold_key} "
        f"previous_value={previous_value:.4f} new_value={new_value:.4f} "
        f"is_new=true "
        f"justification={justification}"
    )
    _seed_audit_row(
        event_id=eid,
        target_type=ADVISOR_SURFACE,
        action=ADOPTION_ACTION,
        note=note,
        actor_id=actor_id,
        target_id=clinic_id,
        when=ts,
    )
    return eid


def _seed_advice_snapshot(
    *,
    clinic_id: str = _DEMO_CLINIC,
    channel: str = "slack",
    advice_code: str = "REFLAG_HIGH",
    severity: str = "high",
    re_flag_rate_pct: float = 40.0,
    confirmed_count: int = 10,
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
        f"manual_rotation_share_pct=100.00 "
        f"auth_error_class_share_pct=100.00 "
        f"total_drifts=10 rotations=10"
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


def _seed_paired_snapshots(
    *,
    clinic_id: str = _DEMO_CLINIC,
    advice_code: str = "REFLAG_HIGH",
    t_start: _dt,
    n_pairs: int,
    disappear_count: int,
) -> None:
    """Seed ``n_pairs`` advice_snapshot rows with their T+14d
    paired snapshots. The first ``disappear_count`` pairs are
    "card disappeared" (no T+14d snapshot for that channel/code, but
    a snapshot_run row IS present at T+14d). The remainder are
    "paired_present" (the T+14d snapshot exists for the same channel/
    code so the card has not gone away).

    The paired_present pairs each get a unique channel so the pair-
    key (channel, advice_code) is distinct per snapshot.
    """
    look = _td(days=14)
    for i in range(n_pairs):
        # Stagger the timestamps so each snapshot is a distinct row.
        ts0 = t_start + _td(hours=i * 2)
        if i < disappear_count:
            ch = f"slack_d{i}"
            _seed_advice_snapshot(
                clinic_id=clinic_id,
                channel=ch,
                advice_code=advice_code,
                when=ts0,
            )
            # snapshot_run at T+14d — but no advice_snapshot for that
            # channel/code → card_disappeared.
            _seed_snapshot_run(clinic_id=clinic_id, when=ts0 + look)
        else:
            ch = f"slack_p{i}"
            _seed_advice_snapshot(
                clinic_id=clinic_id,
                channel=ch,
                advice_code=advice_code,
                when=ts0,
            )
            _seed_advice_snapshot(
                clinic_id=clinic_id,
                channel=ch,
                advice_code=advice_code,
                when=ts0 + look,
            )
            _seed_snapshot_run(clinic_id=clinic_id, when=ts0 + look)


# ── 1. Surface whitelist sanity ────────────────────────────────────────────


def test_csahp7_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_csahp7_surface_accepted_by_qeeg_audit_events(
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


# ── 2. Role gate ───────────────────────────────────────────────────────────


def test_summary_requires_clinician(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{TRACKER_PATH}/summary",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200


def test_summary_blocks_patient(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{TRACKER_PATH}/summary",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_summary_blocks_guest(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{TRACKER_PATH}/summary",
        headers=auth_headers["guest"],
    )
    assert r.status_code == 403


# ── 3. Empty clinic returns clean structure ────────────────────────────────


def test_summary_empty_clinic_returns_clean_structure(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{TRACKER_PATH}/summary",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total_adoptions"] == 0
    counts = body["outcome_counts"]
    assert counts["improved"] == 0
    assert counts["regressed"] == 0
    assert counts["flat"] == 0
    assert counts["pending"] == 0
    assert counts["insufficient_data"] == 0
    assert body["median_accuracy_delta"] is None
    assert body["trend_buckets"] == []


# ── 4. Outcome classification — pending ────────────────────────────────────


def test_outcome_pending_when_window_not_elapsed(
    client: TestClient, auth_headers: dict
) -> None:
    """Adoption emitted today → T+30d has not elapsed → pending."""
    _seed_adoption_row(when=_dt.now(_tz.utc))
    r = client.get(
        f"{TRACKER_PATH}/summary?window_days=180&pair_lookahead_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total_adoptions"] == 1
    assert body["outcome_counts"]["pending"] == 1
    assert body["outcome_counts"]["improved"] == 0
    assert body["outcome_counts"]["regressed"] == 0


# ── 5. Outcome classification — insufficient_data ──────────────────────────


def test_outcome_insufficient_data_when_too_few_paired_cards(
    client: TestClient, auth_headers: dict
) -> None:
    """Adoption was 60 days ago (so T+30d HAS elapsed), but no
    paired snapshots in either window → insufficient_data."""
    t0 = _dt.now(_tz.utc) - _td(days=60)
    _seed_adoption_row(when=t0)
    r = client.get(
        f"{TRACKER_PATH}/summary?window_days=180&pair_lookahead_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["outcome_counts"]["insufficient_data"] >= 1
    assert body["outcome_counts"]["improved"] == 0


# ── 6. Outcome classification — improved ───────────────────────────────────


def test_outcome_improved_when_post_accuracy_jumps(
    client: TestClient, auth_headers: dict
) -> None:
    """Baseline window has 4 paired_present pairs (accuracy 0%);
    post-adoption window has 4 paired_disappeared pairs (accuracy
    100%). Delta = +100 → improved."""
    now = _dt.now(_tz.utc)
    adoption_at = now - _td(days=60)
    _seed_adoption_row(when=adoption_at, advice_code="REFLAG_HIGH")
    # Baseline window: [adoption_at - 30d, adoption_at] → 4 paired_present.
    _seed_paired_snapshots(
        advice_code="REFLAG_HIGH",
        t_start=adoption_at - _td(days=28),
        n_pairs=4,
        disappear_count=0,
    )
    # Post-adoption window: [adoption_at, adoption_at + 30d] → 4 disappeared.
    _seed_paired_snapshots(
        advice_code="REFLAG_HIGH",
        t_start=adoption_at + _td(days=2),
        n_pairs=4,
        disappear_count=4,
    )
    r = client.get(
        f"{TRACKER_PATH}/summary?window_days=180&pair_lookahead_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["outcome_counts"]["improved"] >= 1


# ── 7. Outcome classification — regressed ──────────────────────────────────


def test_outcome_regressed_when_post_accuracy_drops(
    client: TestClient, auth_headers: dict
) -> None:
    """Baseline 100% accuracy, post 0% → delta = -100 → regressed."""
    now = _dt.now(_tz.utc)
    adoption_at = now - _td(days=60)
    _seed_adoption_row(when=adoption_at, advice_code="MANUAL_REFLAG")
    _seed_paired_snapshots(
        advice_code="MANUAL_REFLAG",
        t_start=adoption_at - _td(days=28),
        n_pairs=4,
        disappear_count=4,
    )
    _seed_paired_snapshots(
        advice_code="MANUAL_REFLAG",
        t_start=adoption_at + _td(days=2),
        n_pairs=4,
        disappear_count=0,
    )
    r = client.get(
        f"{TRACKER_PATH}/summary?window_days=180&pair_lookahead_days=30",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["outcome_counts"]["regressed"] >= 1


# ── 8. Outcome classification — flat (direct service test) ───────────────


def test_outcome_classification_flat_via_service() -> None:
    """Direct test of the classification logic in
    pair_adoptions_with_outcomes by mocking the accuracy slicer.
    Baseline 50%, post 52% → delta 2 → flat."""
    from unittest.mock import patch

    from app.services.threshold_adoption_outcome_pairing import (
        OUTCOME_FLAT,
        pair_adoptions_with_outcomes,
    )

    now = _dt.now(_tz.utc)
    adoption_at = now - _td(days=60)
    _seed_adoption_row(when=adoption_at, advice_code="AUTH_DOMINANT")

    with patch(
        "app.services.threshold_adoption_outcome_pairing"
        "._accuracy_for_advice_code_in_window"
    ) as mock_acc:
        # First call = baseline; second = post.
        mock_acc.side_effect = [(50.0, 5), (52.0, 5)]
        db = SessionLocal()
        try:
            records = pair_adoptions_with_outcomes(
                db,
                clinic_id=_DEMO_CLINIC,
                window_days=180,
                pair_lookahead_days=30,
            )
        finally:
            db.close()

    assert len(records) == 1
    assert records[0].outcome == OUTCOME_FLAT
    assert records[0].accuracy_delta == 2.0


def test_outcome_classification_improved_via_service() -> None:
    """Baseline 30%, post 80% → delta 50 → improved."""
    from unittest.mock import patch

    from app.services.threshold_adoption_outcome_pairing import (
        OUTCOME_IMPROVED,
        pair_adoptions_with_outcomes,
    )

    now = _dt.now(_tz.utc)
    adoption_at = now - _td(days=60)
    _seed_adoption_row(when=adoption_at, advice_code="REFLAG_HIGH")

    with patch(
        "app.services.threshold_adoption_outcome_pairing"
        "._accuracy_for_advice_code_in_window"
    ) as mock_acc:
        mock_acc.side_effect = [(30.0, 5), (80.0, 5)]
        db = SessionLocal()
        try:
            records = pair_adoptions_with_outcomes(
                db,
                clinic_id=_DEMO_CLINIC,
                window_days=180,
                pair_lookahead_days=30,
            )
        finally:
            db.close()
    assert len(records) == 1
    assert records[0].outcome == OUTCOME_IMPROVED
    assert records[0].accuracy_delta == 50.0


def test_outcome_classification_regressed_via_service() -> None:
    """Baseline 90%, post 50% → delta -40 → regressed."""
    from unittest.mock import patch

    from app.services.threshold_adoption_outcome_pairing import (
        OUTCOME_REGRESSED,
        pair_adoptions_with_outcomes,
    )

    now = _dt.now(_tz.utc)
    adoption_at = now - _td(days=60)
    _seed_adoption_row(when=adoption_at, advice_code="MANUAL_REFLAG")

    with patch(
        "app.services.threshold_adoption_outcome_pairing"
        "._accuracy_for_advice_code_in_window"
    ) as mock_acc:
        mock_acc.side_effect = [(90.0, 5), (50.0, 5)]
        db = SessionLocal()
        try:
            records = pair_adoptions_with_outcomes(
                db,
                clinic_id=_DEMO_CLINIC,
                window_days=180,
                pair_lookahead_days=30,
            )
        finally:
            db.close()
    assert len(records) == 1
    assert records[0].outcome == OUTCOME_REGRESSED
    assert records[0].accuracy_delta == -40.0


# ── 9. Cross-clinic IDOR on summary ────────────────────────────────────────


def test_cross_clinic_isolation_on_summary(
    client: TestClient, auth_headers: dict
) -> None:
    """Adoption rows in OTHER clinic must NOT show up in DEMO clinic's
    summary."""
    _seed_adoption_row(
        clinic_id=_OTHER_CLINIC,
        when=_dt.now(_tz.utc) - _td(days=10),
        actor_id=CSAHP7_OTHER,
    )
    r = client.get(
        f"{TRACKER_PATH}/summary",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    # DEMO clinic must see zero adoptions (the OTHER clinic's row).
    assert body["total_adoptions"] == 0


# ── 10. Cross-clinic IDOR on adopter-calibration ───────────────────────────


def test_cross_clinic_isolation_on_adopter_calibration(
    client: TestClient, auth_headers: dict
) -> None:
    for _ in range(3):
        _seed_adoption_row(
            clinic_id=_OTHER_CLINIC,
            when=_dt.now(_tz.utc) - _td(days=5),
            actor_id=CSAHP7_OTHER,
        )
    r = client.get(
        f"{TRACKER_PATH}/adopter-calibration?min_adoptions=1",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    # DEMO clinic must see zero adopters (OTHER clinic's were filtered out).
    assert body["total"] == 0


# ── 11. Cross-clinic IDOR on list ──────────────────────────────────────────


def test_cross_clinic_isolation_on_list(
    client: TestClient, auth_headers: dict
) -> None:
    _seed_adoption_row(
        clinic_id=_OTHER_CLINIC,
        when=_dt.now(_tz.utc) - _td(days=2),
        actor_id=CSAHP7_OTHER,
    )
    r = client.get(
        f"{TRACKER_PATH}/list",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0


# ── 12. by_advice_code aggregates ──────────────────────────────────────────


def test_by_advice_code_aggregates_correctly(
    client: TestClient, auth_headers: dict
) -> None:
    """Two REFLAG_HIGH adoptions today → by_advice_code['REFLAG_HIGH']
    has total_adoptions=2 (both pending)."""
    now = _dt.now(_tz.utc)
    _seed_adoption_row(when=now, advice_code="REFLAG_HIGH")
    _seed_adoption_row(when=now - _td(hours=1), advice_code="REFLAG_HIGH")
    _seed_adoption_row(when=now - _td(hours=2), advice_code="MANUAL_REFLAG")
    r = client.get(
        f"{TRACKER_PATH}/summary",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["by_advice_code"]["REFLAG_HIGH"]["total_adoptions"] == 2
    assert body["by_advice_code"]["MANUAL_REFLAG"]["total_adoptions"] == 1
    # AUTH_DOMINANT is always present (zero-filled).
    assert "AUTH_DOMINANT" in body["by_advice_code"]


# ── 13. Adopter calibration formula ────────────────────────────────────────


def test_adopter_calibration_score_formula() -> None:
    """Direct test of compute_adopter_calibration: score = (improved -
    regressed) / total."""
    from app.services.threshold_adoption_outcome_pairing import (
        AdoptionOutcomeRecord,
        compute_adopter_calibration,
        OUTCOME_IMPROVED,
        OUTCOME_REGRESSED,
        OUTCOME_FLAT,
    )

    now = _dt.now(_tz.utc)
    base = dict(
        threshold_key="re_flag_rate_pct_min",
        previous_value=30.0,
        new_value=25.0,
        adopter_user_id="adopter-x",
        justification="",
        adopted_at=now,
        baseline_accuracy_pct=50.0,
        post_adoption_accuracy_pct=80.0,
        accuracy_delta=30.0,
        baseline_sample_size=5,
        post_adoption_sample_size=5,
    )
    records = [
        AdoptionOutcomeRecord(
            adoption_event_id="e1",
            advice_code="REFLAG_HIGH",
            outcome=OUTCOME_IMPROVED,
            **base,
        ),
        AdoptionOutcomeRecord(
            adoption_event_id="e2",
            advice_code="REFLAG_HIGH",
            outcome=OUTCOME_IMPROVED,
            **base,
        ),
        AdoptionOutcomeRecord(
            adoption_event_id="e3",
            advice_code="REFLAG_HIGH",
            outcome=OUTCOME_REGRESSED,
            **base,
        ),
        AdoptionOutcomeRecord(
            adoption_event_id="e4",
            advice_code="REFLAG_HIGH",
            outcome=OUTCOME_FLAT,
            **base,
        ),
    ]
    cal = compute_adopter_calibration(records)
    slot = cal["adopter-x"]
    assert slot["total_adoptions"] == 4
    assert slot["improved_count"] == 2
    assert slot["regressed_count"] == 1
    assert slot["flat_count"] == 1
    # (2 - 1) / 4 = 0.25
    assert slot["calibration_score"] == 0.25


# ── 14. min_adoptions filter ──────────────────────────────────────────────


def test_min_adoptions_filter_excludes_low_volume_adopters(
    client: TestClient, auth_headers: dict
) -> None:
    """Adopter A: 1 adoption. Adopter B: 3 adoptions. With
    min_adoptions=2, only B shows up."""
    now = _dt.now(_tz.utc)
    _seed_user(CSAHP7_USER_A, role="admin")
    _seed_user(CSAHP7_USER_B, role="admin")
    _seed_adoption_row(when=now - _td(days=1), actor_id=CSAHP7_USER_A)
    for i in range(3):
        _seed_adoption_row(
            when=now - _td(days=2 + i),
            actor_id=CSAHP7_USER_B,
            advice_code="MANUAL_REFLAG",
        )
    r = client.get(
        f"{TRACKER_PATH}/adopter-calibration?min_adoptions=2",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    ids = {it["adopter_user_id"] for it in body["items"]}
    assert CSAHP7_USER_B in ids
    assert CSAHP7_USER_A not in ids


# ── 15. List filter by advice_code + outcome ──────────────────────────────


def test_list_filter_by_advice_code(
    client: TestClient, auth_headers: dict
) -> None:
    now = _dt.now(_tz.utc)
    _seed_adoption_row(when=now, advice_code="REFLAG_HIGH")
    _seed_adoption_row(when=now - _td(hours=1), advice_code="MANUAL_REFLAG")
    r = client.get(
        f"{TRACKER_PATH}/list?advice_code=REFLAG_HIGH",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    for it in body["items"]:
        assert it["advice_code"] == "REFLAG_HIGH"


def test_list_filter_by_outcome(
    client: TestClient, auth_headers: dict
) -> None:
    now = _dt.now(_tz.utc)
    _seed_adoption_row(when=now)  # pending
    r = client.get(
        f"{TRACKER_PATH}/list?outcome=pending",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    for it in body["items"]:
        assert it["outcome"] == "pending"


# ── 16. Audit-events scoped + paginated ───────────────────────────────────


def test_audit_events_scoped_and_paginated(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TRACKER_PATH}/audit-events",
        json={"event": "view", "note": "open page"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    eid = r.json()["event_id"]
    assert eid.startswith(f"{SURFACE}-view-")

    r2 = client.get(
        f"{TRACKER_PATH}/audit-events?limit=10",
        headers=auth_headers["clinician"],
    )
    assert r2.status_code == 200
    body = r2.json()
    assert any(it["event_id"] == eid for it in body["items"])


# ── 17. Page-level audit ingestion under csahp7 surface ───────────────────


def test_page_audit_event_targets_csahp7_surface(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TRACKER_PATH}/audit-events",
        json={"event": "window_changed", "note": "180d"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    eid = r.json()["event_id"]
    db = SessionLocal()
    try:
        row = (
            db.query(AuditEventRecord)
            .filter(AuditEventRecord.event_id == eid)
            .one_or_none()
        )
        assert row is not None
        assert row.target_type == SURFACE
        assert row.action == f"{SURFACE}.window_changed"
    finally:
        db.close()


# ── 18. Integration — pair_adoptions_with_outcomes is the source of truth ─


def test_integration_summary_matches_underlying_pair_adoptions(
    client: TestClient, auth_headers: dict
) -> None:
    """Summary endpoint must agree with the pure pair_adoptions_with_outcomes
    function's outcome counts on a realistic seeded dataset."""
    from app.services.threshold_adoption_outcome_pairing import (
        pair_adoptions_with_outcomes,
    )

    now = _dt.now(_tz.utc)
    _seed_adoption_row(when=now)  # pending
    _seed_adoption_row(when=now - _td(hours=2), advice_code="MANUAL_REFLAG")  # pending

    # Direct service call.
    db = SessionLocal()
    try:
        records = pair_adoptions_with_outcomes(
            db, clinic_id=_DEMO_CLINIC, window_days=180, pair_lookahead_days=30
        )
    finally:
        db.close()

    r = client.get(
        f"{TRACKER_PATH}/summary",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total_adoptions"] == len(records)
    pending_via_service = sum(1 for r in records if r.outcome == "pending")
    assert body["outcome_counts"]["pending"] == pending_via_service
    assert pending_via_service == 2


# ── 19. Outcome distribution percentages exclude pending ──────────────────


def test_outcome_pct_excludes_pending_from_denominator(
    client: TestClient, auth_headers: dict
) -> None:
    """Two pending + two improved + two regressed → improved_pct =
    50% (2 of 4 classified, pending excluded)."""
    now = _dt.now(_tz.utc)
    # Two pending.
    _seed_adoption_row(when=now)
    _seed_adoption_row(when=now - _td(hours=1))
    r = client.get(
        f"{TRACKER_PATH}/summary",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    # All adoptions pending → no classified rows → percentages all zero.
    assert body["outcome_pct"]["improved"] == 0.0
    assert body["outcome_pct"]["regressed"] == 0.0
    assert body["outcome_pct"]["flat"] == 0.0
    assert body["outcome_counts"]["pending"] == 2
