from __future__ import annotations

import pytest

from app.services import chat_service


def test_chat_clinician_injects_local_knowledge(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def _fake_llm_chat(**kwargs):
        captured.update(kwargs)
        return "ok"

    monkeypatch.setattr(chat_service, "_llm_chat", _fake_llm_chat)

    reply = chat_service.chat_clinician(
        [{"role": "user", "content": "How should I review qEEG artifact and stimulant confounds?"}]
    )

    assert reply == "ok"
    system = str(captured.get("system") or "")
    assert "<local_knowledge>" in system
    assert "Repo-native local knowledge bundle" in system


def test_chat_agent_with_evidence_injects_local_knowledge_and_papers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def _fake_dispatch(system, messages, provider, openai_key):
        captured["system"] = system
        captured["messages"] = messages
        return "ok"

    monkeypatch.setattr(chat_service, "_agent_llm_dispatch", _fake_dispatch)

    class _FakeEvidenceModule:
        @staticmethod
        def search_evidence(**kwargs):
            return [
                {
                    "pmid": "123456",
                    "title": "Artifact control in qEEG review",
                    "url": "https://pubmed.ncbi.nlm.nih.gov/123456/",
                }
            ]

        @staticmethod
        def format_evidence_context(papers):
            return "1. Artifact control in qEEG review"

    import app.services.evidence_rag as evidence_rag

    monkeypatch.setattr(evidence_rag, "search_evidence", _FakeEvidenceModule.search_evidence)
    monkeypatch.setattr(evidence_rag, "format_evidence_context", _FakeEvidenceModule.format_evidence_context)

    reply, papers = chat_service.chat_agent_with_evidence(
        [{"role": "user", "content": "Show qEEG artifact literature and local courseware"}]
    )

    assert reply == "ok"
    assert len(papers) == 1
    system = str(captured.get("system") or "")
    assert "<local_knowledge>" in system
    assert "<papers>" in system
