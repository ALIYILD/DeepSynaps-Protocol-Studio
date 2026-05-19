"""
Unit tests for app.services.knowledge.adapters.openalex_adapter.

HTTP mocked at the httpx.AsyncClient boundary with a plain stub class
(same pattern as test_pubmed_adapter / test_europepmc_adapter).

Coverage:
* connect / disconnect lifecycle
* fetch() variants: search term, DOI lookup, PMID lookup, OpenAlex ID,
  raw filter DSL, missing-query error
* normalize(): authorships / inverted-index abstract / external IDs
* validate(): _valid flag, _evidence_level, _confidence, _provenance
* get_provenance / get_license / get_confidence: dataclass shape + tier
* health_check: ok + down + missing-api-key paths
* error paths: 404 → NotFound, 401 → Auth, 429 → RateLimit
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Union
from unittest.mock import MagicMock

import pytest

from app.services.knowledge.adapters.openalex_adapter import (
    OpenAlexAdapter,
    OpenAlexAPIError,
    OpenAlexAuthError,
    OpenAlexError,
    OpenAlexNotFoundError,
    OpenAlexRateLimitError,
    _abstract_from_inverted_index,
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
        headers: Dict[str, str] = None,
    ) -> None:
        self.status_code = status_code
        self.text = text_data
        self._json = json_data
        self.headers = headers or {}
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


_JOURNAL_WORK = {
    "id": "https://openalex.org/W2741809807",
    "doi": "https://doi.org/10.1234/jp.2023.42",
    "title": "rTMS in treatment-resistant depression",
    "display_name": "rTMS in treatment-resistant depression",
    "publication_year": 2023,
    "publication_date": "2023-06-15",
    "type": "journal-article",
    "cited_by_count": 42,
    "referenced_works_count": 35,
    "language": "en",
    "open_access": {
        "is_oa": True,
        "oa_status": "gold",
        "oa_url": "https://example.org/paper.pdf",
    },
    "primary_location": {
        "source": {
            "display_name": "Journal of Affective Disorders",
            "issn_l": "0165-0327",
        }
    },
    "authorships": [
        {
            "author": {"display_name": "Jane Smith"},
            "institutions": [{"display_name": "Stanford University"}],
        },
        {
            "author": {"display_name": "John Doe"},
            "institutions": [{"display_name": "Stanford University"}],
        },
    ],
    "concepts": [{"display_name": "Depression"}, {"display_name": "Neuromodulation"}],
    "topics": [{"display_name": "rTMS clinical trials"}],
    "ids": {
        "pmid": "https://pubmed.ncbi.nlm.nih.gov/12345678",
        "doi": "https://doi.org/10.1234/jp.2023.42",
    },
    "abstract_inverted_index": {
        "Background": [0],
        "We": [1, 5],
        "studied": [2],
        "rTMS": [3, 6],
        ".": [4, 8],
        "report": [7],
    },
}

_PREPRINT_WORK = {
    "id": "https://openalex.org/W9999",
    "doi": "https://doi.org/10.1101/2024.01.01.000001",
    "title": "Preprint: novel biomarker hypothesis",
    "publication_year": 2024,
    "type": "preprint",
    "cited_by_count": 0,
    "open_access": {"is_oa": True, "oa_status": "green"},
    "primary_location": {"source": {"display_name": "bioRxiv"}},
    "authorships": [{"author": {"display_name": "X Y"}}],
    "abstract_inverted_index": {"We": [0], "propose": [1]},
}

_REVIEW_WORK = {
    "id": "https://openalex.org/W8888",
    "doi": "https://doi.org/10.5555/review.2022",
    "title": "Review article on neurofeedback",
    "publication_year": 2022,
    "type": "review",
    "cited_by_count": 7,
    "open_access": {"is_oa": False, "oa_status": "closed"},
    "primary_location": {"source": {"display_name": "Neuroscience Reviews"}},
    "authorships": [],
}


def _works_search_response(payload, next_cursor=None):
    return _fake_response(
        json_data={
            "results": payload,
            "meta": {"next_cursor": next_cursor, "count": len(payload)},
        }
    )


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_succeeds_and_disconnect_clears_state():
    adapter = OpenAlexAdapter({"api_key": "k"})
    _install_client(
        adapter, {"works": _works_search_response([_JOURNAL_WORK], None)}
    )
    ok = await adapter.connect()
    assert ok is True
    assert adapter._connected is True
    await adapter.disconnect()
    assert adapter._connected is False


@pytest.mark.asyncio
async def test_connect_failure_returns_false():
    adapter = OpenAlexAdapter({"api_key": "k"})
    _install_client(
        adapter, {"works": _fake_response(status_code=500, text_data="boom")}
    )
    adapter._max_retries = 1
    ok = await adapter.connect()
    assert ok is False
    assert adapter._connected is False


# ---------------------------------------------------------------------------
# fetch — search + ID lookups
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_search_returns_results():
    adapter = OpenAlexAdapter({"api_key": "k"})
    _install_client(
        adapter, {"works": _works_search_response([_JOURNAL_WORK], None)}
    )
    results = await adapter.fetch({"query": "rTMS depression"})
    assert len(results) == 1
    assert results[0]["id"] == _JOURNAL_WORK["id"]


@pytest.mark.asyncio
async def test_fetch_by_doi_uses_doi_endpoint():
    adapter = OpenAlexAdapter({"api_key": "k"})
    client = _install_client(adapter, {"works/doi:": _fake_response(json_data=_JOURNAL_WORK)})
    results = await adapter.fetch({"doi": "10.1234/jp.2023.42"})
    assert len(results) == 1
    # The DOI is lower-cased and embedded in the URL.
    assert any("works/doi:10.1234/jp.2023.42" in call[0] for call in client.calls)


@pytest.mark.asyncio
async def test_fetch_by_pmid_uses_pmid_endpoint():
    adapter = OpenAlexAdapter({"api_key": "k"})
    client = _install_client(adapter, {"works/pmid:": _fake_response(json_data=_JOURNAL_WORK)})
    results = await adapter.fetch({"pmid": "12345678"})
    assert len(results) == 1
    assert any("works/pmid:12345678" in call[0] for call in client.calls)


@pytest.mark.asyncio
async def test_fetch_by_openalex_id_uses_works_endpoint():
    adapter = OpenAlexAdapter({"api_key": "k"})
    client = _install_client(adapter, {"works/W": _fake_response(json_data=_JOURNAL_WORK)})
    results = await adapter.fetch({"openalex_id": "W2741809807"})
    assert len(results) == 1
    assert any("works/W2741809807" in call[0] for call in client.calls)


@pytest.mark.asyncio
async def test_fetch_with_filter_passes_filter_param():
    adapter = OpenAlexAdapter({"api_key": "k"})
    client = _install_client(
        adapter, {"works": _works_search_response([_JOURNAL_WORK], None)}
    )
    await adapter.fetch({"filter": "is_oa:true,cited_by_count:>50"})
    assert client.calls
    last_params = client.calls[-1][1]
    assert last_params["filter"] == "is_oa:true,cited_by_count:>50"


@pytest.mark.asyncio
async def test_fetch_string_query_treated_as_search():
    adapter = OpenAlexAdapter({"api_key": "k"})
    client = _install_client(
        adapter, {"works": _works_search_response([_JOURNAL_WORK], None)}
    )
    await adapter.fetch("rTMS")
    assert client.calls[-1][1]["search"] == "rTMS"


@pytest.mark.asyncio
async def test_fetch_without_query_or_filter_raises():
    adapter = OpenAlexAdapter({"api_key": "k"})
    _install_client(
        adapter, {"works": _works_search_response([_JOURNAL_WORK], None)}
    )
    with pytest.raises(OpenAlexError):
        await adapter.fetch({})


@pytest.mark.asyncio
async def test_fetch_rejects_non_dict_non_str_query():
    adapter = OpenAlexAdapter({"api_key": "k"})
    _install_client(
        adapter, {"works": _works_search_response([_JOURNAL_WORK], None)}
    )
    with pytest.raises(OpenAlexError):
        await adapter.fetch(12345)


@pytest.mark.asyncio
async def test_fetch_respects_max_results_cap():
    adapter = OpenAlexAdapter({"api_key": "k", "page_size": 2})
    # First page hands back a cursor; second page hands back two more + no cursor.
    pages = iter(
        [
            _works_search_response([_JOURNAL_WORK, _PREPRINT_WORK], "cur_2"),
            _works_search_response([_REVIEW_WORK, _JOURNAL_WORK], None),
        ]
    )

    def _route(_params):
        return next(pages)

    _install_client(adapter, {"works": _route})
    results = await adapter.fetch({"query": "x", "max_results": 3})
    assert len(results) == 3


# ---------------------------------------------------------------------------
# normalize + validate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_normalize_journal_work_extracts_authors_and_concepts():
    adapter = OpenAlexAdapter({"api_key": "k"})
    out = await adapter.normalize([_JOURNAL_WORK])
    assert len(out) == 1
    rec = out[0]
    assert rec["doi"] == "10.1234/jp.2023.42"
    assert rec["pmid"] == "12345678"
    assert "Jane Smith" in rec["authors"]
    assert "John Doe" in rec["authors"]
    assert "Stanford University" in rec["affiliations"]
    assert rec["journal"] == "Journal of Affective Disorders"
    assert rec["work_type"] == "journal-article"
    assert rec["is_open_access"] is True
    assert "Depression" in rec["concepts"]
    assert rec["cited_by_count"] == 42
    # Abstract is reconstructed from the inverted index.
    assert "Background" in rec["abstract"]
    assert "rTMS" in rec["abstract"]


@pytest.mark.asyncio
async def test_normalize_skips_records_without_minimal_identity():
    adapter = OpenAlexAdapter({"api_key": "k"})
    out = await adapter.normalize([{"foo": "bar"}, {}])
    assert out == []


@pytest.mark.asyncio
async def test_validate_marks_valid_and_attaches_confidence():
    adapter = OpenAlexAdapter({"api_key": "k"})
    normalised = await adapter.normalize([_JOURNAL_WORK, _PREPRINT_WORK])
    validated = await adapter.validate(normalised)
    journal = next(r for r in validated if r["work_type"] == "journal-article")
    preprint = next(r for r in validated if r["work_type"] == "preprint")
    assert journal["_valid"] is True
    assert preprint["_valid"] is True
    assert journal["_evidence_level"] == EvidenceLevel.COHORT_STUDY.value
    assert preprint["_evidence_level"] == EvidenceLevel.PILOT_EXPERT.value
    assert "_provenance" in journal


@pytest.mark.asyncio
async def test_validate_flags_records_missing_journal_and_year():
    adapter = OpenAlexAdapter({"api_key": "k"})
    bare = {
        "id": "x",
        "doi": "10.1/x",
        "title": "Something",
        "authors": [],
        "journal": "",
        "pub_year": "",
        "work_type": "",
    }
    out = await adapter.validate([dict(bare)])
    assert out[0]["_valid"] is False


# ---------------------------------------------------------------------------
# Governance: provenance, license, confidence
# ---------------------------------------------------------------------------


def test_get_license_is_cc0():
    adapter = OpenAlexAdapter({"api_key": "k"})
    lic = adapter.get_license()
    assert isinstance(lic, LicenseMetadata)
    assert lic.license_type == "CC0-1.0"
    assert lic.allows_research is True
    assert lic.allows_commercial is True
    assert lic.requires_attribution is False


def test_get_provenance_returns_dataclass_with_doi():
    adapter = OpenAlexAdapter({"api_key": "k"})
    record = {
        "id": "W1",
        "doi": "10.1/x",
        "title": "T",
        "work_type": "journal-article",
        "pub_year": "2023",
        "journal": "X",
    }
    prov = adapter.get_provenance(record)
    assert isinstance(prov, ProvenanceRecord)
    assert prov.source_database == "OpenAlex"
    assert prov.citation_doi == "10.1/x"
    assert prov.license_type == "CC0-1.0"
    assert prov.research_only is False  # journal-article


def test_get_provenance_preprint_marks_research_only():
    adapter = OpenAlexAdapter({"api_key": "k"})
    record = {
        "id": "W2",
        "doi": "10.1/y",
        "title": "T",
        "work_type": "preprint",
        "pub_year": "2024",
        "journal": "bioRxiv",
    }
    prov = adapter.get_provenance(record)
    assert prov.research_only is True


def test_get_confidence_tier_for_review_and_journal_article():
    adapter = OpenAlexAdapter({"api_key": "k"})
    assert adapter.get_confidence({"work_type": "review"}) == ConfidenceTier.MEDIUM
    assert (
        adapter.get_confidence({"work_type": "journal-article"})
        == ConfidenceTier.MEDIUM
    )
    assert (
        adapter.get_confidence({"work_type": "preprint"}) == ConfidenceTier.LOW
    )
    assert (
        adapter.get_confidence({"work_type": "dataset"}) == ConfidenceTier.RESEARCH
    )


# ---------------------------------------------------------------------------
# health_check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_ok():
    adapter = OpenAlexAdapter({"api_key": "k"})
    _install_client(
        adapter, {"works": _works_search_response([_JOURNAL_WORK], None)}
    )
    health = await adapter.health_check()
    assert health["status"] == "ok"
    assert health["source"] == "OpenAlex"
    assert health["api_key_configured"] is True


@pytest.mark.asyncio
async def test_health_check_down_on_server_error():
    adapter = OpenAlexAdapter({"api_key": "k"})
    _install_client(
        adapter, {"works": _fake_response(status_code=500, text_data="boom")}
    )
    adapter._max_retries = 1
    health = await adapter.health_check()
    assert health["status"] == "down"


@pytest.mark.asyncio
async def test_health_check_reports_missing_api_key(monkeypatch):
    monkeypatch.delenv("OPENALEX_API_KEY", raising=False)
    adapter = OpenAlexAdapter({})
    _install_client(
        adapter, {"works": _works_search_response([_JOURNAL_WORK], None)}
    )
    health = await adapter.health_check()
    assert health["api_key_configured"] is False


# ---------------------------------------------------------------------------
# error paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_404_raises_not_found():
    adapter = OpenAlexAdapter({"api_key": "k"})
    _install_client(adapter, {"works/doi:": _fake_response(status_code=404)})
    with pytest.raises(OpenAlexNotFoundError):
        await adapter.fetch({"doi": "10.0/nonexistent"})


@pytest.mark.asyncio
async def test_401_raises_auth_error():
    adapter = OpenAlexAdapter({"api_key": "bad"})
    _install_client(adapter, {"works": _fake_response(status_code=401)})
    adapter._max_retries = 1
    with pytest.raises(OpenAlexAuthError):
        await adapter.fetch({"query": "x"})


@pytest.mark.asyncio
async def test_429_raises_rate_limit():
    adapter = OpenAlexAdapter({"api_key": "k"})
    _install_client(adapter, {"works": _fake_response(status_code=429)})
    adapter._max_retries = 1
    with pytest.raises(OpenAlexRateLimitError):
        await adapter.fetch({"query": "x"})


# ---------------------------------------------------------------------------
# inverted-index helper
# ---------------------------------------------------------------------------


def test_inverted_index_reconstructs_in_position_order():
    index = {"world": [1], "hello": [0]}
    assert _abstract_from_inverted_index(index) == "hello world"


def test_inverted_index_handles_repeats():
    index = {"the": [0, 2], "cat": [1, 3]}
    assert _abstract_from_inverted_index(index) == "the cat the cat"


def test_inverted_index_empty_returns_empty():
    assert _abstract_from_inverted_index({}) == ""
    assert _abstract_from_inverted_index(None or {}) == ""
