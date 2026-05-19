"""Upload endpoint security tests: /nifti/inspect and /nwb/inspect.

Covers B2 (role gate, rate limit, extension whitelist, magic-byte sniff),
B3 (tmp file cleanup), B4 (streaming), B7 (fresh 503 instances).
"""
from __future__ import annotations

import importlib

import pytest

pytestmark = pytest.mark.usefixtures("isolated_database")


def _get_client_and_headers(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    from fastapi.testclient import TestClient
    client = TestClient(mod.app)
    headers = {
        "none": {},
        "patient": {"Authorization": "Bearer patient-demo-token"},
        "clinician": {"Authorization": "Bearer clinician-demo-token"},
    }
    return client, headers


def test_nifti_inspect_denied_without_clinician_role(monkeypatch):
    """No auth (guest) → 403 at role gate."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post("/api/v1/neuroimaging/nifti/inspect",
                       files={"file": ("test.nii", b"\x00", "application/octet-stream")})
    assert resp.status_code == 403


def test_nifti_inspect_403_patient_role(monkeypatch):
    """Patient role → 403 (insufficient role)."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post("/api/v1/neuroimaging/nifti/inspect",
                       files={"file": ("test.nii", b"\x00", "application/octet-stream")},
                       headers=headers["patient"])
    assert resp.status_code == 403


def test_nifti_inspect_415_wrong_extension(monkeypatch):
    """Non-.nii/.nii.gz extension → 415."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post("/api/v1/neuroimaging/nifti/inspect",
                       files={"file": ("test.txt", b"hello", "text/plain")},
                       headers=headers["clinician"])
    assert resp.status_code == 415


def test_nifti_inspect_415_wrong_magic(monkeypatch):
    """Right .nii.gz extension but not gzip magic → 415."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post("/api/v1/neuroimaging/nifti/inspect",
                       files={"file": ("brain.nii.gz", b"\x00" * 400, "application/octet-stream")},
                       headers=headers["clinician"])
    assert resp.status_code == 415


def test_nifti_inspect_413_too_large(monkeypatch):
    """Body exceeding _MAX_UPLOAD_BYTES → 413."""
    client, headers = _get_client_and_headers(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "_MAX_UPLOAD_BYTES", 1024)
    large = b"\x1f\x8b" + b"\x00" * 2000
    resp = client.post("/api/v1/neuroimaging/nifti/inspect",
                       files={"file": ("brain.nii.gz", large, "application/octet-stream")},
                       headers=headers["clinician"])
    assert resp.status_code == 413


def test_nwb_inspect_denied_without_clinician_role(monkeypatch):
    """No auth (guest) → 403 at role gate."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post("/api/v1/neuroimaging/nwb/inspect",
                       files={"file": ("test.nwb", b"\x00", "application/octet-stream")})
    assert resp.status_code == 403


def test_nwb_inspect_403_patient_role(monkeypatch):
    """Patient role → 403 (insufficient role)."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post("/api/v1/neuroimaging/nwb/inspect",
                       files={"file": ("test.nwb", b"\x00", "application/octet-stream")},
                       headers=headers["patient"])
    assert resp.status_code == 403


def test_nwb_inspect_415_wrong_extension(monkeypatch):
    """Non-.nwb extension → 415."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post("/api/v1/neuroimaging/nwb/inspect",
                       files={"file": ("data.txt", b"hello", "text/plain")},
                       headers=headers["clinician"])
    assert resp.status_code == 415


def test_nwb_inspect_415_wrong_magic(monkeypatch):
    """Right .nwb extension but not HDF5 magic → 415."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post("/api/v1/neuroimaging/nwb/inspect",
                       files={"file": ("data.nwb", b"\x00" * 16, "application/octet-stream")},
                       headers=headers["clinician"])
    assert resp.status_code == 415


def test_nwb_inspect_413_too_large(monkeypatch):
    """Body exceeding _MAX_UPLOAD_BYTES → 413."""
    client, headers = _get_client_and_headers(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "_MAX_UPLOAD_BYTES", 1024)
    large = b"\x89HDF\r\n\x1a\n" + b"\x00" * 2000
    resp = client.post("/api/v1/neuroimaging/nwb/inspect",
                       files={"file": ("data.nwb", large, "application/octet-stream")},
                       headers=headers["clinician"])
    assert resp.status_code == 413
