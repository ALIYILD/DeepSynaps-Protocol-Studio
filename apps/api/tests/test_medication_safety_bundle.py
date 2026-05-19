from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.pharmaceutical_router import router, get_pharmaceutical_registry


class _FakeAdapter:
    def __init__(self, key: str, results: list[dict], *, api_key: str | None = None, connected: bool = True):
        self.key = key
        self._results = results
        self.api_key = api_key
        self.is_connected = connected

    async def search(self, query: str, filters: dict | None = None):
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


def test_medication_safety_bundle_includes_disclaimer_and_partial_results() -> None:
    registry = _FakeRegistry(
        {
            "rxnorm": _FakeAdapter("rxnorm", [{"name": "Sertraline", "rxcui": "123"}]),
            "drugbank": _FakeAdapter(
                "drugbank",
                [{"name": "Sertraline", "drugbank_id": "DB0001", "warnings": ["monitor"]}],
                api_key="test-key",
            ),
            "openfda": _FakeAdapter("openfda", [{"name": "Sertraline", "contraindications": ["possible review"]}]),
            "pubchem": _FakeAdapter("pubchem", [{"name": "Sertraline", "cid": "1234"}]),
            "chembl": _FakeAdapter("chembl", [{"name": "Sertraline", "chembl_id": "CHEMBL25"}]),
        }
    )
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_pharmaceutical_registry] = lambda: registry

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/pharmaceutical/medication-safety-check",
            json={"medication_name": "sertraline"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["decision_support_only"] is True
        assert body["clinician_review_required"] is True
        assert body["partial"] is False
        assert "decision support only" in body["disclaimer"].lower()
        assert "not a diagnosis" in body["disclaimer"].lower()
        assert "not a prescription" in body["disclaimer"].lower()
        assert "clinician must verify source data" in body["disclaimer"].lower()
        assert body["possible_safety_considerations"]
