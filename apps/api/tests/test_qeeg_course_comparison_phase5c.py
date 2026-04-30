"""Phase 5c — course pre/post qEEG Δ comparison tests.

Verifies the lobe-Δ helper in treatment_courses_router that derives a
4-lobe before/after summary from each analysis's QEEGBrainMapReport payload.
"""
from __future__ import annotations

import json
from typing import Optional

import pytest

from app.routers.treatment_courses_router import _compute_course_lobe_delta


class _FakeQuery:
    def __init__(self, rows: list):
        self._rows = list(rows)

    def filter_by(self, **kwargs):
        rows = [r for r in self._rows if all(getattr(r, k, None) == v for k, v in kwargs.items())]
        return _FakeQuery(rows)

    def order_by(self, *_args, **_kwargs):
        # Pretend we sorted by created_at desc — caller takes .first()
        return self

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeRow:
    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


class _FakeSession:
    def __init__(self, rows: list):
        self.rows = list(rows)

    def query(self, _model):
        return _FakeQuery(self.rows)


def _payload_with_lobes(frontal_lt, frontal_rt, parietal_lt, parietal_rt) -> dict:
    return {
        "lobe_summary": {
            "frontal":   {"lt_percentile": frontal_lt, "rt_percentile": frontal_rt},
            "temporal":  {"lt_percentile": 50.0, "rt_percentile": 50.0},
            "parietal":  {"lt_percentile": parietal_lt, "rt_percentile": parietal_rt},
            "occipital": {"lt_percentile": 50.0, "rt_percentile": 50.0},
        },
    }


def test_lobe_delta_returns_empty_when_either_id_missing():
    db = _FakeSession([])
    assert _compute_course_lobe_delta(db, None, "some-id") == {}
    assert _compute_course_lobe_delta(db, "some-id", None) == {}


def test_lobe_delta_returns_empty_when_payloads_missing():
    db = _FakeSession([
        _FakeRow(analysis_id="A", report_payload=None, created_at=None),
        _FakeRow(analysis_id="B", report_payload=None, created_at=None),
    ])
    assert _compute_course_lobe_delta(db, "A", "B") == {}


def test_lobe_delta_marks_improving_when_moving_toward_typical():
    # Baseline frontal far from 50 (30 / 30 → mean 30), followup near 50 (45 / 50 → mean 47.5)
    baseline = _payload_with_lobes(30, 30, 50, 50)
    followup = _payload_with_lobes(45, 50, 50, 50)
    db = _FakeSession([
        _FakeRow(analysis_id="A", report_payload=json.dumps(baseline), created_at=1),
        _FakeRow(analysis_id="B", report_payload=json.dumps(followup), created_at=2),
    ])
    out = _compute_course_lobe_delta(db, "A", "B")
    assert "frontal" in out
    f = out["frontal"]
    assert f["baseline_pct"] == 30.0
    assert f["followup_pct"] == 47.5
    assert f["delta_pct"] == 17.5
    assert f["direction"] == "improving"


def test_lobe_delta_marks_stable_when_change_below_5_pct():
    baseline = _payload_with_lobes(50, 50, 60, 60)
    followup = _payload_with_lobes(52, 51, 61, 60)
    db = _FakeSession([
        _FakeRow(analysis_id="A", report_payload=json.dumps(baseline), created_at=1),
        _FakeRow(analysis_id="B", report_payload=json.dumps(followup), created_at=2),
    ])
    out = _compute_course_lobe_delta(db, "A", "B")
    assert out["frontal"]["direction"] == "stable"
    assert out["parietal"]["direction"] == "stable"


def test_lobe_delta_marks_declining_when_moving_away_from_typical():
    # Baseline frontal near 50, followup far from 50
    baseline = _payload_with_lobes(50, 50, 50, 50)
    followup = _payload_with_lobes(20, 25, 50, 50)
    db = _FakeSession([
        _FakeRow(analysis_id="A", report_payload=json.dumps(baseline), created_at=1),
        _FakeRow(analysis_id="B", report_payload=json.dumps(followup), created_at=2),
    ])
    out = _compute_course_lobe_delta(db, "A", "B")
    assert out["frontal"]["direction"] == "declining"
    assert out["frontal"]["delta_pct"] == -27.5


def test_lobe_delta_handles_malformed_json_gracefully():
    db = _FakeSession([
        _FakeRow(analysis_id="A", report_payload="not json", created_at=1),
        _FakeRow(analysis_id="B", report_payload="{}", created_at=2),
    ])
    assert _compute_course_lobe_delta(db, "A", "B") == {}


def test_lobe_delta_handles_partial_lobe_data():
    # Followup missing parietal completely
    baseline = _payload_with_lobes(40, 40, 60, 60)
    followup_partial = {
        "lobe_summary": {
            "frontal": {"lt_percentile": 48, "rt_percentile": 49},
            # parietal omitted
        },
    }
    db = _FakeSession([
        _FakeRow(analysis_id="A", report_payload=json.dumps(baseline), created_at=1),
        _FakeRow(analysis_id="B", report_payload=json.dumps(followup_partial), created_at=2),
    ])
    out = _compute_course_lobe_delta(db, "A", "B")
    assert "frontal" in out
    assert "parietal" not in out, "missing followup parietal must be skipped, not synthesized"
