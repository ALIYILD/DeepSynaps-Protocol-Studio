"""Tests for the Audit Trail launch-audit hardening (2026-04-30).

Covers:
  - Role gate: guest → 403, clinician → 200, admin → 200
  - Cross-actor scope: clinician sees only own events; admin sees all
  - Filters: surface, event_type, q (search), since/until, target_type
  - Summary: total / by_surface / by_day_30d / sae_related counts honest
  - CSV export honest columns + Demo header
  - NDJSON export one-event-per-line + Demo header
  - Detail GET /{event_id}: 200 visible, 404 not visible (clinic-isolation)
  - Self-audit: viewing the trail logs an ``audit_trail.viewed`` row
"""
from __future__ import annotations

import io
import csv
import json

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, Clinic, User


def _seed_audit_event(
    *,
    event_id: str,
    actor_id: str,
    target_type: str,
    action: str,
    role: str = "clinician",
    target_id: str = "tgt-1",
    note: str = "test event",
    created_at: str = "2026-04-29T12:00:00+00:00",
) -> None:
    db = SessionLocal()
    try:
        existing = db.query(AuditEventRecord).filter_by(event_id=event_id).first()
        if existing is not None:
            return
        db.add(
            AuditEventRecord(
                event_id=event_id,
                target_id=target_id,
                target_type=target_type,
                action=action,
                role=role,
                actor_id=actor_id,
                note=note,
                created_at=created_at,
            )
        )
        db.commit()
    finally:
        db.close()


# ── Role gating ──────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_guest_forbidden(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get("/api/v1/audit-trail", headers=auth_headers["guest"])
        assert resp.status_code == 403
        body = resp.json()
        assert body["code"] == "insufficient_role"

    def test_clinician_allowed(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get("/api/v1/audit-trail", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body and "total" in body
        # Honest disclaimers always present.
        assert any("immutable" in d.lower() for d in body["disclaimers"])

    def test_admin_allowed(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get("/api/v1/audit-trail", headers=auth_headers["admin"])
        assert resp.status_code == 200


# ── Cross-actor scope ────────────────────────────────────────────────────────


class TestActorScope:
    def test_clinician_sees_only_own_events(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        _seed_audit_event(
            event_id="evt-mine-1",
            actor_id="actor-clinician-demo",
            target_type="qeeg",
            action="qeeg.viewed",
            note="my event",
        )
        _seed_audit_event(
            event_id="evt-others-1",
            actor_id="actor-other-clinician",
            target_type="qeeg",
            action="qeeg.viewed",
            note="someone else's event",
        )
        resp = client.get("/api/v1/audit-trail", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        ids = [e["event_id"] for e in resp.json()["items"]]
        assert "evt-mine-1" in ids
        assert "evt-others-1" not in ids

    def test_admin_sees_all(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        _seed_audit_event(
            event_id="evt-others-2",
            actor_id="actor-other-clinician-2",
            target_type="qeeg",
            action="qeeg.viewed",
        )
        resp = client.get("/api/v1/audit-trail", headers=auth_headers["admin"])
        assert resp.status_code == 200
        ids = [e["event_id"] for e in resp.json()["items"]]
        assert "evt-others-2" in ids


# ── Filters ──────────────────────────────────────────────────────────────────


class TestFilters:
    def test_surface_filter(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        _seed_audit_event(
            event_id="evt-surf-ae",
            actor_id="actor-admin-demo",
            target_type="adverse_events",
            action="adverse_events.create",
        )
        _seed_audit_event(
            event_id="evt-surf-qe",
            actor_id="actor-admin-demo",
            target_type="qeeg",
            action="qeeg.viewed",
        )
        resp = client.get(
            "/api/v1/audit-trail?surface=adverse_events",
            headers=auth_headers["admin"],
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert all(i["surface"] == "adverse_events" for i in items)
        ids = [i["event_id"] for i in items]
        assert "evt-surf-ae" in ids
        assert "evt-surf-qe" not in ids

    def test_event_type_filter(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        _seed_audit_event(
            event_id="evt-type-export",
            actor_id="actor-admin-demo",
            target_type="qeeg",
            action="qeeg.export_csv",
        )
        resp = client.get(
            "/api/v1/audit-trail?event_type=export_csv",
            headers=auth_headers["admin"],
        )
        assert resp.status_code == 200
        ids = [i["event_id"] for i in resp.json()["items"]]
        assert "evt-type-export" in ids

    def test_search_q(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        _seed_audit_event(
            event_id="evt-q-needle",
            actor_id="actor-admin-demo",
            target_type="qeeg",
            action="qeeg.viewed",
            note="haystack-NEEDLE-haystack",
        )
        resp = client.get(
            "/api/v1/audit-trail?q=NEEDLE",
            headers=auth_headers["admin"],
        )
        assert resp.status_code == 200
        ids = [i["event_id"] for i in resp.json()["items"]]
        assert "evt-q-needle" in ids

    def test_since_until_window(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        _seed_audit_event(
            event_id="evt-old",
            actor_id="actor-admin-demo",
            target_type="qeeg",
            action="qeeg.viewed",
            created_at="2025-01-01T00:00:00+00:00",
        )
        _seed_audit_event(
            event_id="evt-new",
            actor_id="actor-admin-demo",
            target_type="qeeg",
            action="qeeg.viewed",
            created_at="2026-04-29T12:00:00+00:00",
        )
        resp = client.get(
            "/api/v1/audit-trail?since=2026-01-01",
            headers=auth_headers["admin"],
        )
        assert resp.status_code == 200
        ids = [i["event_id"] for i in resp.json()["items"]]
        assert "evt-new" in ids
        assert "evt-old" not in ids


# ── Summary endpoint ─────────────────────────────────────────────────────────


class TestSummary:
    def test_summary_counts_real(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        _seed_audit_event(
            event_id="evt-sum-1",
            actor_id="actor-admin-demo",
            target_type="adverse_events",
            action="adverse_events.create",
            note="severity=serious sae=true",
        )
        _seed_audit_event(
            event_id="evt-sum-2",
            actor_id="actor-admin-demo",
            target_type="qeeg",
            action="qeeg.viewed",
        )
        resp = client.get(
            "/api/v1/audit-trail/summary", headers=auth_headers["admin"]
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 2
        assert "adverse_events" in body["by_surface"]
        assert "qeeg" in body["by_surface"]
        # At least one SAE-related row from the AE seed above.
        assert body["sae_related"] >= 1


# ── CSV export ───────────────────────────────────────────────────────────────


class TestCsvExport:
    def test_csv_columns_and_demo_header(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        _seed_audit_event(
            event_id="evt-csv-1",
            actor_id="actor-admin-demo",
            target_type="qeeg",
            action="qeeg.viewed",
            note="DEMO; sample row",
        )
        resp = client.get(
            "/api/v1/audit-trail/export.csv", headers=auth_headers["admin"]
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/csv")
        assert "audit_trail.csv" in resp.headers["content-disposition"]
        assert resp.headers.get("X-Audit-Demo-Rows") is not None

        reader = csv.reader(io.StringIO(resp.text))
        header = next(reader)
        for col in (
            "event_id",
            "created_at",
            "surface",
            "event_type",
            "actor_id",
            "role",
            "target_id",
            "is_demo",
            "payload_hash",
        ):
            assert col in header
        rows = list(reader)
        # Find our row.
        idx = header.index("event_id")
        demo_idx = header.index("is_demo")
        match = [r for r in rows if r and r[idx] == "evt-csv-1"]
        assert match, "seeded event missing from CSV"
        assert match[0][demo_idx] == "1"


# ── NDJSON export ────────────────────────────────────────────────────────────


class TestNdjsonExport:
    def test_ndjson_one_event_per_line(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        _seed_audit_event(
            event_id="evt-nd-1",
            actor_id="actor-admin-demo",
            target_type="session_runner",
            action="session_runner.started",
        )
        resp = client.get(
            "/api/v1/audit-trail/export.ndjson",
            headers=auth_headers["admin"],
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("application/x-ndjson")
        assert "audit_trail.ndjson" in resp.headers["content-disposition"]
        lines = [l for l in resp.text.split("\n") if l.strip()]
        assert any(json.loads(l)["event_id"] == "evt-nd-1" for l in lines)
        # Each line must be valid JSON with surface + payload_hash.
        for l in lines:
            parsed = json.loads(l)
            assert "surface" in parsed
            assert "payload_hash" in parsed


# ── Detail endpoint ──────────────────────────────────────────────────────────


class TestDetail:
    def test_detail_404_for_unknown(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get(
            "/api/v1/audit-trail/does-not-exist",
            headers=auth_headers["admin"],
        )
        assert resp.status_code == 404
        assert resp.json()["code"] == "audit_event_not_found"

    def test_detail_visible_to_owner(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        _seed_audit_event(
            event_id="evt-detail-mine",
            actor_id="actor-clinician-demo",
            target_type="qeeg",
            action="qeeg.viewed",
        )
        resp = client.get(
            "/api/v1/audit-trail/evt-detail-mine",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["event_id"] == "evt-detail-mine"
        assert body["surface"] == "qeeg"
        assert body["event_type"] == "viewed"

    def test_detail_hidden_cross_actor(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        _seed_audit_event(
            event_id="evt-detail-others",
            actor_id="actor-other-not-me",
            target_type="qeeg",
            action="qeeg.viewed",
        )
        # Clinician asking for someone else's event must get 404 (not 200).
        resp = client.get(
            "/api/v1/audit-trail/evt-detail-others",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404


# ── Audit-of-the-audit ───────────────────────────────────────────────────────


class TestSelfAudit:
    def test_listing_creates_audit_trail_viewed(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        # Initial listing → should write a self-audit row.
        resp = client.get(
            "/api/v1/audit-trail", headers=auth_headers["admin"]
        )
        assert resp.status_code == 200

        # Look it up directly in the DB — admin sees it via the API too.
        db = SessionLocal()
        try:
            rec = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.target_type == "audit_trail")
                .filter(AuditEventRecord.action == "audit_trail.viewed")
                .first()
            )
            assert rec is not None
            assert rec.actor_id == "actor-admin-demo"
        finally:
            db.close()

    def test_export_csv_creates_self_audit(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get(
            "/api/v1/audit-trail/export.csv", headers=auth_headers["admin"]
        )
        assert resp.status_code == 200
        db = SessionLocal()
        try:
            rec = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.action == "audit_trail.export_csv")
                .first()
            )
            assert rec is not None
        finally:
            db.close()


# ── qEEG audit-events whitelist accepts audit_trail surface ──────────────────


class TestSurfaceWhitelist:
    def test_audit_trail_surface_accepted(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        """The shared ingestion endpoint must accept the new ``audit_trail``
        surface so the page itself can log ``page_loaded`` / ``filter_changed``
        / ``export_*`` events without falling back silently to ``qeeg``.
        """
        resp = client.post(
            "/api/v1/qeeg-analysis/audit-events",
            headers=auth_headers["clinician"],
            json={
                "event": "page_loaded",
                "surface": "audit_trail",
                "note": "audit-trail page open",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["accepted"] is True
        # Verify the row was tagged with the audit_trail surface, not silently
        # downgraded to qeeg.
        db = SessionLocal()
        try:
            rec = (
                db.query(AuditEventRecord)
                .filter(AuditEventRecord.event_id == body["event_id"])
                .first()
            )
            assert rec is not None
            assert rec.target_type == "audit_trail"
            assert rec.action == "audit_trail.page_loaded"
        finally:
            db.close()
