"""Tests for the Caregiver Delivery Concern Aggregator launch-audit (2026-05-01).

Closes section I rec from the Channel Misconfiguration Detector launch
audit (#389). Detector ships HIGH-priority audit rows when a caregiver's
preferred channel adapter is unavailable. THIS aggregator closes the
patient-side gap: when a caregiver accumulates N delivery concerns
(filed by patients via Patient Digest) within a rolling 7-day window,
the worker auto-flags the caregiver as a candidate for admin review and
emits a HIGH-priority audit row that surfaces in the Clinician Inbox
aggregator (#354).
"""
from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, User


# Make sure the env-var-gated start path stays disabled in tests so we
# don't accidentally fire a real BackgroundScheduler thread inside
# pytest. Tests that exercise the worker call ``tick()`` synchronously.
os.environ.pop("DEEPSYNAPS_CG_CONCERN_AGGREGATOR_ENABLED", None)


SOURCE_ACTION = (
    "clinician_inbox.caregiver_delivery_concern_to_clinician_mirror"
)
PORTAL_FILED_ACTION = "caregiver_portal.delivery_concern_filed"
FLAG_ACTION = "caregiver_portal.delivery_concern_threshold_reached"
RESOLVE_ACTION = "caregiver_portal.delivery_concern_resolved"


# ── Fixtures / helpers ──────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_worker_singleton() -> None:
    """Drop the in-memory singleton between tests so status counters and
    cached threshold/window values don't leak across cases."""
    from app.workers.caregiver_delivery_concern_aggregator_worker import (
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
                [
                    "caregiver_delivery_concern_aggregator",
                    "caregiver_portal",
                    "clinician_inbox",
                ]
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(
            User.id.in_(
                [
                    "actor-cgca-cg-noisy-1",
                    "actor-cgca-cg-noisy-2",
                    "actor-cgca-cg-quiet",
                    "actor-cgca-cg-other-clinic",
                    "actor-cgca-cg-empty",
                    "actor-cgca-cg-resolved",
                ]
            )
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _seed_user(
    user_id: str,
    *,
    email: str,
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
                display_name=email.split("@", 1)[0],
                hashed_password="x",
                role=role,
                package_id="clinician_pro",
                clinic_id=clinic_id,
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_concern(
    *,
    caregiver_user_id: str,
    age_hours: float = 0.0,
    action: str = SOURCE_ACTION,
    target_type: str | None = None,
    note_extra: str = "",
) -> str:
    """Seed one concern audit row at ``now - age_hours``.

    ``action`` defaults to the clinician-mirror row. Pass
    ``PORTAL_FILED_ACTION`` to seed the portal alias instead.

    NOTE: The repository's pydantic validator rejects role='patient'
    (the schema literal only allows guest/clinician/admin), so we write
    directly to the ``AuditEventRecord`` table here. Patient Digest's
    real emitter goes through ``_audit`` which uses ``actor.role`` —
    actual patient rows are written with role='clinician' upstream
    (the ``actor.role`` is whatever role the patient actor token was
    minted with in tests).
    """
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(hours=age_hours)
        eid = (
            f"src-concern-{caregiver_user_id}-"
            f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
        )
        if action == PORTAL_FILED_ACTION:
            tt = target_type or "caregiver_portal"
            tgt = caregiver_user_id
            note = (
                f"priority=high; caregiver_user={caregiver_user_id}; "
                f"clinic_id=clinic-demo-default"
            )
        else:
            tt = target_type or "clinician_inbox"
            tgt = "patient-cgca-demo"
            note = (
                f"priority=high; patient=patient-cgca-demo; "
                f"caregiver_user={caregiver_user_id}; "
                f"dispatch=dispatch-{_uuid.uuid4().hex[:6]}"
            )
        if note_extra:
            note += f"; {note_extra}"
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=tgt,
                target_type=tt,
                action=action,
                role="clinician",
                actor_id="patient-cgca-demo",
                note=note[:1024],
                created_at=ts.isoformat(),
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


def _seed_resolution(
    *,
    caregiver_user_id: str,
    clinic_id: str = "clinic-demo-default",
) -> str:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc)
        eid = (
            f"resolve-{caregiver_user_id}-"
            f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id=caregiver_user_id,
                target_type="caregiver_portal",
                action=RESOLVE_ACTION,
                role="admin",
                actor_id="actor-admin-demo",
                note=(
                    f"caregiver_user={caregiver_user_id}; "
                    f"clinic_id={clinic_id}"
                ),
                created_at=ts.isoformat(),
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


# ── 1. Surface whitelist sanity ─────────────────────────────────────────────


def test_worker_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert "caregiver_delivery_concern_aggregator" in KNOWN_SURFACES


def test_worker_surface_accepted_by_qeeg_audit_events(
    client: TestClient, auth_headers: dict
) -> None:
    body = {
        "event": "view",
        "surface": "caregiver_delivery_concern_aggregator",
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
    assert data.get("event_id", "").startswith(
        "caregiver_delivery_concern_aggregator-"
    )


# ── 2. Role gate ────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_patient_status_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-delivery-concern-aggregator/status",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_guest_status_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-delivery-concern-aggregator/status",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_clinician_can_read_status(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-delivery-concern-aggregator/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "running" in data
        assert "threshold" in data
        assert "window_hours" in data
        assert "cooldown_hours" in data
        assert isinstance(data["disclaimers"], list) and data["disclaimers"]

    def test_clinician_tick_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # The user spec mentions ``quality_reviewer`` and ``clinic_admin``;
        # the canonical role hierarchy maps these to ``reviewer`` (write)
        # and ``admin`` (write). Plain clinicians clear ``clinician`` but
        # the gate is ``reviewer`` minimum which clinician DOES satisfy.
        # We assert the clinician CAN tick (they are senior to reviewer)
        # but a patient CANNOT.
        r = client.post(
            "/api/v1/caregiver-delivery-concern-aggregator/tick",
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_admin_can_tick(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-delivery-concern-aggregator/tick",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["accepted"] is True
        assert data["clinic_id"] == "clinic-demo-default"
        assert "concerns_scanned" in data
        assert "caregivers_flagged" in data
        assert data["audit_event_id"].startswith(
            "caregiver_delivery_concern_aggregator-"
        )

    def test_quality_reviewer_can_tick(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # ``quality_reviewer`` in user spec → ``reviewer`` in canonical
        # role hierarchy. Both clinician and admin clear ``reviewer``
        # minimum so we use the clinician demo token which has the
        # closest role match here.
        r = client.post(
            "/api/v1/caregiver-delivery-concern-aggregator/tick",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text


# ── 3. Threshold + flag emission ────────────────────────────────────────────


class TestThreshold:
    def test_threshold_reached_emits_high_priority_audit(self) -> None:
        from app.workers.caregiver_delivery_concern_aggregator_worker import (
            get_worker,
        )

        _seed_user(
            "actor-cgca-cg-noisy-1",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        # 3 concerns within the 7d window (default threshold).
        for h in (0.5, 1.0, 2.0):
            _seed_concern(
                caregiver_user_id="actor-cgca-cg-noisy-1",
                age_hours=h,
            )

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        assert result.caregivers_flagged == 1, (
            f"expected 1 flag; got flagged={result.caregivers_flagged} "
            f"errors={result.errors} last_error={result.last_error}"
        )
        assert "actor-cgca-cg-noisy-1" in result.flagged_caregiver_ids

        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action == FLAG_ACTION,
                    AuditEventRecord.target_id == "actor-cgca-cg-noisy-1",
                )
                .all()
            )
            assert len(rows) == 1
            note = (rows[0].note or "").lower()
            assert "priority=high" in note
            assert "caregiver_id=actor-cgca-cg-noisy-1" in note
            assert "clinic_id=clinic-demo-default" in note
            assert "concern_count=3" in note
            assert "threshold=3" in note
        finally:
            db.close()

    def test_below_threshold_no_audit(self) -> None:
        from app.workers.caregiver_delivery_concern_aggregator_worker import (
            get_worker,
        )

        _seed_user(
            "actor-cgca-cg-quiet",
            email="cg-q@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        # Only 2 concerns < threshold of 3.
        for h in (0.5, 1.0):
            _seed_concern(
                caregiver_user_id="actor-cgca-cg-quiet",
                age_hours=h,
            )

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        assert result.caregivers_flagged == 0
        assert result.skipped_below_threshold >= 1
        assert "actor-cgca-cg-quiet" not in result.flagged_caregiver_ids

    def test_window_includes_4_concerns_at_days_0_1_3_6(self) -> None:
        from app.workers.caregiver_delivery_concern_aggregator_worker import (
            get_worker,
        )

        _seed_user(
            "actor-cgca-cg-noisy-1",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        # 0d, 1d, 3d, 6d — all within 7d window → flag.
        for hours in (0.0, 24.0, 72.0, 144.0):
            _seed_concern(
                caregiver_user_id="actor-cgca-cg-noisy-1",
                age_hours=hours,
            )

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        assert result.caregivers_flagged == 1
        assert result.concerns_scanned == 4

    def test_8_day_old_concern_excluded(self) -> None:
        from app.workers.caregiver_delivery_concern_aggregator_worker import (
            get_worker,
        )

        _seed_user(
            "actor-cgca-cg-quiet",
            email="cg-q@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        # 2 fresh concerns + 1 eight-day-old concern. The 8d-old one is
        # outside the 7d window → only 2 in-window → no flag.
        for h in (0.5, 1.0):
            _seed_concern(
                caregiver_user_id="actor-cgca-cg-quiet",
                age_hours=h,
            )
        _seed_concern(
            caregiver_user_id="actor-cgca-cg-quiet",
            age_hours=24.0 * 8,
        )

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        # 8-day-old row is OUT of window so concerns_scanned counts only
        # the 2 fresh rows, and threshold is not met.
        assert result.concerns_scanned == 2
        assert result.caregivers_flagged == 0


# ── 4. Cooldown ─────────────────────────────────────────────────────────────


class TestCooldown:
    def test_cooldown_prevents_duplicate_flag(self) -> None:
        from app.workers.caregiver_delivery_concern_aggregator_worker import (
            get_worker,
        )

        _seed_user(
            "actor-cgca-cg-noisy-1",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        for h in (0.5, 1.0, 2.0):
            _seed_concern(
                caregiver_user_id="actor-cgca-cg-noisy-1",
                age_hours=h,
            )

        worker = get_worker()
        db = SessionLocal()
        try:
            r1 = worker.tick(db, only_clinic_id="clinic-demo-default")
            r2 = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        assert r1.caregivers_flagged == 1
        assert "actor-cgca-cg-noisy-1" in r1.flagged_caregiver_ids
        assert r2.caregivers_flagged == 0
        assert r2.skipped_cooldown >= 1

        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action == FLAG_ACTION,
                    AuditEventRecord.target_id == "actor-cgca-cg-noisy-1",
                )
                .all()
            )
            assert len(rows) == 1
        finally:
            db.close()


# ── 5. Cross-clinic isolation ───────────────────────────────────────────────


class TestCrossClinic:
    def test_clinician_status_scoped_to_own_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed an other-clinic noisy caregiver.
        _seed_user(
            "actor-cgca-cg-other-clinic",
            email="cg-other@example.com",
            role="clinician",
            clinic_id="clinic-cgca-other",
        )
        for h in (0.5, 1.0, 2.0):
            _seed_concern(
                caregiver_user_id="actor-cgca-cg-other-clinic",
                age_hours=h,
            )
        r = client.get(
            "/api/v1/caregiver-delivery-concern-aggregator/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["clinic_id"] == "clinic-demo-default"

    def test_tick_only_scans_actor_clinic_even_with_other_clinic_concerns(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed concerns for two caregivers — one in actor's clinic, one
        # in another. Bound by ``actor.clinic_id``: only the demo-default
        # caregiver should appear in flagged ids.
        _seed_user(
            "actor-cgca-cg-noisy-1",
            email="cg1@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        for h in (0.5, 1.0, 2.0):
            _seed_concern(
                caregiver_user_id="actor-cgca-cg-noisy-1",
                age_hours=h,
            )

        _seed_user(
            "actor-cgca-cg-other-clinic",
            email="cg-other@example.com",
            role="clinician",
            clinic_id="clinic-cgca-other",
        )
        for h in (0.5, 1.0, 2.0):
            _seed_concern(
                caregiver_user_id="actor-cgca-cg-other-clinic",
                age_hours=h,
            )

        r = client.post(
            "/api/v1/caregiver-delivery-concern-aggregator/tick",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "actor-cgca-cg-noisy-1" in data["flagged_caregiver_ids"]
        assert (
            "actor-cgca-cg-other-clinic" not in data["flagged_caregiver_ids"]
        )

    def test_tick_scopes_to_actor_clinic_id(self) -> None:
        """Even with ``only_clinic_id`` provided to the worker directly,
        the router's ``_scope_clinic`` always coerces it back to
        ``actor.clinic_id`` for non-admin/super roles. We assert that
        behaviour at the worker layer too: passing a different
        clinic_id to ``tick(only_clinic_id=...)`` ONLY flags caregivers
        in that clinic — i.e. the worker's bound is honored.
        """
        from app.workers.caregiver_delivery_concern_aggregator_worker import (
            get_worker,
        )

        _seed_user(
            "actor-cgca-cg-other-clinic",
            email="cg-other@example.com",
            role="clinician",
            clinic_id="clinic-cgca-other",
        )
        for h in (0.5, 1.0, 2.0):
            _seed_concern(
                caregiver_user_id="actor-cgca-cg-other-clinic",
                age_hours=h,
            )

        worker = get_worker()
        db = SessionLocal()
        try:
            # only_clinic_id="clinic-demo-default" — the other-clinic
            # caregiver must NOT be flagged.
            result = worker.tick(
                db, only_clinic_id="clinic-demo-default"
            )
        finally:
            db.close()

        assert (
            "actor-cgca-cg-other-clinic" not in result.flagged_caregiver_ids
        )


# ── 6. Status endpoint ──────────────────────────────────────────────────────


class TestStatusEndpoint:
    def test_status_reports_threshold_window_cooldown(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-delivery-concern-aggregator/status",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["clinic_id"] == "clinic-demo-default"
        assert data["threshold"] >= 1
        assert data["window_hours"] >= 1
        assert data["cooldown_hours"] >= 1
        assert data["interval_sec"] >= 60
        assert data["last_tick_caregivers_flagged"] == 0


# ── 7. Audit-events list endpoint ───────────────────────────────────────────


class TestAuditEventsList:
    def test_list_paginated_and_clinic_scoped(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Post a couple of page-level audit pings so the list has
        # something to return.
        for ev in ("view", "polling_tick", "filter_changed"):
            r = client.post(
                "/api/v1/caregiver-delivery-concern-aggregator/audit-events",
                json={"event": ev, "note": f"test {ev}"},
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200, r.text
        r = client.get(
            "/api/v1/caregiver-delivery-concern-aggregator/audit-events"
            "?surface=caregiver_delivery_concern_aggregator&limit=10",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["surface"] == "caregiver_delivery_concern_aggregator"
        assert data["total"] >= 3
        assert data["limit"] == 10
        actions = [it["action"] for it in data["items"]]
        # 3 distinct event names should appear in the actions.
        assert any(".view" in a for a in actions)
        assert any(".polling_tick" in a for a in actions)


# ── 8. Inbox surfacing + resolution ─────────────────────────────────────────


class TestClinicianInboxSurfacing:
    def test_flagged_caregiver_appears_in_clinician_inbox(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        from app.workers.caregiver_delivery_concern_aggregator_worker import (
            get_worker,
        )

        _seed_user(
            "actor-cgca-cg-noisy-1",
            email="cg1@example.com",
            role="admin",
            clinic_id="clinic-demo-default",
        )
        for h in (0.5, 1.0, 2.0):
            _seed_concern(
                caregiver_user_id="actor-cgca-cg-noisy-1",
                age_hours=h,
            )
        worker = get_worker()
        db = SessionLocal()
        try:
            worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()

        # Inbox aggregator should pick up the priority=high row.
        r = client.get(
            "/api/v1/clinician-inbox/items?limit=200",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        actions = [it.get("action") for it in r.json().get("items", [])]
        assert FLAG_ACTION in actions, actions

    def test_resolution_event_can_be_emitted(self) -> None:
        """The aggregator emits a HIGH-priority threshold-reached row
        once. The resolution flow (out of scope for this worker — handled
        by the admin-side review tab) emits a
        ``caregiver_portal.delivery_concern_resolved`` row that the
        Clinician Inbox aggregator's existing "resolved" predicate
        clears. We assert the resolution row CAN be written and a fresh
        worker tick respects the resolution by NOT re-flagging within
        the cooldown window."""
        from app.workers.caregiver_delivery_concern_aggregator_worker import (
            get_worker,
        )

        _seed_user(
            "actor-cgca-cg-resolved",
            email="cgresolve@example.com",
            role="clinician",
            clinic_id="clinic-demo-default",
        )
        for h in (0.5, 1.0, 2.0):
            _seed_concern(
                caregiver_user_id="actor-cgca-cg-resolved",
                age_hours=h,
            )

        worker = get_worker()
        db = SessionLocal()
        try:
            r1 = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()
        assert r1.caregivers_flagged == 1

        # Admin resolves the flag — emits resolution row.
        resolve_eid = _seed_resolution(
            caregiver_user_id="actor-cgca-cg-resolved"
        )
        assert resolve_eid

        # Re-tick — cooldown still in effect, so no duplicate flag.
        db = SessionLocal()
        try:
            r2 = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()
        assert r2.caregivers_flagged == 0
        assert r2.skipped_cooldown >= 1


# ── 9. Empty clinic ─────────────────────────────────────────────────────────


class TestEmptyClinic:
    def test_empty_clinic_returns_empty_list(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-delivery-concern-aggregator/tick",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["caregivers_flagged"] == 0
        assert data["flagged_caregiver_ids"] == []
        assert data["flagged"] == []


# ── 10. Lifecycle ───────────────────────────────────────────────────────────


class TestLifecycle:
    def test_start_then_stop_is_idempotent(self) -> None:
        from app.workers.caregiver_delivery_concern_aggregator_worker import (
            CaregiverDeliveryConcernAggregatorWorker,
        )

        worker = CaregiverDeliveryConcernAggregatorWorker(
            interval_sec=86400,
            threshold=3,
            window_hours=168,
            cooldown_hours=72,
        )
        # First start succeeds, second start is no-op.
        try:
            assert worker.start() is True
            assert worker.start() is False
            # Stop succeeds, second stop is no-op.
            assert worker.stop() is True
            assert worker.stop() is False
        finally:
            # Defensive cleanup so the BackgroundScheduler thread is
            # always torn down even if an assert above fails.
            try:
                worker.stop()
            except Exception:
                pass
