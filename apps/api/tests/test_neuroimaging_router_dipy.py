"""Router security + happy-path tests for DIPY Phase 2b endpoint.

Covers: 401/403 anon+non-clinician, 415 wrong ext, 413 over-size, 200 happy path.
"""
from __future__ import annotations

import importlib
import io

import numpy as np
import pytest

pytestmark = pytest.mark.usefixtures("isolated_database")

dipy = pytest.importorskip("dipy")


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


def _make_dwi_files():
    """Return (nii_bytes, bval_str, bvec_str) for a synthetic 2x2x2 DWI dataset."""
    import tempfile, os
    import nibabel as nib

    shape = (2, 2, 2, 7)
    data = np.ones(shape, dtype=np.float32) * 1000.0
    data[..., 1:] = 800.0
    img = nib.Nifti1Image(data, np.eye(4))
    with tempfile.NamedTemporaryFile(suffix='.nii', delete=False) as f:
        nii_path = f.name
    try:
        nib.save(img, nii_path)
        with open(nii_path, 'rb') as fh:
            nii_bytes = fh.read()
    finally:
        os.unlink(nii_path)

    bvals = "0 1000 1000 1000 1000 1000 1000"
    bvecs = (
        "0.0 1.0 0.0 0.0 1.0 0.0 0.0\n"
        "0.0 0.0 1.0 0.0 0.0 1.0 0.0\n"
        "0.0 0.0 0.0 1.0 0.0 0.0 1.0"
    )
    return nii_bytes, bvals.encode(), bvecs.encode()


def _post_dti(client, headers, nii_bytes=None, bval_bytes=None, bvec_bytes=None,
              nii_name="dwi.nii", bval_name="dwi.bval", bvec_name="dwi.bvec"):
    nii_bytes = nii_bytes or b"\x00"
    bval_bytes = bval_bytes or b"0 1000"
    bvec_bytes = bvec_bytes or b"0 1\n0 0\n0 0"
    return client.post(
        "/api/v1/neuroimaging/dipy/dti-scalars",
        files={
            "nifti_file": (nii_name, nii_bytes, "application/octet-stream"),
            "bval_file": (bval_name, bval_bytes, "application/octet-stream"),
            "bvec_file": (bvec_name, bvec_bytes, "application/octet-stream"),
        },
        headers=headers,
    )


def test_dipy_dti_403_no_auth(monkeypatch):
    client, _ = _get_client_and_headers(monkeypatch)
    resp = _post_dti(client, {})
    assert resp.status_code == 403


def test_dipy_dti_403_patient(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    resp = _post_dti(client, headers["patient"])
    assert resp.status_code == 403


def test_dipy_dti_415_wrong_nifti_ext(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    resp = _post_dti(client, headers["clinician"], nii_name="dwi.txt")
    assert resp.status_code == 415


def test_dipy_dti_415_wrong_bval_ext(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    resp = _post_dti(client, headers["clinician"], bval_name="dwi.bad")
    assert resp.status_code == 415


def test_dipy_dti_415_wrong_bvec_ext(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    resp = _post_dti(client, headers["clinician"], bvec_name="dwi.bad")
    assert resp.status_code == 415


def test_dipy_dti_413_nifti_too_large(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    import app.routers.neuroimaging_router as nr
    monkeypatch.setattr(nr, "_MAX_UPLOAD_BYTES", 1024)
    large = b"\x00" * 2000
    resp = _post_dti(client, headers["clinician"], nii_bytes=large)
    assert resp.status_code == 413


def test_dipy_dti_503_when_dipy_missing(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    import app.routers.neuroimaging_router as nr
    monkeypatch.setattr(nr, "HAS_DIPY", False)
    resp = _post_dti(client, headers["clinician"])
    assert resp.status_code == 503
    assert resp.json().get("code") == "neuroimaging_library_unavailable"


def test_dipy_dti_200_happy(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    nii_bytes, bval_bytes, bvec_bytes = _make_dwi_files()
    resp = _post_dti(
        client, headers["clinician"],
        nii_bytes=nii_bytes,
        bval_bytes=bval_bytes,
        bvec_bytes=bvec_bytes,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert 0.0 <= body["mean_fa"] <= 1.0
    assert body["mean_md"] >= 0.0
    assert body["voxel_count"] > 0
