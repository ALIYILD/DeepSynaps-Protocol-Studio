"""
Unit tests for app.services.knowledge.adapters.crossref_live_adapter.

HTTP mocked at the httpx.AsyncClient boundary with a plain stub class —
same pattern as test_europepmc_adapter and test_pubmed_adapter so future
maintainers do not have to learn a new mock dialect.

Live network is never hit. The "polite pool" User-Agent and the
cursor/pagination logic are verified against captured request params,
not the wire.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Union
from unittest.mock import MagicMock

import pytest

from app.services.knowledge.adapters.crossref_live_adapter import (
    CrossRefAPIError,
    CrossRefLiveAdapter,
    CrossRefNotFoundError,
    CrossRefRateLimitError,
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


def _install_client(adapter: CrossRefLiveAdapter, routes: Dict[str, Any]) -> _FakeClient:
    client = _FakeClient(routes)
    adapter._client = client
    adapter._connected = True
    return client


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


_RCT_ITEM = {
    "DOI": "10.1234/jp.2023.42",
    "title": ["RCT of rTMS in treatment-resistant depression"],
    "container-title": ["Journal of Affective Disorders"],
    "issued": {"date-parts": [[2023, 6, 1]]},
    "author": [
        {"family": "Smith", "given": "Jane"},
        {"family": "Doe", "given": "Alex"},
    ],
    "type": "journal-article",
    "is-referenced-by-count": 12,
    "URL": "https://doi.org/10.1234/jp.2023.42",
    "is-open-access": True,
    "ISSN": ["0165-0327"],
    "subject": ["Psychiatry"],
}

_PREPRINT_ITEM = {
    "DOI": "10.1101/2024.01.01.000001",
    "title": ["Preprint: novel biomarker hypothesis"],
    "container-title": ["bioRxiv"],
    "issued": {"date-parts": [[2024]]},
    "author": [{"family": "X", "given": "Y"}],
    "type": "posted-content",
    "is-referenced-by-count": 0,
    "URL": "https://doi.org/10.1101/2024.01.01.000001",
}

_STUB_ITEM_NO_DOI_NO_TITLE = {
    "type": "journal-article",
    "issued": {"date-parts": [[2020]]},
}

_SEARCH_OK = {
    "status": "ok",
    "message": {
        "total-results": 2,
        "items": [_RCT_ITEM, _PREPRINT_ITEM, _STUB_ITEM_NO_DOI_NO_TITLE],
    },
}

_DOI_OK = {"status": "ok", "message": _RCT_ITEM}

_ZERO_HIT = {"status": "ok", "message": {"total-results": 0, "items": []}}


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_ok_then_disconnect():
    adapter = CrossRefLiveAdapter({"max_retries": 1})
    _install_client(adapter, {"works": _fake_response(json_data=_ZERO_HIT)})
    assert await adapter.connect() is True
    assert adapter.is_connected
    await adapter.disconnect()
    assert not adapter.is_connected


@pytest.mark.asyncio
async def test_connect_returns_false_on_500():
    adapter = CrossRefLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"works": _fake_response(status_code=500)})
    assert await adapter.connect() is False


# ---------------------------------------------------------------------------
# User-Agent / polite pool
# ---------------------------------------------------------------------------


def test_user_agent_default_has_app_and_url():
    adapter = CrossRefLiveAdapter()
    ua = adapter._user_agent
    assert ua.startswith("DeepSynaps/")
    assert "https://" in ua
    # No mailto when not configured.
    assert "mailto:" not in ua


def test_user_agent_with_mailto_uses_polite_pool_form():
    adapter = CrossRefLiveAdapter({"mailto": "ops@deepsynaps.example"})
    assert "mailto:ops@deepsynaps.example" in adapter._user_agent


def test_user_agent_explicit_override_wins():
    adapter = CrossRefLiveAdapter({"user_agent": "CustomBot/9.9"})
    assert adapter._user_agent == "CustomBot/9.9"


# ---------------------------------------------------------------------------
# fetch — search path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_string_query_returns_raw_items():
    adapter = CrossRefLiveAdapter({"max_retries": 0, "page_size": 25})
    client = _install_client(adapter, {"works": _fake_response(json_data=_SEARCH_OK)})
    items = await adapter.fetch("rTMS depression")
    assert len(items) == 3
    assert items[0]["DOI"] == "10.1234/jp.2023.42"
    # Confirm the request carried the query and the configured page size.
    url, params = client.calls[-1]
    assert "/works" in url
    assert params["query"] == "rTMS depression"
    assert params["rows"] == 25


@pytest.mark.asyncio
async def test_fetch_dict_query_with_rows_caps_at_max():
    adapter = CrossRefLiveAdapter({"max_retries": 0})
    client = _install_client(adapter, {"works": _fake_response(json_data=_SEARCH_OK)})
    await adapter.fetch({"query": "tDCS", "rows": 9999})
    _, params = client.calls[-1]
    assert params["rows"] == 100  # hard cap


# ---------------------------------------------------------------------------
# fetch — DOI lookup path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_by_doi_returns_single_message():
    adapter = CrossRefLiveAdapter({"max_retries": 0})
    _install_client(
        adapter,
        {"/works/10.1234": _fake_response(json_data=_DOI_OK)},
    )
    items = await adapter.fetch({"doi": "10.1234/jp.2023.42"})
    assert len(items) == 1
    assert items[0]["DOI"] == "10.1234/jp.2023.42"


@pytest.mark.asyncio
async def test_fetch_by_doi_raises_not_found_on_404():
    adapter = CrossRefLiveAdapter({"max_retries": 0})
    _install_client(
        adapter,
        {"/works/missing": _fake_response(status_code=404)},
    )
    with pytest.raises(CrossRefNotFoundError):
        await adapter.fetch({"doi": "missing/doi"})


# ---------------------------------------------------------------------------
# Rate limit + retry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_429_with_no_retries_raises_rate_limit():
    adapter = CrossRefLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"works": _fake_response(status_code=429)})
    with pytest.raises(CrossRefRateLimitError):
        await adapter.fetch("x")


@pytest.mark.asyncio
async def test_500_with_no_retries_raises_api_error():
    adapter = CrossRefLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"works": _fake_response(status_code=500)})
    with pytest.raises(CrossRefAPIError):
        await adapter.fetch("x")


# ---------------------------------------------------------------------------
# normalize + validate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_normalize_maps_journal_article_fields():
    adapter = CrossRefLiveAdapter()
    rows = await adapter.normalize([_RCT_ITEM])
    assert len(rows) == 1
    row = rows[0]
    assert row["doi"] == "10.1234/jp.2023.42"
    assert row["title"].startswith("RCT of rTMS")
    assert row["journal"] == "Journal of Affective Disorders"
    assert row["year"] == 2023
    assert row["authors"] == ["Jane Smith", "Alex Doe"]
    assert row["publication_type"] == "journal-article"
    assert row["evidence_level"] == EvidenceLevel.EXPERT_OPINION.value
    assert row["cited_by_count"] == 12
    assert row["is_open_access"] is True
    assert row["source"] == "crossref"


@pytest.mark.asyncio
async def test_normalize_classifies_preprint_as_pilot_expert():
    adapter = CrossRefLiveAdapter()
    rows = await adapter.normalize([_PREPRINT_ITEM])
    assert rows[0]["evidence_level"] == EvidenceLevel.PILOT_EXPERT.value
    assert rows[0]["year"] == 2024


@pytest.mark.asyncio
async def test_validate_drops_records_without_doi_and_title():
    adapter = CrossRefLiveAdapter()
    rows = await adapter.normalize([_RCT_ITEM, _STUB_ITEM_NO_DOI_NO_TITLE])
    valid = await adapter.validate(rows)
    assert len(valid) == 1
    assert valid[0]["doi"] == "10.1234/jp.2023.42"


# ---------------------------------------------------------------------------
# Provenance + confidence + license
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_provenance_carries_doi_and_attribution():
    adapter = CrossRefLiveAdapter()
    rows = await adapter.normalize([_RCT_ITEM])
    prov = adapter.get_provenance(rows[0])
    assert isinstance(prov, ProvenanceRecord)
    assert prov.source_database == "CrossRef"
    assert prov.citation_doi == "10.1234/jp.2023.42"
    assert prov.attribution_text == "Data from CrossRef."
    assert prov.license_type == "CrossRef-public-data"


def test_get_confidence_high_for_journal_article_with_doi():
    adapter = CrossRefLiveAdapter()
    record = {"doi": "10.x/y", "publication_type": "journal-article"}
    assert adapter.get_confidence(record) is ConfidenceTier.HIGH


def test_get_confidence_medium_for_preprint():
    adapter = CrossRefLiveAdapter()
    record = {"doi": "10.x/y", "publication_type": "posted-content"}
    assert adapter.get_confidence(record) is ConfidenceTier.MEDIUM


def test_get_confidence_low_without_doi():
    adapter = CrossRefLiveAdapter()
    assert adapter.get_confidence({"publication_type": "journal-article"}) is ConfidenceTier.LOW


def test_get_license_is_public_data_allowing_commercial():
    adapter = CrossRefLiveAdapter()
    lic = adapter.get_license()
    assert isinstance(lic, LicenseMetadata)
    assert lic.license_type == "CrossRef-public-data"
    assert lic.allows_research is True
    assert lic.allows_commercial is True
    assert lic.requires_attribution is True


# ---------------------------------------------------------------------------
# health_check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_ok_when_client_returns_status_ok():
    adapter = CrossRefLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"works": _fake_response(json_data=_ZERO_HIT)})
    result = await adapter.health_check()
    assert result["connected"] is True
    assert result["status"] == "ok"
    assert result["latency_ms"] is not None
    assert result["adapter_name"] == "CrossRef"


@pytest.mark.asyncio
async def test_health_check_error_when_probe_5xx():
    adapter = CrossRefLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"works": _fake_response(status_code=503)})
    result = await adapter.health_check()
    assert result["connected"] is False
    assert result["status"] == "error"


@pytest.mark.asyncio
async def test_health_check_no_client_returns_disconnected():
    adapter = CrossRefLiveAdapter()
    # No client installed.
    result = await adapter.health_check()
    assert result["connected"] is False
    assert "not connected" in result["message"].lower()
