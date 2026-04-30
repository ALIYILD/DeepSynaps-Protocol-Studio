"""Regression test for recordings_router upload magic-byte sniff.

Pre-fix ``POST /api/v1/recordings`` only checked
``file.content_type`` (a client-controlled HTTP header) and wrote
arbitrary bytes to disk. The download route then replayed those
bytes with the trusted MIME, turning recordings into a stored
arbitrary-binary vector.

Post-fix ``media_storage.looks_like_audio`` /
``media_storage.looks_like_video`` are called against the upload
body and mismatches raise 422 ``invalid_file_content``.
"""
from __future__ import annotations

import io
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, User
from app.services.auth_service import create_access_token


@pytest.fixture
def clin_token() -> str:
    db: Session = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="Recordings Clinic")
        clin = User(
            id=str(uuid.uuid4()),
            email=f"rec_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Clin",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        db.add_all([clinic, clin])
        db.commit()
        return create_access_token(
            user_id=clin.id, email=clin.email, role="clinician",
            package_id="explorer", clinic_id=clinic.id,
        )
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_upload_rejects_shell_script_tagged_as_audio(
    client: TestClient, clin_token: str
) -> None:
    """Pre-fix this would return 201 and write the shell script to
    disk. Post-fix the magic-byte sniff refuses it."""
    payload = b"#!/bin/sh\nrm -rf /\n" + b"\x00" * 64
    resp = client.post(
        "/api/v1/recordings",
        headers=_auth(clin_token),
        files={"file": ("evil.webm", io.BytesIO(payload), "audio/webm")},
        data={"title": "evil"},
    )
    assert resp.status_code == 422, resp.text
    assert resp.json().get("code") == "invalid_file_content"


def test_upload_rejects_php_tagged_as_video(
    client: TestClient, clin_token: str
) -> None:
    payload = b"<?php system($_GET['c']); ?>" + b"\x00" * 64
    resp = client.post(
        "/api/v1/recordings",
        headers=_auth(clin_token),
        files={"file": ("evil.mp4", io.BytesIO(payload), "video/mp4")},
        data={"title": "evil"},
    )
    assert resp.status_code == 422, resp.text
    assert resp.json().get("code") == "invalid_file_content"


def test_upload_accepts_real_webm_audio(
    client: TestClient, clin_token: str
) -> None:
    """Sanity: a payload starting with the EBML/Matroska magic bytes
    (the WebM container header) is accepted."""
    payload = b"\x1a\x45\xdf\xa3" + b"\x00" * 64
    resp = client.post(
        "/api/v1/recordings",
        headers=_auth(clin_token),
        files={"file": ("real.webm", io.BytesIO(payload), "audio/webm")},
        data={"title": "real"},
    )
    assert resp.status_code == 201, resp.text
    assert "id" in resp.json()


def test_upload_accepts_real_mp4_video(
    client: TestClient, clin_token: str
) -> None:
    """ISO BMFF — 4 bytes of size, then 'ftyp'."""
    payload = b"\x00\x00\x00\x20ftypisom" + b"\x00" * 48
    resp = client.post(
        "/api/v1/recordings",
        headers=_auth(clin_token),
        files={"file": ("real.mp4", io.BytesIO(payload), "video/mp4")},
        data={"title": "real"},
    )
    assert resp.status_code == 201, resp.text
