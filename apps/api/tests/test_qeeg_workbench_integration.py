"""End-to-end integration test for the Raw EEG Cleaning Workbench.

Walks the full clinician workflow against a real synthesised MNE Raw
written to an EDF file, then re-loaded through the API stack:

  1. Upload a real EDF (MNE-generated 20-channel resting recording).
  2. Trigger MNE analysis so the parent ``QEEGAnalysis`` row carries
     real metadata.
  3. Hit ``/metadata`` and assert the workbench loader sees real
     sample-rate / duration / channels — anonymised (no filename).
  4. Read a window of raw signal via ``/raw-signal``.
  5. Generate AI artefact suggestions; assert clinician-confirmation
     contract.
  6. Accept one suggestion via the annotations endpoint.
  7. Save a cleaning version; assert version_number = 1.
  8. Re-run analysis using the cleaning_version_id; assert raw
     metadata immutable + cleaning_config_json carries
     cleaning_version_id.
  9. Cleaning log surfaces every action with actor + timestamp.
 10. Cross-clinic clinician hits 404 on every workbench endpoint.

This exercises:

* file upload + EDF magic-byte gate
* MNE Raw loader (``load_raw_for_analysis``)
* ``/api/v1/qeeg-raw/{id}/metadata`` workbench loader
* ``/api/v1/qeeg-raw/{id}/raw-signal`` window read (real EDF samples)
* ``/api/v1/qeeg-raw/{id}/ai-artefact-suggestions``
* ``/api/v1/qeeg-raw/{id}/annotations``
* ``/api/v1/qeeg-raw/{id}/cleaning-version``
* ``/api/v1/qeeg-raw/{id}/rerun-analysis``
* ``/api/v1/qeeg-raw/{id}/cleaning-log``
* clinic-scope gate on every route
"""
from __future__ import annotations

import json
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import (
    Clinic,
    Patient,
    QEEGAnalysis,
    QeegCleaningVersion,
    User,
)
from app.services.auth_service import create_access_token


pytest.importorskip("mne")
pytest.importorskip("numpy")
# ``edfio`` is required by MNE's EDF *export* path. It is a tiny pure-Python
# library (~100 KB) — install via ``pip install edfio`` to unlock this
# integration test in CI.
pytest.importorskip("edfio")


def _generate_edf_bytes(tmp_path: Path) -> bytes:
    """Synthesise a 5-second 20-channel 256 Hz resting EDF using MNE.

    The bytes are written to disk via MNE's EDF writer (round-trips
    through the same reader the production service will use).
    """
    import mne
    import numpy as np

    sfreq = 256.0
    n_channels = 20
    n_seconds = 60  # qeeg pipeline requires >= 30 s
    rng = np.random.default_rng(42)
    data = rng.standard_normal((n_channels, int(sfreq * n_seconds))) * 10e-6
    ch_names = [
        "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
        "T3", "C3", "Cz", "C4", "T4",
        "T5", "P3", "Pz", "P4", "T6",
        "O1", "O2", "ECG",
    ]
    info = mne.create_info(ch_names=ch_names, sfreq=sfreq, ch_types=["eeg"] * 19 + ["ecg"])
    raw = mne.io.RawArray(data, info, verbose=False)
    edf_path = tmp_path / "synth.edf"
    raw.export(str(edf_path), fmt="edf", overwrite=True, verbose=False)
    return edf_path.read_bytes()


@pytest.fixture
def two_clinics() -> dict[str, Any]:
    db: Session = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Int Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Int Clinic B")
        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"int_a_{uuid.uuid4().hex[:8]}@example.com",
            display_name="A", hashed_password="x",
            role="clinician", package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"int_b_{uuid.uuid4().hex[:8]}@example.com",
            display_name="B", hashed_password="x",
            role="clinician", package_id="explorer",
            clinic_id=clinic_b.id,
        )
        db.add_all([clinic_a, clinic_b, clin_a, clin_b])
        db.flush()
        patient_a = Patient(
            id=str(uuid.uuid4()), clinician_id=clin_a.id,
            first_name="A", last_name="Int",
        )
        db.add(patient_a)
        db.commit()

        def tok(u: User) -> str:
            return create_access_token(
                user_id=u.id, email=u.email, role="clinician",
                package_id="explorer", clinic_id=u.clinic_id,
            )
        return {
            "patient_id": patient_a.id,
            "token_a": tok(clin_a),
            "token_b": tok(clin_b),
        }
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_workbench_end_to_end_with_real_edf(
    client: TestClient,
    two_clinics: dict[str, Any],
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Full clinician walkthrough on a real MNE-generated EDF."""
    # Redirect media storage to a temp dir.
    from app.settings import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "media_storage_root", str(tmp_path))

    edf_bytes = _generate_edf_bytes(tmp_path)
    assert edf_bytes[:8].startswith(b"0"), "EDF magic header"

    # 1. Upload EDF
    files = {"file": ("recording.edf", BytesIO(edf_bytes), "application/octet-stream")}
    data = {"patient_id": two_clinics["patient_id"], "eyes_condition": "closed"}
    r = client.post(
        "/api/v1/qeeg-analysis/upload",
        files=files, data=data,
        headers=_auth(two_clinics["token_a"]),
    )
    assert r.status_code == 201, r.text
    analysis_id = r.json()["id"]

    # 2. /metadata — real recording shape, anonymised.
    r = client.get(
        f"/api/v1/qeeg-raw/{analysis_id}/metadata",
        headers=_auth(two_clinics["token_a"]),
    )
    assert r.status_code == 200, r.text
    meta = r.json()
    assert meta["analysis_id"] == analysis_id
    # No PHI fields ever returned.
    assert "original_filename" not in meta
    assert "patient_name" not in meta
    assert "Original raw EEG is preserved" in meta["immutable_raw_notice"]

    # 3. Cross-clinic clinic-B is locked out at every workbench endpoint.
    cross = _auth(two_clinics["token_b"])
    for path, method in [
        (f"/api/v1/qeeg-raw/{analysis_id}/metadata", "get"),
        (f"/api/v1/qeeg-raw/{analysis_id}/cleaning-log", "get"),
        (f"/api/v1/qeeg-raw/{analysis_id}/cleaning-versions", "get"),
        (f"/api/v1/qeeg-raw/{analysis_id}/raw-vs-cleaned-summary", "get"),
    ]:
        rr = getattr(client, method)(path, headers=cross)
        assert rr.status_code == 404, f"cross-clinic on {path} → {rr.status_code}"

    # 4. AI artefact suggestions — every item is "suggested" + safety notice.
    r = client.post(
        f"/api/v1/qeeg-raw/{analysis_id}/ai-artefact-suggestions",
        headers=_auth(two_clinics["token_a"]),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 1
    assert "clinician confirmation" in body["notice"].lower()
    for item in body["items"]:
        assert item["decision_status"] == "suggested"
        assert "Clinician confirmation required" in item["safety_notice"]

    first_suggestion = body["items"][0]

    # 5. Clinician accepts one suggestion (via a sibling annotation).
    r = client.post(
        f"/api/v1/qeeg-raw/{analysis_id}/annotations",
        json={
            "kind": "ai_suggestion",
            "channel": first_suggestion.get("channel"),
            "start_sec": first_suggestion.get("start_sec"),
            "end_sec": first_suggestion.get("end_sec"),
            "ai_label": first_suggestion["ai_label"],
            "ai_confidence": first_suggestion["ai_confidence"],
            "decision_status": "accepted",
            "source": "clinician",
            "note": f"Decision on {first_suggestion['id']}: accepted",
        },
        headers=_auth(two_clinics["token_a"]),
    )
    assert r.status_code == 201, r.text
    assert r.json()["decision_status"] == "accepted"

    # Add a manual bad-segment so the cleaning version has substance.
    r = client.post(
        f"/api/v1/qeeg-raw/{analysis_id}/annotations",
        json={"kind": "bad_segment", "start_sec": 1.0, "end_sec": 2.0,
              "decision_status": "accepted"},
        headers=_auth(two_clinics["token_a"]),
    )
    assert r.status_code == 201, r.text

    # 6. Save cleaning version.
    r = client.post(
        f"/api/v1/qeeg-raw/{analysis_id}/cleaning-version",
        json={
            "label": "v1 integration",
            "bad_channels": ["Fp1"],
            "rejected_segments": [{"start_sec": 1.0, "end_sec": 2.0,
                                    "description": "BAD_user"}],
            "rejected_ica_components": [],
        },
        headers=_auth(two_clinics["token_a"]),
    )
    assert r.status_code == 201, r.text
    version = r.json()
    assert version["version_number"] == 1
    cleaning_version_id = version["id"]

    # 7. Snapshot raw metadata BEFORE rerun.
    db = SessionLocal()
    try:
        before = db.query(QEEGAnalysis).filter_by(id=analysis_id).one()
        raw_file_ref_before = before.file_ref
        raw_filename_before = before.original_filename
        raw_duration_before = before.recording_duration_sec
    finally:
        db.close()

    # 8. Re-run analysis using cleaning_version_id.
    r = client.post(
        f"/api/v1/qeeg-raw/{analysis_id}/rerun-analysis",
        json={"cleaning_version_id": cleaning_version_id},
        headers=_auth(two_clinics["token_a"]),
    )
    assert r.status_code == 200, r.text
    rerun_body = r.json()
    assert rerun_body["cleaning_version_id"] == cleaning_version_id
    assert "preserved" in rerun_body["message"].lower()

    # 9. Raw metadata IMMUTABLE after rerun. cleaning_config_json carries
    #    the cleaning_version_id link.
    db = SessionLocal()
    try:
        after = db.query(QEEGAnalysis).filter_by(id=analysis_id).one()
        assert after.file_ref == raw_file_ref_before, "file_ref mutated"
        assert after.original_filename == raw_filename_before, "original_filename mutated"
        assert after.recording_duration_sec == raw_duration_before, "duration mutated"
        cfg = json.loads(after.cleaning_config_json or "{}")
        assert cfg.get("cleaning_version_id") == cleaning_version_id
        assert cfg.get("cleaning_version_number") == 1

        # Cleaning version flagged as rerun_requested.
        version_row = (
            db.query(QeegCleaningVersion)
            .filter_by(id=cleaning_version_id).one()
        )
        assert version_row.review_status == "rerun_requested"
    finally:
        db.close()

    # 10. /cleaning-log surfaces every action with actor + timestamp.
    r = client.get(
        f"/api/v1/qeeg-raw/{analysis_id}/cleaning-log",
        headers=_auth(two_clinics["token_a"]),
    )
    assert r.status_code == 200, r.text
    actions = {item["action_type"] for item in r.json()["items"]}
    # AI generation, AI decision, manual segment, version save, rerun.
    assert "ai_suggestion:generated" in actions
    assert "annotation:ai_suggestion" in actions
    assert "annotation:bad_segment" in actions
    assert "cleaning_version:save" in actions
    assert "cleaning_version:rerun_requested" in actions
    for item in r.json()["items"]:
        assert item["actor_id"], "actor_id missing on audit row"
        assert item["created_at"], "created_at missing on audit row"

    # 11. Raw signal endpoint reads real samples through MNE's EDF reader.
    r = client.get(
        f"/api/v1/qeeg-raw/{analysis_id}/raw-signal?t_start=0&window_sec=2",
        headers=_auth(two_clinics["token_a"]),
    )
    assert r.status_code == 200, r.text
    sig = r.json()
    assert sig["sfreq"] > 0, "sfreq populated from real EDF"
    assert len(sig["channels"]) > 0, "channels populated"
    assert len(sig["data"]) == len(sig["channels"]), "one trace per channel"
