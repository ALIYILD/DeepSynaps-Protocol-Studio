from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from app.database import SessionLocal
from app.persistence.models import AudioAnalysis, Clinic, Patient, User
from app.services.auth_service import create_access_token


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _mint_token(user_id: str, role: str, clinic_id: str | None) -> str:
    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role=role,
        package_id="explorer",
        clinic_id=clinic_id,
    )


def _seed_audio_scope_setup() -> dict[str, str]:
    db = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Clinic A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Clinic B")
        db.add_all([clinic_a, clinic_b])
        db.flush()

        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"clin_a_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Clinician A",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"clin_b_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Clinician B",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_b.id,
        )
        db.add_all([clin_a, clin_b])
        db.flush()

        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin_a.id,
            first_name="Audio",
            last_name="Patient",
        )
        db.add(patient)
        db.flush()

        analysis = AudioAnalysis(
            analysis_id=str(uuid.uuid4()),
            patient_id=patient.id,
            session_id="sess-voice-1",
            run_id="run-voice-1",
            status="completed",
            voice_report_json=json.dumps({"qc": {"snr_db": 24.0}}, default=str),
            run_context_json=json.dumps({"source": "test"}, default=str),
            pipeline_version="test-pipeline",
            norm_db_version="test-norms",
            created_at=datetime.now(timezone.utc),
        )
        db.add(analysis)
        db.commit()

        return {
            "patient_id": patient.id,
            "analysis_id": analysis.analysis_id,
            "token_clin_a": _mint_token(clin_a.id, "clinician", clinic_a.id),
            "token_clin_b": _mint_token(clin_b.id, "clinician", clinic_b.id),
        }
    finally:
        db.close()


def test_audio_patient_analyses_same_clinic_visible(client) -> None:
    setup = _seed_audio_scope_setup()

    resp = client.get(
        f"/api/v1/audio/patients/{setup['patient_id']}/analyses",
        headers=_auth(setup["token_clin_a"]),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["analysis_id"] == setup["analysis_id"]


def test_audio_patient_analyses_limit_validation(client) -> None:
    setup = _seed_audio_scope_setup()
    headers = _auth(setup["token_clin_a"])

    low = client.get(
        f"/api/v1/audio/patients/{setup['patient_id']}/analyses?limit=0",
        headers=headers,
    )
    assert low.status_code == 422, low.text

    high = client.get(
        f"/api/v1/audio/patients/{setup['patient_id']}/analyses?limit=201",
        headers=headers,
    )
    assert high.status_code == 422, high.text


def test_audio_patient_analyses_other_clinic_blocked(client) -> None:
    setup = _seed_audio_scope_setup()

    resp = client.get(
        f"/api/v1/audio/patients/{setup['patient_id']}/analyses",
        headers=_auth(setup["token_clin_b"]),
    )

    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_audio_report_same_clinic_visible(client) -> None:
    setup = _seed_audio_scope_setup()

    resp = client.get(
        f"/api/v1/audio/report/{setup['analysis_id']}",
        headers=_auth(setup["token_clin_a"]),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["analysis_id"] == setup["analysis_id"]
    assert body["voice_report"]["qc"]["snr_db"] == 24.0


def test_audio_report_other_clinic_hidden(client) -> None:
    setup = _seed_audio_scope_setup()

    resp = client.get(
        f"/api/v1/audio/report/{setup['analysis_id']}",
        headers=_auth(setup["token_clin_b"]),
    )

    assert resp.status_code == 404, resp.text
    assert resp.json()["detail"] == "analysis not found"


def test_audio_analyze_upload_cross_clinic_patient_blocked(client) -> None:
    setup = _seed_audio_scope_setup()

    resp = client.post(
        "/api/v1/audio/analyze-upload",
        headers=_auth(setup["token_clin_b"]),
        data={
            "session_id": "sess-upload-1",
            "patient_id": setup["patient_id"],
        },
        files={
            "file": ("sample.wav", b"RIFFfakewave", "audio/wav"),
        },
    )

    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_audio_analyze_upload_cross_clinic_patient_blocked_with_padded_patient_id(client) -> None:
    setup = _seed_audio_scope_setup()

    resp = client.post(
        "/api/v1/audio/analyze-upload",
        headers=_auth(setup["token_clin_b"]),
        data={
            "session_id": "sess-upload-1",
            "patient_id": f"  {setup['patient_id']}  ",
        },
        files={
            "file": ("sample.wav", b"RIFFfakewave", "audio/wav"),
        },
    )

    assert resp.status_code == 403, resp.text
    assert resp.json()["code"] == "cross_clinic_access_denied"


def test_audio_analyze_upload_rejects_blank_session_id(client, auth_headers: dict) -> None:
    resp = client.post(
        "/api/v1/audio/analyze-upload",
        headers=auth_headers["clinician"],
        data={
            "session_id": "   ",
        },
        files={
            "file": ("sample.wav", b"RIFFfakewave", "audio/wav"),
        },
    )

    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "session_id is required"
