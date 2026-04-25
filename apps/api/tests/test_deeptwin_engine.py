"""Unit tests for the DeepTwin reasoning engine.

These exercise determinism (same input → same output), shape
correctness, and a few safety-critical invariants:
- simulation always sets ``approval_required=True``,
- contraindicated input always surfaces a safety concern,
- prediction uncertainty band widens with horizon length.
"""

from __future__ import annotations

import pytest

from app.services.deeptwin_engine import (
    REPORT_BUILDERS,
    align_timeline_events,
    build_signal_matrix,
    build_twin_summary,
    compute_data_completeness,
    create_agent_handoff_summary,
    detect_correlations,
    estimate_trajectory,
    generate_causal_hypotheses,
    score_evidence_grade,
    simulate_intervention_scenario,
)


PID = "pat-test-001"


def test_evidence_grade_is_conservative() -> None:
    assert score_evidence_grade(n_observations=1, n_studies_supporting=10, has_baseline=True) == "low"
    assert score_evidence_grade(n_observations=20, n_studies_supporting=2, has_baseline=False) == "low"
    assert score_evidence_grade(n_observations=20, n_studies_supporting=2, has_baseline=True) == "moderate"
    assert score_evidence_grade(n_observations=40, n_studies_supporting=4, has_baseline=True) == "high"


def test_summary_is_deterministic() -> None:
    a = build_twin_summary(PID)
    b = build_twin_summary(PID)
    assert a == b
    assert 0 <= a["completeness_pct"] <= 100
    assert a["risk_status"] in {"stable", "watch", "elevated", "unknown"}
    assert a["review_status"] == "awaiting_clinician_review"
    assert "decision-support" in a["disclaimer"].lower()


def test_completeness_lists_missing_sources() -> None:
    c = compute_data_completeness(PID)
    assert isinstance(c["sources_connected"], list)
    assert isinstance(c["sources_missing"], list)
    assert 0 <= c["completeness_pct"] <= 100


def test_signals_matrix_has_evidence_grade() -> None:
    out = build_signal_matrix(PID)
    assert out["patient_id"] == PID
    assert len(out["signals"]) >= 8
    for s in out["signals"]:
        assert s["evidence_grade"] in {"low", "moderate", "high"}
        assert isinstance(s["sparkline"], list) and len(s["sparkline"]) >= 6


def test_timeline_is_sorted_and_bounded() -> None:
    out = align_timeline_events(PID, days=60)
    assert out["window_days"] == 60
    timestamps = [e["ts"] for e in out["events"]]
    assert timestamps == sorted(timestamps)


def test_correlations_have_correlation_not_causation_note() -> None:
    out = detect_correlations(PID)
    assert out["method"] == "pearson"
    assert len(out["labels"]) == len(out["matrix"])
    assert any("correlation" in c["note"].lower() for c in out["cards"])


def test_causal_hypotheses_require_interpretation() -> None:
    out = generate_causal_hypotheses(PID)
    for h in out["hypotheses"]:
        assert h["interpretation_required"] is True
        assert "evidence_for" in h and "evidence_against" in h
        assert h["evidence_grade"] in {"low", "moderate", "high"}


def test_prediction_uncertainty_widens_with_horizon() -> None:
    p2 = estimate_trajectory(PID, horizon="2w")
    p12 = estimate_trajectory(PID, horizon="12w")
    band_2 = max(p2["traces"][0]["ci_high"]) - min(p2["traces"][0]["ci_low"])
    band_12 = max(p12["traces"][0]["ci_high"]) - min(p12["traces"][0]["ci_low"])
    assert band_12 >= band_2
    assert p12["uncertainty_widens_with_horizon"] is True


def test_simulation_always_requires_approval() -> None:
    sim = simulate_intervention_scenario(
        PID, modality="tdcs", target="Fp2", frequency_hz=10, weeks=5,
    )
    assert sim["approval_required"] is True
    assert sim["labels"]["simulation_only"] is True
    assert sim["labels"]["not_a_prescription"] is True
    assert "x_days" in sim["predicted_curve"]
    assert len(sim["predicted_curve"]["x_days"]) == len(sim["predicted_curve"]["ci_low"])


def test_simulation_flags_contraindications() -> None:
    sim = simulate_intervention_scenario(
        PID, modality="tms", target="DLPFC", frequency_hz=25, weeks=6,
        contraindications=["epilepsy_history"],
    )
    assert any("epilepsy_history" in c for c in sim["safety_concerns"])
    assert any("seizure" in c.lower() for c in sim["safety_concerns"])


def test_simulation_low_adherence_flag() -> None:
    sim = simulate_intervention_scenario(
        PID, modality="tdcs", target="Fp2", weeks=5, adherence_assumption_pct=50.0,
    )
    assert any("adherence" in c.lower() for c in sim["safety_concerns"])


@pytest.mark.parametrize("kind", list(REPORT_BUILDERS.keys()))
def test_report_builders_emit_envelope(kind: str) -> None:
    builder = REPORT_BUILDERS[kind]
    body = builder(PID, horizon="6w", simulation={"scenario_id": "scn_test"})
    assert body["patient_id"] == PID
    assert body["kind"] == kind
    assert "limitations" in body and isinstance(body["limitations"], list)
    assert "review_points" in body and isinstance(body["review_points"], list)


def test_handoff_emits_audit_ref_and_disclaimer() -> None:
    out = create_agent_handoff_summary(PID, kind="send_summary", note="please review")
    assert out["kind"] == "send_summary"
    assert out["audit_ref"].startswith("twin_handoff:")
    assert out["approval_required"] is True
    assert "decision-support" in out["disclaimer"].lower()
    assert "DeepTwin Summary" in out["summary_markdown"]
