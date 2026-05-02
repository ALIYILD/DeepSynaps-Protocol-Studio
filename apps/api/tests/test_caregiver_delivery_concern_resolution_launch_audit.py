"""Tests for the Caregiver Delivery Concern Resolution launch-audit (DCR1, 2026-05-02).

Closes the DCA loop opened by #390: the aggregator emits HIGH-priority
``caregiver_portal.delivery_concern_threshold_reached`` rows when a
caregiver accumulates N+ delivery concerns; the worker honors
``caregiver_portal.delivery_concern_resolved`` rows for cooldown skip;
this router is the admin-side surface that EMITS resolution rows.

Pattern mirrors the DCA aggregator test suite at
``test_caregiver_delivery_concern_aggregator_launch_audit.py``.
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


SOURCE_ACTION = (
    "clinician_inbox.caregiver_delivery_concern_to_clinician_mirror"
)
FLAG_ACTION = "caregiver_portal.delivery_concern_threshold_reached"
RESOLVE_ACTION = "caregiver_portal.delivery_concern_resolved"
SURFACE = "caregiver_delivery_concern_resolution"


# Caregiver IDs used in this suite — kept distinct from the DCA suite
# so cleanup never collides.
CG_FLAGGED = "actor-dcr1-cg-flagged"
CG_FLAGGED_2 = "actor-dcr1-cg-flagged-2"
CG_OTHER_CLINIC = "actor-dcr1-cg-other-clinic"
CG_RESOLVED = "actor-dcr1-cg-resolved"
CG_NEVER_FLAGGED = "actor-dcr1-cg-never"
CG_LOOP = "actor-dcr1-cg-loop"


_ALL_CG_IDS = (
    CG_FLAGGED,
    CG_FLAGGED_2,
    CG_OTHER_CLINIC,
    CG_RESOLVED,
    CG_NEVER_FLAGGED,
    CG_LOOP,
)


# ── Fixtures / helpers ──────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_worker_singleton() -> None:
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
                    "caregiver_delivery_concern_resolution",
                    "caregiver_portal",
                    "clinician_inbox",
                    "caregiver_delivery_concern_aggregator",
                ]
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(list(_ALL_CG_IDS))).delete(
            synchronize_session=False
        )
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


def _seed_flag(
    *,
    caregiver_user_id: str,
    clinic_id: str = "clinic-demo-default",
    age_hours: float = 0.0,
    concern_count: int = 3,
) -> str:
    """Seed a ``caregiver_portal.delivery_concern_threshold_reached`` row
    matching what the DCA worker would emit."""
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


def _seed_concern(
    *,
    caregiver_user_id: str,
    age_hours: float = 0.0,
) -> str:
    db = SessionLocal()
    try:
        ts = _dt.now(_tz.utc) - _td(hours=age_hours)
        eid = (
            f"src-concern-{caregiver_user_id}-"
            f"{int(ts.timestamp() * 1000)}-{_uuid.uuid4().hex[:6]}"
        )
        note = (
            f"priority=high; patient=patient-dcr1-demo; "
            f"caregiver_user={caregiver_user_id}; "
            f"dispatch=dispatch-{_uuid.uuid4().hex[:6]}"
        )
        db.add(
            AuditEventRecord(
                event_id=eid,
                target_id="patient-dcr1-demo",
                target_type="clinician_inbox",
                action=SOURCE_ACTION,
                role="clinician",
                actor_id="patient-dcr1-demo",
                note=note,
                created_at=ts.isoformat(),
            )
        )
        db.commit()
        return eid
    finally:
        db.close()


# ── 1. Surface whitelist sanity ─────────────────────────────────────────────


def test_resolution_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_resolution_surface_accepted_by_qeeg_audit_events(
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
    def test_patient_resolve_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_FLAGGED,
                "resolution_reason": "concerns_addressed",
                "resolution_note": "patient is now ok",
            },
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403

    def test_guest_list_is_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/caregiver-delivery-concern-resolution/list?status=open",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_clinician_can_resolve(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # ``reviewer`` is the gate; clinicians outrank reviewer in the
        # canonical hierarchy so this passes. Patients/technicians get 403.
        _seed_user(CG_FLAGGED, email="cg1@example.com")
        _seed_flag(caregiver_user_id=CG_FLAGGED)
        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_FLAGGED,
                "resolution_reason": "concerns_addressed",
                "resolution_note": "discussed with patient family",
            },
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "resolved"

    def test_admin_can_resolve(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_FLAGGED, email="cg1@example.com")
        _seed_flag(caregiver_user_id=CG_FLAGGED)
        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_FLAGGED,
                "resolution_reason": "false_positive",
                "resolution_note": "reviewed and confirmed FP",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text


# ── 3. Resolve emits canonical audit row ────────────────────────────────────


class TestResolveEmits:
    def test_resolve_emits_caregiver_portal_resolved_row(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_FLAGGED, email="cg1@example.com")
        _seed_flag(caregiver_user_id=CG_FLAGGED)
        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_FLAGGED,
                "resolution_reason": "concerns_addressed",
                "resolution_note": "spoke with caregiver - addressed",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text

        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action == RESOLVE_ACTION,
                    AuditEventRecord.target_id == CG_FLAGGED,
                )
                .all()
            )
            assert len(rows) == 1
            note = rows[0].note or ""
            assert f"caregiver_user_id={CG_FLAGGED}" in note
            assert "clinic_id=clinic-demo-default" in note
            assert "resolution_reason=concerns_addressed" in note
            assert "resolver_user_id=" in note
            assert "resolution_note=spoke with caregiver - addressed" in note
        finally:
            db.close()

    def test_resolve_records_actor_identity_in_note(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_FLAGGED, email="cg1@example.com")
        _seed_flag(caregiver_user_id=CG_FLAGGED)
        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_FLAGGED,
                "resolution_reason": "false_positive",
                "resolution_note": "marked as false positive",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["resolver_user_id"] == "actor-admin-demo"

        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action == RESOLVE_ACTION,
                    AuditEventRecord.target_id == CG_FLAGGED,
                )
                .one()
            )
            assert "resolver_user_id=actor-admin-demo" in (row.note or "")
            assert row.actor_id == "actor-admin-demo"
        finally:
            db.close()


# ── 4. Resolve does NOT touch CaregiverDigestPreference / unrelated tables ──


class TestResolveScope:
    def test_resolve_emits_only_audit_rows(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Mutates only AuditEventRecord; no caregiver preference / user
        # row should change as a side-effect of the resolve call.
        _seed_user(CG_FLAGGED, email="cg1@example.com")
        _seed_flag(caregiver_user_id=CG_FLAGGED)

        db = SessionLocal()
        try:
            user_before = db.query(User).filter_by(id=CG_FLAGGED).one()
            email_before = user_before.email
            display_before = user_before.display_name
        finally:
            db.close()

        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_FLAGGED,
                "resolution_reason": "concerns_addressed",
                "resolution_note": "side-effect-free verification",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text

        db = SessionLocal()
        try:
            user_after = db.query(User).filter_by(id=CG_FLAGGED).one()
            assert user_after.email == email_before
            assert user_after.display_name == display_before
        finally:
            db.close()


# ── 5. Resolve clears the DCA cooldown — full loop verification ─────────────


class TestResolveClearsCooldown:
    def test_resolve_unblocks_next_dca_tick_within_cooldown(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        from app.workers.caregiver_delivery_concern_aggregator_worker import (
            get_worker,
        )

        _seed_user(CG_LOOP, email="cgloop@example.com")
        for h in (0.5, 1.0, 2.0):
            _seed_concern(caregiver_user_id=CG_LOOP, age_hours=h)

        worker = get_worker()
        db = SessionLocal()
        try:
            r1 = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()
        assert r1.caregivers_flagged == 1

        # Same fresh concerns; without resolve, the 2nd tick would skip
        # cooldown.
        db = SessionLocal()
        try:
            r2 = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()
        assert r2.caregivers_flagged == 0
        assert r2.skipped_cooldown >= 1

        # Admin resolves via the API.
        r_resolve = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_LOOP,
                "resolution_reason": "concerns_addressed",
                "resolution_note": "cleared and ready to re-evaluate",
            },
            headers=auth_headers["admin"],
        )
        assert r_resolve.status_code == 200, r_resolve.text

        # Next DCA tick — same concerns still in window → re-flagged
        # because the resolution row consumed the cooldown.
        db = SessionLocal()
        try:
            r3 = worker.tick(db, only_clinic_id="clinic-demo-default")
        finally:
            db.close()
        assert r3.caregivers_flagged == 1, (
            f"expected re-flag after resolve; got flagged="
            f"{r3.caregivers_flagged} skipped_cooldown="
            f"{r3.skipped_cooldown}"
        )


# ── 6. List endpoint — open/resolved status filter ──────────────────────────


class TestListEndpoint:
    def test_list_open_returns_flagged_caregivers(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_FLAGGED, email="cg1@example.com")
        _seed_flag(caregiver_user_id=CG_FLAGGED)
        r = client.get(
            "/api/v1/caregiver-delivery-concern-resolution/list?status=open",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "open"
        assert data["clinic_id"] == "clinic-demo-default"
        ids = [it["caregiver_user_id"] for it in data["items"]]
        assert CG_FLAGGED in ids
        match = next(
            it for it in data["items"] if it["caregiver_user_id"] == CG_FLAGGED
        )
        assert match["concern_count"] == 3
        assert match["last_flagged_at"]
        assert match["days_flagged"] >= 0
        assert match["caregiver_email"] == "cg1@example.com"

    def test_list_open_excludes_resolved_caregivers(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_FLAGGED, email="cg1@example.com")
        _seed_flag(caregiver_user_id=CG_FLAGGED)
        # Resolve via the API.
        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_FLAGGED,
                "resolution_reason": "false_positive",
                "resolution_note": "resolved by admin via API",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text

        # Open list should now exclude this caregiver.
        r2 = client.get(
            "/api/v1/caregiver-delivery-concern-resolution/list?status=open",
            headers=auth_headers["admin"],
        )
        assert r2.status_code == 200, r2.text
        ids = [it["caregiver_user_id"] for it in r2.json()["items"]]
        assert CG_FLAGGED not in ids

    def test_list_resolved_includes_recently_resolved(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_FLAGGED, email="cg1@example.com")
        _seed_flag(caregiver_user_id=CG_FLAGGED)
        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_FLAGGED,
                "resolution_reason": "caregiver_replaced",
                "resolution_note": "new caregiver assigned to family",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text

        r2 = client.get(
            "/api/v1/caregiver-delivery-concern-resolution/list"
            "?status=resolved",
            headers=auth_headers["admin"],
        )
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["status"] == "resolved"
        ids = [
            it["caregiver_user_id"] for it in data["resolved_items"]
        ]
        assert CG_FLAGGED in ids
        match = next(
            it
            for it in data["resolved_items"]
            if it["caregiver_user_id"] == CG_FLAGGED
        )
        assert match["resolution_reason"] == "caregiver_replaced"
        assert match["resolver_user_id"] == "actor-admin-demo"
        assert match["resolved_at"]

    def test_list_ordering_most_recently_flagged_first(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_FLAGGED, email="cg1@example.com")
        _seed_user(CG_FLAGGED_2, email="cg2@example.com")
        # Older flag for CG_FLAGGED, newer for CG_FLAGGED_2.
        _seed_flag(caregiver_user_id=CG_FLAGGED, age_hours=24)
        _seed_flag(caregiver_user_id=CG_FLAGGED_2, age_hours=1)

        r = client.get(
            "/api/v1/caregiver-delivery-concern-resolution/list?status=open",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        ids = [it["caregiver_user_id"] for it in r.json()["items"]]
        assert ids.index(CG_FLAGGED_2) < ids.index(CG_FLAGGED)


# ── 7. Cross-clinic IDOR ────────────────────────────────────────────────────


class TestCrossClinic:
    def test_other_clinic_caregiver_is_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            CG_OTHER_CLINIC,
            email="cgo@example.com",
            clinic_id="clinic-dcr1-other",
        )
        _seed_flag(
            caregiver_user_id=CG_OTHER_CLINIC,
            clinic_id="clinic-dcr1-other",
        )
        # Admin demo token is in clinic-demo-default; resolve on another
        # clinic's caregiver must 404.
        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_OTHER_CLINIC,
                "resolution_reason": "concerns_addressed",
                "resolution_note": "should be denied 404",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 404, r.text

    def test_other_clinic_caregiver_not_in_list(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(
            CG_OTHER_CLINIC,
            email="cgo@example.com",
            clinic_id="clinic-dcr1-other",
        )
        _seed_flag(
            caregiver_user_id=CG_OTHER_CLINIC,
            clinic_id="clinic-dcr1-other",
        )
        r = client.get(
            "/api/v1/caregiver-delivery-concern-resolution/list?status=open",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        ids = [it["caregiver_user_id"] for it in r.json()["items"]]
        assert CG_OTHER_CLINIC not in ids


# ── 8. Validation ───────────────────────────────────────────────────────────


class TestValidation:
    def test_resolution_note_too_short_is_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_FLAGGED, email="cg1@example.com")
        _seed_flag(caregiver_user_id=CG_FLAGGED)
        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_FLAGGED,
                "resolution_reason": "concerns_addressed",
                "resolution_note": "too short",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 422

    def test_resolution_note_too_long_is_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_FLAGGED, email="cg1@example.com")
        _seed_flag(caregiver_user_id=CG_FLAGGED)
        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_FLAGGED,
                "resolution_reason": "concerns_addressed",
                "resolution_note": "x" * 501,
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 422

    def test_invalid_resolution_reason_is_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_FLAGGED, email="cg1@example.com")
        _seed_flag(caregiver_user_id=CG_FLAGGED)
        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_FLAGGED,
                "resolution_reason": "made_up_reason",
                "resolution_note": "valid length but bad reason",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 422

    def test_unknown_caregiver_is_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": "actor-dcr1-cg-does-not-exist",
                "resolution_reason": "concerns_addressed",
                "resolution_note": "this caregiver does not exist",
            },
            headers=auth_headers["admin"],
        )
        assert r.status_code == 404


# ── 9. Idempotency ──────────────────────────────────────────────────────────


class TestIdempotency:
    def test_resolving_already_resolved_returns_already_resolved(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_user(CG_RESOLVED, email="cgr@example.com")
        _seed_flag(caregiver_user_id=CG_RESOLVED)
        r1 = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_RESOLVED,
                "resolution_reason": "concerns_addressed",
                "resolution_note": "first resolve attempt",
            },
            headers=auth_headers["admin"],
        )
        assert r1.status_code == 200, r1.text
        assert r1.json()["status"] == "resolved"

        r2 = client.post(
            "/api/v1/caregiver-delivery-concern-resolution/resolve",
            json={
                "caregiver_user_id": CG_RESOLVED,
                "resolution_reason": "concerns_addressed",
                "resolution_note": "second redundant attempt",
            },
            headers=auth_headers["admin"],
        )
        # Per spec — 409 OR 200 with status='already_resolved'. We chose
        # the latter so the UI doesn't have to special-case the error.
        assert r2.status_code in (200, 409)
        if r2.status_code == 200:
            assert r2.json()["status"] == "already_resolved"

        # Only ONE resolution audit row exists despite two calls.
        db = SessionLocal()
        try:
            rows = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action == RESOLVE_ACTION,
                    AuditEventRecord.target_id == CG_RESOLVED,
                )
                .all()
            )
            assert len(rows) == 1
        finally:
            db.close()


# ── 10. Audit-events list endpoint ─────────────────────────────────────────


class TestAuditEvents:
    def test_audit_events_paginated_and_clinic_scoped(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        for ev in ("view", "list_filter_changed", "resolve_modal_opened"):
            r = client.post(
                "/api/v1/caregiver-delivery-concern-resolution/audit-events",
                json={"event": ev, "note": f"test {ev}"},
                headers=auth_headers["clinician"],
            )
            assert r.status_code == 200, r.text
        r = client.get(
            "/api/v1/caregiver-delivery-concern-resolution/audit-events"
            f"?surface={SURFACE}&limit=10",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["surface"] == SURFACE
        assert data["total"] >= 3
        assert data["limit"] == 10
        actions = [it["action"] for it in data["items"]]
        assert any(".view" in a for a in actions)
        assert any(".list_filter_changed" in a for a in actions)
