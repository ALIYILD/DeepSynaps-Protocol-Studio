"""Integration tests for ``POST /api/v1/qeeg-analysis/{id}/analyze-mne``.

Mocks the ``run_pipeline_safe`` façade so the tests exercise the router +
persistence plumbing without requiring MNE-Python, PyPREP, or the sibling
``deepsynaps_qeeg`` package to be installed.
"""
from __future__ import annotations

import json
import builtins
import sys
import types
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
    """Happy path: the shared job persists every contract column."""
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

    assert payload["analysis_status"] == "processing:mne_pipeline"
    assert payload["analysis_error"] is None
    assert payload["execution_mode"] == "background"
    assert payload["queue_job_id"] is None

    db = SessionLocal()
    try:
        row = db.query(QEEGAnalysis).filter_by(id=analysis_row).first()
        assert row is not None
        assert row.analysis_status == "completed"
        params = json.loads(row.analysis_params_json)
        assert params["execution_mode"] == "background"
        assert params["job_id"] is None
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
        assert row.band_powers_json is not None
        assert row.artifact_rejection_json is not None
        assert json.loads(row.flagged_conditions) == ["adhd", "anxiety"]
    finally:
        db.close()

def test_analyze_mne_pipeline_failure_marks_row_failed(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Pipeline failures should surface on the persisted analysis row."""
    _fail_fn = lambda *a, **k: {"success": False, "error": "pipeline dependency missing"}
    monkeypatch.setattr(
        "app.services.qeeg_pipeline.run_pipeline_safe",
        _fail_fn,
    )
    monkeypatch.setattr(
        "app.services.qeeg_pipeline_job.run_pipeline_safe",
        _fail_fn,
    )

    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/analyze-mne",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["analysis_status"] == "processing:mne_pipeline"
    assert payload["analysis_error"] is None
    assert payload["execution_mode"] == "background"
    assert payload["queue_job_id"] is None

    db = SessionLocal()
    try:
        row = db.query(QEEGAnalysis).filter_by(id=analysis_row).first()
        assert row is not None
        assert row.analysis_status == "failed"
        assert row.analysis_error == "pipeline dependency missing"
        params = json.loads(row.analysis_params_json)
        assert params["execution_mode"] == "background"
        assert params["job_id"] is None
    finally:
        db.close()


def test_analyze_mne_prefers_celery_enqueue_when_available(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    queued_job_id = "celery-job-123"

    # Create a fake worker module hierarchy so the router's
    # ``from apps.worker.app.jobs import run_mne_pipeline_job`` succeeds.
    fake_task = type("FakeTask", (), {
        "delay": staticmethod(
            lambda analysis_id: (calls.append(analysis_id), type("QueuedJob", (), {"id": queued_job_id})())[1]
        ),
    })()
    jobs_mod = types.ModuleType("apps.worker.app.jobs")
    jobs_mod.run_mne_pipeline_job = fake_task  # type: ignore[attr-defined]
    for mod_name in ("apps", "apps.worker", "apps.worker.app", "apps.worker.app.jobs"):
        monkeypatch.setitem(sys.modules, mod_name, types.ModuleType(mod_name))
    monkeypatch.setitem(sys.modules, "apps.worker.app.jobs", jobs_mod)

    monkeypatch.setattr(
        "app.services.qeeg_pipeline_job.run_mne_pipeline_job_sync",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("background fallback should not run")),
    )

    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/analyze-mne",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["analysis_status"] == "processing:mne_pipeline"
    assert payload["execution_mode"] == "celery"
    assert payload["queue_job_id"] == queued_job_id
    assert calls == [analysis_row]

    db = SessionLocal()
    try:
        row = db.query(QEEGAnalysis).filter_by(id=analysis_row).first()
        assert row is not None
        assert row.analysis_status == "processing:mne_pipeline"
        assert row.analyzed_at is None
        params = json.loads(row.analysis_params_json)
        assert params["execution_mode"] == "celery"
        assert params["job_id"] == queued_job_id
    finally:
        db.close()


def test_analyze_mne_falls_back_when_worker_module_is_unavailable(
    client: TestClient,
    auth_headers: dict,
    analysis_row: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    real_import = builtins.__import__

    def _patched_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "apps.worker.app.jobs":
            raise ModuleNotFoundError("simulated missing worker package")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", _patched_import)
    monkeypatch.setattr(
        "app.services.qeeg_pipeline_job.run_mne_pipeline_job_sync",
        lambda analysis_id: calls.append(analysis_id),
    )

    resp = client.post(
        f"/api/v1/qeeg-analysis/{analysis_row}/analyze-mne",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["analysis_status"] == "processing:mne_pipeline"
    assert payload["execution_mode"] == "background"
    assert payload["queue_job_id"] is None
    assert calls == [analysis_row]

    db = SessionLocal()
    try:
        row = db.query(QEEGAnalysis).filter_by(id=analysis_row).first()
        assert row is not None
        assert row.analysis_status == "processing:mne_pipeline"
        params = json.loads(row.analysis_params_json)
        assert params["execution_mode"] == "background"
        assert params["job_id"] is None
    finally:
        db.close()


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
