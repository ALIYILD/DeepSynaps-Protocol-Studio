from __future__ import annotations

from app.services.knowledge.genetics_inventory import build_genetic_registry, summarize_genetic_lifecycle


def test_genetic_lifecycle_summary_is_complete_and_honest() -> None:
    summary = summarize_genetic_lifecycle(build_genetic_registry())

    assert summary["total"] == 14
    assert summary["by_state"]["disabled"] == 6
    assert summary["adapters"]["gnomad"] in {"registered", "healthy"}
    assert summary["adapters"]["myvariant"] in {"registered", "healthy"}

