from __future__ import annotations

import pytest

from app.services.knowledge.adapters.faers_adapter import FAERSAdapter


@pytest.mark.asyncio
async def test_faers_get_drug_event_counts_preserves_non_incidence_caveat(monkeypatch) -> None:
    adapter = FAERSAdapter({})

    async def _fake_fetch(query):
        if query.get("count"):
            return [
                {"term": "Seizure", "count": 5},
                {"term": "Headache", "count": 3},
            ]
        return [{"_meta": {"results": {"total": 42}}}]

    monkeypatch.setattr(adapter, "fetch", _fake_fetch)
    rows = await adapter.get_drug_event_counts("bupropion", top_n=2)
    assert len(rows) == 2
    assert rows[0]["report_count"] == 5
    assert "not incidence" in rows[0]["report_count_note"].lower()
    assert "not a percentage risk or incidence rate" in rows[0]["_caveat"].lower()
