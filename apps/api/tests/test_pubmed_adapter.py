"""
Unit tests for app.services.knowledge.adapters.pubmed_adapter.PubMedAdapter.

All HTTP is mocked at the httpx.AsyncClient boundary. Tests cover:

* connect / disconnect lifecycle
* fetch() variants: term, term + pub-type filter, direct PMIDs, include_abstract
* normalize(): field mapping and edge cases (missing fields, empty input)
* validate(): _valid flag, _evidence_level, _confidence
* get_provenance / get_license / get_confidence: dataclass shape + tier mapping
* health_check: ok + down paths
* error paths: 404 → NotFound, 429 → RateLimit
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Union
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.knowledge.adapters.pubmed_adapter import (
    PubMedAdapter,
    PubMedError,
    PubMedNotFoundError,
    PubMedRateLimitError,
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
    """Plain class mimicking httpx.Response shape (no mock magic)."""

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


def _fake_response(**kwargs: Any) -> _FakeResponse:
    return _FakeResponse(**kwargs)


class _FakeClient:
    """Stub httpx.AsyncClient that dispatches by URL substring."""

    def __init__(
        self,
        routes: Dict[str, Union[_FakeResponse, Callable[[Dict[str, Any]], _FakeResponse]]],
    ) -> None:
        self.routes = routes
        self.is_closed = False

    async def get(
        self, url: str, params: Dict[str, Any] = None
    ) -> _FakeResponse:
        for needle, response in self.routes.items():
            if needle in url:
                return response(params or {}) if callable(response) else response
        raise AssertionError(f"Unexpected URL: {url}")

    async def aclose(self) -> None:
        self.is_closed = True


def _install_client(
    adapter: PubMedAdapter,
    routes: Dict[str, Union[_FakeResponse, Callable[[Dict[str, Any]], _FakeResponse]]],
) -> _FakeClient:
    client = _FakeClient(routes)
    adapter._client = client
    adapter._connected = True
    return client


_ESEARCH_BODY = {
    "esearchresult": {"idlist": ["1111", "2222"], "count": "2"}
}

_ESUMMARY_BODY = {
    "result": {
        "uids": ["1111", "2222"],
        "1111": {
            "uid": "1111",
            "title": "An RCT of sertraline in MDD.",
            "authors": [{"name": "Smith J"}, {"name": "Doe A"}],
            "fulljournalname": "Journal of Psychiatry",
            "issn": "0000-0000",
            "pubtype": ["Randomized Controlled Trial", "Journal Article"],
            "articleids": [{"idtype": "doi", "value": "10.1234/jp.2023.42"}],
            "pubdate": "2023 Mar",
        },
        "2222": {
            "uid": "2222",
            "title": "Case report: rare adverse event.",
            "authors": [{"name": "Roe B"}],
            "fulljournalname": "Case Reports Quarterly",
            "issn": "1111-2222",
            "pubtype": ["Case Reports"],
            "articleids": [],
            "pubdate": "2024 Jan",
        },
    }
}

_EINFO_BODY = {"einforesult": {"dbinfo": [{"dbname": "pubmed"}]}}

_EFETCH_XML = """<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>1111</PMID>
      <Article>
        <Abstract>
          <AbstractText Label="BACKGROUND">Depression is common.</AbstractText>
          <AbstractText Label="METHODS">RCT, N=200.</AbstractText>
        </Abstract>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>"""


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_ok_then_disconnect():
    adapter = PubMedAdapter({"max_retries": 1})
    _install_client(adapter, {"einfo.fcgi": _fake_response(json_data=_EINFO_BODY)})
    ok = await adapter.connect()
    assert ok is True
    assert adapter.is_connected
    await adapter.disconnect()
    assert not adapter.is_connected


@pytest.mark.asyncio
async def test_connect_returns_false_on_failure():
    adapter = PubMedAdapter({"max_retries": 1})
    _install_client(adapter, {"einfo.fcgi": _fake_response(status_code=500)})
    ok = await adapter.connect()
    assert ok is False
    assert not adapter.is_connected


# ---------------------------------------------------------------------------
# fetch / normalize / validate pipeline
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_by_term_runs_esearch_then_esummary():
    adapter = PubMedAdapter({"max_retries": 1})
    _install_client(
        adapter,
        {
            "einfo.fcgi": _fake_response(json_data=_EINFO_BODY),
            "esearch.fcgi": _fake_response(json_data=_ESEARCH_BODY),
            "esummary.fcgi": _fake_response(json_data=_ESUMMARY_BODY),
        },
    )
    records = await adapter.fetch({"term": "sertraline depression", "max_results": 2})
    assert len(records) == 2
    assert {r["uid"] for r in records} == {"1111", "2222"}


@pytest.mark.asyncio
async def test_fetch_by_pmids_skips_esearch():
    adapter = PubMedAdapter({"max_retries": 1})
    _install_client(
        adapter,
        {
            "einfo.fcgi": _fake_response(json_data=_EINFO_BODY),
            "esummary.fcgi": _fake_response(json_data=_ESUMMARY_BODY),
        },
    )
    records = await adapter.fetch({"pmids": ["1111", "2222"]})
    assert len(records) == 2


@pytest.mark.asyncio
async def test_fetch_returns_empty_when_no_results():
    adapter = PubMedAdapter({"max_retries": 1})
    _install_client(
        adapter,
        {
            "einfo.fcgi": _fake_response(json_data=_EINFO_BODY),
            "esearch.fcgi": _fake_response(
                json_data={"esearchresult": {"idlist": [], "count": "0"}}
            ),
        },
    )
    records = await adapter.fetch({"term": "nonexistent term"})
    assert records == []


@pytest.mark.asyncio
async def test_fetch_with_include_abstract_attaches_text():
    adapter = PubMedAdapter({"max_retries": 1})
    _install_client(
        adapter,
        {
            "einfo.fcgi": _fake_response(json_data=_EINFO_BODY),
            "esearch.fcgi": _fake_response(json_data=_ESEARCH_BODY),
            "esummary.fcgi": _fake_response(json_data=_ESUMMARY_BODY),
            "efetch.fcgi": _fake_response(text_data=_EFETCH_XML),
        },
    )
    records = await adapter.fetch(
        {"term": "depression", "include_abstract": True, "max_results": 2}
    )
    rec1 = next(r for r in records if r["uid"] == "1111")
    assert "Depression is common" in rec1["abstract"]
    # PMID 2222 has no abstract in the XML — should be empty string, not crash.
    rec2 = next(r for r in records if r["uid"] == "2222")
    assert rec2["abstract"] == ""


@pytest.mark.asyncio
async def test_fetch_publication_type_filter_is_baked_into_query():
    adapter = PubMedAdapter({"max_retries": 1})
    captured: Dict[str, Any] = {}

    def esearch_resp(params):
        captured.update(params)
        return _fake_response(json_data=_ESEARCH_BODY)

    _install_client(
        adapter,
        {
            "einfo.fcgi": _fake_response(json_data=_EINFO_BODY),
            "esearch.fcgi": esearch_resp,
            "esummary.fcgi": _fake_response(json_data=_ESUMMARY_BODY),
        },
    )
    await adapter.fetch(
        {
            "term": "depression",
            "publication_type": ["Randomized Controlled Trial"],
            "max_results": 5,
        }
    )
    assert '"Randomized Controlled Trial"[Publication Type]' in captured["term"]


@pytest.mark.asyncio
async def test_fetch_rejects_missing_query_keys():
    adapter = PubMedAdapter({"max_retries": 1})
    _install_client(
        adapter, {"einfo.fcgi": _fake_response(json_data=_EINFO_BODY)}
    )
    with pytest.raises(PubMedError):
        await adapter.fetch({"max_results": 5})


@pytest.mark.asyncio
async def test_normalize_maps_esummary_into_canonical_fields():
    adapter = PubMedAdapter()
    normalised = await adapter.normalize(
        [
            _ESUMMARY_BODY["result"]["1111"],
            _ESUMMARY_BODY["result"]["2222"],
        ]
    )
    assert len(normalised) == 2
    rct = normalised[0]
    assert rct["pmid"] == "1111"
    assert rct["title"].startswith("An RCT")
    assert rct["authors"] == ["Smith J", "Doe A"]
    assert rct["journal"] == "Journal of Psychiatry"
    assert rct["doi"] == "10.1234/jp.2023.42"
    assert "Randomized Controlled Trial" in rct["publication_types"]


@pytest.mark.asyncio
async def test_normalize_drops_record_without_pmid():
    adapter = PubMedAdapter()
    normalised = await adapter.normalize([{"title": "no id"}])
    assert normalised == []


@pytest.mark.asyncio
async def test_validate_attaches_flags():
    adapter = PubMedAdapter()
    normalised = await adapter.normalize(
        [_ESUMMARY_BODY["result"]["1111"], _ESUMMARY_BODY["result"]["2222"]]
    )
    validated = await adapter.validate(normalised)
    rct = next(r for r in validated if r["pmid"] == "1111")
    case = next(r for r in validated if r["pmid"] == "2222")
    assert rct["_valid"] is True
    assert rct["_confidence"] == ConfidenceTier.HIGH.value
    assert rct["_evidence_level"] == EvidenceLevel.RCT.value
    assert case["_confidence"] == ConfidenceTier.LOW.value
    assert case["_evidence_level"] == EvidenceLevel.CASE_SERIES.value
    assert rct["_provenance"]["source_database"] == "PubMed"


@pytest.mark.asyncio
async def test_validate_records_without_journal_are_invalid():
    adapter = PubMedAdapter()
    normalised = await adapter.normalize(
        [{"uid": "9999", "title": "Has title but no journal"}]
    )
    validated = await adapter.validate(normalised)
    assert validated[0]["_valid"] is False


# ---------------------------------------------------------------------------
# Provenance, licensing, confidence
# ---------------------------------------------------------------------------


def test_get_license_is_nlm_open_access():
    adapter = PubMedAdapter()
    meta = adapter.get_license()
    assert isinstance(meta, LicenseMetadata)
    assert meta.allows_research is True
    assert meta.allows_commercial is True
    assert meta.requires_attribution is True
    assert "MEDLINE" in meta.attribution_text


def test_get_provenance_dataclass_shape_for_rct():
    adapter = PubMedAdapter()
    record = {
        "pmid": "1111",
        "title": "An RCT",
        "publication_types": ["Randomized Controlled Trial"],
        "journal": "JAMA",
        "doi": "10.1/abc",
        "authors": ["Smith J"],
    }
    prov = adapter.get_provenance(record)
    assert isinstance(prov, ProvenanceRecord)
    assert prov.source_database == "PubMed"
    assert prov.source_record_id == "1111"
    assert prov.confidence_tier == ConfidenceTier.HIGH
    assert prov.evidence_level == EvidenceLevel.RCT
    assert prov.research_only is False
    assert prov.citation_doi == "10.1/abc"


def test_get_provenance_marks_case_reports_research_only():
    adapter = PubMedAdapter()
    record = {
        "pmid": "2222",
        "title": "Case",
        "publication_types": ["Case Reports"],
        "journal": "X",
        "authors": ["A"],
    }
    prov = adapter.get_provenance(record)
    assert prov.research_only is True
    assert prov.evidence_level == EvidenceLevel.CASE_SERIES


def test_get_confidence_tiers_map_correctly():
    adapter = PubMedAdapter()
    assert (
        adapter.get_confidence({"publication_types": ["Meta-Analysis"]})
        == ConfidenceTier.HIGH
    )
    assert (
        adapter.get_confidence({"publication_types": ["Cohort Study", "Observational Study"]})
        == ConfidenceTier.MEDIUM
    )
    assert (
        adapter.get_confidence({"publication_types": ["Case Reports"]})
        == ConfidenceTier.LOW
    )
    assert (
        adapter.get_confidence({"publication_types": []})
        == ConfidenceTier.LOW
    )


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_404_raises_notfound():
    adapter = PubMedAdapter({"max_retries": 1})
    _install_client(
        adapter,
        {
            "einfo.fcgi": _fake_response(json_data=_EINFO_BODY),
            "esearch.fcgi": _fake_response(status_code=404),
        },
    )
    with pytest.raises(PubMedNotFoundError):
        await adapter.fetch({"term": "ghost"})


@pytest.mark.asyncio
async def test_429_raises_ratelimit():
    adapter = PubMedAdapter({"max_retries": 1})
    _install_client(
        adapter,
        {
            "einfo.fcgi": _fake_response(json_data=_EINFO_BODY),
            "esearch.fcgi": _fake_response(status_code=429),
        },
    )
    with pytest.raises(PubMedRateLimitError):
        await adapter.fetch({"term": "burst"})


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_ok():
    adapter = PubMedAdapter({"max_retries": 1})
    _install_client(adapter, {"einfo.fcgi": _fake_response(json_data=_EINFO_BODY)})
    h = await adapter.health_check()
    assert h["status"] == "ok"
    assert h["source"] == "PubMed"
    assert h["rate_limit_per_second"] in (3, 10)


@pytest.mark.asyncio
async def test_health_check_reports_down_on_500():
    adapter = PubMedAdapter({"max_retries": 1})
    _install_client(adapter, {"einfo.fcgi": _fake_response(status_code=500)})
    h = await adapter.health_check()
    assert h["status"] == "down"
    assert "error" in h
