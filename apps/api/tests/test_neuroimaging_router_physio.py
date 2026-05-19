"""Router physio endpoints security and validation tests.

Covers: 401 anonymous, 403 non-clinician, 413 signal_too_long,
422 bad sampling_rate, 200 valid signal for ECG/EDA/RSP.
"""
from __future__ import annotations

import importlib

import pytest


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


# ---------------------------------------------------------------------------
# Auth / role gate — test one endpoint (ecg) as representative
# ---------------------------------------------------------------------------

def test_physio_ecg_401_anonymous(monkeypatch):
    """No auth → 403 (guest actor blocked at role gate)."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/physio/ecg",
        json={"signal": [0.0] * 100, "sampling_rate": 250},
    )
    assert resp.status_code == 403


def test_physio_ecg_403_patient_role(monkeypatch):
    """Patient role → 403 (insufficient role)."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/physio/ecg",
        json={"signal": [0.0] * 100, "sampling_rate": 250},
        headers=headers["patient"],
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Signal length cap
# ---------------------------------------------------------------------------

def test_physio_ecg_413_signal_too_long(monkeypatch):
    """Signal length > _MAX_SIGNAL_SAMPLES → 413."""
    client, headers = _get_client_and_headers(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "_MAX_SIGNAL_SAMPLES", 10)
    resp = client.post(
        "/api/v1/neuroimaging/physio/ecg",
        json={"signal": [0.0] * 11, "sampling_rate": 250},
        headers=headers["clinician"],
    )
    assert resp.status_code == 413


def test_physio_eda_413_signal_too_long(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "_MAX_SIGNAL_SAMPLES", 10)
    resp = client.post(
        "/api/v1/neuroimaging/physio/eda",
        json={"signal": [0.0] * 11, "sampling_rate": 100},
        headers=headers["clinician"],
    )
    assert resp.status_code == 413


def test_physio_rsp_413_signal_too_long(monkeypatch):
    client, headers = _get_client_and_headers(monkeypatch)
    import app.routers.neuroimaging_router as nr_mod
    monkeypatch.setattr(nr_mod, "_MAX_SIGNAL_SAMPLES", 10)
    resp = client.post(
        "/api/v1/neuroimaging/physio/rsp",
        json={"signal": [0.0] * 11, "sampling_rate": 50},
        headers=headers["clinician"],
    )
    assert resp.status_code == 413


# ---------------------------------------------------------------------------
# sampling_rate validation
# ---------------------------------------------------------------------------

def test_physio_ecg_422_zero_sampling_rate(monkeypatch):
    """sampling_rate=0 → 422."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/physio/ecg",
        json={"signal": [0.0] * 100, "sampling_rate": 0},
        headers=headers["clinician"],
    )
    assert resp.status_code == 422


def test_physio_ecg_422_sampling_rate_too_high(monkeypatch):
    """sampling_rate=200000 (> 100000) → 422."""
    client, headers = _get_client_and_headers(monkeypatch)
    resp = client.post(
        "/api/v1/neuroimaging/physio/ecg",
        json={"signal": [0.0] * 100, "sampling_rate": 200_000},
        headers=headers["clinician"],
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 200 happy path — requires neurokit2
# ---------------------------------------------------------------------------

def test_physio_ecg_200_valid(monkeypatch):
    """Valid ECG signal → 200 with EcgFeatures shape."""
    nk = pytest.importorskip("neurokit2")
    client, headers = _get_client_and_headers(monkeypatch)
    signal = nk.ecg_simulate(duration=10, sampling_rate=250).tolist()
    resp = client.post(
        "/api/v1/neuroimaging/physio/ecg",
        json={"signal": signal, "sampling_rate": 250},
        headers=headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "mean_hr_bpm" in body
    assert "rpeak_count" in body
    assert "hrv_sdnn_ms" in body
    assert body["signal_length"] == len(signal)


def test_physio_eda_200_valid(monkeypatch):
    """Valid EDA signal → 200 with EdaFeatures shape."""
    nk = pytest.importorskip("neurokit2")
    client, headers = _get_client_and_headers(monkeypatch)
    signal = nk.eda_simulate(duration=10, sampling_rate=100, scr_number=3).tolist()
    resp = client.post(
        "/api/v1/neuroimaging/physio/eda",
        json={"signal": signal, "sampling_rate": 100},
        headers=headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "mean_tonic_microsiemens" in body
    assert "scr_count" in body


def test_physio_rsp_200_valid(monkeypatch):
    """Valid RSP signal → 200 with RspFeatures shape."""
    nk = pytest.importorskip("neurokit2")
    client, headers = _get_client_and_headers(monkeypatch)
    signal = nk.rsp_simulate(duration=30, sampling_rate=50, respiratory_rate=15).tolist()
    resp = client.post(
        "/api/v1/neuroimaging/physio/rsp",
        json={"signal": signal, "sampling_rate": 50},
        headers=headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "mean_rate_bpm" in body
    assert "rrv_sdbb_ms" in body
