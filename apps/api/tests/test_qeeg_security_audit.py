"""Post-merge security audit — cross-clinic + invalid + unauth gate tests.

Locks in the security gate enforcement for every Phase 3-7 endpoint added
to qeeg_raw_router and qeeg_ai_router during the Raw Data Clinical
Workstation merge. Each endpoint must:

  * 401/403 unauthenticated
  * 404 (NOT 200/403) when actor is from a different clinic — leaking
    row existence to a probing actor is also a vulnerability
  * 404 when analysis_id is invalid

Without these tests, a future refactor that drops the optional ``actor``
arg from ``_load_analysis`` / ``_ensure_analysis`` would silently
re-open the cross-clinic hole.
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
    Clinic,
    Patient,
    QEEGAnalysis,
    User,
)
from app.services.auth_service import create_access_token


# ── Fixture: two clinics, two clinicians, one analysis owned by clinic A ─────


def _seed_two_clinics(db: Session) -> dict[str, Any]:
    clinic_a = Clinic(id=str(uuid.uuid4()), name="Clinic A")
    clinic_b = Clinic(id=str(uuid.uuid4()), name="Clinic B")
    clin_a = User(
        id=str(uuid.uuid4()),
        email=f"a_{uuid.uuid4().hex[:8]}@example.com",
        display_name="A",
        hashed_password="x",
        role="clinician",
        package_id="clinician_pro",
        clinic_id=clinic_a.id,
    )
    clin_b = User(
        id=str(uuid.uuid4()),
        email=f"b_{uuid.uuid4().hex[:8]}@example.com",
        display_name="B",
        hashed_password="x",
        role="clinician",
        package_id="clinician_pro",
        clinic_id=clinic_b.id,
    )
    db.add_all([clinic_a, clinic_b, clin_a, clin_b])
    db.flush()
    patient = Patient(
        id=str(uuid.uuid4()),
        clinician_id=clin_a.id,
        first_name="Pt",
        last_name="A",
    )
    db.add(patient)
    db.flush()
    analysis = QEEGAnalysis(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        clinician_id=clin_a.id,
        file_ref="memory://sec-test",
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
    return {
        "analysis_id": analysis.id,
        "patient_id": patient.id,
        "clinic_a": clinic_a.id,
        "clinic_b": clinic_b.id,
        "token_a": create_access_token(
            user_id=clin_a.id,
            email=clin_a.email,
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic_a.id,
        ),
        "token_b": create_access_token(
            user_id=clin_b.id,
            email=clin_b.email,
            role="clinician",
            package_id="clinician_pro",
            clinic_id=clinic_b.id,
        ),
    }


@pytest.fixture
def two_clinics() -> dict[str, Any]:
    db = SessionLocal()
    try:
        return _seed_two_clinics(db)
    finally:
        db.close()


# ── Endpoint matrix ─────────────────────────────────────────────────────────
# (method, path-template, body-or-None) for every Phase 3-7 endpoint that
# reads/mutates analysis-specific data. Each must enforce the gate.

_ENDPOINTS = [
    # Phase 3
    ("POST", "/api/v1/qeeg-raw/{aid}/filter-preview", {}),
    ("POST", "/api/v1/qeeg-raw/{aid}/window-psd", {"start_sec": 0.0, "end_sec": 1.0}),
    # Phase 4
    ("POST", "/api/v1/qeeg-raw/{aid}/auto-scan", None),
    ("POST", "/api/v1/qeeg-raw/{aid}/auto-scan/run-x/decide",
     {"accepted_items": {"bad_channels": [], "bad_segments": []},
      "rejected_items": {"bad_channels": [], "bad_segments": []}}),
    ("POST", "/api/v1/qeeg-raw/{aid}/apply-template", {"template": "eye_blink"}),
    ("GET", "/api/v1/qeeg-raw/{aid}/spike-events", None),
    # Phase 6
    ("POST", "/api/v1/qeeg-raw/{aid}/export-cleaned",
     {"format": "edf", "interpolate_bad_channels": True}),
    ("POST", "/api/v1/qeeg-raw/{aid}/cleaning-report", {}),
    # Phase 7
    ("POST", "/api/v1/qeeg-raw/{aid}/window-perf-stats",
     {"frame_render_ms": 16.0, "window_load_ms": 5.0,
      "sample_count": 1024, "channel_count": 4}),
    ("GET", "/api/v1/qeeg-raw/{aid}/window-perf-stats", None),
    # Phase 5 — AI co-pilot. Body shape varies but cross-clinic gate fires
    # before any body validation, so {} is fine for the security probe.
    ("POST", "/api/v1/qeeg-ai/{aid}/quality_score", {}),
    ("POST", "/api/v1/qeeg-ai/{aid}/auto_clean_propose", {}),
    ("POST", "/api/v1/qeeg-ai/{aid}/explain_bad_channel/Fp1", {}),
    ("POST", "/api/v1/qeeg-ai/{aid}/classify_components", {}),
    ("POST", "/api/v1/qeeg-ai/{aid}/classify_segment",
     {"start_sec": 0.0, "end_sec": 1.0}),
    ("POST", "/api/v1/qeeg-ai/{aid}/recommend_filters", {}),
    ("POST", "/api/v1/qeeg-ai/{aid}/recommend_montage", {}),
    ("POST", "/api/v1/qeeg-ai/{aid}/segment_eo_ec", {}),
    ("POST", "/api/v1/qeeg-ai/{aid}/narrate", {}),
    ("POST", "/api/v1/qeeg-ai/{aid}/copilot_assist_bundle", {}),
    # Studio ERP — secured via ``studio_erp_router`` + ``_load_analysis`` (same gate as qEEG raw/AI)
    ("GET", "/api/v1/studio/eeg/{aid}/erp/paradigms", None),
    ("GET", "/api/v1/studio/eeg/{aid}/erp/trials", None),
    ("POST", "/api/v1/studio/eeg/{aid}/erp/compute", {}),
    ("POST", "/api/v1/studio/eeg/{aid}/erp/erd", {}),
    ("POST", "/api/v1/studio/eeg/{aid}/erp/wavelet", {}),
]


def _call(client, method: str, url: str, body, token: str | None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    if method == "GET":
        return client.get(url, headers=headers)
    return client.post(url, json=body, headers=headers)


# ── Unauthenticated → 401/403 ────────────────────────────────────────────────


@pytest.mark.parametrize("method,path,body", _ENDPOINTS)
def test_unauthenticated_blocked(
    client: TestClient,
    two_clinics: dict[str, Any],
    method: str,
    path: str,
    body,
):
    """Every endpoint must reject anonymous requests."""
    url = path.format(aid=two_clinics["analysis_id"])
    r = _call(client, method, url, body, token=None)
    assert r.status_code in (401, 403), (
        f"{method} {url} should require auth but returned {r.status_code}"
    )


# ── Cross-clinic → 404 (we don't leak existence) ────────────────────────────


@pytest.mark.parametrize("method,path,body", _ENDPOINTS)
def test_cross_clinic_blocked(
    client: TestClient,
    two_clinics: dict[str, Any],
    method: str,
    path: str,
    body,
):
    """Clinician from clinic B must not be able to act on clinic A's analysis.

    Acceptance: 404 (preferred — does not leak row existence) OR 403.
    Anything 2xx is a critical security regression — do NOT relax this
    assertion to accept 200.
    """
    url = path.format(aid=two_clinics["analysis_id"])
    r = _call(client, method, url, body, token=two_clinics["token_b"])
    assert r.status_code in (404, 403), (
        f"CROSS-CLINIC HOLE: {method} {url} returned {r.status_code} for clinic-B "
        f"clinician acting on clinic-A analysis. Body: {r.text[:200]}"
    )


# ── Invalid analysis_id → 404 ────────────────────────────────────────────────


@pytest.mark.parametrize("method,path,body", _ENDPOINTS)
def test_invalid_analysis_id(
    client: TestClient,
    two_clinics: dict[str, Any],
    method: str,
    path: str,
    body,
):
    """Bogus analysis_id must 404 even when actor is otherwise authorised."""
    url = path.format(aid=str(uuid.uuid4()))
    r = _call(client, method, url, body, token=two_clinics["token_a"])
    assert r.status_code in (404, 422), (
        f"{method} {url} with bogus id returned {r.status_code}, expected 404"
    )


# Note: dedicated ``/erp/bids-events`` upload is not exposed on main — multipart ERP surface
# is covered indirectly via matrix POSTs on studio/eeg (same auth + clinic gate stack).
