"""
Unit tests for app.services.knowledge.adapters.epistemonikos_live_adapter.

HTTP mocked at the httpx.AsyncClient boundary, same _FakeClient pattern
as test_crossref_live_adapter / test_pubmed_central_live_adapter /
test_europepmc_adapter. Live network is never hit in CI.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Union
from unittest.mock import MagicMock

import pytest

from app.services.knowledge.adapters.epistemonikos_live_adapter import (
    EpistemonikosAPIError,
    EpistemonikosLiveAdapter,
    EpistemonikosNotFoundError,
    EpistemonikosRateLimitError,
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
    adapter: EpistemonikosLiveAdapter, routes: Dict[str, Any]
) -> _FakeClient:
    client = _FakeClient(routes)
    adapter._client = client
    adapter._connected = True
    return client


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


_DOC_SR = {
    "id": "12345",
    "title": "Systematic review of rTMS in depression",
    "year": 2023,
    "doi": "10.1234/sr.2023.42",
    "type": "systematic-review",
    "classification": "L1",
    "authors": "Smith J., Doe A., Roe B.",
    "journal": "Cochrane Database of Systematic Reviews",
    "abstract": "We systematically reviewed...",
    "is_open_access": True,
}

_DOC_RCT = {
    "id": "23456",
    "title": "Randomized controlled trial of rTMS in OCD",
    "year": 2022,
    "doi": "10.1234/rct.2022.99",
    "type": "primary-study",
    "classification": "L4",
    "authors": "Lee K.",
    "journal": "JAMA Psychiatry",
}

_DOC_NO_IDS = {
    "title": "Stub record without identifiers",
    "type": "structured-summary",
}

_RESP_DOCUMENTS = {"count": 2, "documents": [_DOC_SR, _DOC_RCT, _DOC_NO_IDS]}
_RESP_RESULTS = {"count": 1, "results": [_DOC_SR]}
_RESP_BARE_LIST = [_DOC_SR]
_RESP_EMPTY = {"count": 0, "documents": []}


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_ok_then_disconnect():
    adapter = EpistemonikosLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"search": _fake_response(json_data=_RESP_EMPTY)})
    assert await adapter.connect() is True
    assert adapter.is_connected
    await adapter.disconnect()
    assert not adapter.is_connected


@pytest.mark.asyncio
async def test_connect_returns_false_on_5xx():
    adapter = EpistemonikosLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"search": _fake_response(status_code=500)})
    assert await adapter.connect() is False


# ---------------------------------------------------------------------------
# Auth header
# ---------------------------------------------------------------------------


def test_headers_no_auth_when_no_key():
    adapter = EpistemonikosLiveAdapter()
    h = adapter._headers()
    assert "Authorization" not in h
    assert h["Accept"] == "application/json"


def test_headers_use_bearer_when_api_key_configured():
    adapter = EpistemonikosLiveAdapter({"api_key": "TOKEN"})
    assert adapter._headers()["Authorization"] == "Bearer TOKEN"


def test_api_key_from_env_picked_up(monkeypatch):
    monkeypatch.setenv("EPISTEMONIKOS_API_KEY", "env-token")
    adapter = EpistemonikosLiveAdapter()
    assert adapter._api_key == "env-token"


def test_api_key_raises_rate_limit_polite_pool(monkeypatch):
    monkeypatch.delenv("EPISTEMONIKOS_API_KEY", raising=False)
    no_key = EpistemonikosLiveAdapter()
    with_key = EpistemonikosLiveAdapter({"api_key": "TOKEN"})
    assert with_key._min_interval < no_key._min_interval


# ---------------------------------------------------------------------------
# fetch — response-shape robustness
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_extracts_documents_field():
    adapter = EpistemonikosLiveAdapter({"max_retries": 0})
    client = _install_client(
        adapter, {"search": _fake_response(json_data=_RESP_DOCUMENTS)}
    )
    items = await adapter.fetch("rTMS depression")
    assert len(items) == 3
    # Confirm the request carries the query and the configured limit.
    url, params = client.calls[-1]
    assert "/search" in url
    assert params["q"] == "rTMS depression"
    assert params["limit"] == 20


@pytest.mark.asyncio
async def test_fetch_extracts_results_field():
    adapter = EpistemonikosLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"search": _fake_response(json_data=_RESP_RESULTS)})
    items = await adapter.fetch("x")
    assert len(items) == 1


@pytest.mark.asyncio
async def test_fetch_accepts_bare_list_response():
    adapter = EpistemonikosLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"search": _fake_response(json_data=_RESP_BARE_LIST)})
    items = await adapter.fetch("x")
    assert len(items) == 1


@pytest.mark.asyncio
async def test_fetch_empty_query_returns_no_records():
    adapter = EpistemonikosLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"search": _fake_response(json_data=_RESP_EMPTY)})
    assert await adapter.fetch("   ") == []


@pytest.mark.asyncio
async def test_fetch_dict_query_caps_rows_at_max():
    adapter = EpistemonikosLiveAdapter({"max_retries": 0})
    client = _install_client(
        adapter, {"search": _fake_response(json_data=_RESP_DOCUMENTS)}
    )
    await adapter.fetch({"query": "anything", "rows": 9999})
    _, params = client.calls[-1]
    assert params["limit"] == 100  # MAX_PAGE_SIZE


# ---------------------------------------------------------------------------
# Rate limit + retry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_429_with_no_retries_raises_rate_limit():
    adapter = EpistemonikosLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"search": _fake_response(status_code=429)})
    with pytest.raises(EpistemonikosRateLimitError):
        await adapter.fetch("x")


@pytest.mark.asyncio
async def test_500_with_no_retries_raises_api_error():
    adapter = EpistemonikosLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"search": _fake_response(status_code=500)})
    with pytest.raises(EpistemonikosAPIError):
        await adapter.fetch("x")


# ---------------------------------------------------------------------------
# normalize + validate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_normalize_maps_systematic_review_to_top_evidence():
    adapter = EpistemonikosLiveAdapter()
    rows = await adapter.normalize([_DOC_SR])
    row = rows[0]
    assert row["epistemonikos_id"] == "12345"
    assert row["doi"] == "10.1234/sr.2023.42"
    assert row["title"].startswith("Systematic review")
    assert row["year"] == 2023
    assert row["authors"] == ["Smith J.", "Doe A.", "Roe B."]
    assert row["evidence_level"] == EvidenceLevel.SYSTEMATIC_REVIEW.value
    assert row["classification"] == "L1"
    assert row["url"] == "https://www.epistemonikos.org/en/documents/12345"


@pytest.mark.asyncio
async def test_normalize_classifies_primary_study():
    adapter = EpistemonikosLiveAdapter()
    rows = await adapter.normalize([_DOC_RCT])
    # type=primary-study + classification=L4 → COHORT_STUDY via type
    # match (primary-study comes before single-token "rct").
    assert rows[0]["evidence_level"] == EvidenceLevel.COHORT_STUDY.value


@pytest.mark.asyncio
async def test_validate_drops_records_without_any_identifier():
    adapter = EpistemonikosLiveAdapter()
    # Synthesize a record with no id, no doi, no title.
    stripped = {"type": "primary-study"}
    rows = await adapter.normalize([stripped])
    valid = await adapter.validate(rows)
    assert valid == []


@pytest.mark.asyncio
async def test_validate_keeps_records_with_just_a_title():
    # _DOC_NO_IDS has only ``title`` + ``type`` — must be kept because
    # title alone is a usable identifier in dedup.
    adapter = EpistemonikosLiveAdapter()
    rows = await adapter.normalize([_DOC_NO_IDS])
    valid = await adapter.validate(rows)
    assert len(valid) == 1
    assert valid[0]["title"] == "Stub record without identifiers"


# ---------------------------------------------------------------------------
# Provenance + confidence + license
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_provenance_carries_record_id_and_doi():
    adapter = EpistemonikosLiveAdapter()
    rows = await adapter.normalize([_DOC_SR])
    prov = adapter.get_provenance(rows[0])
    assert isinstance(prov, ProvenanceRecord)
    assert prov.source_database == "Epistemonikos"
    assert prov.source_record_id == "12345"
    assert prov.citation_doi == "10.1234/sr.2023.42"
    assert "Epistemonikos" in prov.attribution_text


def test_get_confidence_high_for_l1_classification():
    adapter = EpistemonikosLiveAdapter()
    record = {"classification": "L1", "epistemonikos_id": "1"}
    assert adapter.get_confidence(record) is ConfidenceTier.HIGH


def test_get_confidence_medium_for_l3_classification():
    adapter = EpistemonikosLiveAdapter()
    record = {"classification": "L3", "epistemonikos_id": "1"}
    assert adapter.get_confidence(record) is ConfidenceTier.MEDIUM


def test_get_confidence_low_without_classification_or_id():
    adapter = EpistemonikosLiveAdapter()
    assert adapter.get_confidence({}) is ConfidenceTier.LOW


def test_get_license_is_cc_by_nc():
    adapter = EpistemonikosLiveAdapter()
    lic = adapter.get_license()
    assert isinstance(lic, LicenseMetadata)
    assert lic.license_type == "CC-BY-NC-4.0"
    assert lic.allows_research is True
    # CC-BY-NC explicitly forbids commercial use.
    assert lic.allows_commercial is False
    assert lic.requires_attribution is True


# ---------------------------------------------------------------------------
# health_check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_ok_path():
    adapter = EpistemonikosLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"search": _fake_response(json_data=_RESP_EMPTY)})
    result = await adapter.health_check()
    assert result["connected"] is True
    assert result["status"] == "ok"
    assert result["latency_ms"] is not None


@pytest.mark.asyncio
async def test_health_check_error_on_5xx():
    adapter = EpistemonikosLiveAdapter({"max_retries": 0})
    _install_client(adapter, {"search": _fake_response(status_code=503)})
    result = await adapter.health_check()
    assert result["connected"] is False
    assert result["status"] == "error"


@pytest.mark.asyncio
async def test_health_check_no_client_reports_disconnected():
    adapter = EpistemonikosLiveAdapter()
    result = await adapter.health_check()
    assert result["connected"] is False
    assert "not connected" in result["message"].lower()
