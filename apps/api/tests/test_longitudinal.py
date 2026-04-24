"""Unit tests for :mod:`deepsynaps_qeeg.ai.longitudinal`.

Exercises the pure-Python fallback path (no pandas / numpy / plotly
required). Builds a synthetic 3-analysis patient history in the SQLite
test DB and asserts the trajectory report has the expected shape.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.persistence.models import QEEGAnalysis


def _insert_analysis(
    db,
    *,
    patient_id: str,
    analysis_id: str,
    days_offset: int,
    alpha_rel: float,
    risk: float,
) -> None:
    """Insert a completed analysis with a few rich feature columns populated."""
    bands = {
        "bands": {
            "alpha": {
                "channels": {
                    "Cz": {"absolute_uv2": 10.0, "relative_pct": 100.0 * alpha_rel},
                }
            }
        }
    }
    risk_scores = {
        "mdd_like": {"score": risk, "ci95": [max(0.0, risk - 0.1), min(1.0, risk + 0.1)]},
    }
    row = QEEGAnalysis(
        id=analysis_id,
        patient_id=patient_id,
        clinician_id="clinician-longitudinal-test",
        analysis_status="completed",
        band_powers_json=json.dumps(bands),
        risk_scores_json=json.dumps(risk_scores),
        recording_date=(
            datetime.now(timezone.utc) - timedelta(days=120 - days_offset)
        ).strftime("%Y-%m-%d"),
    )
    # Override created_at so the ORDER BY on the longitudinal query returns the
    # rows in the correct order. SQLAlchemy's default is now() which wouldn't
    # reflect session timing in a fast test.
    row.created_at = datetime.now(timezone.utc) - timedelta(days=120 - days_offset)
    db.add(row)


def test_patient_with_3_analyses_has_trajectory() -> None:
    from deepsynaps_qeeg.ai import longitudinal

    patient_id = "patient-longitudinal-0001"
    db = SessionLocal()
    try:
        _insert_analysis(
            db,
            patient_id=patient_id,
            analysis_id="long-a1",
            days_offset=0,
            alpha_rel=0.30,
            risk=0.7,
        )
        _insert_analysis(
            db,
            patient_id=patient_id,
            analysis_id="long-a2",
            days_offset=30,
            alpha_rel=0.35,
            risk=0.55,
        )
        _insert_analysis(
            db,
            patient_id=patient_id,
            analysis_id="long-a3",
            days_offset=60,
            alpha_rel=0.40,
            risk=0.40,
        )
        db.commit()

        report = longitudinal.generate_trajectory_report(patient_id, db)
    finally:
        db.close()

    assert report["n_sessions"] == 3
    assert report["days_since_baseline"] == 60
    # At least one feature trajectory should be populated.
    trajectories = report["feature_trajectories"]
    # MDD-like risk should have 3 points and a negative slope (improving).
    mdd_key = "risk_scores.mdd_like.score"
    assert mdd_key in trajectories
    entry = trajectories[mdd_key]
    assert len(entry["values"]) == 3
    assert entry["slope"] < 0  # risk declining over time
    # Normative distance trajectory should have one entry per session.
    assert len(report["normative_distance_trajectory"]) == 3


def test_single_analysis_returns_empty_trajectory() -> None:
    """A patient with a single session has nothing to trend — the
    change_scores dict is empty but the report itself is still shaped."""
    from deepsynaps_qeeg.ai import longitudinal

    patient_id = "patient-longitudinal-solo"
    db = SessionLocal()
    try:
        _insert_analysis(
            db,
            patient_id=patient_id,
            analysis_id="solo-1",
            days_offset=0,
            alpha_rel=0.3,
            risk=0.5,
        )
        db.commit()

        report = longitudinal.generate_trajectory_report(patient_id, db)
    finally:
        db.close()

    assert report["n_sessions"] == 1
    # With only one session, change_scores returns {}, so the trajectory
    # entries must have zero-valued slope/rci (we still produce one entry
    # per feature path because values is >0).
    for entry in report["feature_trajectories"].values():
        assert entry["rci"] == 0.0
        assert entry["significant"] is False


def test_compute_change_scores_is_empty_when_single_analysis() -> None:
    from deepsynaps_qeeg.ai import longitudinal

    result = longitudinal.compute_change_scores([{"a": 1.0}])
    assert result == {}


def test_compute_change_scores_flags_large_change() -> None:
    from deepsynaps_qeeg.ai import longitudinal

    trajectory = [
        {"risk_scores.mdd_like.score": 0.8, "days_from_baseline": 0},
        {"risk_scores.mdd_like.score": 0.5, "days_from_baseline": 30},
        {"risk_scores.mdd_like.score": 0.2, "days_from_baseline": 60},
    ]
    result = longitudinal.compute_change_scores(trajectory)
    assert "risk_scores.mdd_like.score" in result
    entry = result["risk_scores.mdd_like.score"]
    assert entry["delta"] < 0
    assert abs(entry["rci"]) > 1.0
