"""Regression tests for chat_router Pydantic Field caps.

Pre-fix none of the chat request bodies had any
``Field(max_length=...)`` or list-length cap. Combined with the
per-IP-only rate limit, a stolen clinician token plus a botnet
trivially exhausted the OpenAI / Anthropic budget on a 1MB prompt
or a 10 000-message history.

Post-fix every string field carries an explicit cap and the
``messages`` list carries a max_length.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.routers import chat_router as cr


def test_chat_message_caps_oversized_content() -> None:
    with pytest.raises(ValidationError):
        cr.ChatMessage(role="user", content="x" * (cr._MSG_CONTENT_MAX + 1))


def test_chat_message_caps_oversized_role() -> None:
    with pytest.raises(ValidationError):
        cr.ChatMessage(role="x" * (cr._ROLE_MAX + 1), content="ok")


def test_chat_request_caps_history_length() -> None:
    huge_history = [cr.ChatMessage(role="user", content="hi")] * (cr._HISTORY_MAX_MESSAGES + 1)
    with pytest.raises(ValidationError):
        cr.ChatRequest(messages=huge_history)


def test_chat_request_caps_patient_context() -> None:
    with pytest.raises(ValidationError):
        cr.ChatRequest(
            messages=[cr.ChatMessage(role="user", content="hi")],
            patient_context="x" * (cr._CONTEXT_MAX + 1),
        )


def test_chat_request_caps_dashboard_context() -> None:
    with pytest.raises(ValidationError):
        cr.ChatRequest(
            messages=[cr.ChatMessage(role="user", content="hi")],
            dashboard_context="x" * (cr._CONTEXT_MAX + 1),
        )


def test_chat_request_caps_language() -> None:
    with pytest.raises(ValidationError):
        cr.ChatRequest(
            messages=[cr.ChatMessage(role="user", content="hi")],
            language="x" * (cr._LANG_MAX + 1),
        )


def test_public_chat_request_caps_history() -> None:
    huge_history = [cr.ChatMessage(role="user", content="hi")] * (cr._HISTORY_MAX_MESSAGES + 1)
    with pytest.raises(ValidationError):
        cr.PublicChatRequest(messages=huge_history)


def test_agent_chat_request_caps_context() -> None:
    with pytest.raises(ValidationError):
        cr.AgentChatRequest(
            messages=[cr.ChatMessage(role="user", content="hi")],
            context="x" * (cr._CONTEXT_MAX + 1),
        )


def test_agent_chat_request_caps_provider() -> None:
    with pytest.raises(ValidationError):
        cr.AgentChatRequest(
            messages=[cr.ChatMessage(role="user", content="hi")],
            provider="x" * (cr._PROVIDER_MAX + 1),
        )


def test_agent_chat_request_caps_openai_key() -> None:
    with pytest.raises(ValidationError):
        cr.AgentChatRequest(
            messages=[cr.ChatMessage(role="user", content="hi")],
            openai_key="x" * (cr._OPENAI_KEY_MAX + 1),
        )


def test_sales_inquiry_caps_message() -> None:
    with pytest.raises(ValidationError):
        cr.SalesInquiryRequest(message="x" * 4_001)


def test_sales_inquiry_caps_email() -> None:
    with pytest.raises(ValidationError):
        cr.SalesInquiryRequest(message="ok", email="x" * 321)


def test_wearable_patient_chat_caps_context() -> None:
    with pytest.raises(ValidationError):
        cr.WearablePatientChatRequest(
            messages=[cr.ChatMessage(role="user", content="hi")],
            patient_context="x" * (cr._CONTEXT_MAX + 1),
        )


def test_wearable_clinician_chat_caps_history() -> None:
    huge_history = [cr.ChatMessage(role="user", content="hi")] * (cr._HISTORY_MAX_MESSAGES + 1)
    with pytest.raises(ValidationError):
        cr.WearableClinicianChatRequest(messages=huge_history, patient_id="p-1")
