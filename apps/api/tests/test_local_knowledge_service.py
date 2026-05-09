from __future__ import annotations

from app.services import local_knowledge_service as lks


def test_local_knowledge_summary_exposes_imported_bundle() -> None:
    summary = lks.get_local_knowledge_summary()
    assert summary["resource_count"] >= 3
    assert summary["courseware_modules"] >= 1
    assert summary["research_items"] >= 1
    assert "qeeg-certificate-course" in summary["resource_slugs"]


def test_local_knowledge_search_matches_courseware_and_research() -> None:
    rows = lks.search_local_knowledge("artifact beta", limit=8)
    assert rows, "expected imported local knowledge search to return matches"
    kinds = {row["kind"] for row in rows}
    assert "courseware_module" in kinds or "research_item" in kinds


def test_render_local_knowledge_prompt_returns_prompt_safe_text() -> None:
    block = lks.render_local_knowledge_prompt("psychopharmacology stimulant", limit=3)
    assert block
    assert block.startswith("- ")
