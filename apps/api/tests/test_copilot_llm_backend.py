"""Tests for :mod:`deepsynaps_qeeg.ai.copilot` real streaming dispatch.

Covers:

* Backend selection (``_select_backend``) honours env override and
  falls back to the mock when no SDK client is available.
* The four-tool JSON schema (``_tools_schema``) has the right names
  and required fields.
* ``real_llm_tool_dispatch`` short-circuits on unsafe queries.
* A mocked Anthropic ``messages.stream`` drives the dispatch loop
  through tool-use → tool_result → text-delta → final, in order.
* The banned-word sanitiser rewrites model output BEFORE yield.

These tests never contact a real LLM — every client is a unittest
mock.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest


def _collect(async_iter: Any) -> list[dict[str, Any]]:
    """Drain an async iterator into a list on a fresh event loop."""

    async def _runner() -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        async for chunk in async_iter:
            out.append(chunk)
        return out

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_runner())
    finally:
        loop.close()


def test_backend_selection_prefers_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    from deepsynaps_qeeg.ai import copilot

    copilot._reset_llm_client_caches()
    monkeypatch.setenv("DEEPSYNAPS_LLM_BACKEND", "openai")
    # Provide fake clients for both so the override has something to pick.
    fake_anthropic = MagicMock(name="anthropic")
    fake_openai = MagicMock(name="openai")
    monkeypatch.setattr(copilot, "_get_anthropic_client", lambda: fake_anthropic)
    monkeypatch.setattr(copilot, "_get_openai_client", lambda: fake_openai)
    assert copilot._select_backend() == "openai"


def test_backend_falls_back_to_mock_when_no_clients(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from deepsynaps_qeeg.ai import copilot

    copilot._reset_llm_client_caches()
    monkeypatch.delenv("DEEPSYNAPS_LLM_BACKEND", raising=False)
    monkeypatch.setattr(copilot, "_get_anthropic_client", lambda: None)
    monkeypatch.setattr(copilot, "_get_openai_client", lambda: None)
    assert copilot._select_backend() == "mock"


def test_tools_schema_has_five_tools() -> None:
    from deepsynaps_qeeg.ai import copilot

    schema = copilot._tools_schema()
    assert isinstance(schema, list)
    names = [t["name"] for t in schema]
    assert set(names) == {
        "tool_search_papers",
        "tool_explain_feature",
        "tool_compare_to_norm",
        "tool_get_recommendation_detail",
        "tool_explain_channel",
        "tool_explain_medication",
    }
    for tool in schema:
        assert "description" in tool and tool["description"]
        assert "input_schema" in tool
        schema_obj = tool["input_schema"]
        assert schema_obj["type"] == "object"
        assert "properties" in schema_obj
        assert "required" in schema_obj
    # Per-tool required fields
    by_name = {t["name"]: t for t in schema}
    assert by_name["tool_search_papers"]["input_schema"]["required"] == ["query"]
    assert by_name["tool_explain_feature"]["input_schema"]["required"] == [
        "feature_name"
    ]
    assert set(
        by_name["tool_compare_to_norm"]["input_schema"]["required"]
    ) == {"feature_name", "value"}
    assert by_name["tool_get_recommendation_detail"]["input_schema"]["required"] == [
        "section"
    ]
    assert by_name["tool_explain_channel"]["input_schema"]["required"] == [
        "channel_name"
    ]


def test_real_dispatch_safety_refusal(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unsafe queries MUST short-circuit before any backend call."""
    from deepsynaps_qeeg.ai import copilot

    copilot._reset_llm_client_caches()
    # Use mocked clients that would raise if contacted.
    boom_anthropic = MagicMock(name="anthropic")
    boom_anthropic.messages.stream.side_effect = AssertionError(
        "anthropic should not be called for unsafe queries"
    )
    boom_openai = MagicMock(name="openai")
    boom_openai.chat.completions.create.side_effect = AssertionError(
        "openai should not be called for unsafe queries"
    )

    chunks = _collect(
        copilot.real_llm_tool_dispatch(
            "Should I stop taking my SSRI?",
            {"analysis_id": "a1"},
            history=[],
            anthropic_client=boom_anthropic,
            openai_client=boom_openai,
        )
    )
    assert len(chunks) == 1
    assert chunks[0]["type"] == "final"
    assert "consult your clinician" in chunks[0]["text"].lower()
    boom_anthropic.messages.stream.assert_not_called()
    boom_openai.chat.completions.create.assert_not_called()


def _build_fake_anthropic_stream(scripted_events: list[Any], final_message: Any) -> Any:
    """Build a MagicMock ``messages.stream`` that yields scripted events.

    Parameters
    ----------
    scripted_events : list
        Event objects (``SimpleNamespace``) with ``type`` / ``delta`` /
        ``content_block`` attributes as per Anthropic's streaming SDK.
    final_message : Any
        What :meth:`get_final_message` should return.
    """

    class _FakeStream:
        def __init__(self) -> None:
            self._events = scripted_events

        async def __aenter__(self) -> Any:
            return self

        async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
            return None

        def __aiter__(self) -> Any:
            async def _gen() -> Any:
                for e in self._events:
                    yield e

            return _gen()

        async def get_final_message(self) -> Any:
            return final_message

    fake_client = MagicMock()
    fake_client.messages.stream = MagicMock(return_value=_FakeStream())
    return fake_client


def test_real_dispatch_with_mocked_anthropic(monkeypatch: pytest.MonkeyPatch) -> None:
    """Drive the anthropic branch through a scripted tool_use → text path."""
    from deepsynaps_qeeg.ai import copilot

    copilot._reset_llm_client_caches()
    monkeypatch.setenv("DEEPSYNAPS_LLM_BACKEND", "anthropic")

    # ── Turn 1: model asks for a tool call. ────────────────────────────
    tool_block = SimpleNamespace(
        type="tool_use",
        id="toolu_1",
        name="tool_explain_feature",
        input={"feature_name": "theta_beta_ratio"},
    )
    turn1_events = [
        SimpleNamespace(type="content_block_start", content_block=tool_block),
    ]
    turn1_final = SimpleNamespace(
        stop_reason="tool_use",
        content=[tool_block],
    )

    # ── Turn 2: model produces a text answer after seeing the tool
    # result. ──────────────────────────────────────────────────────────
    turn2_events = [
        SimpleNamespace(
            type="content_block_delta",
            delta=SimpleNamespace(type="text_delta", text="Theta/Beta ratio is "),
        ),
        SimpleNamespace(
            type="content_block_delta",
            delta=SimpleNamespace(type="text_delta", text="a spectral index."),
        ),
    ]
    turn2_final = SimpleNamespace(
        stop_reason="end_turn",
        content=[SimpleNamespace(type="text", text="Theta/Beta ratio is a spectral index.")],
    )

    # Build two consecutive fake streams — one per call.
    stream1 = _build_fake_anthropic_stream(turn1_events, turn1_final)
    stream2 = _build_fake_anthropic_stream(turn2_events, turn2_final)

    fake_client = MagicMock()
    calls: list[dict[str, Any]] = []

    def _side_effect(**kwargs: Any) -> Any:
        calls.append(kwargs)
        # First call returns stream1, subsequent returns stream2.
        return (
            stream1.messages.stream.return_value
            if len(calls) == 1
            else stream2.messages.stream.return_value
        )

    fake_client.messages.stream = MagicMock(side_effect=_side_effect)

    # Track whether the tool was dispatched correctly.
    dispatched: list[tuple[str, dict[str, Any]]] = []
    orig = copilot._dispatch_tool_call

    def _tracker(name: str, tool_input: dict[str, Any], context: dict[str, Any]) -> Any:
        dispatched.append((name, dict(tool_input)))
        return orig(name, tool_input, context)

    monkeypatch.setattr(copilot, "_dispatch_tool_call", _tracker)

    chunks = _collect(
        copilot.real_llm_tool_dispatch(
            "Explain theta_beta_ratio",
            {"analysis_id": "a1"},
            history=[],
            anthropic_client=fake_client,
        )
    )

    # The tool must have been called with the model-supplied input.
    assert dispatched == [("tool_explain_feature", {"feature_name": "theta_beta_ratio"})]

    types = [c["type"] for c in chunks]
    # Expected ordering: tool_use → tool_result → delta → delta → final.
    assert types == ["tool_use", "tool_result", "delta", "delta", "final"]

    assert chunks[0]["tool"] == "tool_explain_feature"
    assert chunks[1]["tool"] == "tool_explain_feature"
    assert chunks[2]["text"] == "Theta/Beta ratio is "
    assert chunks[3]["text"] == "a spectral index."
    assert chunks[4]["text"] == "Theta/Beta ratio is a spectral index."
    # Two LLM calls: the original + the post-tool-result one.
    assert len(calls) == 2


def test_banned_word_sanitiser_applies_to_llm_output() -> None:
    """The sanitiser must rewrite ``diagnosis`` BEFORE each chunk is yielded."""
    from deepsynaps_qeeg.ai import copilot

    copilot._reset_llm_client_caches()

    # One-turn script: emit a text delta that contains "diagnosis".
    banned_events = [
        SimpleNamespace(
            type="content_block_delta",
            delta=SimpleNamespace(
                type="text_delta",
                text="you may have a diagnosis of…",
            ),
        ),
    ]
    final = SimpleNamespace(
        stop_reason="end_turn",
        content=[SimpleNamespace(type="text", text="you may have a diagnosis of…")],
    )

    fake_client = MagicMock()
    fake_stream = _build_fake_anthropic_stream(banned_events, final)
    fake_client.messages.stream = fake_stream.messages.stream

    chunks = _collect(
        copilot.real_llm_tool_dispatch(
            "what does that mean?",
            {"analysis_id": "a1"},
            history=[],
            anthropic_client=fake_client,
        )
    )

    # Each chunk must have been rewritten already.
    deltas = [c for c in chunks if c["type"] == "delta"]
    assert len(deltas) == 1
    assert "diagnosis" not in deltas[0]["text"].lower()
    assert "finding" in deltas[0]["text"].lower()
    assert deltas[0]["text"] == "you may have a finding of…"

    final_chunk = next(c for c in chunks if c["type"] == "final")
    assert "diagnosis" not in final_chunk["text"].lower()


def test_real_dispatch_mock_last_resort(monkeypatch: pytest.MonkeyPatch) -> None:
    """When no backend is configured, yields a single ``final`` with ``<mock>`` prefix."""
    from deepsynaps_qeeg.ai import copilot

    copilot._reset_llm_client_caches()
    monkeypatch.delenv("DEEPSYNAPS_LLM_BACKEND", raising=False)
    monkeypatch.setattr(copilot, "_get_anthropic_client", lambda: None)
    monkeypatch.setattr(copilot, "_get_openai_client", lambda: None)

    chunks = _collect(
        copilot.real_llm_tool_dispatch(
            "explain: theta_beta_ratio",
            {"analysis_id": "a1"},
            history=[],
        )
    )
    assert len(chunks) == 1
    assert chunks[0]["type"] == "final"
    assert chunks[0]["text"].startswith("<mock>")
