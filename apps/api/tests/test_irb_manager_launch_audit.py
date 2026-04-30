"""Tests for the IRB Manager launch-audit hardening (2026-04-30).

Covers the new IRB protocol register endpoints in
``apps/api/app/routers/irb_manager_router.py``:

* GET    /api/v1/irb/protocols                          (filters)
* GET    /api/v1/irb/protocols/summary
* GET    /api/v1/irb/protocols/export.csv
* GET    /api/v1/irb/protocols/export.ndjson
* GET    /api/v1/irb/protocols/{id}
* POST   /api/v1/irb/protocols
* PATCH  /api/v1/irb/protocols/{id}
* POST   /api/v1/irb/protocols/{id}/amendments
* POST   /api/v1/irb/protocols/{id}/close
* POST   /api/v1/irb/protocols/{id}/reopen
* POST   /api/v1/irb/protocols/audit-events

Cross-cutting checks: clinic-isolation, role gate, immutability of closed
protocols, real-User PI enforcement, demo flag prefixing exports, and
audit-event surface attribution to the new ``irb_manager`` whitelist.
"""
from __future__ import annotations

import csv
import io
import json

from fastapi.testclient import TestClient


# ── Helpers ──────────────────────────────────────────────────────────────────


def _create(
    client: TestClient,
    headers: dict,
    *,
    title: str = "Theta Burst TMS for TRD",
    pi_user_id: str = "actor-clinician-demo",
    phase: str = "ii",
    status: str = "pending",
    risk_level: str | None = "greater_than_minimal",
    protocol_code: str | None = None,
    irb_board: str | None = "Western IRB",
    irb_number: str | None = None,
    sponsor: str | None = None,
    approval_date: str | None = None,
    expiry_date: str | None = None,
    enrollment_target: int | None = None,
    consent_version: str | None = None,
    description: str = "",
    is_demo: bool = False,
) -> dict:
    body = {
        "title": title,
        "pi_user_id": pi_user_id,
        "phase": phase,
        "status": status,
        "risk_level": risk_level,
        "protocol_code": protocol_code,
        "irb_board": irb_board,
        "irb_number": irb_number,
        "sponsor": sponsor,
        "approval_date": approval_date,
        "expiry_date": expiry_date,
        "enrollment_target": enrollment_target,
        "consent_version": consent_version,
        "description": description,
        "is_demo": is_demo,
    }
    body = {k: v for k, v in body.items() if v is not None}
    resp = client.post("/api/v1/irb/protocols", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Role gating ──────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_guest_forbidden(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get("/api/v1/irb/protocols", headers=auth_headers["guest"])
        assert resp.status_code == 403
        body = resp.json()
        assert body["code"] == "insufficient_role"

    def test_patient_forbidden(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get(
            "/api/v1/irb/protocols", headers=auth_headers["patient"]
        )
        assert resp.status_code == 403

    def test_clinician_allowed(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get(
            "/api/v1/irb/protocols", headers=auth_headers["clinician"]
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body and "total" in body
        # Honest disclaimers always present on the list.
        assert any("immutable" in d.lower() for d in body["disclaimers"])

    def test_admin_allowed(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get("/api/v1/irb/protocols", headers=auth_headers["admin"])
        assert resp.status_code == 200


# ── Create / list / detail ───────────────────────────────────────────────────


class TestCreateAndList:
    def test_create_minimal(self, client: TestClient, auth_headers: dict) -> None:
        body = _create(
            client, auth_headers["clinician"], title="iTBS pilot", phase="pilot"
        )
        assert body["title"] == "iTBS pilot"
        assert body["status"] == "pending"
        assert body["phase"] == "pilot"
        assert body["pi_user_id"] == "actor-clinician-demo"
        assert body["pi_display_name"]  # resolves from User
        assert body["created_by"] == "actor-clinician-demo"
        assert body["revision_count"] >= 1
        assert body["payload_hash"] and len(body["payload_hash"]) == 16

    def test_list_returns_created(self, client: TestClient, auth_headers: dict) -> None:
        a = _create(client, auth_headers["clinician"], title="Alpha")
        b = _create(client, auth_headers["clinician"], title="Beta", phase="iii")
        resp = client.get("/api/v1/irb/protocols", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        ids = {it["id"] for it in resp.json()["items"]}
        assert a["id"] in ids and b["id"] in ids

    def test_get_detail_includes_amendments(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        p = _create(client, auth_headers["clinician"])
        client.post(
            f"/api/v1/irb/protocols/{p['id']}/amendments",
            json={
                "amendment_type": "protocol_change",
                "description": "Added MRI sub-study",
                "reason": "Imaging biomarker enrichment",
            },
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            f"/api/v1/irb/protocols/{p['id']}", headers=auth_headers["clinician"]
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["amendments"]) == 1
        assert body["amendments"][0]["amendment_type"] == "protocol_change"
        assert body["amendments_count"] == 1

    def test_create_invalid_phase(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.post(
            "/api/v1/irb/protocols",
            json={
                "title": "x",
                "pi_user_id": "actor-clinician-demo",
                "phase": "fakey",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_phase"

    def test_create_invalid_risk_level(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            "/api/v1/irb/protocols",
            json={
                "title": "x",
                "pi_user_id": "actor-clinician-demo",
                "risk_level": "made_up",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_risk_level"


# ── PI real-user enforcement ─────────────────────────────────────────────────


class TestPIValidation:
    def test_unknown_pi_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Free-form strings as PIs are explicitly disallowed by the launch-
        # audit brief: "fabricated PI names" must be impossible.
        resp = client.post(
            "/api/v1/irb/protocols",
            json={"title": "x", "pi_user_id": "Dr. Pretend"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_pi"

    def test_real_pi_accepted(self, client: TestClient, auth_headers: dict) -> None:
        body = _create(
            client, auth_headers["clinician"],
            title="real PI",
            pi_user_id="actor-admin-demo",
        )
        assert body["pi_user_id"] == "actor-admin-demo"


# ── Filters & summary ────────────────────────────────────────────────────────


class TestFiltersAndSummary:
    def test_filter_by_status(self, client: TestClient, auth_headers: dict) -> None:
        a = _create(client, auth_headers["clinician"], title="alpha")
        _create(client, auth_headers["clinician"], title="beta")
        # Close one
        client.post(
            f"/api/v1/irb/protocols/{a['id']}/close",
            json={"note": "study completed"},
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            "/api/v1/irb/protocols?status=pending",
            headers=auth_headers["clinician"],
        )
        items = resp.json()["items"]
        assert all(it["status"] == "pending" for it in items)
        assert a["id"] not in {it["id"] for it in items}

    def test_filter_by_phase(self, client: TestClient, auth_headers: dict) -> None:
        triple = _create(
            client, auth_headers["clinician"], title="phase3", phase="iii"
        )
        _create(client, auth_headers["clinician"], title="pilotonly", phase="pilot")
        resp = client.get(
            "/api/v1/irb/protocols?phase=iii", headers=auth_headers["clinician"]
        )
        ids = {it["id"] for it in resp.json()["items"]}
        assert triple["id"] in ids
        assert all(it["phase"] == "iii" for it in resp.json()["items"])

    def test_filter_by_pi(self, client: TestClient, auth_headers: dict) -> None:
        a = _create(client, auth_headers["clinician"], pi_user_id="actor-admin-demo")
        _create(client, auth_headers["clinician"], pi_user_id="actor-clinician-demo")
        resp = client.get(
            "/api/v1/irb/protocols?pi_user_id=actor-admin-demo",
            headers=auth_headers["clinician"],
        )
        ids = {it["id"] for it in resp.json()["items"]}
        assert a["id"] in ids
        assert all(
            it["pi_user_id"] == "actor-admin-demo"
            for it in resp.json()["items"]
        )

    def test_filter_by_q(self, client: TestClient, auth_headers: dict) -> None:
        a = _create(
            client, auth_headers["clinician"],
            title="Theta Burst TMS for TRD",
            description="iTBS protocol for treatment-resistant MDD",
        )
        _create(
            client, auth_headers["clinician"],
            title="Other study",
            description="Not what we are looking for",
        )
        resp = client.get(
            "/api/v1/irb/protocols?q=theta",
            headers=auth_headers["clinician"],
        )
        ids = {it["id"] for it in resp.json()["items"]}
        assert a["id"] in ids

    def test_summary_counts(self, client: TestClient, auth_headers: dict) -> None:
        a = _create(client, auth_headers["clinician"], title="a", phase="ii")
        b = _create(
            client, auth_headers["clinician"],
            title="b",
            phase="iii",
            risk_level="minimal",
        )
        client.post(
            f"/api/v1/irb/protocols/{a['id']}/close",
            json={"note": "completed"},
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            "/api/v1/irb/protocols/summary", headers=auth_headers["clinician"]
        )
        assert resp.status_code == 200
        s = resp.json()
        assert s["total"] == 2
        assert s["closed"] >= 1
        assert s["pending"] >= 1
        assert (
            s["by_phase"].get("ii", 0) + s["by_phase"].get("iii", 0) >= 2
        )
        # b has minimal risk level, so by_risk_level should reflect it
        assert s["by_risk_level"].get("minimal", 0) >= 1


# ── Patch / immutability ────────────────────────────────────────────────────


class TestPatchAndImmutability:
    def test_patch_phase(self, client: TestClient, auth_headers: dict) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        resp = client.patch(
            f"/api/v1/irb/protocols/{f['id']}",
            json={"phase": "iii"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        assert resp.json()["phase"] == "iii"
        assert resp.json()["revision_count"] >= 2  # create + update

    def test_patch_increments_revision_count(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        before = f["revision_count"]
        resp = client.patch(
            f"/api/v1/irb/protocols/{f['id']}",
            json={"enrollment_target": 50},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        assert resp.json()["revision_count"] == before + 1

    def test_patch_status_to_closed_blocked(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        resp = client.patch(
            f"/api/v1/irb/protocols/{f['id']}",
            json={"status": "closed"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "use_close_endpoint"

    def test_closed_is_immutable(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        client.post(
            f"/api/v1/irb/protocols/{f['id']}/close",
            json={"note": "done"},
            headers=auth_headers["clinician"],
        )
        resp = client.patch(
            f"/api/v1/irb/protocols/{f['id']}",
            json={"phase": "iii"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 409
        assert resp.json()["code"] == "protocol_immutable"

    def test_empty_patch_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        resp = client.patch(
            f"/api/v1/irb/protocols/{f['id']}",
            json={},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "empty_patch"


# ── Amendments ──────────────────────────────────────────────────────────────


class TestAmendments:
    def test_amendment_requires_reason(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        p = _create(client, auth_headers["clinician"])
        resp = client.post(
            f"/api/v1/irb/protocols/{p['id']}/amendments",
            json={
                "amendment_type": "protocol_change",
                "description": "x",
                "reason": "   ",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "amendment_reason_required"

    def test_amendment_invalid_type(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        p = _create(client, auth_headers["clinician"])
        resp = client.post(
            f"/api/v1/irb/protocols/{p['id']}/amendments",
            json={
                "amendment_type": "fake_type",
                "description": "x",
                "reason": "y",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_amendment_type"

    def test_amendment_consent_version_propagates(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        p = _create(client, auth_headers["clinician"], consent_version="v1.0")
        resp = client.post(
            f"/api/v1/irb/protocols/{p['id']}/amendments",
            json={
                "amendment_type": "consent_update",
                "description": "Revised compensation per IRB guidance",
                "reason": "IRB feedback letter received",
                "consent_version_after": "v1.2",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        # Re-fetch to confirm protocol's consent_version was updated
        d = client.get(
            f"/api/v1/irb/protocols/{p['id']}",
            headers=auth_headers["clinician"],
        )
        assert d.json()["consent_version"] == "v1.2"

    def test_amendment_blocked_on_closed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        p = _create(client, auth_headers["clinician"])
        client.post(
            f"/api/v1/irb/protocols/{p['id']}/close",
            json={"note": "closed"},
            headers=auth_headers["clinician"],
        )
        resp = client.post(
            f"/api/v1/irb/protocols/{p['id']}/amendments",
            json={
                "amendment_type": "protocol_change",
                "description": "x",
                "reason": "y",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 409
        assert resp.json()["code"] == "protocol_immutable"


# ── Close + reopen ──────────────────────────────────────────────────────────


class TestCloseReopen:
    def test_close_requires_note(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        resp = client.post(
            f"/api/v1/irb/protocols/{f['id']}/close",
            json={"note": "   "},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "closure_note_required"

    def test_close_then_reopen(self, client: TestClient, auth_headers: dict) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        c = client.post(
            f"/api/v1/irb/protocols/{f['id']}/close",
            json={"note": "study completed; final report filed"},
            headers=auth_headers["clinician"],
        )
        assert c.status_code == 200
        body = c.json()
        assert body["status"] == "closed"
        assert body["closed_by"] == "actor-clinician-demo"
        assert "completed" in body["closure_note"]

        r = client.post(
            f"/api/v1/irb/protocols/{f['id']}/reopen",
            json={"reason": "follow-up data found post-close"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        rb = r.json()
        assert rb["status"] == "reopened"
        assert rb["closed_at"] is None
        assert rb["revision_count"] >= 3  # create + close + reopen

    def test_reopen_requires_reason(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        client.post(
            f"/api/v1/irb/protocols/{f['id']}/close",
            json={"note": "done"},
            headers=auth_headers["clinician"],
        )
        r = client.post(
            f"/api/v1/irb/protocols/{f['id']}/reopen",
            json={"reason": ""},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422
        assert r.json()["code"] == "reopen_reason_required"

    def test_reopen_only_closed(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        r = client.post(
            f"/api/v1/irb/protocols/{f['id']}/reopen",
            json={"reason": "no"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 409


# ── Cross-clinic isolation ───────────────────────────────────────────────────


class TestClinicScope:
    def _seed_other_clinic(self) -> str:
        """Create a separate clinic + clinician and a protocol owned by them."""
        from app.database import SessionLocal
        from app.persistence.models import Clinic, IRBProtocol, User
        import uuid as _uuid

        db = SessionLocal()
        try:
            other_clinic_id = "clinic-other-irb"
            if db.query(Clinic).filter_by(id=other_clinic_id).first() is None:
                db.add(Clinic(id=other_clinic_id, name="Other Clinic"))
            other_user_id = "actor-other-irb-pi"
            if db.query(User).filter_by(id=other_user_id).first() is None:
                db.add(
                    User(
                        id=other_user_id,
                        email="other-pi@example.com",
                        display_name="Other PI",
                        hashed_password="x",
                        role="clinician",
                        package_id="clinician_pro",
                        clinic_id=other_clinic_id,
                    )
                )
            pid = str(_uuid.uuid4())
            db.add(
                IRBProtocol(
                    id=pid,
                    clinic_id=other_clinic_id,
                    title="Cross-clinic protocol",
                    description="should be invisible to demo clinician",
                    pi_user_id=other_user_id,
                    phase="ii",
                    status="active",
                    created_by=other_user_id,
                )
            )
            db.commit()
            return pid
        finally:
            db.close()

    def test_clinician_cannot_see_other_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = self._seed_other_clinic()
        resp = client.get(
            f"/api/v1/irb/protocols/{pid}", headers=auth_headers["clinician"]
        )
        assert resp.status_code == 404
        assert resp.json()["code"] == "protocol_not_found"

    def test_admin_can_see_other_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = self._seed_other_clinic()
        resp = client.get(
            f"/api/v1/irb/protocols/{pid}", headers=auth_headers["admin"]
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Cross-clinic protocol"


# ── Exports ──────────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_columns(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create(client, auth_headers["clinician"], title="csv-row")
        resp = client.get(
            "/api/v1/irb/protocols/export.csv",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/csv")
        assert (
            "filename=irb_protocols.csv" in resp.headers["content-disposition"]
        )
        body = resp.text
        # No demo rows yet → no `# DEMO` prefix.
        assert not body.startswith("# DEMO")
        reader = csv.reader(io.StringIO(body))
        header = next(reader)
        assert "id" in header and "phase" in header and "payload_hash" in header
        assert "pi_user_id" in header

    def test_csv_export_demo_prefix(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create(
            client, auth_headers["clinician"], title="demo-row", is_demo=True
        )
        resp = client.get(
            "/api/v1/irb/protocols/export.csv",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        assert resp.text.startswith("# DEMO"), resp.text[:80]
        assert resp.headers.get("X-IRB-Demo-Rows") == "1"

    def test_ndjson_export_one_per_line(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        a = _create(client, auth_headers["clinician"], title="a")
        b = _create(client, auth_headers["clinician"], title="b")
        resp = client.get(
            "/api/v1/irb/protocols/export.ndjson",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        lines = [ln for ln in resp.text.splitlines() if ln.strip()]
        ids = {
            json.loads(ln).get("id")
            for ln in lines
            if ln.startswith("{") and "_meta" not in ln
        }
        assert a["id"] in ids and b["id"] in ids

    def test_ndjson_export_demo_meta(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create(
            client, auth_headers["clinician"], title="demo-ndjson", is_demo=True
        )
        resp = client.get(
            "/api/v1/irb/protocols/export.ndjson",
            headers=auth_headers["clinician"],
        )
        lines = [ln for ln in resp.text.splitlines() if ln.strip()]
        assert json.loads(lines[0])["_meta"] == "DEMO"


# ── Audit-event ingestion ────────────────────────────────────────────────────


class TestAuditEvents:
    def test_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            "/api/v1/irb/protocols/audit-events",
            json={"event": "page_loaded", "note": "test"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("irb_manager-")

    def test_audit_event_visible_in_audit_trail(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        client.post(
            "/api/v1/irb/protocols/audit-events",
            json={"event": "filter_changed", "note": "status=active"},
            headers=auth_headers["clinician"],
        )
        # Audit trail filters by surface=irb_manager — KNOWN_SURFACES
        # was extended to include irb_manager in this same PR.
        resp = client.get(
            "/api/v1/audit-trail?surface=irb_manager",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        events = resp.json()["items"]
        assert any(
            ev["action"] == "irb_manager.filter_changed" for ev in events
        )

    def test_create_emits_audit_row(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="audited")
        resp = client.get(
            "/api/v1/audit-trail?surface=irb_manager&event_type=created",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        events = resp.json()["items"]
        assert any(
            ev["target_id"] == f["id"]
            and ev["action"] == "irb_manager.created"
            for ev in events
        )

    def test_amendment_emits_audit_row(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        f = _create(client, auth_headers["clinician"])
        client.post(
            f"/api/v1/irb/protocols/{f['id']}/amendments",
            json={
                "amendment_type": "protocol_change",
                "description": "x",
                "reason": "y",
            },
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            "/api/v1/audit-trail?surface=irb_manager&event_type=amended",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        events = resp.json()["items"]
        assert any(
            ev["target_id"] == f["id"]
            and ev["action"] == "irb_manager.amended"
            for ev in events
        )
