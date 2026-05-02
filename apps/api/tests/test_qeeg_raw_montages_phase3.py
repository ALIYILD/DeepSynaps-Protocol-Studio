"""Phase 3 — montage and filter-preview tests.

Covers:
  * apply_montage_to_array on a synthetic 19-channel raw produces output
    of the expected shape for each new montage.
  * linked_mastoid raises ApiServiceError(missing_reference) when A1/A2
    (and M1/M2) are absent.
  * The filter-preview endpoint returns the expected JSON shape on the
    happy path (skipped when MNE is unavailable).
"""
from __future__ import annotations

import uuid
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.errors import ApiServiceError
from app.persistence.models import Clinic, Patient, QEEGAnalysis, User
from app.services import eeg_signal_service
from app.services.auth_service import create_access_token


_TWENTY = [
    "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
    "T3", "C3", "Cz", "C4", "T4",
    "T5", "P3", "Pz", "P4", "T6",
    "O1", "O2",
]


def _synthetic_array(n_channels: int = 19, n_samples: int = 1024) -> np.ndarray:
    rng = np.random.default_rng(seed=42)
    return rng.normal(0.0, 30.0, size=(n_channels, n_samples)).astype(np.float64)


# ── apply_montage_to_array ──────────────────────────────────────────────────


def test_referential_passthrough_returns_same_shape():
    data = _synthetic_array()
    out, chs = eeg_signal_service.apply_montage_to_array(data, _TWENTY, "referential")
    assert out.shape == data.shape
    assert chs == _TWENTY


def test_average_reference_zero_mean_per_sample():
    data = _synthetic_array()
    out, chs = eeg_signal_service.apply_montage_to_array(data, _TWENTY, "average")
    assert out.shape == data.shape
    # After common-average reference, the per-sample mean across channels
    # should be ~0 (within float tolerance).
    col_means = np.mean(out, axis=0)
    assert np.allclose(col_means, 0.0, atol=1e-9)
    assert chs == _TWENTY


def test_bipolar_long_produces_18_pair_rows():
    data = _synthetic_array()
    out, chs = eeg_signal_service.apply_montage_to_array(data, _TWENTY, "bipolar_long")
    # The longitudinal pair list has 18 entries.
    assert out.shape == (18, data.shape[1])
    assert len(chs) == 18
    assert all("-" in c for c in chs)
    assert chs[0] == "Fp1-F7"


def test_bipolar_trans_produces_12_pair_rows():
    data = _synthetic_array()
    out, chs = eeg_signal_service.apply_montage_to_array(data, _TWENTY, "bipolar_trans")
    assert out.shape == (12, data.shape[1])
    assert len(chs) == 12
    assert "F7-F3" in chs


def test_laplacian_returns_one_row_per_resolvable_channel():
    data = _synthetic_array()
    out, chs = eeg_signal_service.apply_montage_to_array(data, _TWENTY, "laplacian")
    # All 19 channels should resolve.
    assert out.shape[0] == 19
    assert out.shape[1] == data.shape[1]
    assert "Cz" in chs


def test_linked_mastoid_with_a1_a2_subtracts_average():
    chs = list(_TWENTY) + ["A1", "A2"]
    data = _synthetic_array(n_channels=len(chs))
    # Set A1/A2 to known values so the math is verifiable.
    data[19, :] = 10.0  # A1
    data[20, :] = 20.0  # A2
    expected_ref = (data[19] + data[20]) / 2.0  # 15.0
    out, out_chs = eeg_signal_service.apply_montage_to_array(data, chs, "linked_mastoid")
    assert out.shape == data.shape
    assert out_chs == chs
    # Pick an arbitrary frontal channel — value should be (orig - 15.0).
    assert np.allclose(out[0], data[0] - expected_ref)


def test_linked_mastoid_falls_back_to_m1_m2():
    chs = list(_TWENTY) + ["M1", "M2"]
    data = _synthetic_array(n_channels=len(chs))
    data[19, :] = 5.0
    data[20, :] = 7.0
    out, _ = eeg_signal_service.apply_montage_to_array(data, chs, "linked_mastoid")
    assert out.shape == data.shape
    assert np.allclose(out[0], data[0] - 6.0)


def test_linked_mastoid_raises_when_references_absent():
    data = _synthetic_array()
    with pytest.raises(ApiServiceError) as exc_info:
        eeg_signal_service.apply_montage_to_array(data, _TWENTY, "linked_mastoid")
    assert exc_info.value.code == "missing_reference"
    assert exc_info.value.status_code == 400
    assert "A1/A2" in exc_info.value.message or "A1" in exc_info.value.message


def test_rest_montage_returns_same_shape_and_subtracts_reference():
    data = _synthetic_array()
    out, chs = eeg_signal_service.apply_montage_to_array(data, _TWENTY, "rest")
    assert out.shape == data.shape
    assert chs == _TWENTY
    # Output should differ from input (a reference was subtracted).
    assert not np.allclose(out, data)


def test_csd_falls_back_to_laplacian_when_mne_available():
    # The pure-array path delegates CSD → laplacian when MNE is present
    # (full CSD requires positions on a Raw).
    data = _synthetic_array()
    if not getattr(eeg_signal_service, "_HAS_MNE", False):
        # CSD raises dependency_missing when MNE is absent.
        with pytest.raises(ApiServiceError) as exc_info:
            eeg_signal_service.apply_montage_to_array(data, _TWENTY, "csd")
        assert exc_info.value.code == "dependency_missing"
        return
    out, chs = eeg_signal_service.apply_montage_to_array(data, _TWENTY, "csd")
    # Falls back to laplacian shape.
    assert out.shape[0] == 19
    assert out.shape[1] == data.shape[1]


def test_custom_montage_with_pair_list():
    data = _synthetic_array()
    out, chs = eeg_signal_service.apply_montage_to_array(
        data, _TWENTY, "custom",
        custom_pairs=[
            {"anode": "Fp1", "cathode": "Fp2"},
            {"anode": "Cz",  "cathode": "Pz"},
        ],
    )
    assert out.shape == (2, data.shape[1])
    assert chs == ["Fp1-Fp2", "Cz-Pz"]


def test_custom_montage_skips_self_pairs():
    data = _synthetic_array()
    out, chs = eeg_signal_service.apply_montage_to_array(
        data, _TWENTY, "custom",
        custom_pairs=[
            {"anode": "Cz", "cathode": "Cz"},  # self-pair → dropped
            {"anode": "Fp1", "cathode": "Fp2"},
        ],
    )
    assert out.shape == (1, data.shape[1])
    assert chs == ["Fp1-Fp2"]


def test_unknown_montage_falls_back_to_referential():
    data = _synthetic_array()
    out, chs = eeg_signal_service.apply_montage_to_array(data, _TWENTY, "not_a_real_montage")
    # Defensive fallback so the UI never wedges on a typo.
    assert out.shape == data.shape
    assert chs == _TWENTY


# ── Filter preview helper ───────────────────────────────────────────────────


def test_butterworth_freqz_shape_and_clipping():
    fr = eeg_signal_service._butterworth_freqz(
        lff=1.0, hff=45.0, notch=50.0, sfreq=256.0, n_points=128,
    )
    assert "hz" in fr and "magnitude_db" in fr
    assert len(fr["hz"]) == 128
    assert len(fr["magnitude_db"]) == 128
    # All values clipped to the documented [-80, 5] dB window.
    assert all(-80.0 <= v <= 5.0 for v in fr["magnitude_db"])
    # The notch should produce a deep dip near 50 Hz.
    near = min(range(len(fr["hz"])), key=lambda i: abs(fr["hz"][i] - 50.0))
    assert fr["magnitude_db"][near] < -10.0


# ── Filter-preview endpoint (integration, MNE-gated) ────────────────────────


def _has_mne() -> bool:
    return bool(getattr(eeg_signal_service, "_HAS_MNE", False))


@pytest.fixture
def filter_preview_fixture() -> dict[str, Any]:
    """A clinic + clinician + (synthetic) analysis row used by the endpoint test.

    The actual filter-preview endpoint requires MNE to load a Raw — when MNE
    is absent we just verify the routing returns 503 dependency_missing.
    """
    db: Session = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="FP Clinic")
        clin = User(
            id=str(uuid.uuid4()),
            email=f"fp_{uuid.uuid4().hex[:8]}@example.com",
            display_name="FP",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        db.add_all([clinic, clin])
        db.flush()
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin.id,
            first_name="A",
            last_name="P",
        )
        db.add(patient)
        db.flush()
        analysis = QEEGAnalysis(
            id=str(uuid.uuid4()),
            patient_id=patient.id,
            clinician_id=clin.id,
            file_ref="memory://fp-test",
            original_filename="syn.edf",
            file_size_bytes=1024,
            recording_duration_sec=60.0,
            sample_rate_hz=256.0,
            channel_count=19,
            channels_json='["Fp1","Fp2","F7","F3","Fz","F4","F8","T3","C3","Cz","C4","T4","T5","P3","Pz","P4","T6","O1","O2"]',
            recording_date="2026-04-29",
            eyes_condition="closed",
            equipment="demo",
            analysis_status="completed",
        )
        db.add(analysis)
        db.commit()
        token = create_access_token(
            user_id=clin.id, email=clin.email, role="clinician",
            package_id="explorer", clinic_id=clin.clinic_id,
        )
        return {"analysis_id": analysis.id, "token": token}
    finally:
        db.close()


def test_filter_preview_endpoint_requires_clinician(
    client: TestClient, filter_preview_fixture: dict[str, Any]
):
    aid = filter_preview_fixture["analysis_id"]
    # Unauth call → 401 / 403 (auth dependency rejects).
    r = client.post(f"/api/v1/qeeg-raw/{aid}/filter-preview", json={})
    assert r.status_code in (401, 403)


def test_filter_preview_endpoint_returns_expected_shape(
    client: TestClient, filter_preview_fixture: dict[str, Any], monkeypatch
):
    aid = filter_preview_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {filter_preview_fixture['token']}"}

    if not _has_mne():
        # Without MNE the endpoint must surface dependency_missing (503).
        r = client.post(f"/api/v1/qeeg-raw/{aid}/filter-preview", json={}, headers=headers)
        assert r.status_code == 503, r.text
        return

    # When MNE is available we monkey-patch compute_filter_preview to avoid
    # actually loading an EDF file (the fixture has none on disk).
    fake = {
        "analysis_id": aid,
        "t_start": 0.0,
        "t_end": 10.0,
        "sfreq": 256.0,
        "channels": ["Fp1", "Fp2"],
        "raw": [[0.0, 1.0, 0.5], [0.0, 0.5, 0.25]],
        "filtered": [[0.0, 0.9, 0.45], [0.0, 0.45, 0.225]],
        "freq_response": {"hz": [1.0, 50.0, 100.0], "magnitude_db": [-30.0, -2.0, -50.0]},
        "params": {"lff": 1.0, "hff": 45.0, "notch": 50.0},
    }
    from app.services import eeg_signal_service as svc
    monkeypatch.setattr(svc, "compute_filter_preview", lambda *a, **k: fake)

    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/filter-preview",
        json={"t_start": 0.0, "window_sec": 10.0, "lff": 1.0, "hff": 45.0, "notch": 50.0},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["analysis_id"] == aid
    assert body["channels"] == ["Fp1", "Fp2"]
    assert body["raw"] == fake["raw"]
    assert body["filtered"] == fake["filtered"]
    assert body["freq_response"]["hz"][0] == 1.0
    assert body["freq_response"]["magnitude_db"][1] == -2.0
    assert body["params"]["notch"] == 50.0
