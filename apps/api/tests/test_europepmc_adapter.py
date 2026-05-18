"""
Unit tests for app.services.knowledge.adapters.europepmc_adapter.

HTTP mocked at the httpx.AsyncClient boundary with a plain stub class
(same pattern as test_pubmed_adapter / test_clinicaltrials_adapter).
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Union
from unittest.mock import MagicMock

import pytest

from app.services.knowledge.adapters.europepmc_adapter import (
    EuropePMCAdapter,
    EuropePMCError,
    EuropePMCNotFoundError,
    EuropePMCRateLimitError,
)
from app.services.knowledge.base_adapter import (
    ConfidenceTier,
    EvidenceLevel,
    LicenseMetadata,
    ProvenanceRecord,
)


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(
        self,
        *,
        json_data: Any = None,
        text_data: str = "",
        status_code: int = 200,
    ) -> None:
        self.status_code = status_code
        self.text = text_data
        self._json = json_data
        self.request = MagicMock()

    def json(self) -> Any:
        return self._json


def _fake_response(**kw: Any) -> _FakeResponse:
    return _FakeResponse(**kw)


class _FakeClient:
    def __init__(
        self,
        routes: Dict[str, Union[_FakeResponse, Callable[[Dict[str, Any]], _FakeResponse]]],
    ) -> None:
        self.routes = routes
        self.is_closed = False
        self.calls: list = []

    async def get(self, url: str, params: Dict[str, Any] = None) -> _FakeResponse:
        self.calls.append((url, dict(params or {})))
        for needle, response in self.routes.items():
            if needle in url:
                return response(params or {}) if callable(response) else response
        raise AssertionError(f"Unexpected URL: {url}")

    async def aclose(self) -> None:
        self.is_closed = True


def _install_client(adapter, routes):
    client = _FakeClient(routes)
    adapter._client = client
    adapter._connected = True
    return client


# ---------------------------------------------------------------------------
# Fixture data
# ---------------------------------------------------------------------------


_RCT_RESULT = {
    "id": "12345678",
    "source": "MED",
    "pmid": "12345678",
    "pmcid": "PMC1234567",
    "doi": "10.1234/jp.2023.42",
    "title": "RCT of rTMS in treatment-resistant depression",
    "authorString": "Smith J, Doe A, Roe B",
    "journalTitle": "Journal of Affective Disorders",
    "issn": "0165-0327",
    "pubYear": "2023",
    "pubType": "research-article; Randomized Controlled Trial",
    "abstractText": "Background: ...",
    "isOpenAccess": "Y",
    "hasFT": "Y",
    "inEPMC": "Y",
    "inPMC": "Y",
    "citedByCount": 12,
}

_PREPRINT_RESULT = {
    "id": "PPR123",
    "source": "PPR",
    "pmid": "",
    "pmcid": "",
    "doi": "10.1101/2024.01.01.000001",
    "title": "Preprint: novel biomarker hypothesis",
    "authorString": "X Y",
    "journalTitle": "bioRxiv",
    "pubYear": "2024",
    "pubType": "Preprint",
    "abstractText": "We propose...",
    "isOpenAccess": "Y",
    "hasFT": "Y",
    "inEPMC": "N",
    "inPMC": "N",
    "citedByCount": 0,
}

_REVIEW_RESULT = {
    "id": "99999",
    "source": "MED",
    "pmid": "99999",
    "title": "Review article on neurofeedback",
    "authorString": "A B",
    "journalTitle": "Neuroscience Reviews",
    "pubYear": "2022",
    "pubType": "Review",
    "abstractText": "We review...",
    "isOpenAccess": "N",
    "hasFT": "N",
    "inEPMC": "Y",
    "inPMC": "N",
    "citedByCount": 7,
}

_SEARCH_BODY_PAGE = {
    "version": "5.6",
    "hitCount": 3,
    "nextCursorMark": "second",
    "resultList": {"result": [_RCT_RESULT, _REVIEW_RESULT, _PREPRINT_RESULT]},
}

_SEARCH_BODY_END = {
    "version": "5.6",
    "hitCount": 3,
    "nextCursorMark": "second",
    "resultList": {"result": []},
}


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_ok_then_disconnect():
    adapter = EuropePMCAdapter({"max_retries": 1})
    _install_client(adapter, {"search": _fake_response(json_data=_SEARCH_BODY_END)})
    assert await adapter.connect() is True
    assert adapter.is_connected
    await adapter.disconnect()
    assert not adapter.is_connected


@pytest.mark.asyncio
async def test_connect_returns_false_on_500():
    adapter = EuropePMCAdapter({"max_retries": 1})
    _install_client(adapter, {"search": _fake_response(status_code=500)})
    assert await adapter.connect() is False


# ---------------------------------------------------------------------------
# Search / fetch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_by_string_term():
    adapter = EuropePMCAdapter({"max_retries": 1})
    # Two-page sequence: first page has 3 results + a cursor; second page is empty.
    seq = iter(
        [_fake_response(json_data=_SEARCH_BODY_PAGE), _fake_response(json_data=_SEARCH_BODY_END)]
    )

    def resp(_params):
        return next(seq)

    client = _install_client(adapter, {"search": resp})
    records = await adapter.fetch("rTMS depression")
    assert len(records) == 3
    # First call's params should include the query and cursorMark=*
    params = client.calls[0][1]
    assert "rTMS depression" in params["query"]
    assert params["cursorMark"] == "*"


@pytest.mark.asyncio
async def test_fetch_with_filters_composes_query():
    adapter = EuropePMCAdapter({"max_retries": 1})
    client = _install_client(
        adapter, {"search": _fake_response(json_data=_SEARCH_BODY_PAGE)}
    )
    await adapter.fetch(
        {
            "query": "stroke",
            "date_from": "2023-01-01",
            "date_to": "2024-12-31",
            "has_ft": True,
            "author": "Smith",
            "max_results": 5,
        }
    )
    params = client.calls[0][1]
    q = params["query"]
    assert "stroke" in q
    assert "FIRST_PDATE:[2023-01-01 TO 2024-12-31]" in q
    assert "HAS_FT:Y" in q
    assert 'AUTH:"Smith"' in q


@pytest.mark.asyncio
async def test_fetch_by_pmid_uses_ext_id_shortcut():
    adapter = EuropePMCAdapter({"max_retries": 1})
    client = _install_client(
        adapter, {"search": _fake_response(json_data=_SEARCH_BODY_PAGE)}
    )
    await adapter.fetch({"pmid": "12345678"})
    assert client.calls[0][1]["query"] == "EXT_ID:12345678 AND SRC:MED"


@pytest.mark.asyncio
async def test_fetch_by_doi_quotes_value():
    adapter = EuropePMCAdapter({"max_retries": 1})
    client = _install_client(
        adapter, {"search": _fake_response(json_data=_SEARCH_BODY_PAGE)}
    )
    await adapter.fetch({"doi": "10.1234/xyz"})
    assert client.calls[0][1]["query"] == 'DOI:"10.1234/xyz"'


@pytest.mark.asyncio
async def test_fetch_empty_query_rejected():
    adapter = EuropePMCAdapter({"max_retries": 1})
    _install_client(adapter, {"search": _fake_response(json_data=_SEARCH_BODY_PAGE)})
    with pytest.raises(EuropePMCError):
        await adapter.fetch({"max_results": 5})


@pytest.mark.asyncio
async def test_fetch_stops_when_cursor_does_not_advance():
    """Defensive: server returns same cursor twice → break, no infinite loop."""
    adapter = EuropePMCAdapter({"max_retries": 1, "page_size": 1})
    stuck_body = {
        "version": "5.6",
        "hitCount": 100,
        "nextCursorMark": "*",  # same as initial cursor
        "resultList": {"result": [_RCT_RESULT]},
    }
    _install_client(
        adapter, {"search": _fake_response(json_data=stuck_body)}
    )
    records = await adapter.fetch({"query": "x", "max_results": 100})
    # Only one page collected; second loop iteration breaks on stuck cursor.
    assert len(records) == 1


# ---------------------------------------------------------------------------
# Normalize / validate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_normalize_maps_search_result_fields():
    adapter = EuropePMCAdapter()
    normalised = await adapter.normalize([_RCT_RESULT, _PREPRINT_RESULT])
    rct = next(r for r in normalised if r["id"] == "12345678")
    pre = next(r for r in normalised if r["id"] == "PPR123")
    assert rct["pmid"] == "12345678"
    assert rct["pmcid"] == "PMC1234567"
    assert rct["doi"] == "10.1234/jp.2023.42"
    assert rct["is_open_access"] is True
    assert rct["has_full_text"] is True
    assert rct["cited_by_count"] == 12
    assert "Smith J" in rct["authors"]
    assert pre["pub_type"] == "Preprint"
    assert pre["is_open_access"] is True


@pytest.mark.asyncio
async def test_normalize_drops_record_without_any_id():
    adapter = EuropePMCAdapter()
    normalised = await adapter.normalize([{"title": "anonymous"}])
    assert normalised == []


@pytest.mark.asyncio
async def test_validate_attaches_evidence_and_provenance():
    adapter = EuropePMCAdapter()
    normalised = await adapter.normalize([_RCT_RESULT, _REVIEW_RESULT, _PREPRINT_RESULT])
    validated = await adapter.validate(normalised)
    rct = next(r for r in validated if r["id"] == "12345678")
    review = next(r for r in validated if r["id"] == "99999")
    pre = next(r for r in validated if r["id"] == "PPR123")
    assert rct["_valid"] is True
    assert rct["_evidence_level"] == EvidenceLevel.RCT.value
    assert rct["_confidence"] == ConfidenceTier.HIGH.value
    # Review → EXPERT_OPINION → MEDIUM
    assert review["_evidence_level"] == EvidenceLevel.EXPERT_OPINION.value
    assert review["_confidence"] == ConfidenceTier.MEDIUM.value
    # Preprint → PILOT_EXPERT → LOW + research_only
    assert pre["_evidence_level"] == EvidenceLevel.PILOT_EXPERT.value
    assert pre["_confidence"] == ConfidenceTier.LOW.value
    assert pre["_provenance"]["research_only"] is True


# ---------------------------------------------------------------------------
# Provenance / license / confidence
# ---------------------------------------------------------------------------


def test_get_license_is_ebi_terms():
    adapter = EuropePMCAdapter()
    meta = adapter.get_license()
    assert isinstance(meta, LicenseMetadata)
    assert meta.allows_research is True
    assert meta.allows_commercial is False
    assert meta.requires_attribution is True
    assert any("isOpenAccess" in r for r in meta.restrictions)


def test_get_provenance_dataclass_shape_for_rct():
    adapter = EuropePMCAdapter()
    record = {
        "id": "12345678",
        "title": "An RCT",
        "pub_type": "Randomized Controlled Trial",
        "journal": "JAMA",
        "pub_year": "2023",
        "doi": "10.1/abc",
    }
    prov = adapter.get_provenance(record)
    assert isinstance(prov, ProvenanceRecord)
    assert prov.source_database == "Europe PMC"
    assert prov.confidence_tier == ConfidenceTier.HIGH
    assert prov.evidence_level == EvidenceLevel.RCT
    assert prov.research_only is False
    assert prov.citation_doi == "10.1/abc"


def test_get_confidence_tiers_map_correctly():
    adapter = EuropePMCAdapter()
    assert (
        adapter.get_confidence({"pub_type": "Meta-Analysis"})
        == ConfidenceTier.HIGH
    )
    assert (
        adapter.get_confidence({"pub_type": "Observational Study"})
        == ConfidenceTier.MEDIUM
    )
    assert (
        adapter.get_confidence({"pub_type": "Case Reports"})
        == ConfidenceTier.LOW
    )
    assert adapter.get_confidence({"pub_type": ""}) == ConfidenceTier.LOW


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_404_raises_notfound():
    adapter = EuropePMCAdapter({"max_retries": 1})
    _install_client(adapter, {"search": _fake_response(status_code=404)})
    with pytest.raises(EuropePMCNotFoundError):
        await adapter.fetch({"query": "ghost"})


@pytest.mark.asyncio
async def test_429_raises_ratelimit():
    adapter = EuropePMCAdapter({"max_retries": 1})
    _install_client(adapter, {"search": _fake_response(status_code=429)})
    with pytest.raises(EuropePMCRateLimitError):
        await adapter.fetch({"query": "burst"})


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_ok():
    adapter = EuropePMCAdapter({"max_retries": 1})
    _install_client(adapter, {"search": _fake_response(json_data=_SEARCH_BODY_END)})
    h = await adapter.health_check()
    assert h["status"] == "ok"
    assert h["source"] == "Europe PMC"


@pytest.mark.asyncio
async def test_health_check_reports_down_on_500():
    adapter = EuropePMCAdapter({"max_retries": 1})
    _install_client(adapter, {"search": _fake_response(status_code=500)})
    h = await adapter.health_check()
    assert h["status"] == "down"
    assert "error" in h
