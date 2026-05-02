"""Tests for the Channel Auth Drift Resolution Tracker launch-audit
(CSAHP2, 2026-05-02).

Closes the proactive-credential-monitoring loop opened by CSAHP1
(#417). The CSAHP1 worker proactively probes each clinic's configured
adapter credentials and emits ``auth_drift_detected`` audit rows BEFORE
the next digest dispatch fails. THIS suite asserts that the new
admin-side resolution surface:

* lets an admin mark an ``auth_drift_detected`` row as rotated (with
  rotation_method + rotation_note),
* emits a ``auth_drift_marked_rotated`` audit row tied to the actor,
* honors a 24h re-mark guard (409 on duplicate),
* role-gates mark-rotated to admin (403 for clinician/patient/guest),
* hides cross-clinic drift IDs (404),
* lists drifts by status=open|resolved|pending_confirmation,
* lets the CSAHP1 worker confirmation hook emit a
  ``auth_drift_resolved_confirmed`` row when the next healthy probe
  follows the mark — bypassing the 24h healthy-cooldown so the
  rotation always gets confirmed,
* surfaces ``channel_auth_drift_resolution`` on KNOWN_SURFACES +
  qeeg-analysis audit-events whitelist,
* end-to-end integration: detect → mark → probe healthy → confirmed.
"""
from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime as _dt, timedelta as _td, timezone as _tz
from typing import Any, Optional
from unittest import mock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, User


os.environ.pop("CHANNEL_AUTH_HEALTH_PROBE_ENABLED", None)


WORKER_SURFACE = "channel_auth_health_probe"
SURFACE = "channel_auth_drift_resolution"
DRIFT_DETECTED_ACTION = f"{WORKER_SURFACE}.auth_drift_detected"
HEALTHY_ACTION = f"{WORKER_SURFACE}.healthy"
MARKED_ROTATED_ACTION = f"{WORKER_SURFACE}.auth_drift_marked_rotated"
RESOLVED_CONFIRMED_ACTION = (
    f"{WORKER_SURFACE}.auth_drift_resolved_confirmed"
)


# ── Fixtures / helpers ──────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_worker_singleton() -> None:
    from app.workers.channel_auth_health_probe_worker import _reset_for_tests

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
                    SURFACE,
                    WORKER_SURFACE,
                ]
            )
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


@pytest.fixture
def slack_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-test-token")


@pytest.fixture
def sendgrid_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENDGRID_API_KEY", "SG.test")


def _mock_response(
    *,
    status_code: int = 200,
    json_payload: Optional[dict] = None,
) -> mock.Mock:
    resp = mock.Mock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json = mock.Mock(return_value=json_payload or {})
    resp.headers = {}
    resp.text = ""
    return resp


class _StubClient:
    def __init__(self, response_or_exc: Any) -> None:
        self._payload = response_or_exc

    def __enter__(self) -> "_StubClient":
        return self

    def __exit__(self, *_args: Any) -> None:
        return None

    def get(self, *_a: Any, **_k: Any):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def _factory_for(payload: Any):
    def _factory(*_a: Any, **_k: Any) -> _StubClient:
        return _StubClient(payload)

    return _factory


def _seed_drift_row(
    *,
    clinic_id: str = "clinic-demo-default",
    channel: str = "slack",
    error_class: str = "auth",
    error_message: str = "invalid_auth",
    age_minutes: int = 5,
) -> tuple[int, str]:
    """Seed a single auth_drift_detected row, returning (id, event_id)."""
    db = SessionLocal()
    try:
        from app.repositories.audit import create_audit_event

        ts = _dt.now(_tz.utc) - _td(minutes=age_minutes)
        eid = (
            f"{WORKER_SURFACE}-auth_drift_detected-{clinic_id}-{channel}-"
            f"{int(ts.timestamp())}-{_uuid.uuid4().hex[:6]}"
        )
        note = (
            f"priority=high clinic_id={clinic_id} channel={channel} "
            f"error_class={error_class} error_message={error_message}"
        )
        create_audit_event(
            db,
            event_id=eid,
            target_id=clinic_id,
            target_type=WORKER_SURFACE,
            action=DRIFT_DETECTED_ACTION,
            role="admin",
            actor_id="channel-auth-health-probe-worker",
            note=note,
            created_at=ts.isoformat(),
        )
        row = (
            db.query(AuditEventRecord)
            .filter(AuditEventRecord.event_id == eid)
            .first()
        )
        return int(row.id), eid
    finally:
        db.close()


# ── 1. Surface whitelist sanity ─────────────────────────────────────────────


def test_csahp2_surface_in_audit_trail_known_surfaces() -> None:
    from app.routers.audit_trail_router import KNOWN_SURFACES

    assert SURFACE in KNOWN_SURFACES


def test_csahp2_surface_accepted_by_qeeg_audit_events(
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
    def test_clinician_mark_rotated_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        drift_id, _ = _seed_drift_row()
        r = client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["clinician"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "manual",
                "rotation_note": "rotated the slack token manually",
            },
        )
        assert r.status_code == 403, r.text

    def test_patient_mark_rotated_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        drift_id, _ = _seed_drift_row()
        r = client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["patient"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "manual",
                "rotation_note": "rotated the slack token manually",
            },
        )
        assert r.status_code == 403

    def test_guest_list_403(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/channel-auth-drift-resolution/list",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403

    def test_clinician_list_ok(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            "/api/v1/channel-auth-drift-resolution/list",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text


# ── 3. mark-rotated happy path + audit row ──────────────────────────────────


class TestMarkRotated:
    def test_mark_rotated_emits_audit_row(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        drift_id, drift_eid = _seed_drift_row()
        r = client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "manual",
                "rotation_note": "rotated slack OAuth token via admin UI",
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["accepted"] is True
        assert data["status"] == "marked_rotated"
        assert data["channel"] == "slack"
        assert data["rotation_method"] == "manual"
        assert data["rotator_user_id"] == "actor-admin-demo"
        assert data["audit_event_id"].startswith(f"{WORKER_SURFACE}-")

        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.action == MARKED_ROTATED_ACTION)
                .first()
            )
            assert row is not None
            note = row.note or ""
            assert f"clinic_id=clinic-demo-default" in note
            assert "channel=slack" in note
            assert "rotation_method=manual" in note
            assert f"source_drift_event_id={drift_eid}" in note
            assert "rotator_user_id=actor-admin-demo" in note
        finally:
            db.close()

    def test_mark_rotated_404_on_cross_clinic_drift(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        drift_id, _ = _seed_drift_row(clinic_id="clinic-csahp2-other")
        r = client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "manual",
                "rotation_note": "rotated, ignore me, wrong clinic",
            },
        )
        assert r.status_code == 404

    def test_mark_rotated_409_on_double_mark_within_24h(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        drift_id, _ = _seed_drift_row()
        body = {
            "auth_drift_audit_id": drift_id,
            "rotation_method": "manual",
            "rotation_note": "rotated slack, first attempt",
        }
        r1 = client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json=body,
        )
        assert r1.status_code == 200, r1.text
        # Second drift on the SAME (clinic, channel) — second mark must
        # 409 because the 24h guard is per-(clinic, channel) not
        # per-drift-row.
        drift_id_2, _ = _seed_drift_row()
        r2 = client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": drift_id_2,
                "rotation_method": "manual",
                "rotation_note": "rotated slack again, should 409",
            },
        )
        assert r2.status_code == 409, r2.text

    def test_mark_rotated_validates_note_length(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        drift_id, _ = _seed_drift_row()
        r = client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "manual",
                "rotation_note": "short",  # < 10 chars
            },
        )
        assert r.status_code == 422

    def test_mark_rotated_rejects_invalid_method(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        drift_id, _ = _seed_drift_row()
        r = client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "carrier_pigeon",
                "rotation_note": "rotated via carrier pigeon (joke)",
            },
        )
        assert r.status_code == 422

    def test_mark_rotated_404_on_nonexistent_audit_id(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": 9999999,
                "rotation_method": "manual",
                "rotation_note": "rotated nothing — no row exists",
            },
        )
        assert r.status_code == 404

    def test_mark_rotated_carries_rotator_user_id(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        drift_id, _ = _seed_drift_row()
        r = client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "automated_rotation",
                "rotation_note": "key vault rotation policy fired",
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["rotator_user_id"] == "actor-admin-demo"


# ── 4. List endpoint ────────────────────────────────────────────────────────


class TestList:
    def test_list_status_open_returns_unrotated_drifts(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_drift_row(channel="slack")
        _seed_drift_row(channel="sendgrid", error_class="rate_limit")
        r = client.get(
            "/api/v1/channel-auth-drift-resolution/list?status=open",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "open"
        assert data["total"] == 2
        channels = {it["channel"] for it in data["items"]}
        assert channels == {"slack", "sendgrid"}

    def test_list_status_pending_after_mark(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        drift_id, _ = _seed_drift_row(channel="twilio")
        # Need slack creds env so worker doesn't matter — directly mark.
        rmark = client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "manual",
                "rotation_note": "rotated twilio account auth token",
            },
        )
        assert rmark.status_code == 200

        r = client.get(
            "/api/v1/channel-auth-drift-resolution/list?status=pending_confirmation",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["channel"] == "twilio"
        assert item["mark_rotated_event_id"]
        assert item["confirmed_event_id"] is None
        assert item["rotation_method"] == "manual"

    def test_list_status_resolved_after_confirmation(
        self, client: TestClient, auth_headers: dict, slack_creds
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        drift_id, _ = _seed_drift_row(channel="slack")
        # Mark as rotated.
        client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "manual",
                "rotation_note": "rotated slack OAuth token via admin UI",
            },
        )
        # Run a healthy probe — confirmation hook should emit
        # auth_drift_resolved_confirmed.
        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(
                    _mock_response(
                        status_code=200, json_payload={"ok": True}
                    )
                ),
            )
        finally:
            db.close()
        assert result.healthy >= 1
        assert result.auth_drift_resolved_confirmed == 1

        r = client.get(
            "/api/v1/channel-auth-drift-resolution/list?status=resolved",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["channel"] == "slack"
        assert item["confirmed_event_id"] is not None
        assert item["mark_rotated_event_id"] is not None

    def test_list_channel_filter_works(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_drift_row(channel="slack")
        _seed_drift_row(channel="sendgrid")
        r = client.get(
            "/api/v1/channel-auth-drift-resolution/list?status=open&channel=slack",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["channel"] == "slack"

    def test_list_hides_cross_clinic_drifts(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_drift_row(channel="slack", clinic_id="clinic-csahp2-other")
        r = client.get(
            "/api/v1/channel-auth-drift-resolution/list?status=open",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 0


# ── 5. Worker confirmation hook ─────────────────────────────────────────────


class TestWorkerConfirmation:
    def test_worker_emits_confirmed_when_healthy_probe_follows_mark(
        self, client: TestClient, auth_headers: dict, slack_creds
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        drift_id, _ = _seed_drift_row(channel="slack")
        client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "manual",
                "rotation_note": "rotated slack OAuth token via admin UI",
            },
        )

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(
                    _mock_response(
                        status_code=200, json_payload={"ok": True}
                    )
                ),
            )
        finally:
            db.close()
        assert result.auth_drift_resolved_confirmed == 1

        db = SessionLocal()
        try:
            row = (
                db.query(AuditEventRecord)
                .filter(
                    AuditEventRecord.action == RESOLVED_CONFIRMED_ACTION
                )
                .first()
            )
            assert row is not None
            note = row.note or ""
            assert "channel=slack" in note
            assert "mark_rotated_event_id=" in note
            assert "priority=info" in note
        finally:
            db.close()

    def test_worker_does_not_emit_confirmed_without_mark(
        self, client: TestClient, auth_headers: dict, slack_creds
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(
                    _mock_response(
                        status_code=200, json_payload={"ok": True}
                    )
                ),
            )
        finally:
            db.close()
        assert result.auth_drift_resolved_confirmed == 0
        assert result.healthy == 1

    def test_worker_does_not_re_emit_confirmed_for_same_mark(
        self, client: TestClient, auth_headers: dict, slack_creds
    ) -> None:
        from app.workers.channel_auth_health_probe_worker import get_worker

        drift_id, _ = _seed_drift_row(channel="slack")
        client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "manual",
                "rotation_note": "rotated slack OAuth token via admin UI",
            },
        )
        worker = get_worker()
        db = SessionLocal()
        try:
            r1 = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(
                    _mock_response(
                        status_code=200, json_payload={"ok": True}
                    )
                ),
            )
            r2 = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(
                    _mock_response(
                        status_code=200, json_payload={"ok": True}
                    )
                ),
            )
        finally:
            db.close()
        assert r1.auth_drift_resolved_confirmed == 1
        # Second tick must not re-confirm.
        assert r2.auth_drift_resolved_confirmed == 0

    def test_confirmation_bypasses_healthy_cooldown(
        self, client: TestClient, auth_headers: dict, slack_creds
    ) -> None:
        """A healthy row exists within the 24h cooldown — the next tick
        with a pending mark MUST still emit a confirmed-row even though
        the cooldown would normally skip the probe."""
        from app.workers.channel_auth_health_probe_worker import get_worker
        from app.repositories.audit import create_audit_event

        # Seed a fresh healthy row (within cooldown).
        db = SessionLocal()
        try:
            recent = _dt.now(_tz.utc) - _td(hours=1)
            create_audit_event(
                db,
                event_id=f"{WORKER_SURFACE}-healthy-cooldownseed",
                target_id="clinic-demo-default",
                target_type=WORKER_SURFACE,
                action=HEALTHY_ACTION,
                role="admin",
                actor_id="channel-auth-health-probe-worker",
                note=(
                    f"priority=info clinic_id=clinic-demo-default "
                    f"channel=slack verified_at={recent.isoformat()}"
                ),
                created_at=recent.isoformat(),
            )
        finally:
            db.close()

        drift_id, _ = _seed_drift_row(channel="slack")
        client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "manual",
                "rotation_note": "rotated slack OAuth token via admin UI",
            },
        )

        worker = get_worker()
        db = SessionLocal()
        try:
            result = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(
                    _mock_response(
                        status_code=200, json_payload={"ok": True}
                    )
                ),
            )
        finally:
            db.close()
        # Confirmation hook MUST run even though cooldown would skip.
        assert result.auth_drift_resolved_confirmed == 1


# ── 6. Audit-events scoping + pagination ────────────────────────────────────


class TestAuditEvents:
    def test_audit_events_paginates(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get(
            f"/api/v1/channel-auth-drift-resolution/audit-events?limit=5&offset=0",
            headers=auth_headers["admin"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["limit"] == 5
        assert data["offset"] == 0
        assert data["surface"] == SURFACE

    def test_audit_events_scoped_to_actor_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Seed an other-clinic self-row that should NOT appear.
        db = SessionLocal()
        try:
            from app.repositories.audit import create_audit_event

            now = _dt.now(_tz.utc).isoformat()
            create_audit_event(
                db,
                event_id="csahp2-other-clinic-row",
                target_id="42",
                target_type=SURFACE,
                action=f"{SURFACE}.marked_rotated",
                role="admin",
                actor_id="other-clinic-actor",
                note="clinic_id=clinic-csahp2-other; channel=slack; rotation_method=manual",
                created_at=now,
            )
        finally:
            db.close()

        r = client.get(
            "/api/v1/channel-auth-drift-resolution/audit-events",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for it in data["items"]:
            assert "clinic_id=clinic-csahp2-other" not in (
                it.get("note") or ""
            )


# ── 7. End-to-end integration ───────────────────────────────────────────────


class TestIntegrationLoop:
    def test_full_loop_detect_mark_probe_confirmed(
        self, client: TestClient, auth_headers: dict, slack_creds
    ) -> None:
        """Full loop: a real auth_drift_detected drift is detected by
        the worker via a 401 stub probe → admin marks rotated → worker
        runs a healthy stub probe → auth_drift_resolved_confirmed
        emitted → /list?status=resolved surfaces it.
        """
        from app.workers.channel_auth_health_probe_worker import get_worker

        worker = get_worker()

        # 1) Detect — 401 probe emits auth_drift_detected.
        db = SessionLocal()
        try:
            r1 = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(_mock_response(status_code=401)),
            )
        finally:
            db.close()
        assert r1.auth_drift_detected == 1

        # Find the drift row id.
        db = SessionLocal()
        try:
            drift_row = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.action == DRIFT_DETECTED_ACTION)
                .first()
            )
            assert drift_row is not None
            drift_id = int(drift_row.id)
        finally:
            db.close()

        # 2) Admin marks rotated.
        rmark = client.post(
            "/api/v1/channel-auth-drift-resolution/mark-rotated",
            headers=auth_headers["admin"],
            json={
                "auth_drift_audit_id": drift_id,
                "rotation_method": "manual",
                "rotation_note": "rotated slack OAuth token via admin UI",
            },
        )
        assert rmark.status_code == 200, rmark.text

        # 3) Healthy probe → confirmation hook.
        db = SessionLocal()
        try:
            r2 = worker.tick(
                db,
                only_clinic_id="clinic-demo-default",
                only_channel="slack",
                httpx_client=_factory_for(
                    _mock_response(
                        status_code=200, json_payload={"ok": True}
                    )
                ),
            )
        finally:
            db.close()
        assert r2.auth_drift_resolved_confirmed == 1

        # 4) /list?status=resolved surfaces the closed loop.
        r3 = client.get(
            "/api/v1/channel-auth-drift-resolution/list?status=resolved",
            headers=auth_headers["admin"],
        )
        assert r3.status_code == 200, r3.text
        data = r3.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["channel"] == "slack"
        assert item["confirmed_event_id"] is not None
        assert item["mark_rotated_event_id"] is not None
        assert item["rotation_method"] == "manual"
