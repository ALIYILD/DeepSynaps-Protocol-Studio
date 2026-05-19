"""
Unit tests for app.services.knowledge.adapters.dynamed_live_adapter.

HTTP mocked at the httpx.AsyncClient boundary. Live network is never
hit. ``DEEPSYNAPS_DYNAMED_API_KEY`` is hermetically cleared with
``monkeypatch.delenv`` before constructing the "no credentials"
adapters.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Union
from unittest.mock import MagicMock

import pytest

from app.services.knowledge.adapters.dynamed_live_adapter import (
    CREDENTIAL_ENV_VARS,
    DynaMedAuthError,
    DynaMedLiveAdapter,
)
from app.services.knowledge.base_adapter import (
    ConfidenceTier,
    FetchError,
    LicenseMetadata,
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
        # Fall back to the first route — DynaMed uses base "/" and "/search".
        first = next(iter(self.routes.values()))
        return first(params or {}) if callable(first) else first

    async def aclose(self) -> None:
        self.is_closed = True


def _install_client(
    adapter: DynaMedLiveAdapter, routes: Dict[str, Any]
) -> _FakeClient:
    client = _FakeClient(routes)
    adapter._client = client
    adapter._connected = True
    return client


def _no_creds_adapter(monkeypatch: pytest.MonkeyPatch) -> DynaMedLiveAdapter:
    for var in CREDENTIAL_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    return DynaMedLiveAdapter({"max_retries": 0})


def _creds_adapter() -> DynaMedLiveAdapter:
    return DynaMedLiveAdapter({"max_retries": 0, "api_key": "test-key"})


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


_TOPIC_DOC = {
    "id": "dynamed-1",
    "title": "Major Depressive Disorder — Topic Summary",
    "topic_type": "Topic Summary",
    "journal": "DynaMed",
    "year": "2024",
    "authors": "EBSCO Editorial Team",
    "doi": "10.5555/dynamed.mdd.2024",
    "url": "https://www.dynamed.com/topic/dynamed-1",
}

_GUIDELINE_DOC = {
    "id": "dynamed-2",
    "title": "Guideline on neuromodulation for treatment-resistant depression",
    "type": "Guideline",
    "year": 2023,
    "authors": ["WHO Panel"],
}

_STUB_DOC = {"type": "Other"}

_SEARCH_OK = {"topics": [_TOPIC_DOC, _GUIDELINE_DOC, _STUB_DOC]}
_PROBE_OK: Dict[str, Any] = {"status": "ok"}


# ---------------------------------------------------------------------------
# 1. connect() returns False without credentials
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_returns_false_without_credentials(monkeypatch):
    adapter = _no_creds_adapter(monkeypatch)
    assert adapter._api_key is None
    assert await adapter.connect() is False
    assert adapter._client is None


# ---------------------------------------------------------------------------
# 2. connect() returns True with credentials + 200 probe
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_ok_with_credentials_and_good_probe():
    adapter = _creds_adapter()
    _install_client(adapter, {"dynamed.com": _fake_response(json_data=_PROBE_OK)})
    assert await adapter.connect() is True
    assert adapter.is_connected


# ---------------------------------------------------------------------------
# 3. fetch() raises FetchError without credentials
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_raises_fetcherror_without_credentials(monkeypatch):
    adapter = _no_creds_adapter(monkeypatch)
    with pytest.raises(FetchError) as excinfo:
        await adapter.fetch("depression")
    msg = str(excinfo.value)
    assert "credentials required" in msg
    for var in CREDENTIAL_ENV_VARS:
        assert var in msg


# ---------------------------------------------------------------------------
# 4. fetch() returns results with credentials + 200 mocked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_returns_results_with_credentials():
    adapter = _creds_adapter()
    _install_client(adapter, {"search": _fake_response(json_data=_SEARCH_OK)})
    items = await adapter.fetch("depression")
    assert len(items) == 3
    assert items[0]["id"] == "dynamed-1"


# ---------------------------------------------------------------------------
# 5. fetch() raises typed APIError on mocked 401/403
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_raises_auth_error_on_401():
    adapter = _creds_adapter()
    _install_client(adapter, {"search": _fake_response(status_code=401)})
    with pytest.raises(DynaMedAuthError):
        await adapter.fetch("anything")


@pytest.mark.asyncio
async def test_fetch_raises_auth_error_on_403():
    adapter = _creds_adapter()
    _install_client(adapter, {"search": _fake_response(status_code=403)})
    with pytest.raises(DynaMedAuthError):
        await adapter.fetch("anything")


# ---------------------------------------------------------------------------
# 6. health_check() → "disabled" without credentials
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_disabled_without_credentials(monkeypatch):
    adapter = _no_creds_adapter(monkeypatch)
    result = await adapter.health_check()
    assert result["status"] == "disabled"
    assert result["connected"] is False
    assert result["requires_credentials"] is True
    assert result["api_key_configured"] is False
    assert "DEEPSYNAPS_DYNAMED_API_KEY" in result["message"]


# ---------------------------------------------------------------------------
# 7. health_check() → "ok" with credentials + good probe
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_ok_with_credentials_and_good_probe():
    adapter = _creds_adapter()
    _install_client(adapter, {"dynamed.com": _fake_response(json_data=_PROBE_OK)})
    result = await adapter.health_check()
    assert result["status"] == "ok"
    assert result["connected"] is True
    assert result["latency_ms"] is not None
    assert result["api_key_configured"] is True


# ---------------------------------------------------------------------------
# 8. get_license(): EBSCO subscription, all flags as required
# ---------------------------------------------------------------------------


def test_get_license_is_ebsco_subscription():
    adapter = DynaMedLiveAdapter({"api_key": "x"})
    lic = adapter.get_license()
    assert isinstance(lic, LicenseMetadata)
    assert lic.license_type == "EBSCO-subscription"
    assert lic.allows_commercial is False
    assert lic.allows_research is False
    assert lic.requires_attribution is True


# ---------------------------------------------------------------------------
# 9. Env-var pickup: setenv → adapter reads it
# ---------------------------------------------------------------------------


def test_env_var_pickup_for_api_key(monkeypatch):
    for var in CREDENTIAL_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("DEEPSYNAPS_DYNAMED_API_KEY", "env-supplied-key")
    adapter = DynaMedLiveAdapter()
    assert adapter._api_key == "env-supplied-key"


# ---------------------------------------------------------------------------
# 10. Env-var hermeticity: delenv before constructing no-creds adapter
# ---------------------------------------------------------------------------


def test_env_var_hermeticity_no_creds_path(monkeypatch):
    monkeypatch.delenv("DEEPSYNAPS_DYNAMED_API_KEY", raising=False)
    adapter = DynaMedLiveAdapter()
    assert adapter._api_key is None


# ---------------------------------------------------------------------------
# Bonus: normalize + validate + bare-list tolerance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_normalize_maps_topic_summary_fields():
    adapter = DynaMedLiveAdapter({"api_key": "x"})
    rows = await adapter.normalize([_TOPIC_DOC])
    assert len(rows) == 1
    assert rows[0]["doi"] == "10.5555/dynamed.mdd.2024"
    assert rows[0]["evidence_level"] == "EXPERT_OPINION"
    assert rows[0]["source"] == "dynamed"
    assert adapter.get_confidence(rows[0]) is ConfidenceTier.MEDIUM


@pytest.mark.asyncio
async def test_validate_drops_records_without_id_doi_title():
    adapter = DynaMedLiveAdapter({"api_key": "x"})
    rows = await adapter.normalize([_TOPIC_DOC, _STUB_DOC])
    valid = await adapter.validate(rows)
    assert len(valid) == 1
    assert valid[0]["dynamed_id"] == "dynamed-1"


@pytest.mark.asyncio
async def test_fetch_accepts_bare_list_payload():
    adapter = _creds_adapter()
    _install_client(
        adapter,
        {"search": _fake_response(json_data=[_TOPIC_DOC, _GUIDELINE_DOC])},
    )
    items = await adapter.fetch("trip search")
    assert len(items) == 2
