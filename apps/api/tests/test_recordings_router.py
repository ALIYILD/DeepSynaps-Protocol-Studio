"""Tests for recordings_router — set D (PR 76/N).

Covers:
  - GET    /api/v1/recordings            (list)
  - POST   /api/v1/recordings            (upload)
  - GET    /api/v1/recordings/{id}/file  (stream)
  - DELETE /api/v1/recordings/{id}       (delete)

Auth, role gates, MIME validation, empty list, 404, 422.
"""
from __future__ import annotations

import io
import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import SessionRecording


# ── helpers ───────────────────────────────────────────────────────────────────


# Minimal magic bytes for test uploads that pass media_storage validation.
# WebM audio: 0x1A 0x45 0xDF 0xA3
_WEBM_MAGIC = b"\x1a\x45\xdf\xa3" + b"\x00" * 100


def _seed_recording(
    *,
    owner_clinician_id: str = "actor-clinician-demo",
    title: str = "Test Recording",
    mime_type: str = "audio/webm",
    tmp_path,
) -> str:
    """Write a real file + DB row and return the recording id."""
    from app.settings import get_settings
    from pathlib import Path

    rid = str(uuid.uuid4())
    settings = get_settings()
    owner_dir = Path(settings.media_storage_root) / "recordings" / owner_clinician_id
    owner_dir.mkdir(parents=True, exist_ok=True)
    file_path = owner_dir / rid
    file_path.write_bytes(_WEBM_MAGIC)

    db = SessionLocal()
    try:
        db.add(SessionRecording(
            id=rid,
            owner_clinician_id=owner_clinician_id,
            patient_id=None,
            title=title,
            file_path=f"recordings/{owner_clinician_id}/{rid}",
            mime_type=mime_type,
            byte_size=len(_WEBM_MAGIC),
            duration_seconds=None,
        ))
        db.commit()
    finally:
        db.close()
    return rid


# ── GET /recordings ───────────────────────────────────────────────────────────


def test_list_recordings_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/recordings")
    assert r.status_code == 403


def test_list_recordings_patient_is_403(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/recordings", headers=auth_headers["patient"])
    assert r.status_code == 403


def test_list_recordings_empty_db(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/recordings", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


# ── POST /recordings ──────────────────────────────────────────────────────────


def test_upload_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/api/v1/recordings",
        files={"file": ("test.webm", io.BytesIO(_WEBM_MAGIC), "audio/webm")},
    )
    assert r.status_code == 403


def test_upload_invalid_mime_is_422(client: TestClient, auth_headers: dict) -> None:
    """Text/plain is not an allowed audio/video MIME type."""
    r = client.post(
        "/api/v1/recordings",
        files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422


def test_upload_empty_file_is_422(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/recordings",
        files={"file": ("test.webm", io.BytesIO(b""), "audio/webm")},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422


def test_upload_content_mismatch_is_422(client: TestClient, auth_headers: dict) -> None:
    """Declare audio/webm but send random bytes that don't look like WebM."""
    r = client.post(
        "/api/v1/recordings",
        files={"file": ("test.webm", io.BytesIO(b"NOTWEBM" + b"\x00" * 100), "audio/webm")},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 422


def test_upload_happy_path(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/recordings",
        files={"file": ("session.webm", io.BytesIO(_WEBM_MAGIC), "audio/webm")},
        data={"title": "My Session"},
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 201
    body = r.json()
    assert "id" in body


def test_upload_then_list(client: TestClient, auth_headers: dict) -> None:
    client.post(
        "/api/v1/recordings",
        files={"file": ("session.webm", io.BytesIO(_WEBM_MAGIC), "audio/webm")},
        headers=auth_headers["clinician"],
    )
    r = client.get("/api/v1/recordings", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.json()["total"] >= 1


# ── GET /recordings/{id}/file ─────────────────────────────────────────────────


def test_stream_missing_recording_is_404(client: TestClient, auth_headers: dict, tmp_path) -> None:
    r = client.get(
        "/api/v1/recordings/non-existent-id/file",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404


# ── DELETE /recordings/{id} ───────────────────────────────────────────────────


def test_delete_missing_recording_is_404(client: TestClient, auth_headers: dict) -> None:
    r = client.delete(
        "/api/v1/recordings/non-existent-id",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404


def test_delete_requires_auth(client: TestClient) -> None:
    r = client.delete("/api/v1/recordings/some-id")
    assert r.status_code == 403


def test_upload_and_delete_round_trip(client: TestClient, auth_headers: dict) -> None:
    upload = client.post(
        "/api/v1/recordings",
        files={"file": ("session.webm", io.BytesIO(_WEBM_MAGIC), "audio/webm")},
        data={"title": "Round trip"},
        headers=auth_headers["clinician"],
    )
    assert upload.status_code == 201
    rid = upload.json()["id"]

    delete = client.delete(f"/api/v1/recordings/{rid}", headers=auth_headers["clinician"])
    assert delete.status_code == 204

    # After deletion the row is gone.
    after = client.get("/api/v1/recordings", headers=auth_headers["clinician"])
    ids = [item["id"] for item in after.json()["items"]]
    assert rid not in ids
