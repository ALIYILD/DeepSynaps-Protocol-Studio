"""Session recordings router — minimal media-storage MVP."""
from __future__ import annotations

import io
from pathlib import Path

from fastapi.testclient import TestClient


def _upload(
    client: TestClient,
    auth_headers: dict,
    *,
    payload: bytes = b"\x1aE\xdf\xa3 fake webm bytes",
    filename: str = "session.webm",
    mime: str = "audio/webm",
    title: str | None = "Session 1",
    patient_id: str | None = None,
    role: str = "clinician",
) -> dict:
    files = {"file": (filename, io.BytesIO(payload), mime)}
    data = {}
    if title is not None:
        data["title"] = title
    if patient_id is not None:
        data["patient_id"] = patient_id
    resp = client.post(
        "/api/v1/recordings",
        files=files,
        data=data,
        headers=auth_headers[role],
    )
    return resp.__dict__ if False else {  # noqa: SIM300 — return both status + body
        "status": resp.status_code,
        "body": (resp.json() if resp.content else {}),
        "headers": dict(resp.headers),
    }


class TestSessionRecordingsCreateAndList:
    def test_upload_returns_id_and_writes_to_disk(
        self, client: TestClient, auth_headers: dict, tmp_path: Path, monkeypatch
    ) -> None:
        from app.settings import get_settings
        monkeypatch.setattr(get_settings(), "media_storage_root", str(tmp_path))

        # Real ISO BMFF ftyp signature so the magic-byte sniff
        # accepts the payload (introduced in PR #197/#214 to refuse
        # arbitrary binary tagged with a media MIME).
        mp4_bytes = b"\x00\x00\x00\x20ftypisom" + b"\x00" * 16
        result = _upload(
            client,
            auth_headers,
            payload=mp4_bytes,
            filename="visit.mp4",
            mime="video/mp4",
            title="Telehealth Visit",
            patient_id="p-77",
        )
        assert result["status"] == 201, result["body"]
        rec_id = result["body"]["id"]
        assert rec_id

        # Bytes landed under recordings/{owner}/{id}
        owner_dir = tmp_path / "recordings" / "actor-clinician-demo"
        stored = owner_dir / rec_id
        assert stored.is_file()
        assert stored.read_bytes() == mp4_bytes

    def test_list_filters_by_patient_and_orders_recent_first(
        self, client: TestClient, auth_headers: dict, tmp_path: Path, monkeypatch
    ) -> None:
        from app.settings import get_settings
        monkeypatch.setattr(get_settings(), "media_storage_root", str(tmp_path))

        _upload(client, auth_headers, title="Old", patient_id="p-1")
        _upload(client, auth_headers, title="New", patient_id="p-2")

        # Unfiltered: both visible
        all_resp = client.get(
            "/api/v1/recordings", headers=auth_headers["clinician"]
        )
        assert all_resp.status_code == 200
        titles = {i["title"] for i in all_resp.json()["items"]}
        assert titles == {"Old", "New"}
        assert all_resp.json()["total"] == 2

        # Patient-filtered: just one
        filt = client.get(
            "/api/v1/recordings?patient_id=p-1", headers=auth_headers["clinician"]
        )
        assert filt.status_code == 200
        items = filt.json()["items"]
        assert [i["title"] for i in items] == ["Old"]
        assert items[0]["mime_type"] == "audio/webm"
        assert items[0]["byte_size"] > 0


class TestSessionRecordingsStreaming:
    def test_stream_serves_bytes_with_stored_mime(
        self, client: TestClient, auth_headers: dict, tmp_path: Path, monkeypatch
    ) -> None:
        from app.settings import get_settings
        monkeypatch.setattr(get_settings(), "media_storage_root", str(tmp_path))

        payload = b"RIFF\x00\x00\x00\x00WAVEfmt fake wav body"
        result = _upload(
            client,
            auth_headers,
            payload=payload,
            filename="audio.wav",
            mime="audio/wav",
            title="Audio",
        )
        assert result["status"] == 201
        rec_id = result["body"]["id"]

        dl = client.get(
            f"/api/v1/recordings/{rec_id}/file",
            headers=auth_headers["clinician"],
        )
        assert dl.status_code == 200
        assert dl.content == payload
        assert dl.headers["content-type"].startswith("audio/wav")


class TestSessionRecordingsAuth:
    def test_anonymous_caller_blocked(
        self, client: TestClient, auth_headers: dict, tmp_path: Path, monkeypatch
    ) -> None:
        from app.settings import get_settings
        monkeypatch.setattr(get_settings(), "media_storage_root", str(tmp_path))

        # Seed one as the clinician so the row exists.
        result = _upload(client, auth_headers, title="Mine")
        rec_id = result["body"]["id"]

        # No Authorization header → anonymous guest → 403 (insufficient_role).
        listed = client.get("/api/v1/recordings")
        assert listed.status_code == 403
        streamed = client.get(f"/api/v1/recordings/{rec_id}/file")
        assert streamed.status_code == 403

    def test_upload_rejects_disallowed_mime(
        self, client: TestClient, auth_headers: dict, tmp_path: Path, monkeypatch
    ) -> None:
        from app.settings import get_settings
        monkeypatch.setattr(get_settings(), "media_storage_root", str(tmp_path))

        result = _upload(
            client,
            auth_headers,
            payload=b"%PDF-1.4 not media",
            filename="evil.pdf",
            mime="application/pdf",
        )
        assert result["status"] == 422


class TestSessionRecordingsOwnerIsolation:
    def test_other_clinician_cannot_stream_or_delete(
        self, client: TestClient, auth_headers: dict, tmp_path: Path, monkeypatch
    ) -> None:
        from app.settings import get_settings
        monkeypatch.setattr(get_settings(), "media_storage_root", str(tmp_path))

        # Upload as clinician demo actor.
        result = _upload(client, auth_headers, title="Mine", patient_id="p-1")
        rec_id = result["body"]["id"]

        # Different clinician (resident-demo-token → actor-resident-demo).
        other = {"Authorization": "Bearer resident-demo-token"}

        # List from other clinician returns empty (not their row).
        listed = client.get("/api/v1/recordings", headers=other)
        assert listed.status_code == 200
        assert listed.json()["items"] == []

        # Stream → 404 (don't leak existence).
        streamed = client.get(f"/api/v1/recordings/{rec_id}/file", headers=other)
        assert streamed.status_code == 404

        # Delete → 404.
        deleted = client.delete(f"/api/v1/recordings/{rec_id}", headers=other)
        assert deleted.status_code == 404

        # Owner can still see and delete.
        own_dl = client.get(
            f"/api/v1/recordings/{rec_id}/file", headers=auth_headers["clinician"]
        )
        assert own_dl.status_code == 200

        own_del = client.delete(
            f"/api/v1/recordings/{rec_id}", headers=auth_headers["clinician"]
        )
        assert own_del.status_code == 204

        # And after delete: 404 + bytes gone from disk.
        gone = client.get(
            f"/api/v1/recordings/{rec_id}/file", headers=auth_headers["clinician"]
        )
        assert gone.status_code == 404
        owner_dir = tmp_path / "recordings" / "actor-clinician-demo"
        assert not (owner_dir / rec_id).exists()
