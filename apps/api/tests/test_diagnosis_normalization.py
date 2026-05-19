"""Unit tests for the diagnosis normalisation service.

The tests use an in-memory FakeRegistry / FakeAdapter so they exercise the
service-layer orchestration end-to-end without hitting any external API.
"""
from __future__ import annotations

from typing import Any, Dict, List

import pytest

from app.services.diagnosis_coding import (
    DIAGNOSIS_CODING_SOURCES,
    NORMALIZATION_DISCLAIMER,
    normalize_diagnosis,
)
from app.services.diagnosis_coding.service import detect_coding_system


# ── Fakes ────────────────────────────────────────────────────────────────────


class FakeAdapter:
    def __init__(self, *, key: str, has_credentials: bool = True, records: List[Dict[str, Any]] = None) -> None:
        self._key = key
        self.has_credentials = has_credentials
        self._records = records or []
        self.is_connected = False

    @property
    def source_name(self) -> str:
        return self._key.upper()

    @property
    def source_version(self) -> str:
        return "test"

    async def connect(self) -> bool:
        if not self.has_credentials:
            self.is_connected = False
            return False
        self.is_connected = True
        return True

    async def fetch(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        return list(self._records)

    async def normalize(self, raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out = []
        for r in raw:
            r2 = dict(r)
            r2.setdefault("source", self._key)
            out.append(r2)
        return out

    async def validate(self, recs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        for r in recs:
            r["_valid"] = True
            r["_confidence"] = "high"
            r["_provenance"] = {
                "source_database": self.source_name,
                "source_record_id": r.get("code", "unknown"),
                "license_type": "TEST",
            }
        return recs


class FakeRegistry:
    def __init__(self, adapters: Dict[str, FakeAdapter]) -> None:
        self._adapters = adapters

    def get(self, key: str) -> Any:
        return self._adapters.get(key)


def _registry_getter(registry: FakeRegistry):
    async def _get() -> FakeRegistry:
        return registry

    return _get


# ── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "term, expected",
    [
        ("F33.2", "icd10"),
        ("E11.9", "icd10"),
        ("370143000", "snomedct"),
        ("D003863", "mesh"),
        ("C0011570", "umls"),
        ("major depressive disorder", None),
    ],
)
def test_detect_coding_system_shapes(term: str, expected: str) -> None:
    assert detect_coding_system(term) == expected


@pytest.mark.asyncio
async def test_normalize_returns_disclaimer_and_provenance() -> None:
    registry = FakeRegistry(
        {
            "icd10": FakeAdapter(
                key="icd10",
                records=[{"code": "F33.2", "display": "Major depressive disorder, severe", "coding_system": "icd10"}],
            ),
            "snomedct": FakeAdapter(
                key="snomedct",
                records=[{"code": "370143000", "display": "Major depressive disorder", "coding_system": "snomedct"}],
            ),
        }
    )
    result = await normalize_diagnosis(
        registry_getter=_registry_getter(registry),
        term="F33.2",
        limit=5,
    )
    assert result["decision_support_disclaimer"] == NORMALIZATION_DISCLAIMER
    assert result["input_term"] == "F33.2"
    assert result["detected_coding_system"] == "icd10"
    icd10_matches = result["matches_by_source"]["icd10"]
    assert icd10_matches and icd10_matches[0]["code"] == "F33.2"
    assert icd10_matches[0]["provenance"]["source_database"] == "ICD10"
    # Result is never a diagnosis assertion — verify no diagnosis-asserting key:
    assert "diagnosis_confirmed" not in result
    assert "patient_diagnosed" not in result
    # Every source key remains present even if empty.
    for src in DIAGNOSIS_CODING_SOURCES:
        assert src in result["matches_by_source"]


@pytest.mark.asyncio
async def test_normalize_empty_term_returns_warning() -> None:
    registry = FakeRegistry({})
    result = await normalize_diagnosis(
        registry_getter=_registry_getter(registry),
        term="",
    )
    assert result["matches"] == []
    assert any("Empty input" in w for w in result["warnings"])
    assert result["decision_support_disclaimer"]


@pytest.mark.asyncio
async def test_normalize_handles_missing_adapter() -> None:
    registry = FakeRegistry({})  # no adapters registered
    result = await normalize_diagnosis(
        registry_getter=_registry_getter(registry),
        term="depression",
        limit=3,
    )
    # All sources should report missing
    for src in DIAGNOSIS_CODING_SOURCES:
        assert result["source_status"].get(src, {}).get("available") is False
    assert any("not registered" in w for w in result["warnings"])


@pytest.mark.asyncio
async def test_normalize_umls_without_credentials_degrades_silently() -> None:
    umls_adapter = FakeAdapter(key="umls", has_credentials=False, records=[])
    icd10_adapter = FakeAdapter(
        key="icd10",
        records=[{"code": "F33.2", "display": "Major depressive disorder, severe"}],
    )
    registry = FakeRegistry({"umls": umls_adapter, "icd10": icd10_adapter})
    result = await normalize_diagnosis(
        registry_getter=_registry_getter(registry),
        term="F33.2",
    )
    assert result["source_status"]["umls"]["status"] == "degraded"
    # ICD-10 still returns results.
    assert result["matches_by_source"]["icd10"]
    # And the result still has a disclaimer.
    assert result["decision_support_disclaimer"]


@pytest.mark.asyncio
async def test_normalize_respects_coding_system_hint() -> None:
    mesh = FakeAdapter(
        key="mesh",
        records=[{"code": "D003863", "display": "Depression", "coding_system": "mesh"}],
    )
    icd10 = FakeAdapter(
        key="icd10",
        records=[{"code": "F33.2", "display": "Major depressive disorder, severe"}],
    )
    registry = FakeRegistry({"mesh": mesh, "icd10": icd10})
    result = await normalize_diagnosis(
        registry_getter=_registry_getter(registry),
        term="depression",
        coding_system="MeSH",
    )
    # MeSH was hinted but both are queried — both should appear.
    assert result["matches_by_source"]["mesh"]
    assert result["matches_by_source"]["icd10"]
