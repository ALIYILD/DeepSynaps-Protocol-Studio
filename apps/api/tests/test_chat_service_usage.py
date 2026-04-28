"""Tests for Phase 8 — real provider usage capture in chat_service.

Covers:

* ``_llm_chat_with_usage`` parses a usage block off an OpenAI /
  OpenRouter chat-completions response (``prompt_tokens`` /
  ``completion_tokens``).
* ``_llm_chat_with_usage`` parses a usage block off an Anthropic
  Messages response (``input_tokens`` / ``output_tokens``).
* ``_llm_chat_with_usage`` returns ``usage=None`` when the response
  shape is unfamiliar — never raises.
* The legacy ``_llm_chat`` wrapper still returns just text, so every
  existing call site (10+) is undisturbed.
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.services import chat_service


# ---------------------------------------------------------------------------
# Settings stub — we don't actually want any network call to happen during
# these tests. Instead we patch the OpenAI / Anthropic clients themselves.
# ---------------------------------------------------------------------------


class _StubSettings:
    """Minimal duck-type for ``app.settings.Settings`` used by chat_service."""

    def __init__(self, *, glm: str | None = None, anthropic: str | None = None) -> None:
        self.glm_api_key = glm
        self.anthropic_api_key = anthropic


def _patch_settings(
    monkeypatch: pytest.MonkeyPatch,
    *,
    glm: str | None = None,
    anthropic: str | None = None,
) -> None:
    monkeypatch.setattr(
        "app.services.chat_service.get_settings",
        lambda: _StubSettings(glm=glm, anthropic=anthropic),
    )


# ---------------------------------------------------------------------------
# OpenRouter / OpenAI-compatible response capture
# ---------------------------------------------------------------------------


def _make_openai_response(
    text: str,
    *,
    prompt_tokens: int,
    completion_tokens: int,
    model: str = "z-ai/glm-4.5-air:free",
) -> SimpleNamespace:
    """Mimic the shape returned by ``OpenAI.chat.completions.create``."""
    msg = SimpleNamespace(content=text)
    choice = SimpleNamespace(message=msg)
    usage = SimpleNamespace(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=prompt_tokens + completion_tokens,
    )
    return SimpleNamespace(choices=[choice], usage=usage, model=model)


def test_llm_chat_with_usage_captures_openrouter_usage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_settings(monkeypatch, glm="test-key")

    captured_calls: list[dict[str, Any]] = []

    class _FakeCompletions:
        def create(self, **kwargs):  # noqa: D401 — mimic SDK
            captured_calls.append(kwargs)
            return _make_openai_response(
                "Hello, doctor.",
                prompt_tokens=50,
                completion_tokens=12,
                model="z-ai/glm-4.5-air:free",
            )

    class _FakeChat:
        completions = _FakeCompletions()

    class _FakeOpenAI:
        def __init__(self, *args, **kwargs) -> None:
            self.chat = _FakeChat()

    # ``chat_service._llm_chat`` does ``from openai import OpenAI`` at call
    # time — patch the module-level symbol so the import resolves to our stub.
    import openai as openai_module
    monkeypatch.setattr(openai_module, "OpenAI", _FakeOpenAI)

    text, usage = chat_service._llm_chat_with_usage(
        system="sys", messages=[{"role": "user", "content": "hi"}]
    )
    assert text == "Hello, doctor."
    assert usage is not None
    assert usage["input_tokens"] == 50
    assert usage["output_tokens"] == 12
    assert usage["provider"] == "openrouter"
    assert usage["model"] == "z-ai/glm-4.5-air:free"
    # And the SDK was called once with the system + user message merged.
    assert len(captured_calls) == 1


# ---------------------------------------------------------------------------
# Anthropic SDK response capture
# ---------------------------------------------------------------------------


def _make_anthropic_response(
    text: str,
    *,
    input_tokens: int,
    output_tokens: int,
    model: str = "claude-haiku-4-5-20251001",
) -> SimpleNamespace:
    """Mimic the shape returned by ``Anthropic.messages.create``."""
    block = SimpleNamespace(text=text)
    usage = SimpleNamespace(
        input_tokens=input_tokens, output_tokens=output_tokens
    )
    return SimpleNamespace(content=[block], usage=usage, model=model)


def test_llm_chat_with_usage_captures_anthropic_usage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # No GLM key → falls straight through to the Anthropic branch.
    _patch_settings(monkeypatch, glm=None, anthropic="test-anth-key")

    class _FakeMessages:
        def create(self, **kwargs):
            return _make_anthropic_response(
                "Anthropic reply", input_tokens=77, output_tokens=33
            )

    class _FakeAnthropic:
        def __init__(self, *args, **kwargs) -> None:
            self.messages = _FakeMessages()

    monkeypatch.setattr("app.services.chat_service.Anthropic", _FakeAnthropic)

    text, usage = chat_service._llm_chat_with_usage(
        system="sys", messages=[{"role": "user", "content": "hi"}]
    )
    assert text == "Anthropic reply"
    assert usage is not None
    assert usage["input_tokens"] == 77
    assert usage["output_tokens"] == 33
    assert usage["provider"] == "anthropic"
    assert usage["model"] == "claude-haiku-4-5-20251001"


# ---------------------------------------------------------------------------
# Unknown response shape → usage is None, never raises
# ---------------------------------------------------------------------------


def test_llm_chat_with_usage_unknown_shape_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If the response carries no ``usage`` attr at all we degrade gracefully."""
    _patch_settings(monkeypatch, glm="test-key")

    class _BareCompletions:
        def create(self, **kwargs):
            # No ``usage`` attribute at all — the older proxy shapes look
            # like this.
            msg = SimpleNamespace(content="bare")
            choice = SimpleNamespace(message=msg)
            return SimpleNamespace(choices=[choice])

    class _BareChat:
        completions = _BareCompletions()

    class _BareOpenAI:
        def __init__(self, *args, **kwargs) -> None:
            self.chat = _BareChat()

    import openai as openai_module
    monkeypatch.setattr(openai_module, "OpenAI", _BareOpenAI)

    text, usage = chat_service._llm_chat_with_usage(
        system="sys", messages=[{"role": "user", "content": "hi"}]
    )
    assert text == "bare"
    assert usage is None


def test_llm_chat_with_usage_no_keys_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When neither provider is configured, we hit the not-configured branch
    and there is obviously no usage block to capture."""
    _patch_settings(monkeypatch, glm=None, anthropic=None)

    text, usage = chat_service._llm_chat_with_usage(
        system="sys", messages=[{"role": "user", "content": "hi"}]
    )
    # Default not-configured message contains the canonical guidance.
    assert "not configured" in text.lower()
    assert usage is None


# ---------------------------------------------------------------------------
# Legacy ``_llm_chat`` wrapper still returns just text
# ---------------------------------------------------------------------------


def test_legacy_llm_chat_still_returns_str(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The 10+ existing callers must keep working — _llm_chat returns str."""
    _patch_settings(monkeypatch, glm="test-key")

    class _Completions:
        def create(self, **kwargs):
            return _make_openai_response(
                "legacy reply", prompt_tokens=1, completion_tokens=2
            )

    class _Chat:
        completions = _Completions()

    class _OpenAI:
        def __init__(self, *args, **kwargs) -> None:
            self.chat = _Chat()

    import openai as openai_module
    monkeypatch.setattr(openai_module, "OpenAI", _OpenAI)

    text = chat_service._llm_chat(
        system="sys", messages=[{"role": "user", "content": "hi"}]
    )
    assert isinstance(text, str)
    assert text == "legacy reply"


# ---------------------------------------------------------------------------
# Dict-shaped usage (proxy / serialised responses)
# ---------------------------------------------------------------------------


def test_llm_chat_with_usage_handles_dict_shaped_usage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Some proxies return ``usage`` as a plain dict rather than a model
    object. The capture helpers must accept either."""
    _patch_settings(monkeypatch, glm="test-key")

    class _Completions:
        def create(self, **kwargs):
            msg = SimpleNamespace(content="dict-usage reply")
            choice = SimpleNamespace(message=msg)
            return SimpleNamespace(
                choices=[choice],
                usage={"prompt_tokens": 9, "completion_tokens": 4},
                model="proxied/model",
            )

    class _Chat:
        completions = _Completions()

    class _OpenAI:
        def __init__(self, *args, **kwargs) -> None:
            self.chat = _Chat()

    import openai as openai_module
    monkeypatch.setattr(openai_module, "OpenAI", _OpenAI)

    text, usage = chat_service._llm_chat_with_usage(
        system="sys", messages=[{"role": "user", "content": "hi"}]
    )
    assert text == "dict-usage reply"
    assert usage is not None
    assert usage["input_tokens"] == 9
    assert usage["output_tokens"] == 4
    assert usage["provider"] == "openrouter"
