"""Documents router — CRUD + multipart upload + download."""
from __future__ import annotations

import io
from pathlib import Path

from fastapi.testclient import TestClient


def _create(client: TestClient, auth_headers: dict, **overrides) -> dict:
    body = {"title": "Test Doc", "doc_type": "clinical", "status": "pending"}
    body.update(overrides)
    resp = client.post("/api/v1/documents", json=body, headers=auth_headers["clinician"])
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestDocumentCrud:
    def test_list_empty(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/documents", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}

    def test_create_and_get(self, client: TestClient, auth_headers: dict) -> None:
        doc = _create(client, auth_headers, title="GP Letter", doc_type="generated", notes="draft text")
        assert doc["title"] == "GP Letter"
        assert doc["doc_type"] == "generated"
        assert doc["notes"] == "draft text"
        assert doc["file_ref"] is None
        resp = client.get(f"/api/v1/documents/{doc['id']}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["id"] == doc["id"]

    def test_list_filters_by_patient(self, client: TestClient, auth_headers: dict) -> None:
        _create(client, auth_headers, title="A", patient_id="p-1")
        _create(client, auth_headers, title="B", patient_id="p-2")
        _create(client, auth_headers, title="C")  # unpatient
        resp = client.get("/api/v1/documents?patient_id=p-1", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        titles = [i["title"] for i in resp.json()["items"]]
        assert titles == ["A"]

    def test_patch_updates_status_and_notes(self, client: TestClient, auth_headers: dict) -> None:
        doc = _create(client, auth_headers)
        resp = client.patch(
            f"/api/v1/documents/{doc['id']}",
            json={"status": "completed", "notes": "signed on portal", "signed_at": "2026-04-19T10:00:00Z"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        j = resp.json()
        assert j["status"] == "completed"
        assert j["notes"] == "signed on portal"
        assert j["signed_at"] == "2026-04-19T10:00:00Z"

    def test_delete(self, client: TestClient, auth_headers: dict) -> None:
        doc = _create(client, auth_headers)
        r = client.delete(f"/api/v1/documents/{doc['id']}", headers=auth_headers["clinician"])
        assert r.status_code == 204
        r = client.get(f"/api/v1/documents/{doc['id']}", headers=auth_headers["clinician"])
        assert r.status_code == 404

    def test_clinician_scope_isolation(self, client: TestClient, auth_headers: dict) -> None:
        _create(client, auth_headers, title="Mine")
        resp = client.get("/api/v1/documents", headers=auth_headers["admin"])
        assert resp.status_code == 200
        assert all(d["title"] != "Mine" for d in resp.json()["items"])


class TestDocumentUploadDownload:
    def test_upload_creates_record_with_file_ref(
        self, client: TestClient, auth_headers: dict, tmp_path: Path, monkeypatch
    ) -> None:
        # Redirect storage root to a temp dir so the test doesn't pollute repo.
        from app.settings import get_settings
        settings = get_settings()
        monkeypatch.setattr(settings, "media_storage_root", str(tmp_path))

        payload = b"%PDF-1.4 fake pdf bytes for test"
        files = {"file": ("intake.pdf", io.BytesIO(payload), "application/pdf")}
        data = {"title": "Intake Form", "doc_type": "uploaded", "patient_id": "p-42"}
        resp = client.post(
            "/api/v1/documents/upload",
            files=files,
            data=data,
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201, resp.text
        j = resp.json()
        assert j["title"] == "Intake Form"
        assert j["doc_type"] == "uploaded"
        assert j["patient_id"] == "p-42"
        assert j["status"] == "uploaded"
        assert j["file_ref"] and j["file_ref"].startswith("documents/")
        # File actually landed on disk under the storage root.
        stored = tmp_path / j["file_ref"]
        assert stored.is_file()
        assert stored.read_bytes() == payload

    def test_upload_rejects_disallowed_mime(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        files = {"file": ("evil.exe", io.BytesIO(b"MZ\x90\x00"), "application/x-msdownload")}
        resp = client.post(
            "/api/v1/documents/upload",
            files=files,
            data={"title": "bad"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422

    def test_upload_rejects_empty_file(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        files = {"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")}
        resp = client.post(
            "/api/v1/documents/upload",
            files=files,
            data={"title": "empty"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422

    def test_download_streams_uploaded_file(
        self, client: TestClient, auth_headers: dict, tmp_path: Path, monkeypatch
    ) -> None:
        from app.settings import get_settings
        settings = get_settings()
        monkeypatch.setattr(settings, "media_storage_root", str(tmp_path))

        payload = b"plaintext doc body"
        files = {"file": ("note.txt", io.BytesIO(payload), "text/plain")}
        up = client.post(
            "/api/v1/documents/upload",
            files=files,
            data={"title": "Session Note"},
            headers=auth_headers["clinician"],
        )
        assert up.status_code == 201, up.text
        doc_id = up.json()["id"]

        dl = client.get(f"/api/v1/documents/{doc_id}/download", headers=auth_headers["clinician"])
        assert dl.status_code == 200
        assert dl.content == payload

    def test_download_404_for_record_without_file(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Create a doc via JSON (no upload), then attempt download.
        doc = _create(client, auth_headers, title="Metadata Only")
        resp = client.get(f"/api/v1/documents/{doc['id']}/download", headers=auth_headers["clinician"])
        assert resp.status_code == 404
