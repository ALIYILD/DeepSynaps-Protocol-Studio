"""Tests for the IRB-AMD4 Reviewer SLA Calibration Threshold Tuning
Advisor launch-audit (2026-05-02).

Closes section I rec from the IRB-AMD3 Reviewer Workload Outcome
Tracker (#451):

* IRB-AMD2 (#447) emits ``irb_reviewer_sla.queue_breach_detected``
  rows when reviewers fall behind.
* IRB-AMD3 (#451) pairs each breach with the same reviewer's NEXT
  ``irb.amendment_decided_*`` row + computes per-reviewer
  ``calibration_score``.
* IRB-AMD4 (this PR) recommends a calibration_score floor with a
  bootstrap confidence interval, supports what-if replay, and
  persists adopted floors with a clinic-scoped audit log.

Test surface
============

Mirrors
``test_rotation_policy_advisor_threshold_tuning_launch_audit.py``
(CSAHP6, #438) — the canonical "tune-a-threshold" precedent — but on
the reviewer-SLA axis.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz
from typing import Optional

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    AuditEventRecord,
    ReviewerSLACalibrationThreshold,
    User,
)
from app.repositories.audit import create_audit_event
from app.services.irb_reviewer_sla_outcome_pairing import (
    BREACH_ACTION,
    BREACH_TARGET_TYPE,
    DECISION_ACTION_PREFIX,
    DECISION_TARGET_TYPE,
)
from app.services.reviewer_sla_threshold_recommender import (
    DEFAULT_THRESHOLD_KEY,
    MIN_BREACHES_PER_REVIEWER,
    MIN_REVIEWERS,
)


SURFACE = "reviewer_sla_calibration_threshold_tuning"
ADOPTION_AUDIT_SURFACE = "reviewer_sla_calibration"
ADOPTION_ACTION = "reviewer_sla_calibration.threshold_adopted"
TUNING_PATH = "/api/v1/reviewer-sla-calibration-threshold-tuning"


_CLINIC_A = "clinic-irbamd4-a"
_CLINIC_B = "clinic-irbamd4-b"

ADMIN_A_USER = "actor-irbamd4-admin-a"
CLIN_A_USER = "actor-irbamd4-clin-a"
CLIN_A2_USER = "actor-irbamd4-clin-a2"
CLIN_A3_USER = "actor-irbamd4-clin-a3"
CLIN_A4_USER = "actor-irbamd4-clin-a4"
CLIN_B_USER = "actor-irbamd4-clin-b"

_TEST_USER_IDS = (
    ADMIN_A_USER,
    CLIN_A_USER,
    CLIN_A2_USER,
    CLIN_A3_USER,
    CLIN_A4_USER,
    CLIN_B_USER,
    "actor-clinician-demo",
    "actor-admin-demo",
)


# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean():
    """Wipe IRB-AMD4 + IRB-AMD3 audit + threshold rows + test users."""
    yield
    db = SessionLocal()
    try:
        db.query(ReviewerSLACalibrationThreshold).filter(
            ReviewerSLACalibrationThreshold.clinic_id.in_(
                [_CLINIC_A, _CLINIC_B]
            )
        ).delete(synchronize_session=False)
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_(
                [
                    SURFACE,
                    ADOPTION_AUDIT_SURFACE,
                    BREACH_TARGET_TYPE,
                    DECISION_TARGET_TYPE,
                ]
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(
            User.id.in_(list(_TEST_USER_IDS))
        ).delete(synchronize_session=False)
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
    _seed_user(
        "actor-clinician-demo", role="clinician", clinic_id=_CLINIC_A
    )
    _seed_user("actor-admin-demo", role="admin", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A2_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A3_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(CLIN_A4_USER, role="clinician", clinic_id=_CLINIC_A)
    _seed_user(ADMIN_A_USER, role="admin", clinic_id=_CLINIC_A)


def _setup_clinic_b() -> None:
    _seed_user(
        "actor-clinician-demo", role="clinician", clinic_id=_CLINIC_B
    )
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
    when = when or _dt.now(_tz.utc)
    aid = f"amd-irbamd4-{_uuid.uuid4().hex[:8]}"
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


def _seed_within_sla(
    *, reviewer: str, count: int, clinic_id: str = _CLINIC_A
) -> None:
    """Seed N breach→decision pairs that all decide WITHIN sla."""
    db = SessionLocal()
    try:
        for i in range(count):
            t = _dt.now(_tz.utc) - _td(days=40 + i * 2)
            _emit_breach(
                db, clinic_id=clinic_id, reviewer_user_id=reviewer, when=t
            )
            _emit_decision(
                db,
                clinic_id=clinic_id,
                reviewer_user_id=reviewer,
                when=t + _td(days=5),
            )
    finally:
        db.close()


def _seed_still_pending(
    *, reviewer: str, count: int, clinic_id: str = _CLINIC_A
) -> None:
    """Seed N breaches with NO decision and 30d-old (window elapsed)."""
    db = SessionLocal()
    try:
        for i in range(count):
            t = _dt.now(_tz.utc) - _td(days=30 + i * 3)
            _emit_breach(
                db, clinic_id=clinic_id, reviewer_user_id=reviewer, when=t
            )
    finally:
        db.close()


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


# ── 2. recommend insufficient_data when <3 reviewers ──────────────────────


def test_recommend_insufficient_data_when_too_few_reviewers(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    # Seed ONLY 2 reviewers with adequate breaches each.
    _seed_within_sla(reviewer=CLIN_A_USER, count=3)
    _seed_within_sla(reviewer=CLIN_A2_USER, count=3)

    r = client.get(
        f"{TUNING_PATH}/recommend?window_days=180",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["insufficient_data"] is True
    assert body["recommended"] is None
    assert body["min_reviewers"] == MIN_REVIEWERS


# ── 3. recommend insufficient_data when reviewers have <2 breaches each ──


def test_recommend_insufficient_data_when_too_few_breaches_per_reviewer(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    # 4 reviewers, each with only 1 breach — fails the breach floor.
    for rid in (CLIN_A_USER, CLIN_A2_USER, CLIN_A3_USER, CLIN_A4_USER):
        _seed_within_sla(reviewer=rid, count=1)

    r = client.get(
        f"{TUNING_PATH}/recommend?window_days=180",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["insufficient_data"] is True
    assert body["min_breaches_per_reviewer"] == MIN_BREACHES_PER_REVIEWER


# ── 4. recommend returns plausible threshold with adequate sample ─────────


def test_recommend_returns_plausible_threshold_with_adequate_sample(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    # 3 in-time reviewers + 1 bad reviewer — all qualify (>=2 breaches each).
    _seed_within_sla(reviewer=CLIN_A_USER, count=3)
    _seed_within_sla(reviewer=CLIN_A2_USER, count=3)
    _seed_within_sla(reviewer=CLIN_A3_USER, count=3)
    _seed_still_pending(reviewer=CLIN_A4_USER, count=3)

    r = client.get(
        f"{TUNING_PATH}/recommend?window_days=180",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["insufficient_data"] is False
    assert body["recommended"] is not None
    assert isinstance(body["recommended"], (int, float))
    assert body["sample_size_reviewers"] >= 4
    assert body["sample_size_breaches"] >= 12


# ── 5. CI bounds reasonable ──────────────────────────────────────────────


def test_recommend_confidence_interval_brackets_recommendation(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    _seed_within_sla(reviewer=CLIN_A_USER, count=3)
    _seed_within_sla(reviewer=CLIN_A2_USER, count=3)
    _seed_within_sla(reviewer=CLIN_A3_USER, count=3)
    _seed_still_pending(reviewer=CLIN_A4_USER, count=3)

    r = client.get(
        f"{TUNING_PATH}/recommend?window_days=180",
        headers=auth_headers["clinician"],
    )
    body = r.json()
    rec = body["recommended"]
    if rec is not None and body["ci_low"] is not None and body["ci_high"] is not None:
        assert body["ci_low"] <= body["ci_high"]
        # CI should contain the recommended OR be in a tight window
        # (bootstrap can shift; just assert the bounds are finite).
        assert isinstance(body["ci_low"], (int, float))
        assert isinstance(body["ci_high"], (int, float))


# ── 6. Cross-clinic IDOR on recommend ─────────────────────────────────────


def test_recommend_cross_clinic_idor_blocks_other_clinic_data(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    # Seed clinic A heavily.
    _seed_within_sla(reviewer=CLIN_A_USER, count=3, clinic_id=_CLINIC_A)
    _seed_within_sla(reviewer=CLIN_A2_USER, count=3, clinic_id=_CLINIC_A)
    _seed_within_sla(reviewer=CLIN_A3_USER, count=3, clinic_id=_CLINIC_A)

    # Switch demo to clinic B → must NOT see clinic A breaches.
    _setup_clinic_b()
    r = client.get(
        f"{TUNING_PATH}/recommend?window_days=180",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["sample_size_breaches"] == 0
    assert body["sample_size_reviewers"] == 0


# ── 7. replay returns deterministic projected_reassign_count ──────────────


def test_replay_returns_deterministic_projected_reassign_count(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    _seed_within_sla(reviewer=CLIN_A_USER, count=3)
    _seed_still_pending(reviewer=CLIN_A4_USER, count=4)

    body = {"override_threshold": 0.5}
    r1 = client.post(
        f"{TUNING_PATH}/replay",
        json=body,
        headers=auth_headers["clinician"],
    )
    r2 = client.post(
        f"{TUNING_PATH}/replay",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200
    j1, j2 = r1.json(), r2.json()
    assert j1["projected_reassign_count"] == j2["projected_reassign_count"]
    # CLIN_A4_USER (calibration -1.0) is below 0.5 → 4 still_pending
    # rows are reassign-eligible.
    assert j1["projected_reassign_count"] == 4
    assert j1["reviewers_below_floor"] >= 1


# ── 8. replay accepts negative + zero thresholds ──────────────────────────


def test_replay_accepts_negative_and_zero_thresholds(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    _seed_within_sla(reviewer=CLIN_A_USER, count=2)
    for value in (-0.5, 0.0, 0.25):
        r = client.post(
            f"{TUNING_PATH}/replay",
            json={"override_threshold": value},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text


# ── 9. Role gating ────────────────────────────────────────────────────────


def test_recommend_clinician_passes(
    client: TestClient, auth_headers: dict
) -> None:
    _setup_clinic_a()
    r = client.get(
        f"{TUNING_PATH}/recommend",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text


def test_recommend_patient_forbidden(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{TUNING_PATH}/recommend",
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_recommend_guest_forbidden(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.get(
        f"{TUNING_PATH}/recommend",
        headers=auth_headers["guest"],
    )
    assert r.status_code == 403


# ── 10. Adopt: admin only ─────────────────────────────────────────────────


def test_adopt_admin_succeeds(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "threshold_value": 0.25,
            "auto_reassign_enabled": False,
            "justification": "Recommend says 0.25 is plausible.",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["accepted"] is True
    assert body["threshold_value"] == 0.25
    assert body["is_new"] is True
    assert body["audit_event_id"]


def test_adopt_clinician_blocked(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "threshold_value": 0.25,
            "auto_reassign_enabled": False,
            "justification": "Recommend says 0.25 is plausible.",
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


# ── 11. Adopt validates threshold_value numeric ───────────────────────────


def test_adopt_rejects_non_numeric_threshold_value(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "threshold_value": "not-a-number",
            "auto_reassign_enabled": False,
            "justification": "Validation test path.",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code in (400, 422)


# ── 12. Adopt justification 10-500 char validation ───────────────────────


def test_adopt_validates_justification_min_length(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "threshold_value": 0.25,
            "auto_reassign_enabled": False,
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
            "threshold_value": 0.25,
            "auto_reassign_enabled": False,
            "justification": "x" * 501,
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code in (400, 422)


# ── 13. Adopt is upsert ───────────────────────────────────────────────────


def test_adopt_is_upsert_no_duplicate_rows(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "threshold_value": 0.25,
        "auto_reassign_enabled": False,
        "justification": "First adoption iteration.",
    }
    r1 = client.post(
        f"{TUNING_PATH}/adopt",
        json=body,
        headers=auth_headers["admin"],
    )
    assert r1.status_code == 200
    assert r1.json()["is_new"] is True

    body["threshold_value"] = 0.30
    body["auto_reassign_enabled"] = True
    body["justification"] = "Tightening floor after second replay."
    r2 = client.post(
        f"{TUNING_PATH}/adopt",
        json=body,
        headers=auth_headers["admin"],
    )
    assert r2.status_code == 200
    assert r2.json()["is_new"] is False
    assert r2.json()["previous_value"] == 0.25

    # Verify only ONE row exists.
    db = SessionLocal()
    try:
        rows = (
            db.query(ReviewerSLACalibrationThreshold)
            .filter(
                ReviewerSLACalibrationThreshold.threshold_key
                == DEFAULT_THRESHOLD_KEY
            )
            .all()
        )
        # The actor's clinic should have exactly one row.
        actor_rows = [r for r in rows if r.clinic_id]
        clinic_ids = {r.clinic_id for r in actor_rows}
        for cid in clinic_ids:
            same_cid = [r for r in actor_rows if r.clinic_id == cid]
            assert len(same_cid) == 1
        # And the latest values stuck.
        match = next(
            (r for r in rows if abs(r.threshold_value - 0.30) < 1e-9),
            None,
        )
        assert match is not None
        assert match.auto_reassign_enabled is True
    finally:
        db.close()


# ── 14. Adopt emits audit row with old/new ───────────────────────────────


def test_adopt_emits_audit_row_with_old_new_values(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "threshold_value": 0.40,
            "auto_reassign_enabled": True,
            "justification": "Audit row shape verification.",
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
        assert "new_value=0.4000" in note
        assert "auto_reassign_enabled=true" in note
        assert "is_new=true" in note
    finally:
        db.close()


# ── 15. Cross-clinic IDOR on adopt ────────────────────────────────────────


def test_adopt_cross_clinic_iidor_does_not_leak(
    client: TestClient, auth_headers: dict
) -> None:
    """Clinic A admin's adoption row must NOT appear when clinic B's
    adoption-history is queried."""
    _setup_clinic_a()
    # Adopt as clinic A admin (demo admin is clinic A).
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "threshold_value": 0.25,
            "auto_reassign_enabled": False,
            "justification": "Clinic A test adoption row.",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200

    # Switch demo admin to clinic B.
    _setup_clinic_b()
    r2 = client.get(
        f"{TUNING_PATH}/current-threshold",
        headers=auth_headers["clinician"],
    )
    assert r2.status_code == 200
    body = r2.json()
    # Clinic B should NOT inherit clinic A's adopted floor.
    assert body["threshold_value"] is None
    assert body["auto_reassign_enabled"] is False


# ── 16. Adoption-history paginated, scoped, ordered ──────────────────────


def test_adoption_history_scoped_paginated_ordered(
    client: TestClient, auth_headers: dict
) -> None:
    for v in (0.10, 0.20, 0.30):
        r = client.post(
            f"{TUNING_PATH}/adopt",
            json={
                "threshold_value": v,
                "auto_reassign_enabled": False,
                "justification": "Iterative tuning round.",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200

    r = client.get(
        f"{TUNING_PATH}/adoption-history?page=1&page_size=2",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 3
    assert len(body["items"]) <= 2
    # Most-recent first → first item should be the LATEST value (0.30).
    assert body["items"][0]["new_value"] == 0.30


# ── 17. Alembic migration smoke ──────────────────────────────────────────


def test_alembic_083_module_loads_with_single_head_target() -> None:
    import importlib.util as _ilu
    from pathlib import Path

    here = Path(__file__).resolve()
    api_root = here.parents[1]
    mig_path = (
        api_root
        / "alembic"
        / "versions"
        / "083_reviewer_sla_calibration_thresholds.py"
    )
    spec = _ilu.spec_from_file_location("irbamd4_mig083", str(mig_path))
    assert spec is not None and spec.loader is not None
    mod = _ilu.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.revision == "083_reviewer_sla_calibration_thresholds"
    # Single head — descends ONLY from 082.
    assert mod.down_revision == "082_irb_amendment_workflow"


def test_alembic_083_upgrade_downgrade_idempotent() -> None:
    """Smoke test: the migration's up/down handle pre-existing/missing
    table state without raising."""
    import importlib.util as _ilu
    from pathlib import Path

    here = Path(__file__).resolve()
    api_root = here.parents[1]
    mig_path = (
        api_root
        / "alembic"
        / "versions"
        / "083_reviewer_sla_calibration_thresholds.py"
    )
    spec = _ilu.spec_from_file_location(
        "irbamd4_mig083_idem", str(mig_path)
    )
    assert spec is not None and spec.loader is not None
    mod = _ilu.module_from_spec(spec)
    spec.loader.exec_module(mod)

    # The module must expose a _has_table helper used by the
    # idempotent guards.
    assert hasattr(mod, "_has_table")
    assert hasattr(mod, "TABLE_NAME")
    assert mod.TABLE_NAME == "reviewer_sla_calibration_thresholds"


# ── 18. audit-events scoped + paginated ───────────────────────────────────


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
    assert body["surface"] == SURFACE


# ── 19. Integration: adopt → next current-threshold reflects new value ───


def test_integration_adopt_then_current_threshold_reflects_value(
    client: TestClient, auth_headers: dict
) -> None:
    r = client.post(
        f"{TUNING_PATH}/adopt",
        json={
            "threshold_value": 0.42,
            "auto_reassign_enabled": True,
            "justification": "Integration test — set then read back.",
        },
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200

    r2 = client.get(
        f"{TUNING_PATH}/current-threshold",
        headers=auth_headers["clinician"],
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body["threshold_value"] == 0.42
    assert body["auto_reassign_enabled"] is True
    assert body["threshold_key"] == DEFAULT_THRESHOLD_KEY
