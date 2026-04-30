"""Regression tests for zip-slip / zip-bomb / extension-allowlist guards
in :mod:`deepsynaps_mri.api`.

The MRI sidecar accepts a ``.zip`` of DICOM data via ``POST /mri/upload``
and auto-extracts it into the per-upload directory. Pre-fix the route
called ``ZipFile.extractall`` directly which is vulnerable to:

  * **zip-slip** — a member named ``../../etc/passwd`` writes outside
    the upload dir, escalating to arbitrary file write under the API's
    uid.
  * **zip-bomb** — a 42 KB zip can decompress to many GB and exhaust
    disk / OOM the worker.
  * **payload smuggling** — a ``.sh`` / ``.so`` / nested ``.zip`` slipped
    inside an "MRI upload" can land on disk for later abuse.

The hardened path now validates each member, caps total members and
total decompressed bytes, and rejects unknown suffixes. These tests pin
that contract.
"""
from __future__ import annotations

import io
import os
import zipfile
from pathlib import Path

import pytest

# Skip the whole module if FastAPI / TestClient is unavailable in the
# slim install — the sidecar app is part of the optional ``[api]`` extra.
fastapi = pytest.importorskip("fastapi")
TestClient = pytest.importorskip("fastapi.testclient").TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """Reload :mod:`deepsynaps_mri.api` against a per-test upload root.

    The module reads ``MRI_UPLOAD_ROOT`` / ``MRI_ARTEFACT_ROOT`` at import
    time; we point them at ``tmp_path`` and reload so tests do not pollute
    ``/tmp/deepsynaps_mri``.
    """
    import importlib

    upload_root = tmp_path / "uploads"
    artefact_root = tmp_path / "runs"
    monkeypatch.setenv("MRI_UPLOAD_ROOT", str(upload_root))
    monkeypatch.setenv("MRI_ARTEFACT_ROOT", str(artefact_root))
    # Tighten caps so we can exercise the limits cheaply.
    monkeypatch.setenv("MRI_MAX_ZIP_MEMBERS", "8")
    monkeypatch.setenv("MRI_MAX_ZIP_BYTES", str(64 * 1024))  # 64 KB

    import deepsynaps_mri.api as api_mod
    api_mod = importlib.reload(api_mod)
    return TestClient(api_mod.app), upload_root


def _make_zip(entries: list[tuple[str, bytes]]) -> bytes:
    """Build an in-memory zip from ``[(name, payload), …]``."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, payload in entries:
            zf.writestr(name, payload)
    return buf.getvalue()


def _post_zip(client_, body: bytes, filename: str = "scan.zip"):
    return client_.post(
        "/mri/upload",
        data={"patient_id": "p-1"},
        files={"file": (filename, body, "application/zip")},
    )


# ---------------------------------------------------------------------------
# zip-slip
# ---------------------------------------------------------------------------
def test_zip_slip_traversal_segment_is_rejected(client) -> None:
    client_, upload_root = client
    body = _make_zip([("../escape.dcm", b"x" * 16)])
    resp = _post_zip(client_, body)
    assert resp.status_code == 400, resp.text
    assert "traversal" in resp.json()["detail"].lower()
    # Nothing should have landed outside the per-upload dir.
    assert not (upload_root.parent / "escape.dcm").exists()


def test_zip_slip_absolute_path_is_rejected(client) -> None:
    client_, _ = client
    body = _make_zip([("/etc/evil.dcm", b"x" * 8)])
    resp = _post_zip(client_, body)
    assert resp.status_code == 400, resp.text
    assert "absolute" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# member-count cap
# ---------------------------------------------------------------------------
def test_member_count_cap_is_enforced(client) -> None:
    client_, _ = client
    # MRI_MAX_ZIP_MEMBERS=8 in the fixture
    too_many = [(f"slice_{i}.dcm", b"x") for i in range(9)]
    body = _make_zip(too_many)
    resp = _post_zip(client_, body)
    assert resp.status_code == 400, resp.text
    assert "member" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# decompressed-size cap
# ---------------------------------------------------------------------------
def test_decompressed_size_cap_blocks_zip_bomb(client) -> None:
    client_, _ = client
    # MRI_MAX_ZIP_BYTES=64 KB; one 128 KB member exceeds the cap.
    huge = b"\0" * (128 * 1024)
    body = _make_zip([("slice.dcm", huge)])
    resp = _post_zip(client_, body)
    assert resp.status_code == 400, resp.text
    assert "uncompressed" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# extension allowlist
# ---------------------------------------------------------------------------
def test_disallowed_extension_is_rejected(client) -> None:
    client_, _ = client
    body = _make_zip([("payload.sh", b"#!/bin/sh\nrm -rf /\n")])
    resp = _post_zip(client_, body)
    assert resp.status_code == 400, resp.text
    assert "disallowed" in resp.json()["detail"].lower()


def test_nested_archive_is_rejected(client) -> None:
    client_, _ = client
    # A zip-inside-a-zip is the classic smuggling shape — must be refused.
    body = _make_zip([("inner.zip", b"PK\x03\x04dummy")])
    resp = _post_zip(client_, body)
    assert resp.status_code == 400, resp.text
    assert "disallowed" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# happy path — DICOM-shaped upload still extracts cleanly
# ---------------------------------------------------------------------------
def test_clean_dicom_zip_extracts_successfully(client) -> None:
    client_, upload_root = client
    body = _make_zip(
        [
            ("series_001/slice_001.dcm", b"DICM" + b"\0" * 12),
            ("series_001/slice_002.dcm", b"DICM" + b"\0" * 12),
            ("metadata.json", b'{"sequence": "T1w"}'),
        ]
    )
    resp = _post_zip(client_, body)
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    upload_dir = Path(payload["path"])
    assert upload_dir.exists()
    assert (upload_dir / "series_001" / "slice_001.dcm").exists()
    assert (upload_dir / "metadata.json").exists()
    # Original .zip should have been cleaned up.
    assert not (upload_dir / "scan.zip").exists()


def test_extensionless_dicom_member_is_allowed(client) -> None:
    """Scanner exports often produce extension-less DICOM files. Make sure
    they survive the allowlist (suffix == "" is whitelisted)."""
    client_, _ = client
    body = _make_zip([("IM00001", b"DICM" + b"\0" * 16)])
    resp = _post_zip(client_, body)
    assert resp.status_code == 200, resp.text
    upload_dir = Path(resp.json()["path"])
    assert (upload_dir / "IM00001").exists()
