from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.pharmaceutical_router import router, get_pharmaceutical_registry
from app.services.knowledge.pharmaceutical_registry import (
    build_pharmaceutical_inventory,
    build_pharmaceutical_registry,
    list_connected_pharmaceutical_keys,
    list_disabled_pharmaceutical_keys,
    list_pharmaceutical_keys,
)


class _FakeAdapter:
    def __init__(
        self,
        key: str,
        results: list[dict],
        *,
        api_key: str | None = None,
        connected: bool = True,
        fail_on_search: bool = False,
    ):
        self.key = key
        self._results = results
        self.api_key = api_key
        self.is_connected = connected
        self.fail_on_search = fail_on_search

    async def search(self, query: str, filters: dict | None = None):
        if self.fail_on_search:
            raise RuntimeError(f"{self.key} upstream unavailable")
        return list(self._results)

    async def fetch(self, query):
        return list(self._results)

    def get_license(self):
        class _License:
            license_type = "CC0"

        return _License()


class _FakeRegistry:
    def __init__(self, adapters: dict[str, _FakeAdapter]):
        self._adapters = adapters

    def get(self, name: str):
        return self._adapters.get(name)

    def get_all_info(self):
        return {
            key: {
                "source_name": key,
                "source_version": "test",
                "tier": "P0",
                "connected": adapter.is_connected,
            }
            for key, adapter in self._adapters.items()
        }


def _app_with_registry(registry) -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_pharmaceutical_registry] = lambda: registry
    return app


def test_pharmaceutical_inventory_declares_all_eleven_sources() -> None:
    assert len(list_pharmaceutical_keys()) == 11
    assert set(list_connected_pharmaceutical_keys()) == {
        "rxnorm",
        "drugbank",
        "openfda",
        "pubchem",
        "chembl",
    }
    assert set(list_disabled_pharmaceutical_keys()) == {
        "dailymed",
        "orange_book",
        "ndc_directory",
        "unii",
        "pharmgkb",
        "aeolus",
    }


def test_connected_pharma_adapters_register_without_import_errors() -> None:
    registry = build_pharmaceutical_registry()
    for key in list_connected_pharmaceutical_keys():
        assert registry.has_adapter(key), f"{key} should be registered"


def test_inventory_marks_pending_sources_disabled(monkeypatch) -> None:
    monkeypatch.delenv("DRUGBANK_API_KEY", raising=False)
    registry = build_pharmaceutical_registry()
    inventory = build_pharmaceutical_inventory(registry=registry)
    by_key = {row["key"]: row for row in inventory}

    assert by_key["rxnorm"]["status"] in {"registered", "healthy"}
    assert by_key["drugbank"]["api_key_required"] is True
    assert by_key["drugbank"]["status"] == "degraded"
    assert by_key["dailymed"]["status"] == "disabled"
    assert by_key["orange_book"]["status"] == "disabled"
    assert by_key["ndc_directory"]["status"] == "disabled"
    assert by_key["unii"]["status"] == "disabled"
    assert by_key["pharmgkb"]["status"] == "disabled"
    assert by_key["aeolus"]["status"] == "disabled"


def test_query_returns_partial_results_when_an_adapter_fails() -> None:
    registry = _FakeRegistry(
        {
            "rxnorm": _FakeAdapter("rxnorm", [{"name": "Sertraline", "rxcui": "123"}]),
            "drugbank": _FakeAdapter(
                "drugbank",
                [{"name": "Sertraline", "drugbank_id": "DB0001"}],
                api_key="test-key",
            ),
            "openfda": _FakeAdapter("openfda", [{"name": "Sertraline", "warnings": ["monitor"]}]),
            "pubchem": _FakeAdapter("pubchem", [{"name": "Sertraline", "cid": "1234"}]),
            "chembl": _FakeAdapter("chembl", [{"name": "Sertraline", "chembl_id": "CHEMBL25"}]),
        }
    )
    app = _app_with_registry(registry)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/pharmaceutical/query",
            json={"medication_name": "sertraline", "adapters": ["rxnorm", "drugbank", "openfda", "pubchem", "chembl"]},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["decision_support_only"] is True
        assert body["partial"] is False
        assert body["total_results"] == 5
        assert "not a diagnosis" in body["disclaimer"].lower()
        assert "not a prescription" in body["disclaimer"].lower()


def test_query_marks_disabled_adapter_as_disabled() -> None:
    registry = _FakeRegistry(
        {
            "rxnorm": _FakeAdapter("rxnorm", [{"name": "Sertraline", "rxcui": "123"}]),
        }
    )
    app = _app_with_registry(registry)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/pharmaceutical/query",
            json={"medication_name": "sertraline", "adapters": ["dailymed"]},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["partial"] is False
        assert body["adapters"][0]["status"] == "disabled"


def test_query_marks_failed_adapter_as_partial() -> None:
    registry = _FakeRegistry(
        {
            "rxnorm": _FakeAdapter("rxnorm", [{"name": "Sertraline", "rxcui": "123"}]),
            "drugbank": _FakeAdapter(
                "drugbank",
                [],
                api_key="test-key",
                fail_on_search=True,
            ),
        }
    )
    app = _app_with_registry(registry)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/pharmaceutical/query",
            json={"medication_name": "sertraline", "adapters": ["rxnorm", "drugbank"]},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["partial"] is True
        assert any(row["status"] == "degraded" for row in body["adapters"])
