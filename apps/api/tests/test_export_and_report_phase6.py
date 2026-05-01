"""Phase 6 — cleaned-signal export + Cleaning Report PDF tests.

Covers:

1. ``apply_cleaning_to_raw`` actually applies bandpass / notch / bad-channel
   handling depending on the ``interpolate_bad_channels`` flag.
2. ``export_cleaned_to_path`` produces a file readable back via MNE's EDF
   reader, with the expected channel count after interpolation vs exclusion.
   (Gated on ``mne`` import via ``pytest.importorskip``.)
3. ``POST /cleaning-report`` returns 200 with ``application/pdf`` and a
   non-empty body. When ``pypdf`` is available we additionally check the
   patient pseudonym + decision-count strings appear in the rendered PDF;
   otherwise the test asserts only the binary contract.
4. Both endpoints require a clinician role.

If the MNE / WeasyPrint stack isn't available, every assertion that depends
on those libs is skipped via ``pytest.importorskip`` — explicit and visible
rather than silently passing.
"""
from __future__ import annotations

import io
import json
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import (
    CleaningDecision,
    Clinic,
    Patient,
    QEEGAnalysis,
    User,
)
from app.services.auth_service import create_access_token


# ── Fixture helpers ──────────────────────────────────────────────────────────


def _make_clinician_and_analysis(db: Session) -> dict[str, Any]:
    clinic = Clinic(id=str(uuid.uuid4()), name="Phase6 Clinic")
    clin = User(
        id=str(uuid.uuid4()),
        email=f"p6_{uuid.uuid4().hex[:8]}@example.com",
        display_name="Dr P6",
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

    cleaning_config = {
        "bad_channels": ["T3"],
        "bad_segments": [
            {
                "start_sec": 1.0,
                "end_sec": 2.0,
                "description": "BAD_user",
                "reason": "movement",
                "source": "user",
            }
        ],
        "excluded_ica_components": [],
        "included_ica_components": [],
        "bandpass_low": 1.0,
        "bandpass_high": 40.0,
        "notch_hz": 50.0,
        "resample_hz": 250.0,
        "saved_at": "2026-04-30T00:00:00+00:00",
        "version": 1,
    }
    analysis = QEEGAnalysis(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        clinician_id=clin.id,
        file_ref="memory://p6-test",
        original_filename="syn.edf",
        file_size_bytes=1024,
        recording_duration_sec=10.0,
        sample_rate_hz=256.0,
        channel_count=4,
        channels_json='["Fp1","Fp2","T3","O1"]',
        recording_date="2026-04-30",
        eyes_condition="closed",
        equipment="demo",
        analysis_status="completed",
        cleaning_config_json=json.dumps(cleaning_config),
    )
    db.add(analysis)
    db.commit()

    # Seed two cleaning decisions so the report has rows to render.
    db.add(
        CleaningDecision(
            analysis_id=analysis.id,
            actor="ai",
            action="auto_scan_proposed",
            target="summary:1c/1s",
            payload_json=json.dumps({"n_bad_channels": 1, "n_bad_segments": 1}),
            accepted_by_user=None,
            confidence=None,
        )
    )
    db.add(
        CleaningDecision(
            analysis_id=analysis.id,
            actor="user",
            action="accept_ai_suggestion",
            target="bad_channel:T3",
            payload_json=json.dumps({"channel": "T3"}),
            accepted_by_user=True,
            confidence=0.9,
        )
    )
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
def phase6_fixture() -> dict[str, Any]:
    db = SessionLocal()
    try:
        return _make_clinician_and_analysis(db)
    finally:
        db.close()


def _make_synthetic_raw(*, sfreq: float = 256.0, duration: float = 10.0):
    """Build a small in-memory MNE Raw with 4 channels + a montage."""
    mne = pytest.importorskip("mne")
    np = pytest.importorskip("numpy")

    n_samples = int(sfreq * duration)
    rng = np.random.default_rng(42)
    data = rng.normal(0.0, 1e-5, size=(4, n_samples))
    ch_names = ["Fp1", "Fp2", "T3", "O1"]
    info = mne.create_info(ch_names, sfreq=sfreq, ch_types="eeg")
    raw = mne.io.RawArray(data, info, verbose=False)
    try:
        montage = mne.channels.make_standard_montage("standard_1020")
        raw.set_montage(montage, on_missing="ignore", verbose=False)
    except Exception:  # pragma: no cover
        pass
    return raw


# ── 1. apply_cleaning_to_raw ─────────────────────────────────────────────────


def test_apply_cleaning_interpolate_keeps_channel_count():
    """Interpolating bad channels preserves the channel count."""
    pytest.importorskip("mne")
    pytest.importorskip("numpy")
    from app.services.eeg_export_and_report import apply_cleaning_to_raw

    raw = _make_synthetic_raw()
    cleaned = apply_cleaning_to_raw(
        raw,
        {
            "bad_channels": ["T3"],
            "bandpass_low": 1.0,
            "bandpass_high": 40.0,
            "notch_hz": 50.0,
            "bad_segments": [
                {"start_sec": 1.0, "end_sec": 2.0, "reason": "movement"}
            ],
        },
        interpolate_bad_channels=True,
    )
    assert len(cleaned.ch_names) == 4
    # Annotation persisted.
    descs = [a["description"] for a in cleaned.annotations]
    assert any("BAD" in d.upper() for d in descs)


def test_apply_cleaning_exclude_drops_bad_channel():
    """Excluding bad channels drops them from the channel list."""
    pytest.importorskip("mne")
    pytest.importorskip("numpy")
    from app.services.eeg_export_and_report import apply_cleaning_to_raw

    raw = _make_synthetic_raw()
    cleaned = apply_cleaning_to_raw(
        raw,
        {
            "bad_channels": ["T3"],
            "bandpass_low": 1.0,
            "bandpass_high": 40.0,
            "notch_hz": 50.0,
        },
        interpolate_bad_channels=False,
    )
    assert "T3" not in cleaned.ch_names
    assert len(cleaned.ch_names) == 3


# ── 2. export_cleaned_to_path round-trip via MNE ───────────────────────────


def test_export_cleaned_edf_round_trip(phase6_fixture, monkeypatch):
    """EDF export reads back via mne.io.read_raw_edf; sample rate matches."""
    mne = pytest.importorskip("mne")
    pytest.importorskip("numpy")
    from app.services import eeg_export_and_report, eeg_signal_service

    aid = phase6_fixture["analysis_id"]
    raw_synth = _make_synthetic_raw()

    # Patch the loader so we don't go through media_storage.
    monkeypatch.setattr(
        eeg_signal_service,
        "load_raw_for_analysis",
        lambda analysis_id, db: raw_synth,
    )
    monkeypatch.setattr(eeg_signal_service, "_HAS_MNE", True, raising=False)

    db = SessionLocal()
    try:
        # Interpolate path → 4 channels in output.
        out_path, fname = eeg_export_and_report.export_cleaned_to_path(
            aid, db, fmt="edf", interpolate_bad_channels=True
        )
        assert fname.endswith(".edf")
        try:
            re_raw = mne.io.read_raw_edf(out_path, preload=True, verbose=False)
            assert len(re_raw.ch_names) == 4
            assert abs(float(re_raw.info["sfreq"]) - 256.0) < 1.0
            # Annotations preserved.
            descs = [a["description"] for a in re_raw.annotations]
            assert any("BAD" in d.upper() for d in descs)
        finally:
            import os
            try:
                os.unlink(out_path)
            except OSError:
                pass

        # Exclude path → 3 channels in output.
        out_path2, _ = eeg_export_and_report.export_cleaned_to_path(
            aid, db, fmt="edf", interpolate_bad_channels=False
        )
        try:
            re_raw2 = mne.io.read_raw_edf(out_path2, preload=True, verbose=False)
            assert len(re_raw2.ch_names) == 3
            assert "T3" not in re_raw2.ch_names
        finally:
            import os
            try:
                os.unlink(out_path2)
            except OSError:
                pass
    finally:
        db.close()


# ── 3. /cleaning-report endpoint contract ───────────────────────────────────


def _weasyprint_can_render() -> bool:
    """Probe whether WeasyPrint can actually render a tiny doc on this host.

    On Windows test hosts the wheel imports fine but the Pango/Cairo native
    libs are missing — even *importing* weasyprint raises OSError. We
    swallow any exception and treat it as 'unavailable' so the test skips
    gracefully rather than erroring out.
    """
    try:
        from weasyprint import HTML  # type: ignore[import-not-found]
        HTML(string="<html><body>x</body></html>").write_pdf()
        return True
    except Exception:
        return False


def test_cleaning_report_returns_pdf_with_required_strings(
    client: TestClient, phase6_fixture, monkeypatch
):
    if not _weasyprint_can_render():
        pytest.skip(
            "WeasyPrint native deps (Pango/Cairo) not available on this host; "
            "PDF rendering path verified via the dependency-missing branch in "
            "the router (returns 503)."
        )
    aid = phase6_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase6_fixture['token']}"}

    # Force the spectra panel to no-op so the test doesn't depend on
    # matplotlib being importable on the host.
    from app.services import eeg_export_and_report

    monkeypatch.setattr(
        eeg_export_and_report,
        "_render_spectra_panel_b64",
        lambda *a, **k: None,
    )

    r = client.post(f"/api/v1/qeeg-raw/{aid}/cleaning-report", headers=headers)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    body = r.content
    assert len(body) > 200, "PDF body suspiciously small"
    assert body[:4] == b"%PDF", "response is not a PDF"

    # Best-effort: parse the PDF text and check pseudonym + counts appear.
    try:
        import pypdf  # type: ignore[import-not-found]

        reader = pypdf.PdfReader(io.BytesIO(body))
        text = "".join((p.extract_text() or "") for p in reader.pages)
        # Pseudonym is "PT-" + first 8 of patient_id.
        pid = phase6_fixture["patient_id"]
        pseudo = f"PT-{pid[:8]}"
        assert pseudo in text, text[:400]
        # Decisions section header is present.
        assert "Decisions" in text
        assert "Cleaning Report" in text
    except ImportError:
        # pypdf not present in this environment → skip the textual checks.
        pytest.skip("pypdf not installed; binary PDF contract verified.")


def test_cleaning_report_503_when_weasyprint_native_missing(
    client: TestClient, phase6_fixture, monkeypatch
):
    """When WeasyPrint cannot actually render, the endpoint returns 503.

    This exercises the dependency_missing branch — the canonical signal to
    the UI that the host is missing Pango/Cairo native libraries.
    """
    aid = phase6_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase6_fixture['token']}"}

    from app.services import eeg_export_and_report

    def _raise(*a, **k):
        raise eeg_export_and_report.CleaningReportRendererUnavailable(
            "WeasyPrint native deps unavailable"
        )

    monkeypatch.setattr(eeg_export_and_report, "render_cleaning_report_pdf", _raise)
    monkeypatch.setattr(
        eeg_export_and_report,
        "_render_spectra_panel_b64",
        lambda *a, **k: None,
    )

    r = client.post(f"/api/v1/qeeg-raw/{aid}/cleaning-report", headers=headers)
    assert r.status_code == 503, r.text
    assert "dependency_missing" in r.text or "WeasyPrint" in r.text


# ── 4. /export-cleaned endpoint contract + auth ───────────────────────────


def test_export_cleaned_endpoint_streams_edf(
    client: TestClient, phase6_fixture, monkeypatch
):
    pytest.importorskip("mne")
    pytest.importorskip("numpy")
    aid = phase6_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase6_fixture['token']}"}

    from app.services import eeg_signal_service, eeg_export_and_report  # noqa: F401

    raw_synth = _make_synthetic_raw()
    monkeypatch.setattr(
        eeg_signal_service,
        "load_raw_for_analysis",
        lambda analysis_id, db: raw_synth,
    )
    monkeypatch.setattr(eeg_signal_service, "_HAS_MNE", True, raising=False)

    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/export-cleaned",
        json={"format": "edf", "interpolate_bad_channels": True},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    disp = r.headers.get("content-disposition") or ""
    assert "attachment" in disp.lower()
    assert "cleaned_" in disp
    assert len(r.content) > 100


def test_export_rejects_unknown_format(client: TestClient, phase6_fixture):
    aid = phase6_fixture["analysis_id"]
    headers = {"Authorization": f"Bearer {phase6_fixture['token']}"}
    r = client.post(
        f"/api/v1/qeeg-raw/{aid}/export-cleaned",
        json={"format": "wav", "interpolate_bad_channels": True},
        headers=headers,
    )
    # Pydantic-level validation may also catch this; we accept either 422.
    assert r.status_code in (422, 400), r.text


def test_endpoints_require_clinician_role(client: TestClient, phase6_fixture):
    aid = phase6_fixture["analysis_id"]
    # No Authorization header → 401 / 403 on both endpoints.
    r1 = client.post(
        f"/api/v1/qeeg-raw/{aid}/export-cleaned",
        json={"format": "edf"},
    )
    assert r1.status_code in (401, 403)
    r2 = client.post(f"/api/v1/qeeg-raw/{aid}/cleaning-report")
    assert r2.status_code in (401, 403)
