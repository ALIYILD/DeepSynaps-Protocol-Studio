"""Tests for the Quality Assurance launch-audit hardening (2026-04-30).

Covers the new findings register endpoints in
``apps/api/app/routers/quality_assurance_router.py``:

* GET    /api/v1/qa/findings                          (filters)
* GET    /api/v1/qa/findings/summary
* GET    /api/v1/qa/findings/export.csv
* GET    /api/v1/qa/findings/export.ndjson
* GET    /api/v1/qa/findings/{id}
* POST   /api/v1/qa/findings
* PATCH  /api/v1/qa/findings/{id}
* POST   /api/v1/qa/findings/{id}/close
* POST   /api/v1/qa/findings/{id}/reopen
* POST   /api/v1/qa/findings/audit-events

Cross-cutting checks: clinic-isolation, role gate, immutability of closed
findings, real-user CAPA owner enforcement, demo flag prefixing exports,
and audit-event surface attribution.
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
    title: str = "Documentation gap",
    finding_type: str = "documentation_gap",
    severity: str = "minor",
    owner_id: str | None = None,
    capa_text: str | None = None,
    capa_due_date: str | None = None,
    source_target_type: str | None = None,
    source_target_id: str | None = None,
    description: str = "",
    is_demo: bool = False,
) -> dict:
    body = {
        "title": title,
        "finding_type": finding_type,
        "severity": severity,
        "owner_id": owner_id,
        "capa_text": capa_text,
        "capa_due_date": capa_due_date,
        "source_target_type": source_target_type,
        "source_target_id": source_target_id,
        "description": description,
        "is_demo": is_demo,
    }
    body = {k: v for k, v in body.items() if v is not None}
    resp = client.post("/api/v1/qa/findings", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Role gating ──────────────────────────────────────────────────────────────


class TestRoleGate:
    def test_guest_forbidden(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get("/api/v1/qa/findings", headers=auth_headers["guest"])
        assert resp.status_code == 403
        body = resp.json()
        assert body["code"] == "insufficient_role"

    def test_patient_forbidden(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get("/api/v1/qa/findings", headers=auth_headers["patient"])
        assert resp.status_code == 403

    def test_clinician_allowed(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get("/api/v1/qa/findings", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body and "total" in body
        # Honest disclaimers always present on the list.
        assert any("immutable" in d.lower() for d in body["disclaimers"])

    def test_admin_allowed(
        self, client: TestClient, auth_headers: dict[str, dict[str, str]]
    ) -> None:
        resp = client.get("/api/v1/qa/findings", headers=auth_headers["admin"])
        assert resp.status_code == 200


# ── Create / list / detail ───────────────────────────────────────────────────


class TestCreateAndList:
    def test_create_minimal(self, client: TestClient, auth_headers: dict) -> None:
        body = _create(
            client, auth_headers["clinician"],
            title="Consent re-attestation gap",
            finding_type="documentation_gap",
            severity="major",
        )
        assert body["title"] == "Consent re-attestation gap"
        assert body["status"] == "open"
        assert body["severity"] == "major"
        assert body["reporter_id"] == "actor-clinician-demo"
        assert body["revision_count"] >= 1
        assert body["payload_hash"] and len(body["payload_hash"]) == 16

    def test_list_returns_created(self, client: TestClient, auth_headers: dict) -> None:
        a = _create(client, auth_headers["clinician"], title="A")
        b = _create(client, auth_headers["clinician"], title="B", severity="critical")
        resp = client.get("/api/v1/qa/findings", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        ids = {it["id"] for it in resp.json()["items"]}
        assert a["id"] in ids and b["id"] in ids

    def test_create_invalid_finding_type(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.post(
            "/api/v1/qa/findings",
            json={"title": "x", "finding_type": "fakey"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_finding_type"

    def test_create_invalid_source_target(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.post(
            "/api/v1/qa/findings",
            json={"title": "x", "source_target_type": "made_up_surface"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_source_target_type"


# ── CAPA owner real-user enforcement ─────────────────────────────────────────


class TestOwnerValidation:
    def test_unknown_owner_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Free-form strings as owners are explicitly disallowed by the launch-
        # audit brief: "fake CAPA owners that aren't users" must be impossible.
        resp = client.post(
            "/api/v1/qa/findings",
            json={"title": "x", "owner_id": "Dr. Pretend Owner"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_capa_owner"

    def test_real_owner_accepted(self, client: TestClient, auth_headers: dict) -> None:
        body = _create(
            client, auth_headers["clinician"],
            title="real owner ok",
            owner_id="actor-admin-demo",
        )
        assert body["owner_id"] == "actor-admin-demo"


# ── Filters & summary ────────────────────────────────────────────────────────


class TestFiltersAndSummary:
    def test_filter_by_status(self, client: TestClient, auth_headers: dict) -> None:
        a = _create(client, auth_headers["clinician"], title="alpha")
        _create(client, auth_headers["clinician"], title="beta")
        # Close one
        client.post(
            f"/api/v1/qa/findings/{a['id']}/close",
            json={"note": "resolved by retraining"},
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            "/api/v1/qa/findings?status=open", headers=auth_headers["clinician"]
        )
        items = resp.json()["items"]
        assert all(it["status"] == "open" for it in items)
        assert a["id"] not in {it["id"] for it in items}

    def test_filter_by_severity(self, client: TestClient, auth_headers: dict) -> None:
        crit = _create(
            client, auth_headers["clinician"], title="crit", severity="critical"
        )
        _create(client, auth_headers["clinician"], title="minor")
        resp = client.get(
            "/api/v1/qa/findings?severity=critical", headers=auth_headers["clinician"]
        )
        ids = {it["id"] for it in resp.json()["items"]}
        assert crit["id"] in ids
        assert all(it["severity"] == "critical" for it in resp.json()["items"])

    def test_filter_by_q(self, client: TestClient, auth_headers: dict) -> None:
        a = _create(
            client, auth_headers["clinician"],
            title="Consent missing", description="patient consent not on file",
        )
        _create(
            client, auth_headers["clinician"],
            title="Other finding", description="protocol fidelity",
        )
        resp = client.get(
            "/api/v1/qa/findings?q=consent", headers=auth_headers["clinician"]
        )
        ids = {it["id"] for it in resp.json()["items"]}
        assert a["id"] in ids

    def test_filter_capa_overdue(self, client: TestClient, auth_headers: dict) -> None:
        overdue = _create(
            client, auth_headers["clinician"],
            title="overdue", capa_due_date="2020-01-01",
        )
        _create(
            client, auth_headers["clinician"],
            title="future", capa_due_date="2099-12-31",
        )
        resp = client.get(
            "/api/v1/qa/findings?capa_overdue_only=true",
            headers=auth_headers["clinician"],
        )
        ids = {it["id"] for it in resp.json()["items"]}
        assert overdue["id"] in ids
        assert all(it["capa_overdue"] for it in resp.json()["items"])

    def test_summary_counts(self, client: TestClient, auth_headers: dict) -> None:
        a = _create(client, auth_headers["clinician"], title="a", severity="major")
        b = _create(client, auth_headers["clinician"], title="b", severity="critical")
        client.post(
            f"/api/v1/qa/findings/{a['id']}/close",
            json={"note": "closed"},
            headers=auth_headers["clinician"],
        )
        resp = client.get(
            "/api/v1/qa/findings/summary", headers=auth_headers["clinician"]
        )
        assert resp.status_code == 200
        s = resp.json()
        assert s["total"] == 2
        assert s["closed"] >= 1
        assert s["open"] >= 1
        assert s["by_severity"].get("major", 0) + s["by_severity"].get("critical", 0) >= 2


# ── Patch / immutability ────────────────────────────────────────────────────


class TestPatchAndImmutability:
    def test_patch_severity(self, client: TestClient, auth_headers: dict) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        resp = client.patch(
            f"/api/v1/qa/findings/{f['id']}",
            json={"severity": "critical"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        assert resp.json()["severity"] == "critical"
        assert resp.json()["revision_count"] >= 2  # create + update

    def test_patch_status_to_closed_blocked(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        resp = client.patch(
            f"/api/v1/qa/findings/{f['id']}",
            json={"status": "closed"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "use_close_endpoint"

    def test_closed_is_immutable(self, client: TestClient, auth_headers: dict) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        client.post(
            f"/api/v1/qa/findings/{f['id']}/close",
            json={"note": "done"},
            headers=auth_headers["clinician"],
        )
        resp = client.patch(
            f"/api/v1/qa/findings/{f['id']}",
            json={"severity": "major"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 409
        assert resp.json()["code"] == "finding_immutable"


# ── Close + reopen ──────────────────────────────────────────────────────────


class TestCloseReopen:
    def test_close_requires_note(self, client: TestClient, auth_headers: dict) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        resp = client.post(
            f"/api/v1/qa/findings/{f['id']}/close",
            json={"note": "   "},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "closure_note_required"

    def test_close_then_reopen(self, client: TestClient, auth_headers: dict) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        c = client.post(
            f"/api/v1/qa/findings/{f['id']}/close",
            json={"note": "training done"},
            headers=auth_headers["clinician"],
        )
        assert c.status_code == 200
        body = c.json()
        assert body["status"] == "closed"
        assert body["closed_by"] == "actor-clinician-demo"
        assert "training" in body["closure_note"]

        r = client.post(
            f"/api/v1/qa/findings/{f['id']}/reopen",
            json={"reason": "additional issues found"},
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
            f"/api/v1/qa/findings/{f['id']}/close",
            json={"note": "done"},
            headers=auth_headers["clinician"],
        )
        r = client.post(
            f"/api/v1/qa/findings/{f['id']}/reopen",
            json={"reason": ""},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422
        assert r.json()["code"] == "reopen_reason_required"

    def test_reopen_only_closed(self, client: TestClient, auth_headers: dict) -> None:
        f = _create(client, auth_headers["clinician"], title="x")
        r = client.post(
            f"/api/v1/qa/findings/{f['id']}/reopen",
            json={"reason": "no"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 409


# ── Cross-clinic isolation ───────────────────────────────────────────────────


class TestClinicScope:
    def _seed_other_clinic(self) -> str:
        """Create a separate clinic + clinician and a finding owned by them."""
        from app.database import SessionLocal
        from app.persistence.models import Clinic, QualityFinding, User
        import uuid as _uuid

        db = SessionLocal()
        try:
            other_clinic_id = "clinic-other"
            if db.query(Clinic).filter_by(id=other_clinic_id).first() is None:
                db.add(Clinic(id=other_clinic_id, name="Other Clinic"))
            other_user_id = "actor-other-clinician"
            if db.query(User).filter_by(id=other_user_id).first() is None:
                db.add(
                    User(
                        id=other_user_id,
                        email="other@example.com",
                        display_name="Other Clinician",
                        hashed_password="x",
                        role="clinician",
                        package_id="clinician_pro",
                        clinic_id=other_clinic_id,
                    )
                )
            fid = str(_uuid.uuid4())
            db.add(
                QualityFinding(
                    id=fid,
                    clinic_id=other_clinic_id,
                    title="Other clinic finding",
                    description="should be invisible to demo clinician",
                    finding_type="non_conformance",
                    severity="minor",
                    status="open",
                    reporter_id=other_user_id,
                )
            )
            db.commit()
            return fid
        finally:
            db.close()

    def test_clinician_cannot_see_other_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        fid = self._seed_other_clinic()
        resp = client.get(
            f"/api/v1/qa/findings/{fid}", headers=auth_headers["clinician"]
        )
        assert resp.status_code == 404
        assert resp.json()["code"] == "finding_not_found"

    def test_admin_can_see_other_clinic(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        fid = self._seed_other_clinic()
        resp = client.get(
            f"/api/v1/qa/findings/{fid}", headers=auth_headers["admin"]
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Other clinic finding"


# ── Exports ──────────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_columns(self, client: TestClient, auth_headers: dict) -> None:
        _create(client, auth_headers["clinician"], title="csv-row")
        resp = client.get(
            "/api/v1/qa/findings/export.csv", headers=auth_headers["clinician"]
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/csv")
        assert "filename=quality_findings.csv" in resp.headers["content-disposition"]
        body = resp.text
        # No demo rows yet → no `# DEMO` prefix.
        assert not body.startswith("# DEMO")
        reader = csv.reader(io.StringIO(body))
        header = next(reader)
        assert "id" in header and "severity" in header and "payload_hash" in header

    def test_csv_export_demo_prefix(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _create(client, auth_headers["clinician"], title="demo-row", is_demo=True)
        resp = client.get(
            "/api/v1/qa/findings/export.csv", headers=auth_headers["clinician"]
        )
        assert resp.status_code == 200
        assert resp.text.startswith("# DEMO"), resp.text[:80]
        assert resp.headers.get("X-QA-Demo-Rows") == "1"

    def test_ndjson_export_one_per_line(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        a = _create(client, auth_headers["clinician"], title="a")
        b = _create(client, auth_headers["clinician"], title="b")
        resp = client.get(
            "/api/v1/qa/findings/export.ndjson",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        lines = [ln for ln in resp.text.splitlines() if ln.strip()]
        ids = {json.loads(ln).get("id") for ln in lines if ln.startswith("{") and "_meta" not in ln}
        assert a["id"] in ids and b["id"] in ids


# ── Audit-event ingestion ────────────────────────────────────────────────────


class TestAuditEvents:
    def test_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            "/api/v1/qa/findings/audit-events",
            json={"event": "page_loaded", "note": "test"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("quality_assurance-")

    def test_audit_event_visible_in_audit_trail(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        client.post(
            "/api/v1/qa/findings/audit-events",
            json={"event": "filter_changed", "note": "status=open"},
            headers=auth_headers["clinician"],
        )
        # Audit trail filters by surface=quality_assurance — KNOWN_SURFACES
        # was extended to include quality_assurance in this same PR.
        resp = client.get(
            "/api/v1/audit-trail?surface=quality_assurance",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        events = resp.json()["items"]
        assert any(
            ev["action"] == "quality_assurance.filter_changed"
            for ev in events
        )

    def test_create_emits_audit_row(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        f = _create(client, auth_headers["clinician"], title="audited")
        resp = client.get(
            "/api/v1/audit-trail?surface=quality_assurance&event_type=created",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        events = resp.json()["items"]
        assert any(
            ev["target_id"] == f["id"]
            and ev["action"] == "quality_assurance.created"
            for ev in events
        )
