"""Unit tests for app.services.patient_context — prompt-safe context builder.

All DB I/O is mocked via get_patient patch.  Role-gating and PHI-safety
contracts are the primary focus.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.auth import AuthenticatedActor
from app.errors import ApiServiceError
from app.services.patient_context import (
    _BLOCKING_SAFETY_FLAGS,
    _MH_SECTION_LABELS,
    _parse_mh,
    _truncate,
    build_patient_medical_context,
)


# ── _parse_mh ─────────────────────────────────────────────────────────────────

class TestParseMh:
    def test_valid_json_dict_returned(self):
        raw = json.dumps({"sections": {"presenting": {"notes": "anxiety"}}})
        result = _parse_mh(raw)
        assert "sections" in result

    def test_none_returns_empty_dict(self):
        assert _parse_mh(None) == {}

    def test_empty_string_returns_empty_dict(self):
        assert _parse_mh("") == {}

    def test_invalid_json_returns_empty_dict(self):
        assert _parse_mh("NOT JSON") == {}

    def test_json_list_returns_empty_dict(self):
        # JSON array is not a dict — must return {}
        assert _parse_mh(json.dumps([1, 2, 3])) == {}


# ── _truncate ─────────────────────────────────────────────────────────────────

class TestTruncate:
    def test_short_string_unchanged(self):
        assert _truncate("hello", 100) == "hello"

    def test_long_string_gets_ellipsis(self):
        long = "x" * 2000
        result = _truncate(long, 1500)
        assert result.endswith("…")
        assert len(result) <= 1500

    def test_empty_returns_empty(self):
        assert _truncate("", 100) == ""


# ── blocking safety flags ─────────────────────────────────────────────────────

def test_blocking_safety_flags_include_seizure_history():
    assert "seizure_history" in _BLOCKING_SAFETY_FLAGS


def test_blocking_safety_flags_include_implanted_device():
    assert "implanted_device" in _BLOCKING_SAFETY_FLAGS


def test_blocking_safety_flags_include_pregnancy():
    assert "pregnancy" in _BLOCKING_SAFETY_FLAGS


# ── build_patient_medical_context ─────────────────────────────────────────────

def _clinician_actor(actor_id="clin-1"):
    return AuthenticatedActor(
        actor_id=actor_id,
        display_name="Dr Test",
        role="clinician",
    )


def _patient_actor():
    return AuthenticatedActor(
        actor_id="pat-1",
        display_name="Patient",
        role="patient",
    )


def _mock_patient(medical_history=None, first_name="Alice", primary_condition="ADHD"):
    p = MagicMock()
    p.medical_history = medical_history
    p.first_name = first_name
    p.primary_condition = primary_condition
    return p


class TestBuildPatientMedicalContext:
    @patch("app.services.patient_context.get_patient")
    def test_returns_summary_md_key(self, mock_get_patient):
        mock_get_patient.return_value = _mock_patient()
        db = MagicMock()
        result = build_patient_medical_context(db, _clinician_actor(), "pat-1")
        assert "summary_md" in result

    @patch("app.services.patient_context.get_patient")
    def test_raises_404_when_patient_not_found(self, mock_get_patient):
        mock_get_patient.return_value = None
        db = MagicMock()
        with pytest.raises(ApiServiceError) as exc_info:
            build_patient_medical_context(db, _clinician_actor(), "missing-id")
        assert exc_info.value.status_code == 404

    def test_raises_on_insufficient_role(self):
        db = MagicMock()
        with pytest.raises(ApiServiceError):
            build_patient_medical_context(db, _patient_actor(), "pat-1")

    @patch("app.services.patient_context.get_patient")
    def test_blocking_flag_triggers_requires_review(self, mock_get_patient):
        mh = json.dumps({
            "sections": {},
            "safety": {"flags": {"seizure_history": True}},
        })
        mock_get_patient.return_value = _mock_patient(medical_history=mh)
        db = MagicMock()
        result = build_patient_medical_context(db, _clinician_actor(), "pat-1")
        assert result["requires_review"] is True

    @patch("app.services.patient_context.get_patient")
    def test_reviewed_record_no_blocking_flag_not_requires_review(self, mock_get_patient):
        mh = json.dumps({
            "sections": {},
            "safety": {"flags": {}},
            "meta": {"reviewed_at": "2024-01-01T10:00:00Z"},
        })
        mock_get_patient.return_value = _mock_patient(medical_history=mh)
        db = MagicMock()
        result = build_patient_medical_context(db, _clinician_actor(), "pat-1")
        assert result["requires_review"] is False

    @patch("app.services.patient_context.get_patient")
    def test_unreviewed_record_requires_review(self, mock_get_patient):
        mh = json.dumps({"sections": {}, "safety": {"flags": {}}, "meta": {}})
        mock_get_patient.return_value = _mock_patient(medical_history=mh)
        db = MagicMock()
        result = build_patient_medical_context(db, _clinician_actor(), "pat-1")
        assert result["requires_review"] is True

    @patch("app.services.patient_context.get_patient")
    def test_sections_with_notes_appear_in_summary_md(self, mock_get_patient):
        mh = json.dumps({
            "sections": {"presenting": {"notes": "Persistent anxiety episodes"}},
            "safety": {"flags": {}},
            "meta": {"reviewed_at": "2024-01-01"},
        })
        mock_get_patient.return_value = _mock_patient(medical_history=mh)
        db = MagicMock()
        result = build_patient_medical_context(db, _clinician_actor(), "pat-1")
        assert "Persistent anxiety episodes" in result["summary_md"]

    @patch("app.services.patient_context.get_patient")
    def test_used_sections_populated(self, mock_get_patient):
        mh = json.dumps({
            "sections": {"presenting": {"notes": "Depression"}, "goals": {"notes": "Improve mood"}},
            "safety": {"flags": {}},
            "meta": {"reviewed_at": "2024-03-01"},
        })
        mock_get_patient.return_value = _mock_patient(medical_history=mh)
        db = MagicMock()
        result = build_patient_medical_context(db, _clinician_actor(), "pat-1")
        assert "presenting" in result["used_sections"]
        assert "goals" in result["used_sections"]

    @patch("app.services.patient_context.get_patient")
    def test_no_phi_in_summary_md_key_order(self, mock_get_patient):
        """summary_md must never contain clinician_id / patient_id."""
        mh = json.dumps({"sections": {}, "safety": {"flags": {}}, "meta": {}})
        mock_get_patient.return_value = _mock_patient(medical_history=mh)
        db = MagicMock()
        result = build_patient_medical_context(db, _clinician_actor(), "pat-1")
        assert "pat-1" not in result["summary_md"]
        assert "clin-1" not in result["summary_md"]

    @patch("app.services.patient_context.get_patient")
    def test_blocking_flag_labelled_in_summary_md(self, mock_get_patient):
        mh = json.dumps({
            "sections": {},
            "safety": {"flags": {"implanted_device": True}},
            "meta": {"reviewed_at": "2024-01-01"},
        })
        mock_get_patient.return_value = _mock_patient(medical_history=mh)
        db = MagicMock()
        result = build_patient_medical_context(db, _clinician_actor(), "pat-1")
        # Blocking flags must be marked [blocking] in the summary
        assert "[blocking]" in result["summary_md"]

    @patch("app.services.patient_context.get_patient")
    def test_include_sections_filter_respected(self, mock_get_patient):
        mh = json.dumps({
            "sections": {
                "presenting": {"notes": "Anxiety"},
                "goals": {"notes": "Better focus"},
            },
            "safety": {"flags": {}},
            "meta": {"reviewed_at": "2024-01-01"},
        })
        mock_get_patient.return_value = _mock_patient(medical_history=mh)
        db = MagicMock()
        result = build_patient_medical_context(
            db, _clinician_actor(), "pat-1", include_sections=["presenting"]
        )
        assert "Anxiety" in result["summary_md"]
        assert "Better focus" not in result["summary_md"]
        assert result["used_sections"] == ["presenting"]
