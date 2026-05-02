"""
Patient message / email / chat analysis: intent, urgency, action items.

Rule-based baseline; swap :class:`MessageAnalysisBackend` for ML or LLM later.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod

from deepsynaps_text.schemas import (
    ActionItem,
    MessageIntentCategory,
    MessageIntentLabel,
    MessageUrgencyLabel,
)


def classify_message_intent(text: str) -> MessageIntentLabel:
    """Classify high-level patient intent using the default rule backend."""
    return RuleBasedMessageBackend().classify_intent(text)


def classify_message_urgency(text: str) -> MessageUrgencyLabel:
    """Estimate message urgency for triage queues."""
    return RuleBasedMessageBackend().classify_urgency(text)


def extract_action_items_from_message(text: str) -> list[ActionItem]:
    """Extract suggested staff actions from message content."""
    return RuleBasedMessageBackend().extract_actions(text)


class MessageAnalysisBackend(ABC):
    """Pluggable analyzer (rules today; HF classifier or LLM task later)."""

    @abstractmethod
    def classify_intent(self, text: str) -> MessageIntentLabel:
        ...

    @abstractmethod
    def classify_urgency(self, text: str) -> MessageUrgencyLabel:
        ...

    @abstractmethod
    def extract_actions(self, text: str) -> list[ActionItem]:
        ...


_INTENT_RULES: list[tuple[MessageIntentCategory, float, re.Pattern[str], str]] = [
    (
        "appointment_request",
        0.93,
        re.compile(
            r"\b(?:schedule|book|reschedule|cancel)\s+(?:an\s+)?appointment\b|"
            r"\bfollow[- ]?up\s+appointment\b|"
            r"\breschedule\s+my\b|"
            r"\b(?:appointment|follow[- ]?up)\s+(?:please|needed|request)\b|"
            r"\bwhen\s+(?:can|could)\s+i\s+(?:come|see|get\s+in)\b|"
            r"\bneed\s+(?:to\s+)?(?:see|visit)\s+(?:dr\.|doctor)\b|"
            r"\bschedule\s+me\b",
            re.I,
        ),
        "intent_appointment",
    ),
    (
        "administrative",
        0.9,
        re.compile(
            r"\b(?:billing|invoice|copay|insurance\s+card|prior\s+auth|"
            r"portal\s+(?:login|password|access)|forms?|referral\s+request)\b",
            re.I,
        ),
        "intent_admin",
    ),
    (
        "side_effect_report",
        0.88,
        re.compile(
            r"\b(?:side\s+effect|adverse\s+react|rash|hives|itching)\b|"
            r"\b(?:since\s+(?:starting|taking)|after\s+(?:the\s+)?(?:pill|dose|med))\b|"
            r"\bnausea\s+(?:from|after)\s+(?:my\s+)?(?:med|medication|pill)\b",
            re.I,
        ),
        "intent_side_effect",
    ),
    (
        "medication_question",
        0.87,
        re.compile(
            r"\b(?:refill|prescription)\b|"
            r"\b(?:can\s+i|should\s+i|is\s+it\s+ok\s+to)\s+(?:stop|skip|take|double)\b|"
            r"\b(?:dose|dosage|mg|tablet)\s*(?:\?|\.|,|$)|"
            r"\b(?:medication|medicine|pill)\s+(?:question|concern)\b|"
            r"\bhow\s+(?:many|often)\s+(?:times|pills)\b",
            re.I,
        ),
        "intent_med_question",
    ),
    (
        "symptom_report",
        0.86,
        re.compile(
            r"\b(?:pain|hurts|aching|fever|headache|dizzy|weakness|numb|tingling|"
            r"worse|symptom|nausea|vomit|seizure)\b|"
            r"\bi(?:'m|\s+am)\s+(?:having|feeling|experiencing)\b",
            re.I,
        ),
        "intent_symptom",
    ),
]


_URGENCY_HIGH: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"\b(?:chest\s+pain|heart\s+attack|crushing\s+(?:chest|pain))\b",
            re.I,
        ),
        "urgency_chest_pain",
    ),
    (
        re.compile(
            r"\b(?:suicid|suicidal\s+thoughts?|kill\s+myself|end\s+my\s+life|want\s+to\s+die)\b",
            re.I,
        ),
        "urgency_suicidal",
    ),
    (
        re.compile(
            r"\b(?:stroke|facial\s+droop|slurred\s+speech|weakness\s+on\s+one\s+side)\b",
            re.I,
        ),
        "urgency_stroke_like",
    ),
    (
        re.compile(
            r"\b(?:can'?t\s+breathe|difficulty\s+breathing|severe\s+bleeding)\b",
            re.I,
        ),
        "urgency_resp_bleed",
    ),
]


_URGENCY_MEDIUM_CUES: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"\b(?:worse|worsening|severe|uncontrolled|urgent|asap)\b",
            re.I,
        ),
        "urgency_worsening",
    ),
]


_URGENCY_LOW_CUES: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"(?m)^\s*(?:thank\s+you|thanks)\b|"
            r"\b(?:just\s+a\s+quick\s+question|non[- ]urgent|whenever\s+you\s+can|"
            r"when\s+you\s+have\s+time)\b",
            re.I,
        ),
        "urgency_explicit_low",
    ),
]


class RuleBasedMessageBackend(MessageAnalysisBackend):
    """Keyword / regex baseline with deterministic tie-breaking."""

    def classify_intent(self, text: str) -> MessageIntentLabel:
        low = text.strip().lower()
        if not low:
            return MessageIntentLabel(
                intent="other",
                confidence=0.5,
                source="rule",
                matched_cues=["intent_empty"],
            )
        best_cat: MessageIntentCategory | None = None
        best_conf = 0.0
        cues: list[str] = []
        for cat, conf, pat, cue_id in _INTENT_RULES:
            if pat.search(text):
                if conf > best_conf:
                    best_conf = conf
                    best_cat = cat
                    cues = [cue_id]
                elif abs(conf - best_conf) < 1e-6 and best_cat == cat:
                    cues.append(cue_id)
        if best_cat is None:
            return MessageIntentLabel(
                intent="other",
                confidence=0.55,
                source="rule",
                matched_cues=["intent_fallback"],
            )
        return MessageIntentLabel(
            intent=best_cat,
            confidence=best_conf,
            source="rule",
            matched_cues=cues or ["intent_match"],
        )

    def classify_urgency(self, text: str) -> MessageUrgencyLabel:
        low = text.strip().lower()
        if not low:
            return MessageUrgencyLabel(
                level="medium",
                confidence=0.5,
                source="rule",
                matched_cues=["urgency_empty"],
            )
        cues: list[str] = []
        for pat, cid in _URGENCY_HIGH:
            if pat.search(text):
                cues.append(cid)
        if cues:
            return MessageUrgencyLabel(
                level="high",
                confidence=0.95,
                source="rule",
                matched_cues=cues,
            )
        low_cues = [cid for pat, cid in _URGENCY_LOW_CUES if pat.search(text)]
        if low_cues:
            return MessageUrgencyLabel(
                level="low",
                confidence=0.72,
                source="rule",
                matched_cues=low_cues,
            )
        med_cues = [cid for pat, cid in _URGENCY_MEDIUM_CUES if pat.search(text)]
        if med_cues:
            return MessageUrgencyLabel(
                level="medium",
                confidence=0.75,
                source="rule",
                matched_cues=med_cues,
            )
        return MessageUrgencyLabel(
            level="medium",
            confidence=0.6,
            source="rule",
            matched_cues=["urgency_default"],
        )

    def extract_actions(self, text: str) -> list[ActionItem]:
        items: list[ActionItem] = []
        intent = self.classify_intent(text).intent
        urgency = self.classify_urgency(text)

        if urgency.level == "high":
            items.append(
                ActionItem(
                    type="call_patient",
                    description="Immediate clinician review — elevated urgency cues in message.",
                    suggested_role="MD",
                    cue="action_high_urgency_call",
                )
            )

        if intent == "appointment_request":
            items.append(
                ActionItem(
                    type="schedule_visit",
                    description="Respond to appointment scheduling request.",
                    suggested_role="admin",
                    cue="action_schedule_visit",
                )
            )
        elif intent == "medication_question":
            items.append(
                ActionItem(
                    type="adjust_medication",
                    description="Review medication question or refill request.",
                    suggested_role="MD",
                    cue="action_med_review",
                )
            )
        elif intent == "side_effect_report":
            items.append(
                ActionItem(
                    type="adjust_medication",
                    description="Assess reported side effect and medication linkage.",
                    suggested_role="RN",
                    cue="action_side_effect_triage",
                )
            )
        elif intent == "symptom_report":
            items.append(
                ActionItem(
                    type="call_patient",
                    description="Follow up on reported symptoms.",
                    suggested_role="RN",
                    cue="action_symptom_followup",
                )
            )

        if re.search(r"\b(?:labs?|blood\s+work|MRI|CT|EEG|test\s+order)\b", text, re.I):
            items.append(
                ActionItem(
                    type="order_test",
                    description="Consider diagnostic testing mentioned by patient.",
                    suggested_role="MD",
                    cue="action_order_test_mention",
                )
            )

        # Bullet / numbered task lines often imply concrete asks
        for m in re.finditer(
            r"(?m)^\s*(?:[-*•]|\d+[.)])\s*(.{8,120})$",
            text,
        ):
            line = m.group(1).strip()
            if line:
                items.append(
                    ActionItem(
                        type="other",
                        description=line[:200],
                        suggested_role="admin",
                        cue="action_bullet_line",
                    )
                )

        # Dedupe by (type, description)
        seen: set[tuple[str, str]] = set()
        unique: list[ActionItem] = []
        for it in items:
            key = (it.type, it.description)
            if key in seen:
                continue
            seen.add(key)
            unique.append(it)
        return unique
