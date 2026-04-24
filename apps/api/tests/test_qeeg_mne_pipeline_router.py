"""Integration tests for ``POST /api/v1/qeeg-analysis/{id}/analyze-mne``.

Mocks the ``run_pipeline_safe`` façade so the tests exercise the router +
persistence plumbing without requiring MNE-Python, PyPREP, or the sibling
``deepsynaps_qeeg`` package to be installed.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import QEEGAnalysis
from app.settings import get_settings


# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_fake_pipeline_result() -> dict:
    """Return a §1-shaped dict matching CONTRACT.md §1."""
    return {
        "success": True,
        "features": {
            "spectral": {
                "bands": {
                    "alpha": {
                        "absolute_uv2": {"Cz": 12.3, "Pz": 9.8, "F3": 7.1, "F4": 6.9},
                        "relative": {"Cz": 0.42, "Pz": 0.39, "F3": 0.31, "F4": 0.33},
                    },
                    "theta": {
                        "absolute_uv2": {"Cz": 3.1, "Pz": 2.9, "F3": 4.2, "F4": 4.0},
                        "relative": {"Cz": 0.12, "Pz": 0.11, "F3": 0.18, "F4": 0.17},
                    },
                },
                "aperiodic": {
                    "slope": {"Cz": 1.42, "Pz": 1.35},
                    "offset": {"Cz": -1.2, "Pz": -1.1},
                    "r_squared": {"Cz": 0.97, "Pz": 0.95},
                },
                "peak_alpha_freq": {"Cz": 10.1, "Pz": 10.3, "F3": None},
            },
            "connectivity": {
                "wpli": {"alpha": [[0.0, 0.3], [0.3, 0.0]]},
                "coherence": {"alpha": [[1.0, 0.5], [0.5, 1.0]]},
                "channels": ["Cz", "Pz"],
            },
            "asymmetry": {
                "frontal_alpha_F3_F4": -0.027,
                "frontal_alpha_F7_F8": 0.013,
            },
            "graph": {
                "alpha": {
                    "clustering_coef": 0.51,
                    "char_path_length": 1.8,
                    "small_worldness": 1.12,
                }
            },
            "source": {
                "roi_band_power": {"alpha": {"bankssts-lh": 0.42}},
                "method": "eLORETA",
            },
        },
        "zscores": {
            "spectral": {"bands": {"alpha": {"absolute_uv2": {"Cz": 0.4}}}},
            "aperiodic": {"slope": {"Cz": -0.1}},
            "flagged": [
                {"metric": "spectral.bands.theta.absolute_uv2", "channel": "Fz", "z": 2.81}
            ],
            "norm_db_version": "toy-0.1",
        },
        "flagged_conditions": ["adhd", "anxiety"],
        "quality": {
            "n_channels_input": 19,
            "n_channels_rejected": 1,
            "bad_channels": ["T6"],
            "n_epochs_total": 60,
            "n_epochs_retained": 48,
            "ica_components_dropped": 3,
            "ica_labels_dropped": {"eye": 2, "muscle": 1},
            "sfreq_input": 500.0,
            "sfreq_output": 250.0,
            "bandpass": [1.0, 45.0],
            "notch_hz": 50.0,
            "pipeline_version": "0.1.0",
        },
        "report_html": None,
        "report_pdf_path": None,
    }


@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "MNE", "last_name": "Tester", "dob": "1990-01-01", "gender": "F"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def analysis_row(patient_id: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Create a QEEGAnalysis row with a real (tiny) file on disk.

    The ``/analyze-mne`` endpoint calls ``media_storage.read_upload`` before
    handing off to the façade, so we need a real file_ref even though the
    façade itself is mocked.
    """
    # Point media storage at the tmp_path so no test ever writes to the real
    # upload directory.
    monkeypatch.setenv("MEDIA_STORAGE_ROOT", str(tmp_path))
    # Settings is cached via @lru_cache — clear it so the env var is picked up.
    get_settings.cache_clear()  # type: ignore[attr-defined]

    settings = get_settings()
    storage_root = Path(settings.media_storage_root)
    patient_dir = storage_root / patient_id
    patient_dir.mkdir(parents=True, exist_ok=True)

    analysis_id = "test-mne-analysis-0001"
    file_ref = f"{patient_id}/{analysis_id}.edf"
    (storage_root / file_ref).write_bytes(b"0" + b" " * 255 + b"\x00" * 256)

    db = SessionLocal()
    try:
        row = QEEGAnalysis(
            id=analysis_id,
            patient_id=patient_id,
            clinician_id="actor-clinician-demo",
            file_ref=file_ref,
            original_filename="sample.edf",
            file_size_bytes=512,
            analysis_status="pending",
        )
        db.add(row)
        db.commit()
    finally:
        db.close()

    yield analysis_id

    get_settings.cache_clear()  # type: ignore[attr-defined]


# ── Tests ────────────────────────────────────────────────────────────────────


def test_analyze_mne_success_persists_all_contract_columns(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Happy path: the endpoint writes every §2 column and returns §3 fields."""
    fake_result = _make_fake_pipeline_result()
    monkeypatch.setattr(
        "app.services.qeeg_pipeline.run_pipeline_safe",
        lambda *a, **k: fake_result,
    )

    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/analyze-mne",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()

    # ── AnalysisOut response shape (CONTRACT.md §3) ───────────────────────
    assert payload["analysis_status"] == "completed"
    assert payload["pipeline_version"] == "0.1.0"
    assert payload["norm_db_version"] == "toy-0.1"
    assert payload["flagged_conditions"] == ["adhd", "anxiety"]
    assert payload["aperiodic"]["slope"]["Cz"] == pytest.approx(1.42)
    assert payload["peak_alpha_freq"]["Cz"] == pytest.approx(10.1)
    assert payload["connectivity"]["channels"] == ["Cz", "Pz"]
    assert payload["asymmetry"]["frontal_alpha_F3_F4"] == pytest.approx(-0.027)
    assert payload["graph_metrics"]["alpha"]["small_worldness"] == pytest.approx(1.12)
    assert payload["source_roi"]["method"] == "eLORETA"
    assert payload["normative_zscores"]["norm_db_version"] == "toy-0.1"
    assert payload["quality_metrics"]["pipeline_version"] == "0.1.0"
    assert payload["quality_metrics"]["n_channels_rejected"] == 1

    # Legacy back-compat fields should also be populated so the
    # pre-existing frontend + AI interpreter keep working.
    assert payload["band_powers"] is not None
    assert "alpha" in payload["band_powers"]["bands"]
    assert payload["artifact_rejection"]["source"] == "mne_pipeline"
    assert payload["artifact_rejection"]["rejected_channels"] == ["T6"]

    # ── DB row directly: every CONTRACT.md §2 column must be non-null ────
    db = SessionLocal()
    try:
        row = db.query(QEEGAnalysis).filter_by(id=analysis_row).first()
        assert row is not None
        assert row.aperiodic_json is not None
        assert row.peak_alpha_freq_json is not None
        assert row.connectivity_json is not None
        assert row.asymmetry_json is not None
        assert row.graph_metrics_json is not None
        assert row.source_roi_json is not None
        assert row.normative_zscores_json is not None
        assert row.flagged_conditions is not None
        assert row.quality_metrics_json is not None
        assert row.pipeline_version == "0.1.0"
        assert row.norm_db_version == "toy-0.1"
        # And the legacy JSON columns must have been back-filled:
        assert row.band_powers_json is not None
        assert row.artifact_rejection_json is not None
        # Stored as a JSON array, not a PG ARRAY — decode to verify.
        assert json.loads(row.flagged_conditions) == ["adhd", "anxiety"]
    finally:
        db.close()


def test_analyze_mne_pipeline_failure_marks_row_failed(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the façade returns ``{"success": False, ...}`` the row must be
    marked ``failed`` and the error must be surfaced in ``analysis_error``."""
    monkeypatch.setattr(
        "app.services.qeeg_pipeline.run_pipeline_safe",
        lambda *a, **k: {"success": False, "error": "pipeline dependency missing"},
    )

    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/analyze-mne",
        headers=auth_headers["clinician"],
    )
    # The endpoint swallows pipeline errors and returns the analysis row with
    # status=failed so the frontend can surface a useful message.
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["analysis_status"] == "failed"
    assert payload["analysis_error"] == "pipeline dependency missing"


def test_analyze_mne_rejects_unknown_id(
    client: TestClient,
    auth_headers: dict,
) -> None:
    resp = client.post(
        "/api/v1/qeeg-analysis/does-not-exist/analyze-mne",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 404


def test_analyze_mne_rejects_guest(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
) -> None:
    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/analyze-mne",
        headers=auth_headers["guest"],
    )
    assert resp.status_code == 403
