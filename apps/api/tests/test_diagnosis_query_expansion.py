"""Unit tests for the diagnosis terminology query-expansion service."""
from __future__ import annotations

from typing import Any, Dict, List

import pytest

from app.services.diagnosis_coding import (
    DIAGNOSIS_CODING_SOURCES,
    QUERY_EXPANSION_DISCLAIMER,
    query_expansion,
)


class FakeAdapter:
    def __init__(self, *, key: str, records: List[Dict[str, Any]] = None) -> None:
        self._key = key
        self._records = records or []
        self.has_credentials = True
        self.is_connected = False

    @property
    def source_name(self) -> str:
        return self._key.upper()

    @property
    def source_version(self) -> str:
        return "test"

    async def connect(self) -> bool:
        self.is_connected = True
        return True

    async def fetch(self, query):  # noqa: ANN001
        return list(self._records)

    async def normalize(self, raw):  # noqa: ANN001
        out = []
        for r in raw:
            r2 = dict(r)
            r2.setdefault("source", self._key)
            out.append(r2)
        return out

    async def validate(self, recs):  # noqa: ANN001
        for r in recs:
            r["_valid"] = True
            r["_confidence"] = "high"
            r["_provenance"] = {"source_database": self.source_name}
        return recs


class FakeRegistry:
    def __init__(self, adapters: Dict[str, FakeAdapter]) -> None:
        self._adapters = adapters

    def get(self, key: str) -> Any:
        return self._adapters.get(key)


def _getter(registry):
    async def _g():
        return registry

    return _g


@pytest.mark.asyncio
async def test_query_expansion_returns_synonyms_and_provenance() -> None:
    registry = FakeRegistry(
        {
            "icd10": FakeAdapter(
                key="icd10",
                records=[{"code": "F33.2", "display": "Major depressive disorder, severe"}],
            ),
            "mesh": FakeAdapter(
                key="mesh",
                records=[
                    {
                        "code": "D003863",
                        "display": "Depression",
                        "synonyms": ["Mood Disorders", "Melancholia"],
                    }
                ],
            ),
        }
    )
    result = await query_expansion(
        registry_getter=_getter(registry),
        condition="depression",
        target_workflow="evidence",
        limit=5,
    )
    assert result["decision_support_disclaimer"] == QUERY_EXPANSION_DISCLAIMER
    assert result["condition"] == "depression"
    # Mappings exist per-source, and provenance is included on each match.
    assert any(m["provenance"] for m in result["mappings"]["icd10"])
    assert "Mood Disorders" in result["synonyms"]
    # The original condition appears first in the evidence search terms.
    assert result["evidence_search_terms"][0] == "depression"
    # Every source key is represented even when empty.
    for src in DIAGNOSIS_CODING_SOURCES:
        assert src in result["mappings"]


@pytest.mark.asyncio
async def test_query_expansion_warns_when_no_source_backed_mappings() -> None:
    registry = FakeRegistry({})  # zero adapters
    result = await query_expansion(
        registry_getter=_getter(registry),
        condition="rare_unmappable_condition_xyz",
    )
    assert result["evidence_search_terms"] == ["rare_unmappable_condition_xyz"]
    assert any("No source-backed mappings" in w for w in result["warnings"])


@pytest.mark.asyncio
async def test_query_expansion_empty_condition_safe() -> None:
    registry = FakeRegistry({})
    result = await query_expansion(
        registry_getter=_getter(registry),
        condition="",
    )
    assert result["evidence_search_terms"] == []
    assert result["decision_support_disclaimer"]
    assert any("Empty condition" in w for w in result["warnings"])
