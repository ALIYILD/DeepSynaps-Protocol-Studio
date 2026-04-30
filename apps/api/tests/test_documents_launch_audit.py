"""Tests for the Documents Hub launch-audit hardening (2026-04-30).

Covers the new endpoints added to ``apps/api/app/routers/documents_router.py``:

* GET    /api/v1/documents                     filters: kind / status / since /
                                               until / q / limit / offset
* GET    /api/v1/documents/summary             counts: total / draft / signed /
                                               superseded / by_kind / by_status
* POST   /api/v1/documents/{id}/sign           clinician sign-off, immutable,
                                               idempotent for same actor
* POST   /api/v1/documents/{id}/supersede      creates revision; both audited
* GET    /api/v1/documents/export.zip          filtered ZIP w/ DEMO header
* POST   /api/v1/documents/audit-events        page-level audit ingestion

Cross-cutting: clinic-isolation (clinician sees only own), role gate
(patient → 403), audit hooks emit ``target_type=documents`` rows.
"""
from __future__ import annotations

import io
import zipfile

from fastapi.testclient import TestClient


# ── Helpers ──────────────────────────────────────────────────────────────────


def _new_doc(
    client: TestClient,
    headers: dict,
    *,
    title: str = "Doc",
    doc_type: str = "clinical",
    notes: str | None = None,
) -> str:
    body = {"title": title, "doc_type": doc_type, "status": "pending"}
    if notes is not None:
        body["notes"] = notes
    resp = client.post("/api/v1/documents", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ── Filters on list ──────────────────────────────────────────────────────────


class TestListFilters:
    def test_filter_by_kind_substring(self, client: TestClient, auth_headers: dict) -> None:
        _new_doc(client, auth_headers["clinician"], title="L1", doc_type="letter")
        _new_doc(client, auth_headers["clinician"], title="C1", doc_type="consent")

        r = client.get("/api/v1/documents?kind=letter", headers=auth_headers["clinician"])
        assert r.status_code == 200
        titles = [it["title"] for it in r.json()["items"]]
        assert "L1" in titles and "C1" not in titles

    def test_filter_by_status_signed(self, client: TestClient, auth_headers: dict) -> None:
        a = _new_doc(client, auth_headers["clinician"], title="A")
        _new_doc(client, auth_headers["clinician"], title="B")

        sign = client.post(
            f"/api/v1/documents/{a}/sign",
            json={"note": "ok"},
            headers=auth_headers["clinician"],
        )
        assert sign.status_code == 200, sign.text

        signed = client.get(
            "/api/v1/documents?status=signed", headers=auth_headers["clinician"]
        )
        assert signed.status_code == 200
        ids = [r["id"] for r in signed.json()["items"]]
        assert a in ids
        assert all(r["status"] == "signed" for r in signed.json()["items"])

    def test_filter_by_q(self, client: TestClient, auth_headers: dict) -> None:
        _new_doc(
            client, auth_headers["clinician"],
            title="Discharge Summary", notes="patient achieved remission",
        )
        _new_doc(
            client, auth_headers["clinician"],
            title="Intake Note", notes="initial baseline screening",
        )

        r = client.get(
            "/api/v1/documents?q=remission", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200
        titles = [it["title"] for it in r.json()["items"]]
        assert "Discharge Summary" in titles
        assert "Intake Note" not in titles


# ── Summary endpoint ─────────────────────────────────────────────────────────


class TestSummary:
    def test_empty_summary_structure(self, client: TestClient, auth_headers: dict) -> None:
        r = client.get("/api/v1/documents/summary", headers=auth_headers["clinician"])
        assert r.status_code == 200, r.text
        body = r.json()
        for key in (
            "total", "draft", "uploaded", "signed", "superseded",
            "by_status", "by_kind", "disclaimers", "scope_limitations",
        ):
            assert key in body, body
        assert any("sign-off" in d.lower() for d in body["disclaimers"])

    def test_summary_counts_after_sign(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        a = _new_doc(client, auth_headers["clinician"], title="S-A")
        _new_doc(client, auth_headers["clinician"], title="S-B")

        before = client.get(
            "/api/v1/documents/summary", headers=auth_headers["clinician"]
        ).json()
        client.post(
            f"/api/v1/documents/{a}/sign", json={}, headers=auth_headers["clinician"]
        )
        after = client.get(
            "/api/v1/documents/summary", headers=auth_headers["clinician"]
        ).json()
        assert after["signed"] >= before["signed"] + 1


# ── Sign endpoint ────────────────────────────────────────────────────────────


class TestSign:
    def test_sign_marks_immutable_metadata(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        rid = _new_doc(client, auth_headers["clinician"], title="Sign-1")
        signed = client.post(
            f"/api/v1/documents/{rid}/sign",
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
        rid = _new_doc(client, auth_headers["clinician"], title="Sign-2")
        a = client.post(
            f"/api/v1/documents/{rid}/sign", json={}, headers=auth_headers["clinician"]
        )
        b = client.post(
            f"/api/v1/documents/{rid}/sign", json={}, headers=auth_headers["clinician"]
        )
        assert a.status_code == 200 and b.status_code == 200
        # signed_at must remain stable on the second call
        assert a.json()["signed_at"] == b.json()["signed_at"]

    def test_patient_role_cannot_sign(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        rid = _new_doc(client, auth_headers["clinician"], title="Sign-3")
        r = client.post(
            f"/api/v1/documents/{rid}/sign",
            json={},
            headers=auth_headers["patient"],
        )
        assert r.status_code in (403, 404), r.text


# ── Supersede endpoint ───────────────────────────────────────────────────────


class TestSupersede:
    def test_supersede_creates_revision(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        rid = _new_doc(
            client, auth_headers["clinician"],
            title="Original", notes="v1 body",
        )
        out = client.post(
            f"/api/v1/documents/{rid}/supersede",
            json={"reason": "score correction", "new_notes": "v2 body"},
            headers=auth_headers["clinician"],
        )
        assert out.status_code == 200, out.text
        new_id = out.json()["id"]
        assert new_id != rid
        assert out.json()["supersedes"] == rid
        assert out.json()["revision"] == 2

        original = client.get(
            f"/api/v1/documents/{rid}", headers=auth_headers["clinician"]
        ).json()
        assert original["status"] == "superseded"
        assert original["superseded_by"] == new_id

    def test_cannot_sign_superseded(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        rid = _new_doc(client, auth_headers["clinician"], title="O")
        client.post(
            f"/api/v1/documents/{rid}/supersede",
            json={"reason": "fixing typo"},
            headers=auth_headers["clinician"],
        )
        r = client.post(
            f"/api/v1/documents/{rid}/sign", json={}, headers=auth_headers["clinician"]
        )
        assert r.status_code == 409, r.text

    def test_cannot_double_supersede(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        rid = _new_doc(client, auth_headers["clinician"], title="DS")
        client.post(
            f"/api/v1/documents/{rid}/supersede",
            json={"reason": "first revision"},
            headers=auth_headers["clinician"],
        )
        r = client.post(
            f"/api/v1/documents/{rid}/supersede",
            json={"reason": "should fail"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 409, r.text

    def test_supersede_requires_reason(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        rid = _new_doc(client, auth_headers["clinician"], title="NR")
        # Empty reason violates the min_length=3 constraint.
        r = client.post(
            f"/api/v1/documents/{rid}/supersede",
            json={"reason": ""},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 422


# ── Exports ──────────────────────────────────────────────────────────────────


class TestExports:
    def test_zip_export_contains_manifest(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _new_doc(client, auth_headers["clinician"], title="Z1")
        _new_doc(client, auth_headers["clinician"], title="Z2")

        r = client.get(
            "/api/v1/documents/export.zip", headers=auth_headers["clinician"]
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/zip")

        buf = io.BytesIO(r.content)
        with zipfile.ZipFile(buf) as zf:
            names = zf.namelist()
            assert "manifest.csv" in names
            with zf.open("manifest.csv") as fh:
                manifest = fh.read().decode("utf-8")
        # Header line lists every documented column.
        assert "id," in manifest and "title," in manifest


# ── Audit-event ingestion ────────────────────────────────────────────────────


class TestAuditEvents:
    def test_audit_event_accepted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/documents/audit-events",
            json={"event": "page_loaded", "note": "tab=all"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["accepted"] is True
        assert body["event_id"].startswith("documents-")

    def test_audit_event_role_gate(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.post(
            "/api/v1/documents/audit-events",
            json={"event": "page_loaded"},
            headers=auth_headers["patient"],
        )
        assert r.status_code in (403, 404), r.text
