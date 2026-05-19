"""Unit tests for the diagnosis eligibility-context service.

These tests pin down the contract: the service surfaces COVERAGE-RELATED
CONTEXT only, and never crosses into "eligible" / "covered" / "approved"
language or claims a coverage decision was made.
"""
from __future__ import annotations

from typing import Any, Dict, List

import pytest

from app.services.diagnosis_coding import (
    ELIGIBILITY_DISCLAIMER,
    eligibility_context,
)
from app.services.diagnosis_coding.safety import FORBIDDEN_PHRASES


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
        return [{**r, "source": self._key} for r in raw]

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


def _serialize(obj: Any) -> str:
    import json

    return json.dumps(obj, default=str).lower()


@pytest.mark.asyncio
async def test_eligibility_context_never_claims_coverage() -> None:
    registry = FakeRegistry(
        {
            "icd10": FakeAdapter(
                key="icd10",
                records=[{"code": "F33.2", "display": "Major depressive disorder, severe"}],
            )
        }
    )
    result = await eligibility_context(
        registry_getter=_getter(registry),
        diagnosis_code="F33.2",
        modality="rTMS",
        jurisdiction="UK",
        payer="NHS",
    )
    assert result["decision_support_disclaimer"] == ELIGIBILITY_DISCLAIMER
    assert result["coverage_determined"] is False
    assert result["status"] == "context_only"
    flat = _serialize(result)
    for forbidden in FORBIDDEN_PHRASES:
        assert forbidden.lower() not in flat, (
            f"Eligibility context must never emit phrase '{forbidden}': {flat[:200]}..."
        )


@pytest.mark.asyncio
async def test_eligibility_context_missing_input_warns() -> None:
    registry = FakeRegistry({})
    result = await eligibility_context(
        registry_getter=_getter(registry),
        diagnosis_code="",
    )
    assert result["status"] == "missing_input"
    assert result["coverage_determined"] is False
    assert any("No diagnosis_code" in w for w in result["warnings"])


@pytest.mark.asyncio
async def test_eligibility_context_reports_missing_sources() -> None:
    # Only ICD-10 is registered; the other 4 should be flagged as missing.
    registry = FakeRegistry(
        {
            "icd10": FakeAdapter(
                key="icd10",
                records=[{"code": "F33.2", "display": "Major depressive disorder, severe"}],
            )
        }
    )
    result = await eligibility_context(
        registry_getter=_getter(registry),
        diagnosis_code="F33.2",
        modality="rTMS",
    )
    missing = set(result["missing_sources"])
    # ICD-10 produced a match, so it should be available; the other 4 missing.
    assert "icd10" not in missing
    for src in ("snomedct", "mesh", "umls", "ols"):
        assert src in missing
