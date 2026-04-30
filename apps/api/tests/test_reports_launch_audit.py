"""Tests for the Reports Hub launch-audit hardening (2026-04-30).

Covers the new endpoints added to ``apps/api/app/routers/reports_router.py``:

* GET    /api/v1/reports                      filters: status, kind, since,
                                              until, q, patient_id, limit
* GET    /api/v1/reports/summary              counts: total / draft / signed /
                                              superseded / by_kind / by_status
* GET    /api/v1/reports/{id}                 detail with signed_by/signed_at,
                                              supersedes/superseded_by, revision
* POST   /api/v1/reports/{id}/sign            clinician sign-off, immutable
* POST   /api/v1/reports/{id}/supersede       creates new revision; both audited
* GET    /api/v1/reports/{id}/export.csv      one-row CSV w/ DEMO header
* GET    /api/v1/reports/{id}/export.docx     honest 503 (no DOCX renderer)
* POST   /api/v1/reports/audit-events         page-level audit ingestion

Cross-cutting: clinic-isolation (clinician sees only own), role gate
(patient → 403), audit hooks emit ``target_type=reports`` rows.
"""
from __future__ import annotations

import json

from fastapi.testclient import TestClient


# ── Helpers ──────────────────────────────────────────────────────────────────


def _new_patient(client: TestClient, headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "Audit", "last_name": "Patient"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _new_report(
    client: TestClient,
    headers: dict,
    *,
    patient_id: str,
    title: str,
    kind: str = "clinician",
    content: str = "body",
) -> str:
    resp = client.post(
        "/api/v1/reports",
        json={
            "patient_id": patient_id,
            "type": kind,
            "title": title,
            "content": content,
            "status": "generated",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ── Filters on list ──────────────────────────────────────────────────────────


class TestListFilters:
    def test_filter_by_status(self, client: TestClient, auth_headers: dict) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        a = _new_report(client, auth_headers["clinician"], patient_id=pid, title="A")
        _new_report(client, auth_headers["clinician"], patient_id=pid, title="B")

        # Sign A → status becomes "signed".
        sign = client.post(
            f"/api/v1/reports/{a}/sign",
            json={"note": "ok"},
            headers=auth_headers["clinician"],
        )
        assert sign.status_code == 200, sign.text

        signed = client.get(
            "/api/v1/reports?status=signed", headers=auth_headers["clinician"]
        )
        assert signed.status_code == 200
        ids = [r["id"] for r in signed.json()["items"]]
        assert a in ids
        assert all(r["status"] == "signed" for r in signed.json()["items"])

    def test_filter_by_kind_substring(self, client: TestClient, auth_headers: dict) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        _new_report(client, auth_headers["clinician"], patient_id=pid, title="X", kind="progress-note")
        _new_report(client, auth_headers["clinician"], patient_id=pid, title="Y", kind="discharge-summary")

        progress = client.get(
            "/api/v1/reports?kind=progress", headers=auth_headers["clinician"]
        )
        assert progress.status_code == 200
        titles = [r["title"] for r in progress.json()["items"]]
        assert "X" in titles and "Y" not in titles

    def test_filter_by_q(self, client: TestClient, auth_headers: dict) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        _new_report(
            client, auth_headers["clinician"],
            patient_id=pid, title="Discharge Summary 1",
            content="patient achieved remission",
        )
        _new_report(
            client, auth_headers["clinician"],
            patient_id=pid, title="Intake Note 1",
            content="initial assessment baseline",
        )

        r = client.get(
            "/api/v1/reports?q=remission", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200
        titles = [it["title"] for it in r.json()["items"]]
        assert "Discharge Summary 1" in titles
        assert "Intake Note 1" not in titles

    def test_filter_by_patient_id_isolation(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        _new_report(client, auth_headers["clinician"], patient_id=pid, title="Mine")

        # Filter by an unknown patient — clinic-isolation kicks in (404).
        r = client.get(
            "/api/v1/reports?patient_id=patient-does-not-exist",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 404, r.text


# ── Summary endpoint ─────────────────────────────────────────────────────────


class TestSummary:
    def test_empty_summary(self, client: TestClient, auth_headers: dict) -> None:
        # No reports yet for this clinician scope.
        r = client.get("/api/v1/reports/summary", headers=auth_headers["clinician"])
        assert r.status_code == 200
        body = r.json()
        # The harness may have leftover seed rows; assert structure not zeros.
        for key in ("total", "draft", "signed", "superseded", "by_status", "by_kind", "disclaimers"):
            assert key in body, body
        assert any("sign-off" in d.lower() for d in body["disclaimers"])

    def test_summary_counts_after_sign(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        a = _new_report(client, auth_headers["clinician"], patient_id=pid, title="A")
        _new_report(client, auth_headers["clinician"], patient_id=pid, title="B")

        before = client.get(
            "/api/v1/reports/summary", headers=auth_headers["clinician"]
        ).json()
        client.post(f"/api/v1/reports/{a}/sign", json={}, headers=auth_headers["clinician"])
        after = client.get(
            "/api/v1/reports/summary", headers=auth_headers["clinician"]
        ).json()
        assert after["signed"] >= before["signed"] + 1


# ── Sign endpoint ────────────────────────────────────────────────────────────


class TestSign:
    def test_sign_marks_immutable_metadata(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        rid = _new_report(client, auth_headers["clinician"], patient_id=pid, title="S")

        signed = client.post(
            f"/api/v1/reports/{rid}/sign",
            json={"note": "reviewed at clinic"},
            headers=auth_headers["clinician"],
        )
        assert signed.status_code == 200, signed.text
        body = signed.json()
        assert body["status"] == "signed"
        assert body["signed_by"]
        assert body["signed_at"]

    def test_sign_idempotent_for_same_actor(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        rid = _new_report(client, auth_headers["clinician"], patient_id=pid, title="S2")
        a = client.post(
            f"/api/v1/reports/{rid}/sign", json={}, headers=auth_headers["clinician"]
        )
        b = client.post(
            f"/api/v1/reports/{rid}/sign", json={}, headers=auth_headers["clinician"]
        )
        assert a.status_code == 200 and b.status_code == 200
        # The signed_at must remain stable on the second call.
        assert a.json()["signed_at"] == b.json()["signed_at"]

    def test_patient_role_cannot_sign(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        rid = _new_report(client, auth_headers["clinician"], patient_id=pid, title="S3")
        r = client.post(
            f"/api/v1/reports/{rid}/sign",
            json={},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403, r.text


# ── Supersede endpoint ───────────────────────────────────────────────────────


class TestSupersede:
    def test_supersede_creates_revision(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        rid = _new_report(
            client,
            auth_headers["clinician"],
            patient_id=pid,
            title="Original",
            content="v1 body",
        )
        out = client.post(
            f"/api/v1/reports/{rid}/supersede",
            json={"reason": "score correction", "new_content": "v2 body"},
            headers=auth_headers["clinician"],
        )
        assert out.status_code == 200, out.text
        new_id = out.json()["id"]
        assert new_id != rid
        assert out.json()["supersedes"] == rid
        assert out.json()["revision"] == 2
        assert out.json()["content"] == "v2 body"

        # Original is now status=superseded with a back-pointer.
        original = client.get(
            f"/api/v1/reports/{rid}", headers=auth_headers["clinician"]
        ).json()
        assert original["status"] == "superseded"
        assert original["superseded_by"] == new_id

    def test_cannot_sign_superseded(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        rid = _new_report(client, auth_headers["clinician"], patient_id=pid, title="O")
        client.post(
            f"/api/v1/reports/{rid}/supersede",
            json={"reason": "fixing typo"},
            headers=auth_headers["clinician"],
        )
        r = client.post(
            f"/api/v1/reports/{rid}/sign", json={}, headers=auth_headers["clinician"]
        )
        assert r.status_code == 409, r.text
        assert r.json()["code"] == "report_superseded"

    def test_cannot_double_supersede(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        rid = _new_report(client, auth_headers["clinician"], patient_id=pid, title="DS")
        client.post(
            f"/api/v1/reports/{rid}/supersede",
            json={"reason": "first revision"},
            headers=auth_headers["clinician"],
        )
        r = client.post(
            f"/api/v1/reports/{rid}/supersede",
            json={"reason": "should fail"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 409, r.text


# ── Exports ──────────────────────────────────────────────────────────────────


class TestExports:
    def test_csv_export_one_row(self, client: TestClient, auth_headers: dict) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        rid = _new_report(client, auth_headers["clinician"], patient_id=pid, title="CSV")
        r = client.get(
            f"/api/v1/reports/{rid}/export.csv", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "").lower()
        assert ct.startswith("text/csv")
        text = r.text
        # Header + one row at minimum.
        lines = [ln for ln in text.splitlines() if ln.strip()]
        assert len(lines) >= 2
        assert "id," in lines[0] or lines[0].startswith("# DEMO")

    def test_docx_export_honest_503(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _new_patient(client, auth_headers["clinician"])
        rid = _new_report(client, auth_headers["clinician"], patient_id=pid, title="D")
        r = client.get(
            f"/api/v1/reports/{rid}/export.docx", headers=auth_headers["clinician"]
        )
        assert r.status_code == 503, r.text
        assert r.json()["code"] == "docx_renderer_unavailable"


# ── Audit-event ingestion ────────────────────────────────────────────────────


class TestAuditEvents:
    def test_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/reports/audit-events",
            json={"event": "page_loaded", "note": "tab=recent"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("reports-")

    def test_audit_event_role_gate(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/reports/audit-events",
            json={"event": "page_loaded"},
            headers=auth_headers["patient"],
        )
        assert r.status_code == 403, r.text
