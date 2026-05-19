"""Router security + happy-path tests for Nilearn Phase 2b endpoints.

Covers: 401/403 anon+non-clinician, 200 happy path, 503 HAS_NILEARN=False.
"""
from __future__ import annotations

import importlib

import numpy as np
import pytest

pytestmark = pytest.mark.usefixtures("isolated_database")

nilearn = pytest.importorskip("nilearn")


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


def _make_nifti_bytes(shape=(4, 4, 4, 5)):
    """Return in-memory NIfTI bytes for a ones-valued image."""
    import tempfile, os
    import nibabel as nib
    data = np.ones(shape, dtype=np.float32)
    img = nib.Nifti1Image(data, np.eye(4))
    with tempfile.NamedTemporaryFile(suffix='.nii', delete=False) as f:
        path = f.name
    try:
        nib.save(img, path)
        with open(path, 'rb') as fh:
            return fh.read()
    finally:
        os.unlink(path)


# ── /nilearn/mask ──────────────────────────────────────────────────────────

def test_nilearn_mask_403_no_auth(monkeypatch):
    client, _ = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/mask",
        files={"file": ("brain.nii", b"\x00", "application/octet-stream")},
    )
    assert resp.status_code == 403


def test_nilearn_mask_403_patient(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/mask",
        files={"file": ("brain.nii", b"\x00", "application/octet-stream")},
        headers=headers["patient"],
    )
    assert resp.status_code == 403


def test_nilearn_mask_415_wrong_ext(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/mask",
        files={"file": ("brain.txt", b"\x00", "text/plain")},
        headers=headers["clinician"],
    )
    assert resp.status_code == 415


def test_nilearn_mask_200_happy(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    nii_bytes = _make_nifti_bytes()
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/mask",
        files={"file": ("brain.nii", nii_bytes, "application/octet-stream")},
        headers=headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["n_timepoints"] == 5
    assert body["n_voxels"] > 0


def test_nilearn_mask_503_when_nilearn_missing(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    import app.routers.neuroimaging_router as nr
    monkeypatch.setattr(nr, "HAS_NILEARN", False)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/mask",
        files={"file": ("brain.nii", b"\x00", "application/octet-stream")},
        headers=headers["clinician"],
    )
    assert resp.status_code == 503
    assert resp.json().get("code") == "neuroimaging_library_unavailable"


# ── /nilearn/connectome ────────────────────────────────────────────────────

def _connectome_payload(n_tp=50, n_reg=3, kind="correlation"):
    ts = np.random.default_rng(0).standard_normal((n_tp, n_reg)).tolist()
    return {"timeseries": ts, "kind": kind}


def test_nilearn_connectome_403_no_auth(monkeypatch):
    client, _ = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/connectome",
        json=_connectome_payload(),
    )
    assert resp.status_code == 403


def test_nilearn_connectome_403_patient(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/connectome",
        json=_connectome_payload(),
        headers=headers["patient"],
    )
    assert resp.status_code == 403


def test_nilearn_connectome_422_unknown_kind(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/connectome",
        json=_connectome_payload(kind="bad-kind"),
        headers=headers["clinician"],
    )
    assert resp.status_code == 422


def test_nilearn_connectome_413_too_large(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    # 1001 timepoints × 1000 regions = 1,001,000 > 1,000,000
    big_ts = [[0.0] * 1000] * 1001
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/connectome",
        json={"timeseries": big_ts, "kind": "correlation"},
        headers=headers["clinician"],
    )
    assert resp.status_code == 413


def test_nilearn_connectome_200_happy(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/connectome",
        json=_connectome_payload(),
        headers=headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["n_regions"] == 3
    assert body["kind"] == "correlation"
    assert body["truncated"] is False
    assert len(body["matrix"]) == 3


def test_nilearn_connectome_503_when_nilearn_missing(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    import app.routers.neuroimaging_router as nr
    monkeypatch.setattr(nr, "HAS_NILEARN", False)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/connectome",
        json=_connectome_payload(),
        headers=headers["clinician"],
    )
    assert resp.status_code == 503


# ── /nilearn/atlas-timeseries ─────────────────────────────────────────────

def test_nilearn_atlas_403_no_auth(monkeypatch):
    client, _ = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/atlas-timeseries",
        json={"img_path": "/data/bids/sub/func.nii", "atlas_path": "/data/bids/atlas.nii"},
    )
    assert resp.status_code == 403


def test_nilearn_atlas_403_patient(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/atlas-timeseries",
        json={"img_path": "/data/bids/sub/func.nii", "atlas_path": "/data/bids/atlas.nii"},
        headers=headers["patient"],
    )
    assert resp.status_code == 403


def test_nilearn_atlas_403_path_traversal(monkeypatch):
    """Paths outside allow-list return 403 code='path_not_allowed'."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/atlas-timeseries",
        json={"img_path": "/etc/passwd", "atlas_path": "/etc/hosts"},
        headers=headers["clinician"],
    )
    assert resp.status_code == 403
    assert resp.json().get("code") == "path_not_allowed"


def test_nilearn_atlas_503_when_nilearn_missing(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    import app.routers.neuroimaging_router as nr
    monkeypatch.setattr(nr, "HAS_NILEARN", False)
    resp = client.post(
        "/api/v1/neuroimaging/nilearn/atlas-timeseries",
        json={"img_path": "/data/bids/f.nii", "atlas_path": "/data/bids/a.nii"},
        headers=headers["clinician"],
    )
    assert resp.status_code == 503
