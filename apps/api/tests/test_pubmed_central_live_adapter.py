"""
Unit tests for app.services.knowledge.adapters.pubmed_central_live_adapter.

HTTP mocked at the httpx.AsyncClient boundary with the same _FakeClient
pattern as test_crossref_live_adapter / test_europepmc_adapter. NCBI is
not hit in CI.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Union
from unittest.mock import MagicMock

import pytest

from app.services.knowledge.adapters.pubmed_central_live_adapter import (
    PubMedCentralAPIError,
    PubMedCentralLiveAdapter,
    PubMedCentralNotFoundError,
    PubMedCentralRateLimitError,
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


def _install_client(
    adapter: PubMedCentralLiveAdapter, routes: Dict[str, Any]
) -> _FakeClient:
    client = _FakeClient(routes)
    adapter._client = client
    adapter._connected = True
    return client


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


_EINFO_OK = {
    "header": {"type": "einfo", "version": "0.3"},
    "einforesult": {"dbinfo": {"dbname": "pmc"}},
}

_ESEARCH_OK = {
    "header": {"type": "esearch", "version": "0.3"},
    "esearchresult": {"count": "2", "idlist": ["7777777", "8888888"]},
}

_DOC_RCT = {
    "uid": "7777777",
    "title": "RCT of rTMS in depression",
    "fulljournalname": "Journal of Affective Disorders",
    "source": "J Affect Disord",
    "pubdate": "2023 Jun",
    "epubdate": "",
    "authors": [
        {"name": "Smith J"},
        {"name": "Doe A"},
    ],
    "pubtype": ["Journal Article", "Randomized Controlled Trial"],
    "articleids": [
        {"idtype": "pmcid", "value": "PMC7777777"},
        {"idtype": "pmid", "value": "33333333"},
        {"idtype": "doi", "value": "10.1234/jad.2023.42"},
    ],
    "issn": "0165-0327",
}

_DOC_PREPRINT = {
    "uid": "8888888",
    "title": "Preprint: novel biomarker hypothesis",
    "fulljournalname": "bioRxiv",
    "source": "bioRxiv",
    "pubdate": "2024 Jan",
    "authors": [{"lastname": "X", "forename": "Y"}],
    "pubtype": ["Preprint"],
    "articleids": [
        {"idtype": "pmcid", "value": "PMC8888888"},
        {"idtype": "doi", "value": "10.1101/2024.01.01.000001"},
    ],
}

_DOC_NO_IDS = {
    "uid": "9999999",
    "title": "Malformed record",
    "pubdate": "2020",
    "authors": [],
    "pubtype": [],
    "articleids": [],
}

_ESUMMARY_OK = {
    "header": {"type": "esummary"},
    "result": {
        "uids": ["7777777", "8888888"],
        "7777777": _DOC_RCT,
        "8888888": _DOC_PREPRINT,
    },
}

_ESUMMARY_SINGLE = {
    "header": {"type": "esummary"},
    "result": {
        "uids": ["7777777"],
        "7777777": _DOC_RCT,
    },
}

_ESUMMARY_EMPTY = {
    "header": {"type": "esummary"},
    "result": {"uids": []},
}


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_ok_then_disconnect():
    adapter = PubMedCentralLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"einfo": _fake_response(json_data=_EINFO_OK)})
    assert await adapter.connect() is True
    assert adapter.is_connected
    await adapter.disconnect()
    assert not adapter.is_connected


@pytest.mark.asyncio
async def test_connect_returns_false_on_5xx():
    adapter = PubMedCentralLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"einfo": _fake_response(status_code=500)})
    assert await adapter.connect() is False


# ---------------------------------------------------------------------------
# NCBI etiquette params
# ---------------------------------------------------------------------------


def test_base_params_include_tool_default():
    adapter = PubMedCentralLiveAdapter()
    params = adapter._base_params()
    assert params["db"] == "pmc"
    assert params["tool"] == "deepsynaps"


def test_base_params_include_email_when_configured():
    adapter = PubMedCentralLiveAdapter({"email": "ops@deepsynaps.example"})
    assert adapter._base_params()["email"] == "ops@deepsynaps.example"


def test_base_params_include_api_key_when_configured():
    adapter = PubMedCentralLiveAdapter({"api_key": "FAKEKEY"})
    assert adapter._base_params()["api_key"] == "FAKEKEY"


def test_api_key_raises_rate_limit_to_polite_pool(monkeypatch):
    # Ensure no ambient NCBI_API_KEY leaks into the no-key construction.
    monkeypatch.delenv("NCBI_API_KEY", raising=False)
    no_key = PubMedCentralLiveAdapter()
    with_key = PubMedCentralLiveAdapter({"api_key": "FAKEKEY"})
    # With key, minimum interval should be smaller (higher RPS allowed).
    assert with_key._min_interval < no_key._min_interval


def test_api_key_from_env_picked_up(monkeypatch):
    monkeypatch.setenv("NCBI_API_KEY", "env-key")
    adapter = PubMedCentralLiveAdapter()
    assert adapter._api_key == "env-key"


# ---------------------------------------------------------------------------
# fetch — search path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_string_query_runs_esearch_then_esummary():
    adapter = PubMedCentralLiveAdapter({"max_retries": 0, "page_size": 25})
    client = _install_client(
        adapter,
        {
            "esearch": _fake_response(json_data=_ESEARCH_OK),
            "esummary": _fake_response(json_data=_ESUMMARY_OK),
        },
    )
    docs = await adapter.fetch("rTMS depression")
    assert len(docs) == 2
    # esearch must have been called with the query + JSON retmode.
    esearch_call = next(c for c in client.calls if "esearch" in c[0])
    assert esearch_call[1]["term"] == "rTMS depression"
    assert esearch_call[1]["retmode"] == "json"
    # esummary must have been called with the comma-joined ID list.
    esummary_call = next(c for c in client.calls if "esummary" in c[0])
    assert esummary_call[1]["id"] == "7777777,8888888"


@pytest.mark.asyncio
async def test_fetch_empty_query_returns_no_records():
    adapter = PubMedCentralLiveAdapter({"max_retries": 0})
    _install_client(
        adapter,
        {
            "esearch": _fake_response(json_data=_ESEARCH_OK),
            "esummary": _fake_response(json_data=_ESUMMARY_OK),
        },
    )
    assert await adapter.fetch("   ") == []


@pytest.mark.asyncio
async def test_fetch_caps_rows_at_max_results():
    adapter = PubMedCentralLiveAdapter({"max_retries": 0})
    client = _install_client(
        adapter,
        {
            "esearch": _fake_response(json_data=_ESEARCH_OK),
            "esummary": _fake_response(json_data=_ESUMMARY_OK),
        },
    )
    await adapter.fetch({"query": "anything", "rows": 9999})
    esearch_call = next(c for c in client.calls if "esearch" in c[0])
    assert esearch_call[1]["retmax"] == 200  # MAX_RESULTS_HARD_CAP


# ---------------------------------------------------------------------------
# fetch — PMCID lookup path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_by_pmcid_skips_esearch():
    adapter = PubMedCentralLiveAdapter({"max_retries": 0})
    client = _install_client(
        adapter,
        {"esummary": _fake_response(json_data=_ESUMMARY_SINGLE)},
    )
    docs = await adapter.fetch({"pmcid": "PMC7777777"})
    assert len(docs) == 1
    assert docs[0]["uid"] == "7777777"
    # No esearch call should have been made.
    assert all("esearch" not in c[0] for c in client.calls)


@pytest.mark.asyncio
async def test_fetch_by_pmcid_raises_not_found_on_empty_result():
    adapter = PubMedCentralLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"esummary": _fake_response(json_data=_ESUMMARY_EMPTY)})
    with pytest.raises(PubMedCentralNotFoundError):
        await adapter.fetch({"pmcid": "PMC9999999999"})


# ---------------------------------------------------------------------------
# Rate limit + retry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_429_with_no_retries_raises_rate_limit():
    adapter = PubMedCentralLiveAdapter({"max_retries": 0})
    _install_client(
        adapter,
        {"esearch": _fake_response(status_code=429)},
    )
    with pytest.raises(PubMedCentralRateLimitError):
        await adapter.fetch("x")


@pytest.mark.asyncio
async def test_500_with_no_retries_raises_api_error():
    adapter = PubMedCentralLiveAdapter({"max_retries": 0})
    _install_client(
        adapter,
        {"esearch": _fake_response(status_code=500)},
    )
    with pytest.raises(PubMedCentralAPIError):
        await adapter.fetch("x")


# ---------------------------------------------------------------------------
# normalize + validate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_normalize_maps_rct_with_all_ids():
    adapter = PubMedCentralLiveAdapter()
    rows = await adapter.normalize([_DOC_RCT])
    assert len(rows) == 1
    row = rows[0]
    assert row["pmcid"] == "PMC7777777"
    assert row["pmid"] == "33333333"
    assert row["doi"] == "10.1234/jad.2023.42"
    assert row["title"] == "RCT of rTMS in depression"
    assert row["journal"] == "Journal of Affective Disorders"
    assert row["year"] == 2023
    assert row["authors"] == ["Smith J", "Doe A"]
    assert row["evidence_level"] == EvidenceLevel.RCT.value
    assert row["is_open_access"] is True
    assert row["url"] == "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7777777/"


@pytest.mark.asyncio
async def test_normalize_classifies_preprint_as_pilot_expert():
    adapter = PubMedCentralLiveAdapter()
    rows = await adapter.normalize([_DOC_PREPRINT])
    assert rows[0]["evidence_level"] == EvidenceLevel.PILOT_EXPERT.value


@pytest.mark.asyncio
async def test_validate_drops_records_with_no_strong_id():
    adapter = PubMedCentralLiveAdapter()
    rows = await adapter.normalize([_DOC_RCT, _DOC_NO_IDS])
    valid = await adapter.validate(rows)
    assert len(valid) == 1
    assert valid[0]["pmcid"] == "PMC7777777"


# ---------------------------------------------------------------------------
# Provenance + confidence + license
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_provenance_carries_pmcid_and_doi():
    adapter = PubMedCentralLiveAdapter()
    rows = await adapter.normalize([_DOC_RCT])
    prov = adapter.get_provenance(rows[0])
    assert isinstance(prov, ProvenanceRecord)
    assert prov.source_database == "PubMed Central"
    assert prov.source_record_id == "PMC7777777"
    assert prov.citation_doi == "10.1234/jad.2023.42"
    assert "PubMed Central" in prov.attribution_text


def test_get_confidence_high_when_pmcid_present():
    adapter = PubMedCentralLiveAdapter()
    record = {"pmcid": "PMC7777777", "publication_type": "Journal Article"}
    assert adapter.get_confidence(record) is ConfidenceTier.HIGH


def test_get_confidence_medium_for_preprint():
    adapter = PubMedCentralLiveAdapter()
    record = {"pmcid": "PMC8888888", "publication_type": "Preprint"}
    assert adapter.get_confidence(record) is ConfidenceTier.MEDIUM


def test_get_confidence_low_without_any_id():
    adapter = PubMedCentralLiveAdapter()
    assert adapter.get_confidence({"publication_type": "Journal Article"}) is ConfidenceTier.LOW


def test_get_license_is_ncbi_terms_no_commercial():
    adapter = PubMedCentralLiveAdapter()
    lic = adapter.get_license()
    assert isinstance(lic, LicenseMetadata)
    assert lic.license_type == "NCBI-terms"
    assert lic.allows_research is True
    # NCBI E-utilities are research-allowed but commercial use needs
    # case-by-case review — adapter is conservative.
    assert lic.allows_commercial is False
    assert lic.requires_attribution is True


# ---------------------------------------------------------------------------
# health_check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_ok_path():
    adapter = PubMedCentralLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"einfo": _fake_response(json_data=_EINFO_OK)})
    result = await adapter.health_check()
    assert result["connected"] is True
    assert result["status"] == "ok"
    assert result["latency_ms"] is not None


@pytest.mark.asyncio
async def test_health_check_error_on_5xx():
    adapter = PubMedCentralLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"einfo": _fake_response(status_code=503)})
    result = await adapter.health_check()
    assert result["connected"] is False
    assert result["status"] == "error"


@pytest.mark.asyncio
async def test_health_check_no_client_reports_disconnected():
    adapter = PubMedCentralLiveAdapter()
    result = await adapter.health_check()
    assert result["connected"] is False
    assert "not connected" in result["message"].lower()
