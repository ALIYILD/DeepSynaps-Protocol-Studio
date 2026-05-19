"""Phase 2c: EEG-DL router endpoint tests.

Auth/validation/503 tests run unconditionally.
Happy-path tests (at the bottom) are individually skipped via importorskip
when braindecode is not installed; they do NOT affect the rest of the file
because importorskip is called inside the test body for those tests only.
"""
from __future__ import annotations

import importlib

import pytest

CLINICIAN_HEADERS = {"Authorization": "Bearer clinician-demo-token"}
PATIENT_HEADERS = {"Authorization": "Bearer patient-demo-token"}


def _get_client(monkeypatch):
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_NEUROIMAGING", "1")
    import app.main as main_mod
    mod = importlib.reload(main_mod)
    from fastapi.testclient import TestClient
    return TestClient(mod.app)


def test_build_model_401_no_auth(monkeypatch):
    """No auth header -> 403 (guest actor, role gate)."""
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/eeg-dl/build-model",
        json={"model": "eegnet", "n_channels": 8, "n_classes": 4, "input_window_samples": 256},
    )
    assert resp.status_code == 403


def test_build_model_403_patient_role(monkeypatch):
    """Patient role -> 403."""
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/eeg-dl/build-model",
        json={"model": "eegnet", "n_channels": 8, "n_classes": 4, "input_window_samples": 256},
        headers=PATIENT_HEADERS,
    )
    assert resp.status_code == 403


def test_build_model_422_invalid_n_channels(monkeypatch):
    """n_channels=0 violates constraint -> 422."""
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/eeg-dl/build-model",
        json={"model": "eegnet", "n_channels": 0, "n_classes": 4, "input_window_samples": 256},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 422


def test_build_model_422_invalid_n_classes(monkeypatch):
    """n_classes=1 violates constraint -> 422."""
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/eeg-dl/build-model",
        json={"model": "eegnet", "n_channels": 8, "n_classes": 1, "input_window_samples": 256},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 422


def test_forward_401_no_auth(monkeypatch):
    """No auth header -> 403."""
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/eeg-dl/forward",
        json={"model_spec": {}, "input_shape": [1, 8, 256]},
    )
    assert resp.status_code == 403


def test_forward_422_wrong_input_shape_length(monkeypatch):
    """input_shape length != 3 -> 422."""
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/eeg-dl/forward",
        json={"model_spec": {}, "input_shape": [1, 8]},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 422


def test_forward_422_batch_too_large(monkeypatch):
    """batch > 16 -> 422."""
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/eeg-dl/forward",
        json={"model_spec": {}, "input_shape": [17, 8, 256]},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 422


def test_build_model_503_when_braindecode_missing(monkeypatch):
    """HAS_BRAINDECODE=False -> 503."""
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_BRAINDECODE", False)
    resp = client.post(
        "/api/v1/neuroimaging/eeg-dl/build-model",
        json={"model": "eegnet", "n_channels": 8, "n_classes": 4, "input_window_samples": 256},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 503
    assert resp.json().get("code") == "neuroimaging_library_unavailable"


def test_forward_503_when_braindecode_missing(monkeypatch):
    """HAS_BRAINDECODE=False -> 503."""
    client = _get_client(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "HAS_BRAINDECODE", False)
    resp = client.post(
        "/api/v1/neuroimaging/eeg-dl/forward",
        json={"model_spec": {}, "input_shape": [1, 8, 256]},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 503
    assert resp.json().get("code") == "neuroimaging_library_unavailable"


def test_build_model_happy_path(monkeypatch):
    """Clinician + valid params -> 200 with EegModelSummary shape."""
    pytest.importorskip("braindecode")
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/eeg-dl/build-model",
        json={"model": "eegnet", "n_channels": 8, "n_classes": 4, "input_window_samples": 256},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["param_count"] > 0
    assert body["layer_count"] > 0
    assert body["n_channels"] == 8
    assert body["n_classes"] == 4


def test_forward_happy_path(monkeypatch):
    """Clinician + valid spec -> 200 with output_shape [1,4]."""
    pytest.importorskip("braindecode")
    from app.services.neuroimaging.braindecode_models import build_eegnet
    summary = build_eegnet(n_channels=8, n_classes=4, input_window_samples=256)
    client = _get_client(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/eeg-dl/forward",
        json={"model_spec": summary.model_dump(), "input_shape": [1, 8, 256]},
        headers=CLINICIAN_HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["output_shape"] == [1, 4]
    assert body["device"] == "cpu"
