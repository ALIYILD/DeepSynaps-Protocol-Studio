"""
Unit tests for app.services.knowledge.adapters.openalex_adapter.

HTTP mocked at the httpx.AsyncClient boundary with a plain stub class
(same pattern as test_europepmc_adapter / test_pubmed_adapter).
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Union
from unittest.mock import MagicMock

import pytest

from app.services.knowledge.adapters.openalex_adapter import (
    OpenAlexAdapter,
    OpenAlexError,
    OpenAlexNotFoundError,
    OpenAlexRateLimitError,
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
    def __init__(self, *, json_data: Any = None, text_data: str = "", status_code: int = 200) -> None:
        self.status_code = status_code
        self.text = text_data
        self._json = json_data
        self.request = MagicMock()

    def json(self) -> Any:
        return self._json


def _fake_response(**kw: Any) -> _FakeResponse:
    return _FakeResponse(**kw)


class _FakeClient:
    def __init__(self, routes: Dict[str, Union[_FakeResponse, Callable[[Dict[str, Any]], _FakeResponse]]]) -> None:
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

_RCT_WORK = {
    "id": "https://openalex.org/W1234567890",
    "doi": "https://doi.org/10.1001/jama.2023.1234",
    "title": "Randomised controlled trial of repetitive TMS in depression",
    "display_name": "Randomised controlled trial of repetitive TMS in depression",
    "publication_year": 2023,
    "type": "article",
    "authorships": [
        {"author": {"display_name": "Alice Smith"}},
        {"author": {"display_name": "Bob Jones"}},
    ],
    "primary_location": {
        "source": {"display_name": "JAMA", "issn_l": "0098-7484"},
        "is_oa": True,
    },
    "open_access": {"is_oa": True},
    "cited_by_count": 42,
    "abstract_inverted_index": {"Background": [0], ":": [1], "We": [2], "tested": [3]},
    "topics": [{"display_name": "Meta-Analysis"}],
}

_PREPRINT_WORK = {
    "id": "https://openalex.org/W9876543210",
    "doi": "https://doi.org/10.1101/2024.01.01.000001",
    "title": "Preprint: novel biomarker for neurofeedback response",
    "display_name": "Preprint: novel biomarker for neurofeedback response",
    "publication_year": 2024,
    "type": "preprint",
    "authorships": [{"author": {"display_name": "Carol White"}}],
    "primary_location": {
        "source": {"display_name": "bioRxiv", "issn_l": None},
        "is_oa": True,
    },
    "open_access": {"is_oa": True},
    "cited_by_count": 0,
    "abstract_inverted_index": None,
    "topics": [],
}

_WORKS_PAGE = {
    "meta": {"count": 2, "page": 1, "per_page": 25},
    "results": [_RCT_WORK, _PREPRINT_WORK],
}

_WORKS_EMPTY = {
    "meta": {"count": 0, "page": 1, "per_page": 25},
    "results": [],
}

_HEALTH_PING = {
    "meta": {"count": 1, "page": 1, "per_page": 1},
    "results": [_RCT_WORK],
}


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


def test_openalex_adapter_is_importable():
    from app.services.knowledge.adapters.openalex_adapter import OpenAlexAdapter
    assert OpenAlexAdapter is not None


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_ok_then_disconnect():
    adapter = OpenAlexAdapter({"max_retries": 1})
    _install_client(adapter, {"works": _fake_response(json_data=_HEALTH_PING)})
    assert await adapter.connect() is True
    assert adapter.is_connected
    await adapter.disconnect()
    assert not adapter.is_connected


@pytest.mark.asyncio
async def test_connect_returns_false_on_500():
    adapter = OpenAlexAdapter({"max_retries": 1})
    _install_client(adapter, {"works": _fake_response(status_code=500)})
    assert await adapter.connect() is False


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_by_string_term_returns_results():
    adapter = OpenAlexAdapter({"max_retries": 1})
    client = _install_client(adapter, {"works": _fake_response(json_data=_WORKS_PAGE)})
    records = await adapter.fetch("repetitive TMS depression")
    assert len(records) == 2
    params = client.calls[0][1]
    assert "repetitive TMS depression" in params.get("search", "")


@pytest.mark.asyncio
async def test_fetch_with_dict_term():
    adapter = OpenAlexAdapter({"max_retries": 1})
    client = _install_client(adapter, {"works": _fake_response(json_data=_WORKS_PAGE)})
    await adapter.fetch({"search": "neurofeedback ADHD", "max_results": 10})
    params = client.calls[0][1]
    assert "neurofeedback ADHD" in params.get("search", "")


@pytest.mark.asyncio
async def test_fetch_includes_custom_mailto():
    adapter = OpenAlexAdapter({"max_retries": 1, "mailto": "test@example.com"})
    client = _install_client(adapter, {"works": _fake_response(json_data=_WORKS_EMPTY)})
    await adapter.fetch("TMS")
    params = client.calls[0][1]
    assert params.get("mailto") == "test@example.com"


@pytest.mark.asyncio
async def test_fetch_uses_default_mailto():
    adapter = OpenAlexAdapter({"max_retries": 1})
    client = _install_client(adapter, {"works": _fake_response(json_data=_WORKS_EMPTY)})
    await adapter.fetch("TMS")
    params = client.calls[0][1]
    assert "mailto" in params
    assert "@" in params["mailto"]


@pytest.mark.asyncio
async def test_fetch_returns_empty_list_when_no_results():
    adapter = OpenAlexAdapter({"max_retries": 1})
    _install_client(adapter, {"works": _fake_response(json_data=_WORKS_EMPTY)})
    records = await adapter.fetch("xyzzy_no_results")
    assert records == []


@pytest.mark.asyncio
async def test_fetch_rejects_non_string_non_dict():
    adapter = OpenAlexAdapter({"max_retries": 1})
    _install_client(adapter, {"works": _fake_response(json_data=_WORKS_EMPTY)})
    with pytest.raises(OpenAlexError):
        await adapter.fetch(12345)


# ---------------------------------------------------------------------------
# Normalize
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_normalize_maps_work_fields():
    adapter = OpenAlexAdapter()
    normalised = await adapter.normalize([_RCT_WORK, _PREPRINT_WORK])
    rct = next(r for r in normalised if "W1234567890" in r["id"])
    pre = next(r for r in normalised if "W9876543210" in r["id"])

    assert rct["doi"] == "10.1001/jama.2023.1234"
    assert rct["title"] == "Randomised controlled trial of repetitive TMS in depression"
    assert rct["pub_year"] == "2023"
    assert rct["is_open_access"] is True
    assert rct["cited_by_count"] == 42
    assert "Alice Smith" in rct["authors"]
    assert rct["journal"] == "JAMA"
    assert pre["type"] == "preprint"
    assert pre["abstract"] == ""


@pytest.mark.asyncio
async def test_normalize_strips_doi_prefix():
    adapter = OpenAlexAdapter()
    normalised = await adapter.normalize([_RCT_WORK])
    assert not normalised[0]["doi"].startswith("https://doi.org/")


@pytest.mark.asyncio
async def test_normalize_drops_record_without_id():
    adapter = OpenAlexAdapter()
    normalised = await adapter.normalize([{"title": "no id here"}])
    assert normalised == []


# ---------------------------------------------------------------------------
# Validate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_attaches_confidence_and_provenance():
    adapter = OpenAlexAdapter()
    norm = await adapter.normalize([_RCT_WORK, _PREPRINT_WORK])
    validated = await adapter.validate(norm)
    rct = next(r for r in validated if "W1234567890" in r["id"])
    pre = next(r for r in validated if "W9876543210" in r["id"])

    assert rct["_valid"] is True
    assert "_confidence" in rct
    assert "_evidence_level" in rct
    assert "_provenance" in rct
    assert pre["_provenance"]["research_only"] is True


# ---------------------------------------------------------------------------
# License (CC0 — public domain)
# ---------------------------------------------------------------------------


def test_get_license_is_cc0():
    adapter = OpenAlexAdapter()
    meta = adapter.get_license()
    assert isinstance(meta, LicenseMetadata)
    license_lower = meta.license_type.lower()
    assert "cc0" in license_lower or "public domain" in license_lower
    assert meta.allows_research is True
    assert meta.allows_commercial is True
    assert meta.requires_attribution is False


# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------


def test_get_provenance_shape():
    adapter = OpenAlexAdapter()
    record = {
        "id": "https://openalex.org/W123",
        "title": "Test article",
        "doi": "10.1/test",
        "pub_year": "2023",
        "journal": "Nature",
        "type": "article",
        "topics": ["Meta-Analysis"],
    }
    prov = adapter.get_provenance(record)
    assert isinstance(prov, ProvenanceRecord)
    assert prov.source_database == "OpenAlex"
    assert prov.citation_doi == "10.1/test"


# ---------------------------------------------------------------------------
# Confidence tiers
# ---------------------------------------------------------------------------


def test_confidence_tiers_map_for_known_types():
    adapter = OpenAlexAdapter()
    assert adapter.get_confidence({"type": "article", "topics": ["Systematic Review"]}) == ConfidenceTier.HIGH
    assert adapter.get_confidence({"type": "preprint", "topics": []}) == ConfidenceTier.LOW
    assert adapter.get_confidence({"type": "article", "topics": []}) == ConfidenceTier.LOW


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_404_raises_notfound():
    adapter = OpenAlexAdapter({"max_retries": 1})
    _install_client(adapter, {"works": _fake_response(status_code=404)})
    with pytest.raises(OpenAlexNotFoundError):
        await adapter.fetch("ghost query")


@pytest.mark.asyncio
async def test_429_raises_ratelimit():
    adapter = OpenAlexAdapter({"max_retries": 1})
    _install_client(adapter, {"works": _fake_response(status_code=429)})
    with pytest.raises(OpenAlexRateLimitError):
        await adapter.fetch("burst query")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_ok():
    adapter = OpenAlexAdapter({"max_retries": 1})
    _install_client(adapter, {"works": _fake_response(json_data=_HEALTH_PING)})
    h = await adapter.health_check()
    assert h["status"] == "ok"
    assert h["source"] == "OpenAlex"


@pytest.mark.asyncio
async def test_health_check_reports_down_on_500():
    adapter = OpenAlexAdapter({"max_retries": 1})
    _install_client(adapter, {"works": _fake_response(status_code=500)})
    h = await adapter.health_check()
    assert h["status"] == "down"
    assert "error" in h


# ---------------------------------------------------------------------------
# Shim import acceptance
# ---------------------------------------------------------------------------


def test_shim_import_works():
    from app.knowledge.openalex_adapter import OpenAlexAdapter as ShimAdapter
    assert ShimAdapter is not None


# ---------------------------------------------------------------------------
# Bootstrap acceptance
# ---------------------------------------------------------------------------


def test_openalex_in_production_adapter_keys():
    from app.services.knowledge.adapter_bootstrap import list_production_adapter_keys
    assert "openalex" in list_production_adapter_keys()
