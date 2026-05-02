"""Tests for the Caregiver Delivery Concern Resolution Outcome Tracker
launch-audit (DCRO1, 2026-05-02).

Calibration-accuracy dashboard built on top of the DCR1 + DCR2 audit
trail. Pairs each ``caregiver_portal.delivery_concern_resolved`` row
with the NEXT ``caregiver_portal.delivery_concern_threshold_reached``
row for the same caregiver to record stayed_resolved vs
re_flagged_within_30d.

Pattern mirrors
``test_caregiver_delivery_concern_resolution_audit_hub_launch_audit.py``.
"""
from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, User


os.environ.pop("DEEPSYNAPS_CG_CONCERN_AGGREGATOR_ENABLED", None)


FLAG_ACTION = "caregiver_portal.delivery_concern_threshold_reached"
RESOLVE_ACTION = "caregiver_portal.delivery_concern_resolved"
SURFACE = "caregiver_delivery_concern_resolution_outcome_tracker"
TRACKER_PATH = "/api/v1/caregiver-delivery-concern-resolution-outcome-tracker"


CG_A = "actor-dcro1-cg-a"
CG_B = "actor-dcro1-cg-b"
CG_C = "actor-dcro1-cg-c"
CG_D = "actor-dcro1-cg-d"
CG_E = "actor-dcro1-cg-e"
CG_F = "actor-dcro1-cg-f"
CG_OTHER = "actor-dcro1-cg-other-clinic"

RESOLVER_X = "actor-dcro1-resolver-x"
RESOLVER_Y = "actor-dcro1-resolver-y"
RESOLVER_Z = "actor-dcro1-resolver-z"

_ALL_USER_IDS = (
    CG_A,
    CG_B,
    CG_C,
    CG_D,
    CG_E,
    CG_F,
    CG_OTHER,
    RESOLVER_X,
    RESOLVER_Y,
    RESOLVER_Z,
)


# ── Fixtures / helpers ──────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean_after():
    yield
    db = SessionLocal()
    try:
        db.query(AuditEventRecord).filter(
            AuditEventRecord.target_type.in_(
                [
                    "caregiver_portal",
                    "caregiver_delivery_concern_resolution",
                    "caregiver_delivery_concern_resolution_audit_hub",
                    "caregiver_delivery_concern_resolution_outcome_tracker",
                ]
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(list(_ALL_USER_IDS))).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def _seed_user(
    user_id: str,
    *,
    email: str | None = None,
    display_name: str | None = None,
    role: str = "clinician",
    clinic_id: str = "clinic-demo-default",
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
    resolver_user_id: str = "actor-admin-demo",
    clinic_id: str = "clinic-demo-default",
    resolution_reason: str = "concerns_addressed",
    resolution_note: str = "demo resolution note",
    age_hours: float = 1.0,
) -> str:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(hours=age_hours)
        eid = (
            f"resolved-{caregiver_user_id}-"
            f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
        )
        note = (
            f"caregiver_user_id={caregiver_user_id}; "
            f"clinic_id={clinic_id}; "
            f"resolver_user_id={resolver_user_id}; "
            f"resolution_reason={resolution_reason}; "
            f"resolution_note={resolution_note}"
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=caregiver_user_id,
                target_type="caregiver_portal",
                action=RESOLVE_ACTION,
                role="admin",
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
    clinic_id: str = "clinic-demo-default",
    age_hours: float = 24.0,
    concern_count: int = 3,
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
            f"concern_count={concern_count} "
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


# ── 1. Surface whitelist sanity ─────────────────────────────────────────────


def test_dcro1_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_dcro1_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {"event": "view", "surface": SURFACE, "note": "whitelist sanity"}
    r = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        json=body,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("accepted") is True
    assert data.get("event_id", "").startswith(SURFACE + "-")


# ── 2. Role gate ────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_summary_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_guest_summary_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_clinician_can_read_summary(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text


# ── 3. Pairing logic — core outcome classification ──────────────────────────


class TestOutcomeClassification:
    def test_no_subsequent_flag_classifies_as_stayed_resolved(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Resolved row with NO subsequent threshold-reached AND
        resolution older than 30d → ``stayed_resolved``."""
        _seed_user(CG_A)
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolver_user_id=RESOLVER_X,
            resolution_reason="concerns_addressed",
            age_hours=24.0 * 35,  # 35 days ago — outside the pending window
        )
        _seed_user(RESOLVER_X)
        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_resolutions"] == 1
        assert data["outcome_counts"]["stayed_resolved"] == 1
        assert data["outcome_counts"]["re_flagged_within_30d"] == 0
        assert data["outcome_counts"]["pending"] == 0

    def test_subsequent_flag_within_30d_classifies_as_re_flagged(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Resolution 10 days ago, flag 5 days ago → re_flagged_within_30d."""
        _seed_user(CG_A)
        _seed_user(RESOLVER_X)
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolver_user_id=RESOLVER_X,
            resolution_reason="false_positive",
            age_hours=24.0 * 10,
        )
        _seed_flag(caregiver_user_id=CG_A, age_hours=24.0 * 5)

        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_resolutions"] == 1
        assert data["outcome_counts"]["re_flagged_within_30d"] == 1
        assert data["outcome_counts"]["stayed_resolved"] == 0

    def test_subsequent_flag_after_30d_classifies_as_stayed_resolved(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Resolution 60 days ago, flag 25 days ago → 35 days later →
        stayed_resolved (outside the 30d re-flag window)."""
        _seed_user(CG_A)
        _seed_user(RESOLVER_X)
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolver_user_id=RESOLVER_X,
            resolution_reason="concerns_addressed",
            age_hours=24.0 * 60,
        )
        _seed_flag(caregiver_user_id=CG_A, age_hours=24.0 * 25)

        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_resolutions"] == 1
        assert data["outcome_counts"]["stayed_resolved"] == 1
        assert data["outcome_counts"]["re_flagged_within_30d"] == 0

    def test_recent_resolution_no_flag_yet_classifies_as_pending(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Resolution 5 days ago, no flag yet → pending (can't classify)."""
        _seed_user(CG_A)
        _seed_user(RESOLVER_X)
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolver_user_id=RESOLVER_X,
            resolution_reason="false_positive",
            age_hours=24.0 * 5,
        )
        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["outcome_counts"]["pending"] == 1
        assert data["outcome_counts"]["stayed_resolved"] == 0
        assert data["outcome_counts"]["re_flagged_within_30d"] == 0

    def test_old_resolution_no_flag_classifies_as_stayed_resolved(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Resolution 35 days ago, no flag → stayed_resolved (window past)."""
        _seed_user(CG_A)
        _seed_user(RESOLVER_X)
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolver_user_id=RESOLVER_X,
            resolution_reason="concerns_addressed",
            age_hours=24.0 * 35,
        )
        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["outcome_counts"]["stayed_resolved"] == 1
        assert data["outcome_counts"]["pending"] == 0


# ── 4. Resolver calibration ─────────────────────────────────────────────────


class TestResolverCalibration:
    def test_resolver_with_5_fp_calls_1_re_flagged_is_80_pct(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Resolver X: 5 false_positive resolutions, 1 was re-flagged
        within 30d → calibration_accuracy_pct = 80.0%."""
        _seed_user(RESOLVER_X, display_name="Reviewer X")
        # Five false_positive resolutions, all old enough to be classified.
        for cg in (CG_A, CG_B, CG_C, CG_D, CG_E):
            _seed_user(cg)
            _seed_resolution(
                caregiver_user_id=cg,
                resolver_user_id=RESOLVER_X,
                resolution_reason="false_positive",
                age_hours=24.0 * 35,  # old enough to be classified
            )
        # Only CG_A was re-flagged within 30d after their resolution.
        # Resolution was 35d ago; flag 20d ago → 15 days later → within 30d.
        _seed_flag(caregiver_user_id=CG_A, age_hours=24.0 * 20)

        r = client.get(
            f"{TRACKER_PATH}/resolver-calibration?window_days=90&min_resolutions=3",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert len(items) == 1
        item = items[0]
        assert item["resolver_user_id"] == RESOLVER_X
        assert item["resolver_name"] == "Reviewer X"
        assert item["total_resolutions"] == 5
        assert item["false_positive_calls"] == 5
        assert item["false_positive_re_flagged_within_30d"] == 1
        # 1 - 1/5 = 0.8 → 80.0
        assert abs(item["calibration_accuracy_pct"] - 80.0) < 0.5

    def test_resolver_below_min_resolutions_excluded(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Resolver with fewer resolutions than ``min_resolutions`` is
        skipped."""
        _seed_user(RESOLVER_X, display_name="Reviewer X")
        _seed_user(CG_A)
        # Only 1 resolution.
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolver_user_id=RESOLVER_X,
            resolution_reason="concerns_addressed",
            age_hours=24.0 * 35,
        )
        r = client.get(
            f"{TRACKER_PATH}/resolver-calibration?window_days=90&min_resolutions=3",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        ids = [it["resolver_user_id"] for it in r.json()["items"]]
        assert RESOLVER_X not in ids


# ── 5. Cross-clinic IDOR ────────────────────────────────────────────────────


class TestCrossClinic:
    def test_other_clinic_excluded_from_summary(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_OTHER, clinic_id="clinic-dcro1-other")
        _seed_user(RESOLVER_X, clinic_id="clinic-dcro1-other")
        _seed_resolution(
            caregiver_user_id=CG_OTHER,
            resolver_user_id=RESOLVER_X,
            clinic_id="clinic-dcro1-other",
            resolution_reason="false_positive",
            age_hours=24.0 * 35,
        )
        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        # Caller is in clinic-demo-default; the other-clinic row must
        # not contribute.
        assert r.json()["total_resolutions"] == 0

    def test_other_clinic_excluded_from_resolver_calibration(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_OTHER, clinic_id="clinic-dcro1-other")
        _seed_user(RESOLVER_Y, clinic_id="clinic-dcro1-other")
        for _ in range(5):
            _seed_resolution(
                caregiver_user_id=CG_OTHER,
                resolver_user_id=RESOLVER_Y,
                clinic_id="clinic-dcro1-other",
                resolution_reason="false_positive",
                age_hours=24.0 * 35,
            )
        r = client.get(
            f"{TRACKER_PATH}/resolver-calibration?window_days=90&min_resolutions=3",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        ids = [it["resolver_user_id"] for it in r.json()["items"]]
        assert RESOLVER_Y not in ids

    def test_other_clinic_excluded_from_audit_events(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed an audit-event row for our surface tagged for the other clinic.
        # The /audit-events endpoint must filter by note clinic_id needle.
        db = SessionLocal()
        try:
            db.add(
                AuditEventRecord(
                    event_id="dcro1-otherclinic-row",
                    target_id="x",
                    target_type=SURFACE,
                    action=f"{SURFACE}.view",
                    role="admin",
                    actor_id="someone-else",
                    note="clinic_id=clinic-dcro1-other; foreign",
                    created_at=_dt.now(_tz.utc).isoformat(),
                )
            )
            db.commit()
        finally:
            db.close()

        r = client.get(
            f"{TRACKER_PATH}/audit-events?surface={SURFACE}&limit=50",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        evs = [it["event_id"] for it in r.json()["items"]]
        assert "dcro1-otherclinic-row" not in evs


# ── 6. By-reason rollup ─────────────────────────────────────────────────────


class TestByReason:
    def test_by_reason_false_positive_incorrect_pct(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Two false_positive resolutions, one re-flagged → 50% incorrect."""
        _seed_user(CG_A)
        _seed_user(CG_B)
        _seed_user(RESOLVER_X)
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolver_user_id=RESOLVER_X,
            resolution_reason="false_positive",
            age_hours=24.0 * 35,
        )
        _seed_resolution(
            caregiver_user_id=CG_B,
            resolver_user_id=RESOLVER_X,
            resolution_reason="false_positive",
            age_hours=24.0 * 35,
        )
        # Only CG_A was re-flagged within 30d.
        _seed_flag(caregiver_user_id=CG_A, age_hours=24.0 * 20)

        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        fp = r.json()["by_reason"]["false_positive"]
        assert fp["total"] == 2
        assert fp["re_flagged"] == 1
        assert abs(fp["incorrect_pct"] - 50.0) < 0.5


# ── 7. Median days to re-flag ───────────────────────────────────────────────


class TestMedian:
    def test_median_days_to_re_flag_computed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Three resolved+re-flagged pairs at gaps 5d, 10d, 25d → median 10d."""
        for cg, gap_days, res_age in (
            (CG_A, 5, 35),
            (CG_B, 10, 35),
            (CG_C, 25, 35),
        ):
            _seed_user(cg)
            _seed_user(RESOLVER_X)
            _seed_resolution(
                caregiver_user_id=cg,
                resolver_user_id=RESOLVER_X,
                resolution_reason="concerns_addressed",
                age_hours=24.0 * res_age,
            )
            # Flag at age_hours = (res_age - gap_days) * 24, i.e. gap_days
            # AFTER the resolution.
            _seed_flag(
                caregiver_user_id=cg,
                age_hours=24.0 * (res_age - gap_days),
            )
        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        median_d = r.json()["median_days_to_re_flag"]
        assert median_d is not None
        # Allow ±1 day tolerance for clock-drift in the test seeding.
        assert 9.0 <= median_d <= 11.0, f"expected ~10d, got {median_d}"

    def test_median_null_when_no_re_flags(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_A)
        _seed_user(RESOLVER_X)
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolver_user_id=RESOLVER_X,
            resolution_reason="concerns_addressed",
            age_hours=24.0 * 35,
        )
        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["median_days_to_re_flag"] is None


# ── 8. Multi-cycle pairing ──────────────────────────────────────────────────


class TestMultipleCycles:
    def test_multiple_resolution_cycles_pair_correctly(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """Caregiver resolve → flag → resolve cycle. Timeline:

        - first resolve at -100d (false_positive)
        - flag at -80d (re-flagged — 20d after first resolve)
        - second resolve at -50d (concerns_addressed; old enough to be
          classified, no later flag)

        Expected pairing:
        - first resolve (-100d) → next flag at -80d → 20d gap → re_flagged
        - second resolve (-50d) → no later flag, 50d elapsed → stayed_resolved
        """
        _seed_user(CG_A)
        _seed_user(RESOLVER_X)
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolver_user_id=RESOLVER_X,
            resolution_reason="false_positive",
            age_hours=24.0 * 100,
            resolution_note="cycle 1 first resolve",
        )
        _seed_flag(caregiver_user_id=CG_A, age_hours=24.0 * 80)
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolver_user_id=RESOLVER_X,
            resolution_reason="concerns_addressed",
            age_hours=24.0 * 50,
            resolution_note="cycle 2 second resolve",
        )
        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=180",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Two resolutions total. Canonical pairing:
        #   - 1 re_flagged_within_30d (first resolve → flag 20d later)
        #   - 1 stayed_resolved (second resolve, no subsequent flag,
        #     past the 30d window)
        assert data["total_resolutions"] == 2
        assert (
            data["outcome_counts"]["re_flagged_within_30d"] == 1
        ), data["outcome_counts"]
        assert data["outcome_counts"]["stayed_resolved"] == 1


# ── 9. Resolver name resolution ─────────────────────────────────────────────


class TestResolverNames:
    def test_resolver_name_resolved_from_user_table(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(RESOLVER_X, display_name="Dr. Reviewer X")
        for cg in (CG_A, CG_B, CG_C):
            _seed_user(cg)
            _seed_resolution(
                caregiver_user_id=cg,
                resolver_user_id=RESOLVER_X,
                resolution_reason="concerns_addressed",
                age_hours=24.0 * 35,
            )
        r = client.get(
            f"{TRACKER_PATH}/resolver-calibration?window_days=90&min_resolutions=3",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        match = [it for it in items if it["resolver_user_id"] == RESOLVER_X]
        assert len(match) == 1
        assert match[0]["resolver_name"] == "Dr. Reviewer X"


# ── 10. Empty clinic ────────────────────────────────────────────────────────


class TestEmptyClinic:
    def test_empty_clinic_returns_clean_summary(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=90",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_resolutions"] == 0
        assert data["outcome_counts"]["stayed_resolved"] == 0
        assert data["outcome_counts"]["re_flagged_within_30d"] == 0
        assert data["outcome_counts"]["pending"] == 0
        # No div-by-zero — pct fields should all be 0.0.
        assert data["outcome_pct"]["stayed_resolved"] == 0.0
        assert data["outcome_pct"]["re_flagged_within_30d"] == 0.0
        assert data["median_days_to_re_flag"] is None

    def test_empty_clinic_returns_empty_calibration_list(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{TRACKER_PATH}/resolver-calibration?window_days=90&min_resolutions=3",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["items"] == []


# ── 11. Large dataset ───────────────────────────────────────────────────────


class TestLargeDataset:
    def test_100_resolutions_does_not_oom(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        """100+ resolutions should be paired without OOM and return
        sane counts."""
        _seed_user(RESOLVER_X)
        _seed_user(CG_A)
        for i in range(110):
            _seed_resolution(
                caregiver_user_id=CG_A,
                resolver_user_id=RESOLVER_X,
                resolution_reason="concerns_addressed",
                age_hours=24.0 * (35 + i * 0.01),  # all old enough to classify
                resolution_note=f"large dataset row {i}",
            )
        r = client.get(
            f"{TRACKER_PATH}/summary?window_days=180",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_resolutions"] >= 110
        # All 110 stayed_resolved (no flags) and old enough to be classified.
        assert data["outcome_counts"]["stayed_resolved"] >= 110
