"""BIDS path traversal protection tests.

Covers B1: path traversal on POST /bids/summarise.
"""
from __future__ import annotations

import importlib
import json

import pytest

pytestmark = pytest.mark.usefixtures("isolated_database")


def _get_client(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    from fastapi.testclient import TestClient
    return TestClient(mod.app)


CLINICIAN_HEADERS = {"Authorization": "Bearer clinician-demo-token"}


def test_bids_traversal_outside_allow_list(monkeypatch):
    """root_path outside allow-list → 403 bids_root_not_allowed."""
    monkeypatch.setenv("DEEPSYNAPS_BIDS_ROOTS", "/tmp/deepsynaps_bids_test")
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/bids/summarise",
        json={"root_path": "/home/user/secret"},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 403
    assert resp.json().get("code") == "bids_root_not_allowed"


def test_bids_traversal_etc_rejected(monkeypatch):
    """root_path pointing to /etc → 403."""
    monkeypatch.setenv("DEEPSYNAPS_BIDS_ROOTS", "/tmp/deepsynaps_bids_test")
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/bids/summarise",
        json={"root_path": "/etc"},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 403


def test_bids_traversal_inside_allow_list(monkeypatch, tmp_path):
    """root_path inside DEEPSYNAPS_BIDS_ROOTS → proceeds (200 or 422, not 403)."""
    bids_root = tmp_path / "bids"
    bids_root.mkdir()
    # minimal BIDS dataset so pybids doesn't error
    desc = {"Name": "TestDataset", "BIDSVersion": "1.8.0"}
    (bids_root / "dataset_description.json").write_text(json.dumps(desc))

    monkeypatch.setenv("DEEPSYNAPS_BIDS_ROOTS", str(tmp_path))
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/bids/summarise",
        json={"root_path": str(bids_root)},
        headers=CLINICIAN_HEADERS,
    )
    # 403 would mean our allow-list check rejected it — that must NOT happen
    assert resp.status_code != 403


def test_bids_guest_denied(monkeypatch, tmp_path):
    """Guest actor → 403 from require_minimum_role, not bids check."""
    monkeypatch.setenv("DEEPSYNAPS_BIDS_ROOTS", str(tmp_path))
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/bids/summarise",
        json={"root_path": str(tmp_path)},
    )
    assert resp.status_code == 403
