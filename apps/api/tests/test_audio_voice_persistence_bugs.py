"""Regression tests for BUG-001 and BUG-004 in voice analysis persistence.

BUG-001 — Persisted status was always "completed" because the router never
passed ``run.status`` to ``persist_voice_analysis``.

BUG-004 — Absolute filesystem paths and sensitive PHI fields were persisted
verbatim into the ``audio_analyses`` table.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import pytest

from app.database import SessionLocal
from app.persistence.models import AudioAnalysis, Clinic, Patient, User
from app.services.audio_voice_persistence import (
    _redact_run_context,
    _sanitize_input_path,
    _SENSITIVE_CONTEXT_KEYS,
    persist_voice_analysis,
)


def _seed_clinic_patient() -> dict[str, str]:
    """Return a dict with patient_id, clinic_id, and a clinician id."""
    db = SessionLocal()
    try:
        clinic = Clinic(id=str(uuid.uuid4()), name="Test Clinic")
        db.add(clinic)
        db.flush()

        clinician = User(
            id=str(uuid.uuid4()),
            email=f"clin_{uuid.uuid4().hex[:8]}@example.com",
            display_name="Test Clinician",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        db.add(clinician)
        db.flush()

        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clinician.id,
            first_name="Test",
            last_name="Patient",
        )
        db.add(patient)
        db.commit()

        return {
            "patient_id": patient.id,
            "clinic_id": clinic.id,
            "clinician_id": clinician.id,
        }
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────────────────────
# BUG-004 — Unit tests for sanitisation helpers
# ──────────────────────────────────────────────────────────────────────────────


class TestSanitizeInputPath:
    """BUG-FIX-004: _sanitize_input_path must strip absolute filesystem paths."""

    def test_none_returns_empty(self):
        assert _sanitize_input_path(None) == ""

    def test_empty_string_returns_empty(self):
        assert _sanitize_input_path("") == ""

    def test_already_relative_path_unchanged(self):
        assert _sanitize_input_path("uploads/voice/sample.wav") == "uploads/voice/sample.wav"

    def test_strips_unix_absolute_prefix(self):
        result = _sanitize_input_path("/var/lib/deepsynaps/media/audio/patient123.wav")
        assert "/var/lib" not in result
        # Last 3 components retained
        assert result == "media/audio/patient123.wav"

    def test_strips_deep_unix_path(self):
        result = _sanitize_input_path("/very/deep/nested/path/to/file.wav")
        assert result == "path/to/file.wav"

    def test_strips_windows_drive_letter(self):
        result = _sanitize_input_path(r"C:\Users\admin\media\file.wav")
        assert "C:" not in result
        # Last 3 components retained (Users filtered as drive-letter neighbour)
        assert result == "admin/media/file.wav"

    def test_short_path_preserved(self):
        assert _sanitize_input_path("audio/file.wav") == "audio/file.wav"

    def test_filename_only_unchanged(self):
        assert _sanitize_input_path("sample.wav") == "sample.wav"

    def test_keeps_last_three_components(self):
        path = "a/b/c/d/e/final.wav"
        result = _sanitize_input_path(path)
        assert result == "d/e/final.wav"
        assert result.count("/") <= 2


class TestRedactRunContext:
    """BUG-FIX-004: _redact_run_context must strip sensitive PHI keys."""

    def test_empty_dict(self):
        assert _redact_run_context({}) == {}

    def test_innocent_keys_preserved(self):
        ctx = {"session_id": "s-1", "task_protocol": "sustained_vowel_a", "snr_db": 24.0}
        assert _redact_run_context(ctx) == ctx

    def test_all_sensitive_keys_removed(self):
        ctx = {key: "leak" for key in _SENSITIVE_CONTEXT_KEYS}
        ctx["safe_key"] = "preserved"
        result = _redact_run_context(ctx)
        assert all(key not in result for key in _SENSITIVE_CONTEXT_KEYS)
        assert result["safe_key"] == "preserved"

    def test_partial_redaction(self):
        ctx = {
            "session_id": "s-1",
            "patient_name": "John Doe",
            "email": "john@example.com",
            "ssn": "123-45-6789",
            "snr_db": 24.0,
        }
        result = _redact_run_context(ctx)
        assert "session_id" in result
        assert "snr_db" in result
        assert "patient_name" not in result
        assert "email" not in result

    def test_nested_dicts_are_preserved_as_values(self):
        """Values that happen to be dicts are left intact; only top-level keys are filtered."""
        ctx = {"metadata": {"patient_name": "nested"}, "session_id": "s-1"}
        assert _redact_run_context(ctx) == ctx

    def test_voice_report_payload_removed(self):
        """Defense-in-depth: voice_report_payload already excluded upstream,
        but the redactor must also catch it."""
        ctx = {"voice_report_payload": {"secret": "data"}, "session_id": "s-1"}
        result = _redact_run_context(ctx)
        assert "voice_report_payload" not in result
        assert "session_id" in result


# ──────────────────────────────────────────────────────────────────────────────
# BUG-001 — Integration: persisted status must match pipeline status
# ──────────────────────────────────────────────────────────────────────────────


class TestPersistedStatusBug001:
    """BUG-FIX-001: persist_voice_analysis must honour the *status* argument."""

    def test_status_warning_persisted(self):
        """When status='warning' is passed, the DB row must reflect it."""
        setup = _seed_clinic_patient()
        db = SessionLocal()
        try:
            analysis_id = str(uuid.uuid4())
            persist_voice_analysis(
                db,
                analysis_id=analysis_id,
                voice_report={"qc": {"snr_db": 20.0}},
                run_context={"session_id": "s-1"},
                patient_id=setup["patient_id"],
                session_id="s-1",
                run_id="run-001",
                input_path="uploads/sample.wav",
                status="warning",  # non-default status
            )

            row = db.get(AudioAnalysis, analysis_id)
            assert row is not None
            assert row.status == "warning"
        finally:
            db.close()

    def test_status_error_persisted(self):
        """When status='error' is passed, the DB row must reflect it."""
        setup = _seed_clinic_patient()
        db = SessionLocal()
        try:
            analysis_id = str(uuid.uuid4())
            persist_voice_analysis(
                db,
                analysis_id=analysis_id,
                voice_report={"qc": {"snr_db": 10.0}},
                run_context={"session_id": "s-2"},
                patient_id=setup["patient_id"],
                session_id="s-2",
                run_id="run-002",
                input_path="uploads/sample.wav",
                status="error",
            )

            row = db.get(AudioAnalysis, analysis_id)
            assert row is not None
            assert row.status == "error"
        finally:
            db.close()

    def test_default_status_is_completed(self):
        """Without an explicit status argument, the row defaults to 'completed'."""
        setup = _seed_clinic_patient()
        db = SessionLocal()
        try:
            analysis_id = str(uuid.uuid4())
            persist_voice_analysis(
                db,
                analysis_id=analysis_id,
                voice_report={"qc": {"snr_db": 30.0}},
                run_context={"session_id": "s-3"},
                patient_id=setup["patient_id"],
                session_id="s-3",
                run_id="run-003",
                input_path="uploads/sample.wav",
                # status omitted — should default to "completed"
            )

            row = db.get(AudioAnalysis, analysis_id)
            assert row is not None
            assert row.status == "completed"
        finally:
            db.close()

    def test_status_matches_api_response(self):
        """End-to-end: the status stored in the DB must match what the API returns."""
        setup = _seed_clinic_patient()
        db = SessionLocal()
        try:
            analysis_id = str(uuid.uuid4())
            # Simulate a pipeline run that returns status="warning"
            persist_voice_analysis(
                db,
                analysis_id=analysis_id,
                voice_report={"qc": {"snr_db": 18.0, "flag": "low_snr"}},
                run_context={"session_id": "s-4", "task_protocol": "sustained_vowel_a"},
                patient_id=setup["patient_id"],
                session_id="s-4",
                run_id="run-004",
                input_path="uploads/voice/test.wav",
                status="warning",  # This simulates run.status being passed
            )

            row = db.get(AudioAnalysis, analysis_id)
            assert row is not None
            # The DB status must match what would be returned in the API response
            assert row.status == "warning"
            assert row.status != "completed"
        finally:
            db.close()


# ──────────────────────────────────────────────────────────────────────────────
# BUG-004 — Integration: sanitised values in DB row
# ──────────────────────────────────────────────────────────────────────────────


class TestSanitizedPersistenceBug004:
    """BUG-FIX-004: verify that absolute paths and sensitive context never reach the DB."""

    def test_absolute_path_sanitized_before_persist(self):
        setup = _seed_clinic_patient()
        db = SessionLocal()
        try:
            analysis_id = str(uuid.uuid4())
            persist_voice_analysis(
                db,
                analysis_id=analysis_id,
                voice_report={"qc": {"snr_db": 25.0}},
                run_context={"session_id": "s-1"},
                patient_id=setup["patient_id"],
                session_id="s-1",
                input_path="/var/lib/deepsynaps/media/voice/patient123/session456/recording.wav",
            )

            row = db.get(AudioAnalysis, analysis_id)
            assert row is not None
            # Must NOT contain the absolute prefix
            assert "/var/lib" not in row.input_path
            # Must contain only the last 3 components
            assert row.input_path == "patient123/session456/recording.wav"
        finally:
            db.close()

    def test_sensitive_context_redacted_before_persist(self):
        setup = _seed_clinic_patient()
        db = SessionLocal()
        try:
            analysis_id = str(uuid.uuid4())
            persist_voice_analysis(
                db,
                analysis_id=analysis_id,
                voice_report={"qc": {"snr_db": 25.0}},
                run_context={
                    "session_id": "s-1",
                    "patient_name": "John Doe",
                    "email": "john@example.com",
                    "ssn": "123-45-6789",
                    "task_protocol": "sustained_vowel_a",
                },
                patient_id=setup["patient_id"],
                session_id="s-1",
                input_path="uploads/sample.wav",
            )

            row = db.get(AudioAnalysis, analysis_id)
            assert row is not None
            ctx = json.loads(row.run_context_json or "{}")
            assert "patient_name" not in ctx
            assert "email" not in ctx
            assert "ssn" not in ctx
            # Safe keys must be preserved
            assert ctx["session_id"] == "s-1"
            assert ctx["task_protocol"] == "sustained_vowel_a"
        finally:
            db.close()

    def test_input_recording_ref_preserved_in_context(self):
        """The recording ref is added to context *before* redaction, so it survives."""
        setup = _seed_clinic_patient()
        db = SessionLocal()
        try:
            analysis_id = str(uuid.uuid4())
            persist_voice_analysis(
                db,
                analysis_id=analysis_id,
                voice_report={"qc": {"snr_db": 25.0}},
                run_context={"session_id": "s-1"},
                patient_id=setup["patient_id"],
                session_id="s-1",
                input_path="uploads/sample.wav",
                input_recording_ref="media:uploads/abc.wav",
            )

            row = db.get(AudioAnalysis, analysis_id)
            assert row is not None
            ctx = json.loads(row.run_context_json or "{}")
            assert ctx.get("input_recording_ref") == "media:uploads/abc.wav"
        finally:
            db.close()

    def test_voice_report_payload_not_in_context(self):
        """Defense-in-depth: even if voice_report_payload sneaks into context,
        the redactor strips it."""
        setup = _seed_clinic_patient()
        db = SessionLocal()
        try:
            analysis_id = str(uuid.uuid4())
            persist_voice_analysis(
                db,
                analysis_id=analysis_id,
                voice_report={"qc": {"snr_db": 25.0}},
                run_context={
                    "session_id": "s-1",
                    "voice_report_payload": {"secret": "biomarker_data"},
                },
                patient_id=setup["patient_id"],
                session_id="s-1",
                input_path="uploads/sample.wav",
            )

            row = db.get(AudioAnalysis, analysis_id)
            assert row is not None
            ctx = json.loads(row.run_context_json or "{}")
            assert "voice_report_payload" not in ctx
        finally:
            db.close()


# ──────────────────────────────────────────────────────────────────────────────
# Source-code audit: verify the router forwards run.status
# ──────────────────────────────────────────────────────────────────────────────


def test_router_source_code_forwards_run_status() -> None:
    """Static check: confirm the router source contains ``status=run.status``
    in the ``persist_voice_analysis`` call inside ``_run_and_persist``.

    This guards against BUG-001 regressions when the file is edited without
    running the full integration suite.
    """
    from pathlib import Path

    router_file = Path(__file__).resolve().parents[1] / "app" / "routers" / "audio_analysis_router.py"
    assert router_file.exists(), f"Router file not found: {router_file}"
    source = router_file.read_text()

    assert "status=run.status" in source, (
        "BUG-001 REGRESSION: _run_and_persist does not pass status=run.status "
        "to persist_voice_analysis. The router will always default to 'completed'."
    )
    # Also confirm the call is to persist_voice_analysis, not some other function
    assert "persist_voice_analysis(" in source


def test_persistence_source_code_has_sanitization() -> None:
    """Static check: confirm persist_voice_analysis uses sanitization helpers.

    Guards against BUG-004 regressions.
    """
    from pathlib import Path

    persist_file = Path(__file__).resolve().parents[1] / "app" / "services" / "audio_voice_persistence.py"
    assert persist_file.exists(), f"Persistence file not found: {persist_file}"
    source = persist_file.read_text()

    assert "_sanitize_input_path(input_path)" in source, (
        "BUG-004 REGRESSION: persist_voice_analysis does not sanitize input_path"
    )
    assert "_redact_run_context(ctx_out)" in source, (
        "BUG-004 REGRESSION: persist_voice_analysis does not redact run_context"
    )
    assert "BUG-FIX-004" in source, "BUG-FIX-004 comment missing"
    # Sensitive keys must be defined
    assert "patient_name" in source
    assert "ssn" in source
    assert "voice_report_payload" in source
