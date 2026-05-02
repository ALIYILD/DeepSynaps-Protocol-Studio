"""Message analyzer tests — synthetic messages only."""

from __future__ import annotations

from deepsynaps_text.message_analyzers import (
    classify_message_intent,
    classify_message_urgency,
    extract_action_items_from_message,
)


def test_intent_medication_question() -> None:
    text = "Can I refill my sertraline prescription before next visit?"
    lab = classify_message_intent(text)
    assert lab.intent == "medication_question"
    assert lab.confidence >= 0.85
    assert lab.source == "rule"


def test_intent_appointment_request() -> None:
    text = "Please reschedule my follow-up appointment to next Tuesday."
    lab = classify_message_intent(text)
    assert lab.intent == "appointment_request"


def test_intent_symptom_report() -> None:
    text = "My headache has been worse for three days."
    lab = classify_message_intent(text)
    assert lab.intent == "symptom_report"


def test_intent_administrative() -> None:
    text = "I need help with billing and my insurance card upload."
    lab = classify_message_intent(text)
    assert lab.intent == "administrative"


def test_intent_side_effect() -> None:
    text = "I developed a rash since starting the new medication."
    lab = classify_message_intent(text)
    assert lab.intent == "side_effect_report"


def test_urgency_high_chest_pain() -> None:
    text = "I have crushing chest pain since this morning."
    u = classify_message_urgency(text)
    assert u.level == "high"
    assert "urgency_chest_pain" in u.matched_cues


def test_urgency_high_suicidal() -> None:
    text = "I've been having suicidal thoughts."
    u = classify_message_urgency(text)
    assert u.level == "high"


def test_urgency_low_thanks() -> None:
    text = "Thank you for the note — non-urgent question when you have time."
    u = classify_message_urgency(text)
    assert u.level == "low"


def test_action_items_high_urgency_and_schedule() -> None:
    text = "Schedule me urgently — crushing chest pain."
    actions = extract_action_items_from_message(text)
    types = {a.type for a in actions}
    assert "call_patient" in types
    assert "schedule_visit" in types


def test_action_items_bullet_lines() -> None:
    text = (
        "Hi team,\n"
        "- Please send lab orders\n"
        "- Call me back about MRI results\n"
    )
    actions = extract_action_items_from_message(text)
    descs = [a.description for a in actions if a.cue == "action_bullet_line"]
    assert len(descs) >= 2


def test_action_items_order_test_mention() -> None:
    text = "Can you order blood work before my visit?"
    actions = extract_action_items_from_message(text)
    assert any(a.type == "order_test" for a in actions)
