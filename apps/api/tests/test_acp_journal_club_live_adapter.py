"""
Unit tests for app.services.knowledge.adapters.acp_journal_club_live_adapter.

HTTP mocked at the httpx.AsyncClient boundary. Live network is never
hit. Both username and password env vars are hermetically cleared with
``monkeypatch.delenv`` before constructing the "no credentials" adapters.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Union
from unittest.mock import MagicMock

import pytest

from app.services.knowledge.adapters.acp_journal_club_live_adapter import (
    ACPJournalClubAuthError,
    ACPJournalClubLiveAdapter,
    CREDENTIAL_ENV_VARS,
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
        if isinstance(self._json, Exception):
            raise self._json
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
    adapter: ACPJournalClubLiveAdapter, routes: Dict[str, Any]
) -> _FakeClient:
    client = _FakeClient(routes)
    adapter._client = client
    adapter._connected = True
    return client


def _no_creds_adapter(monkeypatch: pytest.MonkeyPatch) -> ACPJournalClubLiveAdapter:
    for var in CREDENTIAL_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    return ACPJournalClubLiveAdapter({"max_retries": 0})


def _creds_adapter() -> ACPJournalClubLiveAdapter:
    return ACPJournalClubLiveAdapter(
        {"max_retries": 0, "username": "u", "password": "p"}
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


_ACP_DOC = {
    "id": "acp-1",
    "title": "RCT of CBT for chronic pain",
    "type": "randomized controlled trial",
    "journal": "ACP Journal Club",
    "year": "2024",
    "authors": "Smith J., Doe A.",
    "doi": "10.7326/acp.2024.1",
    "url": "https://www.acpjournals.org/journal/aim/acp-1",
}

_ACP_REVIEW = {
    "id": "acp-2",
    "title": "Systematic review on rTMS for treatment-resistant depression",
    "type": "Systematic Review",
    "year": 2023,
    "authors": ["Jones K."],
}

_STUB = {"type": "Editorial"}

_SEARCH_OK = {"articles": [_ACP_DOC, _ACP_REVIEW, _STUB]}
_LANDING_OK = {"items": []}


# ---------------------------------------------------------------------------
# 1. connect() returns False without credentials
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_returns_false_without_credentials(monkeypatch):
    adapter = _no_creds_adapter(monkeypatch)
    assert adapter._username is None
    assert adapter._password is None
    assert await adapter.connect() is False
    assert adapter._client is None


# ---------------------------------------------------------------------------
# 2. connect() returns True with credentials + 200 probe
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect_ok_with_credentials_and_good_probe():
    adapter = _creds_adapter()
    _install_client(adapter, {"aim": _fake_response(json_data=_LANDING_OK)})
    assert await adapter.connect() is True
    assert adapter.is_connected


# ---------------------------------------------------------------------------
# 3. fetch() raises FetchError without credentials
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_raises_fetcherror_without_credentials(monkeypatch):
    adapter = _no_creds_adapter(monkeypatch)
    with pytest.raises(FetchError) as excinfo:
        await adapter.fetch("rTMS")
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
    _install_client(adapter, {"aim": _fake_response(json_data=_SEARCH_OK)})
    items = await adapter.fetch("rTMS depression")
    assert len(items) == 3
    assert items[0]["id"] == "acp-1"


# ---------------------------------------------------------------------------
# 5. fetch() raises typed APIError on mocked 401/403
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_raises_auth_error_on_401():
    adapter = _creds_adapter()
    _install_client(adapter, {"aim": _fake_response(status_code=401)})
    with pytest.raises(ACPJournalClubAuthError):
        await adapter.fetch("anything")


@pytest.mark.asyncio
async def test_fetch_raises_auth_error_on_403():
    adapter = _creds_adapter()
    _install_client(adapter, {"aim": _fake_response(status_code=403)})
    with pytest.raises(ACPJournalClubAuthError):
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
    assert result["credentials_configured"] is False
    for var in CREDENTIAL_ENV_VARS:
        assert var in result["message"]


# ---------------------------------------------------------------------------
# 7. health_check() → "ok" with credentials + good probe
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_ok_with_credentials_and_good_probe():
    adapter = _creds_adapter()
    _install_client(adapter, {"aim": _fake_response(json_data=_LANDING_OK)})
    result = await adapter.health_check()
    assert result["status"] == "ok"
    assert result["connected"] is True
    assert result["latency_ms"] is not None


# ---------------------------------------------------------------------------
# 8. get_license(): ACP subscription, all flags as required
# ---------------------------------------------------------------------------


def test_get_license_is_acp_subscription():
    adapter = ACPJournalClubLiveAdapter({"username": "u", "password": "p"})
    lic = adapter.get_license()
    assert isinstance(lic, LicenseMetadata)
    assert lic.license_type == "ACP-subscription"
    assert lic.allows_commercial is False
    assert lic.allows_research is False
    assert lic.requires_attribution is True


# ---------------------------------------------------------------------------
# 9. Env-var pickup: setenv → adapter reads it
# ---------------------------------------------------------------------------


def test_env_var_pickup_for_username_and_password(monkeypatch):
    for var in CREDENTIAL_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("DEEPSYNAPS_ACP_USERNAME", "env-user")
    monkeypatch.setenv("DEEPSYNAPS_ACP_PASSWORD", "env-pass")
    adapter = ACPJournalClubLiveAdapter()
    assert adapter._username == "env-user"
    assert adapter._password == "env-pass"


# ---------------------------------------------------------------------------
# 10. Env-var hermeticity: delenv before constructing no-creds adapter
# ---------------------------------------------------------------------------


def test_env_var_hermeticity_no_creds_path(monkeypatch):
    for var in CREDENTIAL_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    adapter = ACPJournalClubLiveAdapter()
    assert adapter._username is None
    assert adapter._password is None
    assert adapter._has_credentials is False


# ---------------------------------------------------------------------------
# Bonus: normalize + validate + non-JSON tolerance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_normalize_maps_rct_fields():
    adapter = ACPJournalClubLiveAdapter({"username": "u", "password": "p"})
    rows = await adapter.normalize([_ACP_DOC])
    assert len(rows) == 1
    assert rows[0]["evidence_level"] == "RCT"
    assert rows[0]["doi"] == "10.7326/acp.2024.1"
    assert rows[0]["source"] == "acp_journal_club"
    assert adapter.get_confidence(rows[0]) is ConfidenceTier.HIGH


@pytest.mark.asyncio
async def test_validate_drops_records_without_id_doi_title():
    adapter = ACPJournalClubLiveAdapter({"username": "u", "password": "p"})
    rows = await adapter.normalize([_ACP_DOC, _STUB])
    valid = await adapter.validate(rows)
    assert len(valid) == 1
    assert valid[0]["acp_id"] == "acp-1"


@pytest.mark.asyncio
async def test_fetch_tolerates_html_response_as_empty():
    """ACP serves HTML for the landing page; we treat that as 'no rows'."""
    adapter = _creds_adapter()
    _install_client(
        adapter,
        {"aim": _fake_response(json_data=ValueError("not JSON"))},
    )
    items = await adapter.fetch("rTMS")
    assert items == []
