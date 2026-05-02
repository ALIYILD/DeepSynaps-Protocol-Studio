"""Tests for the Caregiver Delivery Concern Resolution Audit Hub
launch-audit (DCR2, 2026-05-02).

Cohort dashboard built on the DCR1 audit trail: distribution of
resolution reasons over time + top resolvers + median time-to-resolve.

Pattern mirrors
``test_caregiver_delivery_concern_resolution_launch_audit.py``.
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
SURFACE = "caregiver_delivery_concern_resolution_audit_hub"
HUB_PATH = "/api/v1/caregiver-delivery-concern-resolution-audit-hub"


CG_A = "actor-dcr2-cg-a"
CG_B = "actor-dcr2-cg-b"
CG_C = "actor-dcr2-cg-c"
CG_D = "actor-dcr2-cg-d"
CG_E = "actor-dcr2-cg-e"
CG_OTHER = "actor-dcr2-cg-other-clinic"

RESOLVER_X = "actor-dcr2-resolver-x"
RESOLVER_Y = "actor-dcr2-resolver-y"
RESOLVER_Z = "actor-dcr2-resolver-z"

_ALL_USER_IDS = (
    CG_A,
    CG_B,
    CG_C,
    CG_D,
    CG_E,
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
    email: str,
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
        db.add(
            User(
                id=user_id,
                email=email,
                display_name=display_name or email.split("@", 1)[0],
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


def test_dcr2_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_dcr2_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "surface": SURFACE,
        "note": "whitelist sanity",
    }
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


# ── 3. Summary counts + percentages ─────────────────────────────────────────


class TestSummaryCounts:
    def test_summary_counts_by_reason(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # 4 concerns_addressed, 2 false_positive, 1 caregiver_replaced, 1 other
        for cg, reason in (
            (CG_A, "concerns_addressed"),
            (CG_A, "concerns_addressed"),
            (CG_B, "concerns_addressed"),
            (CG_C, "concerns_addressed"),
            (CG_D, "false_positive"),
            (CG_D, "false_positive"),
            (CG_E, "caregiver_replaced"),
            (CG_A, "other"),
        ):
            _seed_user(cg, email=f"{cg}@example.com")
            _seed_resolution(
                caregiver_user_id=cg,
                resolution_reason=reason,
                age_hours=2.0,
            )

        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_resolved"] == 8
        br = data["by_reason"]
        assert br["concerns_addressed"] == 4
        assert br["false_positive"] == 2
        assert br["caregiver_replaced"] == 1
        assert br["other"] == 1
        assert data["window_days"] == 30
        assert data["clinic_id"] == "clinic-demo-default"

    def test_summary_pct_sums_to_100(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        for reason in (
            "concerns_addressed",
            "concerns_addressed",
            "false_positive",
            "caregiver_replaced",
        ):
            _seed_user(CG_A, email="cga@example.com")
            _seed_resolution(
                caregiver_user_id=CG_A,
                resolution_reason=reason,
                age_hours=1.0,
            )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        pct = r.json()["by_reason_pct"]
        total_pct = (
            pct["concerns_addressed"]
            + pct["false_positive"]
            + pct["caregiver_replaced"]
            + pct["other"]
        )
        assert abs(total_pct - 100.0) < 0.5

    def test_summary_zero_when_no_rows(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_resolved"] == 0
        for k in (
            "concerns_addressed",
            "false_positive",
            "caregiver_replaced",
            "other",
        ):
            assert data["by_reason"][k] == 0
            assert data["by_reason_pct"][k] == 0.0
        assert data["median_time_to_resolve_hours"] is None


# ── 4. Median time-to-resolve ───────────────────────────────────────────────


class TestMedian:
    def test_median_time_to_resolve_calculated(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed paired flag + resolution rows. Caregiver A: flag 10h before
        # resolve. Caregiver B: flag 6h before resolve. Caregiver C:
        # flag 2h before resolve. Median of [2, 6, 10] = 6.
        for cg, hours_before_resolve in (
            (CG_A, 10),
            (CG_B, 6),
            (CG_C, 2),
        ):
            _seed_user(cg, email=f"{cg}@example.com")
            # Resolution at age_hours=1 (1h ago).
            _seed_resolution(
                caregiver_user_id=cg,
                resolution_reason="concerns_addressed",
                age_hours=1.0,
            )
            # Flag at age_hours=1+hours_before_resolve.
            _seed_flag(
                caregiver_user_id=cg,
                age_hours=1.0 + hours_before_resolve,
            )

        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        median_h = r.json()["median_time_to_resolve_hours"]
        assert median_h is not None
        assert 5.5 <= median_h <= 6.5, f"expected ~6h, got {median_h}"

    def test_median_null_when_no_paired_flag(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Resolution exists but no preceding threshold-reached row.
        _seed_user(CG_A, email="cga@example.com")
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolution_reason="concerns_addressed",
            age_hours=1.0,
        )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["median_time_to_resolve_hours"] is None


# ── 5. Cross-clinic IDOR ────────────────────────────────────────────────────


class TestCrossClinic:
    def test_other_clinic_excluded_from_summary(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            CG_OTHER,
            email="cgo@example.com",
            clinic_id="clinic-dcr2-other",
        )
        _seed_resolution(
            caregiver_user_id=CG_OTHER,
            clinic_id="clinic-dcr2-other",
            resolution_reason="concerns_addressed",
            age_hours=1.0,
        )
        # Also one in our clinic for contrast.
        _seed_user(CG_A, email="cga@example.com")
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolution_reason="false_positive",
            age_hours=1.0,
        )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Only the in-clinic row counted.
        assert data["total_resolved"] == 1
        assert data["by_reason"]["false_positive"] == 1
        assert data["by_reason"]["concerns_addressed"] == 0

    def test_other_clinic_excluded_from_list(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            CG_OTHER,
            email="cgo@example.com",
            clinic_id="clinic-dcr2-other",
        )
        _seed_resolution(
            caregiver_user_id=CG_OTHER,
            clinic_id="clinic-dcr2-other",
            resolution_reason="concerns_addressed",
            age_hours=1.0,
        )
        r = client.get(
            f"{HUB_PATH}/list?page=1&page_size=50",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        ids = [it["caregiver_user_id"] for it in r.json()["items"]]
        assert CG_OTHER not in ids

    def test_other_clinic_excluded_from_top_resolvers(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed the other clinic with a resolver who would dominate the
        # leaderboard if cross-clinic leakage existed.
        _seed_user(
            CG_OTHER,
            email="cgo@example.com",
            clinic_id="clinic-dcr2-other",
        )
        _seed_user(RESOLVER_X, email="rx@example.com", clinic_id="clinic-dcr2-other")
        for _ in range(10):
            _seed_resolution(
                caregiver_user_id=CG_OTHER,
                resolver_user_id=RESOLVER_X,
                clinic_id="clinic-dcr2-other",
                resolution_reason="concerns_addressed",
                age_hours=1.0,
            )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        ids = [tr["resolver_user_id"] for tr in r.json()["top_resolvers"]]
        assert RESOLVER_X not in ids


# ── 6. List endpoint pagination + filters ───────────────────────────────────


class TestList:
    def test_list_pagination(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_A, email="cga@example.com")
        for i in range(7):
            _seed_resolution(
                caregiver_user_id=CG_A,
                resolution_reason="concerns_addressed",
                resolution_note=f"note {i}",
                age_hours=float(i + 1),
            )
        # page_size=3 → 3 pages of 3, 3, 1.
        r1 = client.get(
            f"{HUB_PATH}/list?page=1&page_size=3",
            headers=auth_headers["admin"],
        )
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["page"] == 1
        assert d1["page_size"] == 3
        assert d1["total"] == 7
        assert len(d1["items"]) == 3

        r3 = client.get(
            f"{HUB_PATH}/list?page=3&page_size=3",
            headers=auth_headers["admin"],
        )
        d3 = r3.json()
        assert d3["page"] == 3
        assert len(d3["items"]) == 1

    def test_list_reason_filter(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_A, email="cga@example.com")
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolution_reason="false_positive",
            age_hours=1.0,
        )
        _seed_user(CG_B, email="cgb@example.com")
        _seed_resolution(
            caregiver_user_id=CG_B,
            resolution_reason="concerns_addressed",
            age_hours=2.0,
        )
        r = client.get(
            f"{HUB_PATH}/list?reason=false_positive&page=1&page_size=20",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["resolution_reason"] == "false_positive"
        assert items[0]["caregiver_user_id"] == CG_A

    def test_list_date_filters(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        from urllib.parse import quote

        _seed_user(CG_A, email="cga@example.com")
        # Resolution 50h ago (just over 2 days).
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolution_reason="concerns_addressed",
            age_hours=50.0,
        )
        # Resolution 10h ago.
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolution_reason="false_positive",
            age_hours=10.0,
        )
        # Filter to last 24h: only the recent one survives.
        start = (_dt.now(_tz.utc) - _td(hours=24)).isoformat()
        r = client.get(
            f"{HUB_PATH}/list?start={quote(start)}&page=1&page_size=20",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["resolution_reason"] == "false_positive"


# ── 7. Top resolvers ────────────────────────────────────────────────────────


class TestTopResolvers:
    def test_top_resolvers_ordered_and_capped(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed 6 unique resolvers with different counts so the top-5 cap
        # actually drops one.
        _seed_user(CG_A, email="cga@example.com")
        seeds = [
            (RESOLVER_X, 5, "Resolver X"),
            (RESOLVER_Y, 3, "Resolver Y"),
            (RESOLVER_Z, 2, "Resolver Z"),
            ("actor-dcr2-resolver-w", 4, "Resolver W"),
            ("actor-dcr2-resolver-v", 1, "Resolver V"),
            ("actor-dcr2-resolver-u", 6, "Resolver U"),
        ]
        for rid, _, name in seeds:
            _seed_user(rid, email=f"{rid}@example.com", display_name=name)
        for rid, count, _ in seeds:
            for _ in range(count):
                _seed_resolution(
                    caregiver_user_id=CG_A,
                    resolver_user_id=rid,
                    resolution_reason="concerns_addressed",
                    age_hours=1.0,
                )

        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        top = r.json()["top_resolvers"]
        assert len(top) == 5  # capped
        counts = [tr["count"] for tr in top]
        # Strictly descending counts.
        assert counts == sorted(counts, reverse=True)
        # The lowest seed (1) is dropped because cap is 5.
        ids = {tr["resolver_user_id"] for tr in top}
        assert "actor-dcr2-resolver-v" not in ids
        # Highest-count resolver appears first with the right name.
        assert top[0]["resolver_user_id"] == "actor-dcr2-resolver-u"
        assert top[0]["count"] == 6
        # Cleanup test-specific resolver ids.
        db = SessionLocal()
        try:
            db.query(User).filter(
                User.id.in_(
                    [
                        "actor-dcr2-resolver-w",
                        "actor-dcr2-resolver-v",
                        "actor-dcr2-resolver-u",
                    ]
                )
            ).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()


# ── 8. Trend buckets ────────────────────────────────────────────────────────


class TestTrendBuckets:
    def test_trend_buckets_daily_for_7d_window(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_A, email="cga@example.com")
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolution_reason="concerns_addressed",
            age_hours=12.0,
        )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=7",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        buckets = r.json()["trend_buckets"]
        assert len(buckets) == 7

    def test_trend_buckets_weekly_for_30d_window(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_A, email="cga@example.com")
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolution_reason="concerns_addressed",
            age_hours=12.0,
        )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=30",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        buckets = r.json()["trend_buckets"]
        # 30/7 = 4.28 → 5 weekly buckets.
        assert 4 <= len(buckets) <= 6


# ── 9. Audit-events endpoint ────────────────────────────────────────────────


class TestAuditEvents:
    def test_audit_events_paginated_and_clinic_scoped(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        for ev in ("view", "window_changed", "reason_filter_changed"):
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


# ── 10. Window cap / large-window safety ────────────────────────────────────


class TestWindowCap:
    def test_large_window_does_not_oom(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # A handful of rows at varying ages — pulling 180d with these
        # counts must return 200 and a sane payload.
        _seed_user(CG_A, email="cga@example.com")
        for h in (1.0, 24.0, 72.0, 168.0, 24 * 30.0):
            _seed_resolution(
                caregiver_user_id=CG_A,
                resolution_reason="concerns_addressed",
                age_hours=h,
            )
        r = client.get(
            f"{HUB_PATH}/summary?window_days=180",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["window_days"] == 180
        assert data["total_resolved"] >= 5

    def test_rows_outside_window_excluded(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_A, email="cga@example.com")
        # 100h ago and 1000h ago.
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolution_reason="concerns_addressed",
            age_hours=100.0,
        )
        _seed_resolution(
            caregiver_user_id=CG_A,
            resolution_reason="false_positive",
            age_hours=1000.0,
        )
        # 7-day window (168h) → only the 100h-ago row counts.
        r = client.get(
            f"{HUB_PATH}/summary?window_days=7",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_resolved"] == 1
        assert data["by_reason"]["concerns_addressed"] == 1
        assert data["by_reason"]["false_positive"] == 0
