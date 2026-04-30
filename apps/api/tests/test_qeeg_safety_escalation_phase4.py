"""Phase 4 — red-flag → AdverseEvent escalation tests.

Verifies:
  - high-severity red flags create AdverseEvent rows with the correct
    event_type mapping
  - low/medium-severity flags do NOT escalate
  - the escalator is idempotent within a 60-second window (re-runs of the
    safety engine on the same analysis don't double-write)
  - the regulatory disclaimer copy stays clean
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.persistence.models import AdverseEvent, QEEGAnalysis
from app.services.qeeg_safety_engine import (
    _AE_TYPE_BY_FLAG,
    escalate_red_flags_to_adverse_events,
)


def _fake_analysis() -> QEEGAnalysis:
    a = QEEGAnalysis()
    a.id = str(uuid.uuid4())
    a.patient_id = str(uuid.uuid4())
    a.clinician_id = "clin_test"
    a.created_at = datetime.now(timezone.utc)
    return a


class _FakeQuery:
    def __init__(self, rows, predicates=None):
        self._rows = list(rows)
        self._predicates = list(predicates or [])

    def filter(self, *args, **_kwargs):
        # Each positional arg is a SQLAlchemy BinaryExpression. Pull the
        # ColumnElement attribute name and the literal value off the
        # right-hand-side so we can apply an in-memory predicate. Fall back
        # to a permissive predicate on parse failure.
        new_preds = list(self._predicates)
        for expr in args:
            try:
                attr = expr.left.key  # type: ignore[attr-defined]
                op = expr.operator  # type: ignore[attr-defined]
                rhs = getattr(expr.right, "value", None)
                if rhs is None:
                    rhs = getattr(expr.right, "effective_value", None)
                op_name = getattr(op, "__name__", "") or str(op)

                def _make_pred(_attr=attr, _op_name=op_name, _rhs=rhs):
                    def _check(row):
                        v = getattr(row, _attr, None)
                        if "ge" in _op_name or ">=" in _op_name:
                            return v is not None and v >= _rhs
                        if "le" in _op_name or "<=" in _op_name:
                            return v is not None and v <= _rhs
                        if "eq" in _op_name or _op_name == "=":
                            return v == _rhs
                        return v == _rhs
                    return _check
                new_preds.append(_make_pred())
            except Exception:
                # Permissive — if we can't parse, treat as a no-op.
                continue
        return _FakeQuery(self._rows, new_preds)

    def first(self):
        for r in self._rows:
            if all(p(r) for p in self._predicates):
                return r
        return None


class _FakeSession:
    def __init__(self, prior_rows: list[AdverseEvent] | None = None):
        self.added: list[AdverseEvent] = []
        self.prior = list(prior_rows or [])

    def query(self, _model):
        rows = list(self.prior) + list(self.added)
        return _FakeQuery(rows)

    def add(self, obj):
        if not getattr(obj, "id", None):
            obj.id = str(uuid.uuid4())
        if not getattr(obj, "reported_at", None):
            obj.reported_at = datetime.now(timezone.utc)
        if not getattr(obj, "created_at", None):
            obj.created_at = datetime.now(timezone.utc)
        self.added.append(obj)

    def flush(self):
        pass


def test_high_severity_flags_create_adverse_events():
    a = _fake_analysis()
    db = _FakeSession()
    flags = [
        {"code": "EPILEPTIFORM_HEURISTIC", "severity": "high", "title": "Possible epileptiform activity", "message": "elev. high-freq", "action": "review raw"},
        {"code": "FOCAL_ASYMMETRY_SEVERE", "severity": "high", "title": "Severe focal asymmetry", "message": "ch X |z|>3", "action": "imaging"},
    ]
    created = escalate_red_flags_to_adverse_events(a, flags, db)
    assert len(created) == 2
    types = sorted(ae.event_type for ae in db.added)
    assert types == sorted(["qeeg_red_flag_epileptiform", "qeeg_red_flag_focal_asymmetry"])
    for ae in db.added:
        assert ae.severity == "high"
        assert ae.patient_id == a.patient_id
        assert ae.clinician_id == "clin_test"
        assert ae.action_taken == "auto_flagged_for_review"
        assert "diagnosis" not in (ae.description or "").lower(), "leak: 'diagnosis' in AE description"


def test_medium_and_low_severity_flags_do_not_escalate():
    a = _fake_analysis()
    db = _FakeSession()
    flags = [
        {"code": "EXCESSIVE_SLOWING_THETA", "severity": "medium", "message": ""},
        {"code": "EYES_UNSPECIFIED", "severity": "low", "message": ""},
    ]
    created = escalate_red_flags_to_adverse_events(a, flags, db)
    assert created == []
    assert db.added == []


def test_unknown_flag_codes_are_skipped():
    a = _fake_analysis()
    db = _FakeSession()
    flags = [{"code": "DOES_NOT_EXIST", "severity": "high", "message": "?"}]
    created = escalate_red_flags_to_adverse_events(a, flags, db)
    assert created == []


def test_escalation_is_idempotent_within_a_minute():
    a = _fake_analysis()
    # Pre-existing AE for this patient + type in the last 60s
    prior = AdverseEvent(
        patient_id=a.patient_id,
        clinician_id=a.clinician_id,
        event_type="qeeg_red_flag_epileptiform",
        severity="high",
        description="prior",
        reported_at=datetime.now(timezone.utc) - timedelta(seconds=10),
    )
    prior.id = str(uuid.uuid4())
    db = _FakeSession(prior_rows=[prior])
    flags = [{"code": "EPILEPTIFORM_HEURISTIC", "severity": "high", "title": "x", "message": "x", "action": "x"}]
    created = escalate_red_flags_to_adverse_events(a, flags, db)
    # No new AE — the prior one within the 60s window suppresses re-write.
    assert created == []
    assert len(db.added) == 0


def test_escalator_handles_empty_input():
    a = _fake_analysis()
    db = _FakeSession()
    assert escalate_red_flags_to_adverse_events(a, [], db) == []
    assert escalate_red_flags_to_adverse_events(a, None, db) == []


def test_AE_type_map_covers_documented_codes():
    expected = {
        "EPILEPTIFORM_HEURISTIC",
        "FOCAL_ASYMMETRY_SEVERE",
        "EXCESSIVE_SLOWING_DELTA",
        "EXCESSIVE_SLOWING_THETA",
        "SIGNAL_QUALITY_POOR",
        "ACUTE_NEURO_CONCERN",
        "SELF_HARM_EMERGENCY",
    }
    assert expected.issubset(set(_AE_TYPE_BY_FLAG.keys()))
