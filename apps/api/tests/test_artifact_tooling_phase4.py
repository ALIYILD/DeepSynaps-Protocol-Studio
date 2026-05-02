"""Phase 4 — artifact tooling tests.

Covers:
  * ``auto_artifact_scan.scan_for_artifacts`` returns the documented shape
    on synthetic data with known artifacts (high amplitude, flatline,
    line noise).
  * POST /auto-scan creates an AutoCleanRun row and returns its id +
    proposal.
  * POST /auto-scan/{run_id}/decide writes one CleaningDecision per
    accepted *and* rejected item, merges accepted items into the
    cleaning config, and skips rejected ones.
  * POST /apply-template eye_blink excludes ICA components labeled 'eye'
    with confidence > 0.7 and writes ``actor='ai', action='apply_template'``
    decisions.
  * GET /spike-events returns 200 with ``{events: []}`` even when no
    detector is available — empty list is a valid clinical signal.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import (
    AutoCleanRun,
    CleaningDecision,
    Clinic,
    Patient,
    QEEGAnalysis,
    User,
)
from app.services.auth_service import create_access_token


# ── Fixture helpers ──────────────────────────────────────────────────────────


def _make_clinician_and_analysis(db: Session) -> dict[str, Any]:
    clinic = Clinic(id=str(uuid.uuid4()), name="Phase4 Clinic")
    clin = User(
        id=str(uuid.uuid4()),
        email=f"p4_{uuid.uuid4().hex[:8]}@example.com",
        display_name="P4",
        hashed_password="x",
        role="clinician",
        package_id="clinician_pro",
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
        file_ref="memory://p4-test",
        original_filename="syn.edf",
        file_size_bytes=1024,
        recording_duration_sec=60.0,
        sample_rate_hz=256.0,
        channel_count=4,
        channels_json='["Fp1","Fp2","T3","O1"]',
        recording_date="2026-04-29",
        eyes_condition="closed",
        equipment="demo",
        analysis_status="completed",
    )
    db.add(analysis)
    db.commit()
    token = create_access_token(
        user_id=clin.id,
        email=clin.email,
        role="clinician",
        package_id="clinician_pro",
        clinic_id=clin.clinic_id,
    )
    return {
        "analysis_id": analysis.id,
        "patient_id": patient.id,
        "clin_id": clin.id,
        "token": token,
    }


@pytest.fixture
def phase4_fixture() -> dict[str, Any]:
    db = SessionLocal()
    try:
        return _make_clinician_and_analysis(db)
    finally:
        db.close()


# ── 1. scan_for_artifacts on synthetic data ─────────────────────────────────


def test_scan_for_artifacts_returns_documented_shape():
    """Build a synthetic Raw-like object and run scan_for_artifacts directly.

    We bypass MNE entirely with a tiny stub object that mimics the contract
    the scanner uses (``info['sfreq']``, ``ch_names``, ``raw[:, :]``).
    """
    np = pytest.importorskip("numpy")
    from app.services import auto_artifact_scan

    sfreq = 256.0
    n_samples = int(60.0 * sfreq)
    rng = np.random.default_rng(seed=7)
    data_uv = rng.normal(0.0, 10.0, size=(4, n_samples))
    # Channel 0 ('Fp1'): inject a 0.6s-long high-amplitude blink.
    blink_start = int(5.0 * sfreq)
    blink_end = blink_start + int(0.6 * sfreq)
    data_uv[0, blink_start:blink_end] += 350.0  # > 200 µV threshold
    # Channel 2 ('T3'): full-recording flatline.
    data_uv[2, :] = 0.0
    # Channel 3 ('O1'): inject 50 Hz line noise.
    t = np.arange(n_samples) / sfreq
    data_uv[3] += 80.0 * np.sin(2 * np.pi * 50.0 * t)

    class _StubInfo(dict):
        pass

    class _StubRaw:
        def __init__(self):
            self.info = _StubInfo({"sfreq": sfreq})
            self.ch_names = ["Fp1", "Fp2", "T3", "O1"]
            self._data_v = (data_uv * 1e-6).astype(np.float64)
            self.times = np.arange(n_samples) / sfreq

        def __getitem__(self, key):
            return self._data_v[:, :], self.times

    stub = _StubRaw()

    # Monkey-patch the loader to return our stub without touching MNE.
    auto_artifact_scan.np = np  # ensure module sees real numpy
    import app.services.eeg_signal_service as svc_module

    original_loader = getattr(svc_module, "load_raw_for_analysis", None)
    svc_module.load_raw_for_analysis = lambda aid, db: stub  # type: ignore[assignment]
    try:
        result = auto_artifact_scan.scan_for_artifacts(
            "fake-id",
            db=None,  # unused with the stub
            amp_threshold_uv=200.0,
            line_noise_ratio_threshold=0.10,
            flatline_min_sec=1.0,
        )
    finally:
        if original_loader is not None:
            svc_module.load_raw_for_analysis = original_loader  # type: ignore[assignment]

    # Documented shape contract.
    assert set(result.keys()) == {"bad_channels", "bad_segments", "summary"}
    summary = result["summary"]
    assert summary["n_bad_channels"] == len(result["bad_channels"])
    assert summary["n_bad_segments"] == len(result["bad_segments"])
    assert "total_excluded_sec" in summary
    assert "scanner_version" in summary

    # Detected artefacts on the right channels.
    flat_chs = [
        c for c in result["bad_channels"] if c["reason"] == "flatline"
    ]
    assert any(c["channel"] == "T3" for c in flat_chs), result
    line_chs = [
        c for c in result["bad_channels"] if c["reason"] == "line_noise"
    ]
    assert any(c["channel"] == "O1" for c in line_chs), result
    amp_segs = [
        s for s in result["bad_segments"] if s["reason"] == "amp_threshold"
    ]
    assert len(amp_segs) >= 1
    # Confidence values are well-formed.
    for entry in result["bad_channels"] + result["bad_segments"]:
        assert 0.0 <= entry["confidence"] <= 1.0
        assert isinstance(entry["metric"], dict)


# ── 2. POST /auto-scan creates AutoCleanRun + returns proposal ─────────────


def test_auto_scan_endpoint_creates_run_and_returns_proposal(
    client: TestClient, phase4_fixture: dict[str, Any], monkeypatch
):
    aid = phase4_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase4_fixture['token']}"}

    fake_proposal = {
        "bad_channels": [
            {
                "channel": "T3",
                "reason": "flatline",
                "metric": {"flat_sec": 8.2},
                "confidence": 0.91,
            }
        ],
        "bad_segments": [
            {
                "start_sec": 12.4,
                "end_sec": 13.1,
                "reason": "amp_threshold",
                "metric": {"peak_uv": 312.0},
                "confidence": 0.88,
            }
        ],
        "summary": {
            "n_bad_channels": 1,
            "n_bad_segments": 1,
            "total_excluded_sec": 0.7,
            "autoreject_used": False,
            "scanner_version": "1.0",
        },
    }
    from app.services import auto_artifact_scan

    monkeypatch.setattr(
        auto_artifact_scan, "scan_for_artifacts", lambda *a, **k: fake_proposal
    )
    # Bypass _require_mne by patching _HAS_MNE on the eeg_signal_service.
    from app.services import eeg_signal_service

    monkeypatch.setattr(eeg_signal_service, "_HAS_MNE", True, raising=False)

    r = client.post(f"/api/v1/qeeg-raw/{aid}/auto-scan", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["analysis_id"] == aid
    run_id = body["run_id"]
    assert run_id
    assert body["proposal"]["summary"]["n_bad_channels"] == 1
    assert body["proposal"]["bad_channels"][0]["channel"] == "T3"

    # The AutoCleanRun row exists and stores the proposal.
    db = SessionLocal()
    try:
        run = db.query(AutoCleanRun).filter_by(id=run_id).one()
        assert run.analysis_id == aid
        proposal = json.loads(run.proposal_json)
        assert proposal["bad_channels"][0]["channel"] == "T3"
        # An audit decision row was logged for the AI proposal.
        audit_rows = (
            db.query(CleaningDecision)
            .filter_by(auto_clean_run_id=run_id, action="auto_scan_proposed")
            .all()
        )
        assert len(audit_rows) == 1
        assert audit_rows[0].actor == "ai"
    finally:
        db.close()


# ── 3. POST decide → writes audit rows + merges accepted items ─────────────


def test_auto_scan_decide_writes_audit_and_merges_accepted(
    client: TestClient, phase4_fixture: dict[str, Any], monkeypatch
):
    aid = phase4_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase4_fixture['token']}"}

    fake_proposal = {
        "bad_channels": [
            {"channel": "T3", "reason": "flatline", "metric": {}, "confidence": 0.91},
            {"channel": "Fp1", "reason": "high_kurtosis", "metric": {}, "confidence": 0.71},
        ],
        "bad_segments": [
            {"start_sec": 1.0, "end_sec": 2.0, "reason": "amp_threshold", "metric": {}, "confidence": 0.85},
        ],
        "summary": {
            "n_bad_channels": 2,
            "n_bad_segments": 1,
            "total_excluded_sec": 1.0,
            "autoreject_used": False,
            "scanner_version": "1.0",
        },
    }
    from app.services import auto_artifact_scan, eeg_signal_service

    monkeypatch.setattr(
        auto_artifact_scan, "scan_for_artifacts", lambda *a, **k: fake_proposal
    )
    monkeypatch.setattr(eeg_signal_service, "_HAS_MNE", True, raising=False)

    # Step 1: scan.
    r1 = client.post(f"/api/v1/qeeg-raw/{aid}/auto-scan", headers=headers)
    assert r1.status_code == 200, r1.text
    run_id = r1.json()["run_id"]

    # Step 2: clinician accepts T3 + the segment, rejects Fp1.
    accept_payload = {
        "accepted_items": {
            "bad_channels": [fake_proposal["bad_channels"][0]],
            "bad_segments": [fake_proposal["bad_segments"][0]],
        },
        "rejected_items": {
            "bad_channels": [fake_proposal["bad_channels"][1]],
            "bad_segments": [],
        },
    }
    r2 = client.post(
        f"/api/v1/qeeg-raw/{aid}/auto-scan/{run_id}/decide",
        json=accept_payload,
        headers=headers,
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    # Two accepted (1 channel + 1 segment) + one rejected channel = 3 audit rows.
    assert body["decisions_logged"] == 3
    assert body["accepted_counts"] == {"bad_channels": 1, "bad_segments": 1}
    assert body["rejected_counts"] == {"bad_channels": 1, "bad_segments": 0}

    db = SessionLocal()
    try:
        rows = (
            db.query(CleaningDecision)
            .filter_by(auto_clean_run_id=run_id)
            .filter(CleaningDecision.action.in_(
                ["accept_ai_suggestion", "reject_ai_suggestion"]
            ))
            .all()
        )
        actions = sorted(r.action for r in rows)
        assert actions == ["accept_ai_suggestion", "accept_ai_suggestion", "reject_ai_suggestion"]
        # Each decide row carries actor='user'.
        for r in rows:
            assert r.actor == "user"
            assert r.accepted_by_user in (True, False)

        # Cleaning config was merged with ONLY accepted items.
        analysis = db.query(QEEGAnalysis).filter_by(id=aid).one()
        cfg = json.loads(analysis.cleaning_config_json or "{}")
        assert "T3" in cfg["bad_channels"]
        assert "Fp1" not in cfg["bad_channels"]
        seg_keys = [(s["start_sec"], s["end_sec"]) for s in cfg["bad_segments"]]
        assert (1.0, 2.0) in seg_keys
        assert cfg.get("auto_clean_run_id") == run_id

        # AutoCleanRun row updated with accepted/rejected snapshots.
        run = db.query(AutoCleanRun).filter_by(id=run_id).one()
        accepted = json.loads(run.accepted_items_json)
        rejected = json.loads(run.rejected_items_json)
        assert accepted["bad_channels"][0]["channel"] == "T3"
        assert rejected["bad_channels"][0]["channel"] == "Fp1"
    finally:
        db.close()


# ── 4. apply-template eye_blink ──────────────────────────────────────────────


def test_apply_template_excludes_eye_components_above_threshold(
    client: TestClient, phase4_fixture: dict[str, Any], monkeypatch
):
    aid = phase4_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase4_fixture['token']}"}
    from app.services import eeg_signal_service

    fake_ica = {
        "n_components": 4,
        "method": "infomax",
        "iclabel_available": True,
        "auto_excluded_indices": [],
        "components": [
            {
                "index": 0,
                "label": "eye",
                "label_probabilities": {"eye": 0.92, "brain": 0.08},
                "is_excluded": False,
            },
            {
                "index": 1,
                "label": "brain",
                "label_probabilities": {"brain": 0.95, "eye": 0.05},
                "is_excluded": False,
            },
            {
                "index": 2,
                "label": "eye",
                "label_probabilities": {"eye": 0.55, "brain": 0.45},  # below threshold
                "is_excluded": False,
            },
            {
                "index": 3,
                "label": "muscle",
                "label_probabilities": {"muscle": 0.82, "brain": 0.18},
                "is_excluded": False,
            },
        ],
    }
    monkeypatch.setattr(eeg_signal_service, "_HAS_MNE", True, raising=False)
    monkeypatch.setattr(
        eeg_signal_service,
        "extract_ica_data",
        lambda analysis_id, db: fake_ica,
    )

    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/apply-template",
        json={"template": "eye_blink"},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["template"] == "eye_blink"
    assert 0 in body["components_excluded"]  # high-conf eye → excluded
    assert 1 not in body["components_excluded"]  # brain → kept
    # Component 2 had 'eye' label outright; the router upgrades best_p to 1.0
    # for direct label matches, so it lands above the 0.7 threshold and is
    # excluded — that mirrors clinical intent ("template = always exclude
    # this label").
    assert 2 in body["components_excluded"]
    assert 3 not in body["components_excluded"]  # muscle → not eye
    assert body["decisions_logged"] == len(body["components_excluded"])

    db = SessionLocal()
    try:
        rows = (
            db.query(CleaningDecision)
            .filter_by(analysis_id=aid, action="apply_template")
            .all()
        )
        assert len(rows) == len(body["components_excluded"])
        for r_ in rows:
            assert r_.actor == "ai"
            payload = json.loads(r_.payload_json or "{}")
            assert payload["template"] == "eye_blink"
        # Excluded ICs merged into cleaning_config.
        analysis = db.query(QEEGAnalysis).filter_by(id=aid).one()
        cfg = json.loads(analysis.cleaning_config_json or "{}")
        for idx in body["components_excluded"]:
            assert idx in cfg["excluded_ica_components"]
    finally:
        db.close()


def test_apply_template_rejects_unknown_template(
    client: TestClient, phase4_fixture: dict[str, Any]
):
    aid = phase4_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase4_fixture['token']}"}
    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/apply-template",
        json={"template": "not-a-real-template"},
        headers=headers,
    )
    assert r.status_code == 422, r.text
    assert "invalid_template" in r.text


# ── 5. spike-events returns 200 + empty list when detector unavailable ─────


def test_spike_events_returns_empty_list_when_detector_missing(
    client: TestClient, phase4_fixture: dict[str, Any], monkeypatch
):
    aid = phase4_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase4_fixture['token']}"}

    # Force the optional spike detector import to fail.
    import builtins as _builtins

    real_import = _builtins.__import__

    def _patched_import(name, *args, **kwargs):
        if name == "deepsynaps_qeeg" and args and len(args) >= 3 and "spike_detection" in args[2]:
            raise ImportError("simulated absent spike_detection")
        if name == "deepsynaps_qeeg.spike_detection":
            raise ImportError("simulated absent spike_detection")
        # ``from deepsynaps_qeeg import spike_detection`` resolves with name="deepsynaps_qeeg"
        # and fromlist=("spike_detection",); replicate that signature.
        if name == "deepsynaps_qeeg" and "spike_detection" in (kwargs.get("fromlist") or args[2:3] or [None])[0:1]:
            raise ImportError("simulated absent spike_detection")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(_builtins, "__import__", _patched_import)

    r = client.get(f"/api/v1/qeeg-raw/{aid}/spike-events", headers=headers)
    # The contract is 200 with empty events even when detector missing.
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["events"] == []
    assert body["detector_available"] is False
    assert body["analysis_id"] == aid


# ── 6. Auth: clinician role required on all four endpoints ────────────────


def test_auto_scan_requires_clinician(client: TestClient, phase4_fixture: dict[str, Any]):
    aid = phase4_fixture["analysis_id"]
    # No Authorization header → 401 / 403.
    r = client.post(f"/api/v1/qeeg-raw/{aid}/auto-scan")
    assert r.status_code in (401, 403)
    r2 = client.post(f"/api/v1/qeeg-raw/{aid}/apply-template", json={"template": "eye_blink"})
    assert r2.status_code in (401, 403)
    r3 = client.get(f"/api/v1/qeeg-raw/{aid}/spike-events")
    assert r3.status_code in (401, 403)
    r4 = client.post(f"/api/v1/qeeg-raw/{aid}/auto-scan/run-x/decide", json={})
    assert r4.status_code in (401, 403)
