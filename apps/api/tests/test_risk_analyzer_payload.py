"""Risk Analyzer payload helper regressions."""
from __future__ import annotations

from app.services.risk_analyzer_payload import (
    _merge_relapse_adherence,
    _predict_harm_to_others,
    _predict_suicide_self_harm,
    _recommended_actions,
)


def test_relapse_adherence_composite_is_withheld_even_when_subscores_exist() -> None:
    card = _merge_relapse_adherence(
        {
            "relapse_risk": {
                "value": 0.62,
                "summary": "Trajectory worsening across recent measures.",
            },
            "adherence_risk": {
                "value": 0.44,
                "summary": "Open adherence flags remain present.",
            },
        }
    )
    assert card["analyzer_id"] == "relapse_adherence"
    assert card["score"] is None
    assert card["status"] == "not_implemented"
    assert card["reason"] == "no_calibrated_model"
    assert card["confidence"]["level"] == "no_data"
    assert "withheld" in card["confidence"]["calibration_note"].lower()
    assert card["model"]["kind"] == "research_composite_withheld"
    assert all(f["weight_or_rank"] is None for f in card["contributing_factors"])


def test_relapse_adherence_composite_stays_withheld_without_subscores() -> None:
    card = _merge_relapse_adherence({})
    assert card["score"] is None
    assert card["status"] == "not_implemented"
    assert card["reason"] == "no_calibrated_model"


def test_suicide_self_harm_card_is_index_not_probability() -> None:
    ctx = type(
        "Ctx",
        (),
        {
            "assessments": [
                {"template_id": "phq-9", "items_json": '{"item_9": 2}'},
                {"template_id": "cssrs", "score_numeric": 3},
            ],
            "intake": {"psychiatric_history": "prior self-harm and unstable mood"},
            "safety_flags": {"unstable_psych": True},
            "wearable_summaries": [{"mood_score": 2, "anxiety_score": 8}],
        },
    )()
    card = _predict_suicide_self_harm(ctx, {"suicide_risk": {"level": "amber"}, "self_harm": {"level": "green"}})
    assert 0.0 <= card["score"] <= 1.0
    assert card["score_type"] == "index"
    assert "index" in card["title"].lower()
    assert "not calibrated" in card["confidence"]["calibration_note"].lower()


def test_harm_to_others_card_is_index_not_probability() -> None:
    ctx = type(
        "Ctx",
        (),
        {
            "intake": {"psychiatric_history": "history of aggression threats"},
            "adverse_events": [{"event_type": "aggression_escalation"}],
        },
    )()
    card = _predict_harm_to_others(ctx, {"harm_to_others": {"level": "amber"}})
    assert 0.0 <= card["score"] <= 1.0
    assert card["score_type"] == "index"
    assert "index" in card["title"].lower()
    assert "not a calibrated probability" in card["confidence"]["calibration_note"].lower()


def test_recommended_actions_do_not_trigger_from_heuristic_prediction_score_alone() -> None:
    actions = _recommended_actions(
        {"suicide_risk": {"level": "green"}, "self_harm": {"level": "green"}},
        {"safety_plan_status": {"status": "active"}},
        {"status": "active"},
        {"score": 0.91, "analyzer_id": "suicide_self_harm"},
        {"score": 0.0, "analyzer_id": "mental_crisis"},
    )
    assert len(actions) == 1
    assert actions[0]["title"] == "Continue routine monitoring"
    assert actions[0]["derived_from"] == ["policy"]
