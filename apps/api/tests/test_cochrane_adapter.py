"""
Unit tests for app.services.knowledge.adapters.cochrane_adapter.

HTTP mocked at the httpx.AsyncClient boundary with a plain stub class.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Union
from unittest.mock import MagicMock

import pytest

from app.services.knowledge.adapters.cochrane_adapter import (
    CochraneAdapter,
    CochraneError,
    CochraneNotFoundError,
    CochraneRateLimitError,
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
        if self._json is None:
            # Mirror httpx.Response.json() when body isn't JSON.
            raise ValueError("not JSON")
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


_REVIEW_BODY = {
    "doi": "10.1002/14651858.CD012345.pub2",
    "title": "Cognitive behavioural therapy for depression in adults",
    "authors": [{"name": "Smith J"}, {"name": "Doe A"}],
    "abstract": "Background: depression is a leading cause of disability...",
    "publishedDate": "2023-04-12",
    "reviewGroup": "Common Mental Disorders Group",
    "version": "pub2",
    "isProtocol": False,
    "isWithdrawn": False,
}

_PROTOCOL_BODY = {
    "doi": "10.1002/14651858.CD019999",
    "title": "Protocol: ketamine for treatment-resistant depression",
    "type": "protocol",
    "isProtocol": True,
    "isWithdrawn": False,
}

_WITHDRAWN_BODY = {
    "doi": "10.1002/14651858.CD000001.pub5",
    "title": "Withdrawn review: outdated methodology",
    "isWithdrawn": True,
}

_SEARCH_HTML = """
<html><body>
  <div class="result-item">
    <h3 class="result-title"><a href="/cdsr/...">Cognitive behavioural therapy for depression in adults</a></h3>
    <p>doi.org/10.1002/14651858.CD012345.pub2</p>
  </div>
  <div class="result-item">
    <h3 class="result-title"><a href="/cdsr/...">Mindfulness for chronic pain</a></h3>
    <p>10.1002/14651858.CD009876.pub3</p>
  </div>
</body></html>
"""


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_ok_then_disconnect():
    adapter = CochraneAdapter({"max_retries": 1})
    _install_client(adapter, {"cochranelibrary.com": _fake_response(text_data="<html></html>")})
    assert await adapter.connect() is True
    assert adapter.is_connected
    await adapter.disconnect()
    assert not adapter.is_connected


@pytest.mark.asyncio
async def test_connect_returns_false_on_500():
    adapter = CochraneAdapter({"max_retries": 1})
    _install_client(adapter, {"cochranelibrary.com": _fake_response(status_code=500)})
    assert await adapter.connect() is False


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_by_doi_uses_export_endpoint():
    adapter = CochraneAdapter({"max_retries": 1})
    client = _install_client(
        adapter, {"export.cochrane.org/api/review/": _fake_response(json_data=_REVIEW_BODY)}
    )
    records = await adapter.fetch({"doi": "10.1002/14651858.CD012345.pub2"})
    assert len(records) == 1
    assert any("export.cochrane.org" in c[0] for c in client.calls)


@pytest.mark.asyncio
async def test_fetch_by_doi_not_found_returns_empty():
    adapter = CochraneAdapter({"max_retries": 1})
    _install_client(
        adapter,
        {"export.cochrane.org/api/review/": _fake_response(status_code=404)},
    )
    records = await adapter.fetch({"doi": "10.1002/14651858.CD999999.pub1"})
    assert records == []


@pytest.mark.asyncio
async def test_fetch_search_falls_back_to_html_when_json_unavailable():
    adapter = CochraneAdapter({"max_retries": 1})
    # First request to /search throws on .json() because we return text only;
    # adapter retries as text and extracts results from HTML.
    text_resp = _fake_response(text_data=_SEARCH_HTML, status_code=200)
    _install_client(adapter, {"/search": text_resp})
    records = await adapter.fetch({"term": "depression CBT", "max_results": 5})
    # Should have extracted 2 DOIs from HTML
    assert len(records) == 2
    dois = {r.get("doi", "") for r in records}
    assert "10.1002/14651858.CD012345.pub2" in dois


@pytest.mark.asyncio
async def test_fetch_search_uses_json_list_response_when_available():
    adapter = CochraneAdapter({"max_retries": 1})
    _install_client(
        adapter,
        {"/search": _fake_response(json_data=[_REVIEW_BODY, _PROTOCOL_BODY])},
    )
    records = await adapter.fetch({"term": "ketamine"})
    assert len(records) == 2


@pytest.mark.asyncio
async def test_fetch_empty_query_rejected():
    adapter = CochraneAdapter({"max_retries": 1})
    _install_client(adapter, {"cochranelibrary.com": _fake_response(text_data="ok")})
    with pytest.raises(CochraneError):
        await adapter.fetch({"max_results": 5})


# ---------------------------------------------------------------------------
# Normalize
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_normalize_maps_review_fields():
    adapter = CochraneAdapter()
    normalised = await adapter.normalize([_REVIEW_BODY])
    assert len(normalised) == 1
    rec = normalised[0]
    assert rec["doi"] == "10.1002/14651858.CD012345.pub2"
    assert "Smith J" in rec["authors"]
    assert rec["review_group"] == "Common Mental Disorders Group"
    assert rec["is_protocol"] is False
    assert rec["is_withdrawn"] is False


@pytest.mark.asyncio
async def test_normalize_flags_protocol_records():
    adapter = CochraneAdapter()
    normalised = await adapter.normalize([_PROTOCOL_BODY])
    assert normalised[0]["is_protocol"] is True


@pytest.mark.asyncio
async def test_normalize_drops_record_without_doi_or_title():
    adapter = CochraneAdapter()
    normalised = await adapter.normalize([{"abstract": "anonymous"}])
    assert normalised == []


# ---------------------------------------------------------------------------
# Validate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_withdrawn_review_is_invalid():
    adapter = CochraneAdapter()
    normalised = await adapter.normalize([_WITHDRAWN_BODY])
    validated = await adapter.validate(normalised)
    assert validated[0]["_valid"] is False
    assert validated[0]["_confidence"] == ConfidenceTier.LOW.value
    # Withdrawn reviews must be flagged research_only.
    assert validated[0]["_provenance"]["research_only"] is True


@pytest.mark.asyncio
async def test_validate_published_review_is_high_confidence_systematic_review():
    adapter = CochraneAdapter()
    normalised = await adapter.normalize([_REVIEW_BODY])
    validated = await adapter.validate(normalised)
    rec = validated[0]
    assert rec["_valid"] is True
    assert rec["_evidence_level"] == EvidenceLevel.SYSTEMATIC_REVIEW.value
    assert rec["_confidence"] == ConfidenceTier.HIGH.value
    assert rec["_provenance"]["research_only"] is False


@pytest.mark.asyncio
async def test_validate_protocol_is_medium_confidence_and_research_only():
    adapter = CochraneAdapter()
    normalised = await adapter.normalize([_PROTOCOL_BODY])
    validated = await adapter.validate(normalised)
    rec = validated[0]
    assert rec["_evidence_level"] == EvidenceLevel.EXPERT_OPINION.value
    assert rec["_confidence"] == ConfidenceTier.MEDIUM.value
    assert rec["_provenance"]["research_only"] is True


# ---------------------------------------------------------------------------
# Provenance / license / confidence
# ---------------------------------------------------------------------------


def test_get_license_is_research_only_not_commercial():
    adapter = CochraneAdapter()
    meta = adapter.get_license()
    assert isinstance(meta, LicenseMetadata)
    assert meta.allows_research is True
    assert meta.allows_commercial is False
    assert meta.requires_attribution is True
    # Withdrawn/protocol caveat surfaced in restrictions.
    assert any("withdrawn" in r.lower() or "protocol" in r.lower() for r in meta.restrictions)


def test_get_provenance_dataclass_shape():
    adapter = CochraneAdapter()
    record = {
        "doi": "10.1002/14651858.CD012345.pub2",
        "title": "review",
        "is_protocol": False,
        "is_withdrawn": False,
    }
    prov = adapter.get_provenance(record)
    assert isinstance(prov, ProvenanceRecord)
    assert prov.source_database == "Cochrane Library"
    assert prov.evidence_level == EvidenceLevel.SYSTEMATIC_REVIEW
    assert prov.confidence_tier == ConfidenceTier.HIGH
    assert prov.research_only is False


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_429_raises_ratelimit():
    adapter = CochraneAdapter({"max_retries": 1})
    _install_client(
        adapter,
        {"export.cochrane.org/api/review/": _fake_response(status_code=429)},
    )
    with pytest.raises(CochraneRateLimitError):
        await adapter.fetch({"doi": "10.1002/14651858.CD012345.pub2"})


@pytest.mark.asyncio
async def test_search_404_raises_notfound():
    adapter = CochraneAdapter({"max_retries": 1})
    _install_client(adapter, {"/search": _fake_response(status_code=404)})
    with pytest.raises(CochraneNotFoundError):
        await adapter.fetch({"term": "ghost"})


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_ok():
    adapter = CochraneAdapter({"max_retries": 1})
    _install_client(adapter, {"cochranelibrary.com": _fake_response(text_data="<html></html>")})
    h = await adapter.health_check()
    assert h["status"] == "ok"
    assert h["source"] == "Cochrane Library"


@pytest.mark.asyncio
async def test_health_check_reports_down_on_500():
    adapter = CochraneAdapter({"max_retries": 1})
    _install_client(adapter, {"cochranelibrary.com": _fake_response(status_code=500)})
    h = await adapter.health_check()
    assert h["status"] == "down"
    assert "error" in h
