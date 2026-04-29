"""Tests for fusion safety gates (Migration 054).

Covers red-flag classification, radiology review, report-state warnings,
and recency checks.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from app.services.fusion_safety_service import (
    _check_red_flags,
    _check_radiology_review,
    _check_report_state,
    _check_recency,
    run_safety_gates,
)


class FakeQEEGAnalysis:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class FakeMriAnalysis:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class FakeQEEGAIReport:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


# ── Red flag checks ──────────────────────────────────────────────────────────


def test_check_red_flags_no_flags():
    analysis = FakeQEEGAnalysis(
        safety_cockpit_json=json.dumps({"red_flags": [], "overall_status": "OK"}),
        red_flags_json=None,
    )
    assert _check_red_flags(analysis, "qEEG") == []


def test_check_red_flags_critical_unresolved_blocks():
    analysis = FakeQEEGAnalysis(
        safety_cockpit_json=json.dumps({
            "red_flags": [
                {"code": "EPILEPTIFORM", "severity": "critical", "message": "Spikes detected", "resolved": False}
            ]
        }),
        red_flags_json=None,
    )
    reasons = _check_red_flags(analysis, "qEEG")
    assert len(reasons) == 1
    assert "EPILEPTIFORM" in reasons[0]
    assert "critical" in reasons[0]


def test_check_red_flags_critical_resolved_does_not_block():
    analysis = FakeQEEGAnalysis(
        safety_cockpit_json=json.dumps({
            "red_flags": [
                {"code": "EPILEPTIFORM", "severity": "critical", "message": "Spikes detected", "resolved": True}
            ]
        }),
        red_flags_json=None,
    )
    assert _check_red_flags(analysis, "qEEG") == []


def test_check_red_flags_from_standalone_json():
    analysis = FakeQEEGAnalysis(
        safety_cockpit_json=None,
        red_flags_json=json.dumps({
            "flags": [
                {"code": "BAD_QUALITY", "severity": "blocks_export", "resolved": False}
            ]
        }),
    )
    reasons = _check_red_flags(analysis, "qEEG")
    assert len(reasons) == 1
    assert "BAD_QUALITY" in reasons[0]


def test_check_red_flags_high_severity_does_not_block():
    analysis = FakeMriAnalysis(
        safety_cockpit_json=json.dumps({
            "red_flags": [
                {"code": "ARTIFACT", "severity": "high", "message": "Motion artifact", "resolved": False}
            ]
        }),
        red_flags_json=None,
    )
    assert _check_red_flags(analysis, "MRI") == []


# ── Radiology review checks ──────────────────────────────────────────────────


def test_check_radiology_review_required_unresolved_blocks():
    mri = FakeMriAnalysis(
        safety_cockpit_json=json.dumps({
            "red_flags": [
                {"code": "RADIOLOGY_REVIEW_REQUIRED", "severity": "high", "message": "Incidental finding", "resolved": False}
            ]
        }),
    )
    reasons = _check_radiology_review(mri)
    assert len(reasons) == 1
    assert "radiology review" in reasons[0].lower()


def test_check_radiology_review_required_resolved_does_not_block():
    mri = FakeMriAnalysis(
        safety_cockpit_json=json.dumps({
            "red_flags": [
                {"code": "RADIOLOGY_REVIEW_REQUIRED", "severity": "high", "message": "Incidental finding", "resolved": True}
            ]
        }),
    )
    assert _check_radiology_review(mri) == []


def test_check_radiology_review_no_mri():
    assert _check_radiology_review(None) == []


# ── Report state checks ──────────────────────────────────────────────────────


def test_check_report_state_qeeg_draft_ai_warns():
    analysis = FakeQEEGAnalysis(id="a1")
    report = FakeQEEGAIReport(report_state="DRAFT_AI")
    warnings = _check_report_state(analysis, "qEEG", report)
    assert len(warnings) == 1
    assert "DRAFT_AI" in warnings[0]


def test_check_report_state_qeeg_needs_review_no_warning():
    analysis = FakeQEEGAnalysis(id="a1")
    report = FakeQEEGAIReport(report_state="NEEDS_CLINICAL_REVIEW")
    warnings = _check_report_state(analysis, "qEEG", report)
    assert warnings == []


def test_check_report_state_mri_draft_ai_warns():
    analysis = FakeMriAnalysis(report_state="MRI_DRAFT_AI")
    warnings = _check_report_state(analysis, "MRI")
    assert len(warnings) == 1
    assert "DRAFT_AI" in warnings[0]


def test_check_report_state_mri_approved_no_warning():
    analysis = FakeMriAnalysis(report_state="MRI_APPROVED")
    warnings = _check_report_state(analysis, "MRI")
    assert warnings == []


def test_check_report_state_none_analysis():
    assert _check_report_state(None, "qEEG") == []


# ── Recency checks ───────────────────────────────────────────────────────────


def test_check_recency_fresh_no_warning():
    analysis = FakeQEEGAnalysis(
        analyzed_at=datetime.now(timezone.utc) - timedelta(days=10),
    )
    assert _check_recency(analysis, "qEEG", max_days=180) == []


def test_check_recency_stale_warns():
    analysis = FakeQEEGAnalysis(
        analyzed_at=datetime.now(timezone.utc) - timedelta(days=200),
    )
    warnings = _check_recency(analysis, "qEEG", max_days=180)
    assert len(warnings) == 1
    assert "200 days" in warnings[0]


def test_check_recency_no_timestamp():
    analysis = FakeMriAnalysis(created_at=None)
    assert _check_recency(analysis, "MRI", max_days=180) == []


# ── Integration: run_safety_gates ────────────────────────────────────────────


def test_run_safety_gates_all_clear():
    db = MagicMock()
    db.query.return_value.filter_by.return_value.order_by.return_value.first.return_value = None

    qeeg = FakeQEEGAnalysis(
        id="q1",
        safety_cockpit_json=json.dumps({"red_flags": []}),
        analyzed_at=datetime.now(timezone.utc) - timedelta(days=10),
    )
    mri = FakeMriAnalysis(
        safety_cockpit_json=json.dumps({"red_flags": []}),
        report_state="MRI_APPROVED",
        created_at=datetime.now(timezone.utc) - timedelta(days=10),
    )

    result = run_safety_gates(db, qeeg, mri)
    assert result.blocked is False
    assert result.reasons == []


def test_run_safety_gates_blocked_by_red_flags():
    db = MagicMock()
    db.query.return_value.filter_by.return_value.order_by.return_value.first.return_value = None

    qeeg = FakeQEEGAnalysis(
        id="q1",
        safety_cockpit_json=json.dumps({
            "red_flags": [
                {"code": "EPILEPTIFORM", "severity": "critical", "resolved": False}
            ]
        }),
        analyzed_at=datetime.now(timezone.utc) - timedelta(days=10),
    )
    mri = None

    result = run_safety_gates(db, qeeg, mri)
    assert result.blocked is True
    assert len(result.reasons) == 1
    assert "EPILEPTIFORM" in result.reasons[0]
    assert len(result.next_steps) == 3


def test_run_safety_gates_blocked_by_radiology():
    db = MagicMock()
    db.query.return_value.filter_by.return_value.order_by.return_value.first.return_value = None

    qeeg = FakeQEEGAnalysis(
        id="q1",
        safety_cockpit_json=json.dumps({"red_flags": []}),
        analyzed_at=datetime.now(timezone.utc) - timedelta(days=10),
    )
    mri = FakeMriAnalysis(
        safety_cockpit_json=json.dumps({
            "red_flags": [
                {"code": "RADIOLOGY_REVIEW_REQUIRED", "severity": "high", "resolved": False}
            ]
        }),
        report_state="MRI_NEEDS_CLINICAL_REVIEW",
        created_at=datetime.now(timezone.utc) - timedelta(days=10),
    )

    result = run_safety_gates(db, qeeg, mri)
    assert result.blocked is True
    assert any("radiology review" in r.lower() for r in result.reasons)


def test_run_safety_gates_warnings_present():
    db = MagicMock()
    db.query.return_value.filter_by.return_value.order_by.return_value.first.return_value = FakeQEEGAIReport(report_state="DRAFT_AI")

    qeeg = FakeQEEGAnalysis(
        id="a1",
        safety_cockpit_json=json.dumps({"red_flags": []}),
        analyzed_at=datetime.now(timezone.utc) - timedelta(days=200),
    )
    mri = FakeMriAnalysis(
        safety_cockpit_json=json.dumps({"red_flags": []}),
        report_state="MRI_DRAFT_AI",
        created_at=datetime.now(timezone.utc) - timedelta(days=250),
    )

    result = run_safety_gates(db, qeeg, mri)
    assert result.blocked is False
    assert len(result.warnings) == 4  # qEEG draft + MRI draft + qEEG stale + MRI stale
