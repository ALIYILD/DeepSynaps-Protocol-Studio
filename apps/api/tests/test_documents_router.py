"""Documents router — CRUD + multipart upload + download."""
from __future__ import annotations

import io
import json
from pathlib import Path

from fastapi.testclient import TestClient


def _create_patient(client: TestClient, auth_headers: dict, patient_id: str = "doc-patient-1") -> str:
    from app.database import SessionLocal
    from app.persistence.models import Patient

    with SessionLocal() as db:
        if db.query(Patient).filter_by(id=patient_id).first() is None:
            db.add(
                Patient(
                    id=patient_id,
                    clinician_id="actor-clinician-demo",
                    first_name="Doc",
                    last_name="Patient",
                    email=f"{patient_id}@example.com",
                    status="active",
                )
            )
            db.commit()
    return patient_id


def _create(client: TestClient, auth_headers: dict, **overrides) -> dict:
    body = {"title": "Test Doc", "doc_type": "clinical", "status": "pending"}
    body.update(overrides)
    resp = client.post("/api/v1/documents", json=body, headers=auth_headers["clinician"])
    assert resp.status_code == 201, resp.text
    return resp.json()


def _load_doc_meta(doc_id: str) -> dict:
    from app.database import SessionLocal
    from app.persistence.models import FormDefinition

    with SessionLocal() as db:
        record = db.query(FormDefinition).filter_by(id=doc_id).one()
        return json.loads(record.questions_json or "{}")


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
        patient_one = _create_patient(client, auth_headers, "doc-patient-1")
        patient_two = _create_patient(client, auth_headers, "doc-patient-2")
        _create(client, auth_headers, title="A", patient_id=patient_one)
        _create(client, auth_headers, title="B", patient_id=patient_two)
        _create(client, auth_headers, title="C")  # unpatient
        resp = client.get(f"/api/v1/documents?patient_id={patient_one}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        titles = [i["title"] for i in resp.json()["items"]]
        assert titles == ["A"]

    def test_create_stamps_document_provenance(self, client: TestClient, auth_headers: dict) -> None:
        patient_id = _create_patient(client, auth_headers)
        doc = _create(client, auth_headers, patient_id=patient_id, notes="ready")
        meta = _load_doc_meta(doc["id"])
        assert meta["created_by_actor_id"] == "actor-clinician-demo"
        assert meta["created_by_actor_at"]
        assert meta["last_governance_event"] == "created"
        assert meta["last_governance_event_at"]
        assert meta["last_governance_event_by"] == "actor-clinician-demo"

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

    def test_patch_rejects_invalid_status(self, client: TestClient, auth_headers: dict) -> None:
        doc = _create(client, auth_headers)
        resp = client.patch(
            f"/api/v1/documents/{doc['id']}",
            json={"status": "clinician_reviewed"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422

    def test_patch_rejects_signed_at_without_signed_status(self, client: TestClient, auth_headers: dict) -> None:
        doc = _create(client, auth_headers)
        resp = client.patch(
            f"/api/v1/documents/{doc['id']}",
            json={"status": "pending", "signed_at": "2026-04-19T10:00:00Z"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422

    def test_patch_status_autostamps_signed_at(self, client: TestClient, auth_headers: dict) -> None:
        doc = _create(client, auth_headers)
        resp = client.patch(
            f"/api/v1/documents/{doc['id']}",
            json={"status": "signed"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        assert resp.json()["signed_at"] is not None
        meta = _load_doc_meta(doc["id"])
        assert meta["signed_by_actor_id"] == "actor-clinician-demo"
        assert meta["signed_recorded_at"]
        assert meta["status_updated_by_actor_id"] == "actor-clinician-demo"
        assert meta["last_governance_event"] == "updated"

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
        patient_id = _create_patient(client, auth_headers)

        payload = b"%PDF-1.4 fake pdf bytes for test"
        files = {"file": ("intake.pdf", io.BytesIO(payload), "application/pdf")}
        data = {"title": "Intake Form", "doc_type": "uploaded", "patient_id": patient_id}
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
        assert j["patient_id"] == patient_id
        assert j["status"] == "uploaded"
        assert j["file_ref"] and j["file_ref"].startswith("documents/")
        # File actually landed on disk under the storage root.
        stored = tmp_path / j["file_ref"]
        assert stored.is_file()
        assert stored.read_bytes() == payload
        meta = _load_doc_meta(j["id"])
        assert meta["created_by_actor_id"] == "actor-clinician-demo"
        assert meta["last_governance_event"] == "uploaded"

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

    def test_upload_preserves_file_ref_and_mime_for_download(
        self, client: TestClient, auth_headers: dict, tmp_path: Path, monkeypatch
    ) -> None:
        """Contract test: uploaded file must round-trip with its declared MIME
        on download — this is what the structured-report renderer relies on
        when it embeds attached PDFs."""
        from app.settings import get_settings
        settings = get_settings()
        monkeypatch.setattr(settings, "media_storage_root", str(tmp_path))

        payload = b"%PDF-1.4 round-trip mime test"
        files = {"file": ("scan.pdf", io.BytesIO(payload), "application/pdf")}
        up = client.post(
            "/api/v1/documents/upload",
            files=files,
            data={"title": "Scan attachment"},
            headers=auth_headers["clinician"],
        )
        assert up.status_code == 201, up.text
        doc_id = up.json()["id"]
        assert up.json()["file_ref"].startswith("documents/")

        dl = client.get(f"/api/v1/documents/{doc_id}/download", headers=auth_headers["clinician"])
        assert dl.status_code == 200
        # MIME must round-trip — never default to octet-stream when known.
        assert dl.headers["content-type"].startswith("application/pdf")
        assert dl.content == payload
