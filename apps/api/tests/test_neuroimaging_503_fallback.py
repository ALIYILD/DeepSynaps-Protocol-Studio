"""503 fallback tests when neuroimaging libraries are unavailable.

Covers B7: each endpoint raises a fresh ApiServiceError(503) when
its HAS_* flag is False.
"""
from __future__ import annotations

import importlib

import pytest

pytestmark = pytest.mark.usefixtures("isolated_database")

CLINICIAN_HEADERS = {"Authorization": "Bearer clinician-demo-token"}


def _get_client(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    from fastapi.testclient import TestClient
    return TestClient(mod.app)


def test_nifti_inspect_503_when_nibabel_missing(monkeypatch):
    """HAS_NIBABEL=False → 503 with code neuroimaging_library_unavailable."""
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_NIBABEL", False)
    resp = client.post(
        "/api/v1/neuroimaging/nifti/inspect",
        files={"file": ("test.nii", b"\x00", "application/octet-stream")},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 503
    assert resp.json().get("code") == "neuroimaging_library_unavailable"


def test_bids_summarise_503_when_pybids_missing(monkeypatch, tmp_path):
    """HAS_PYBIDS=False → 503 with code neuroimaging_library_unavailable."""
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_PYBIDS", False)
    resp = client.post(
        "/api/v1/neuroimaging/bids/summarise",
        json={"root_path": str(tmp_path)},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 503
    assert resp.json().get("code") == "neuroimaging_library_unavailable"


def test_nwb_inspect_503_when_pynwb_missing(monkeypatch):
    """HAS_PYNWB=False → 503 with code neuroimaging_library_unavailable."""
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_PYNWB", False)
    resp = client.post(
        "/api/v1/neuroimaging/nwb/inspect",
        files={"file": ("test.nwb", b"\x00", "application/octet-stream")},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 503
    assert resp.json().get("code") == "neuroimaging_library_unavailable"
