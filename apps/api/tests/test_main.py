"""Tests for the top-level /health endpoint surface.

Focused on the additive ``knowledge_adapters`` lifecycle summary shipped
alongside the existing health payload. The pre-existing keys (``status``,
``db``, ``version``, ``database``, ``clinical_snapshot``, ``environment``)
must remain present and unchanged — the lifecycle field is additive only.
"""
from __future__ import annotations

from app.services.knowledge import adapter_bootstrap
from app.services.knowledge.lifecycle import (
    DISABLED_ADAPTERS_ENV,
    LifecycleState,
)


_HEALTH_PATHS = ("/health", "/healthz", "/api/v1/health")
_REQUIRED_LEGACY_KEYS = {
    "status",
    "db",
    "environment",
    "version",
    "database",
    "clinical_snapshot",
}


def _assert_legacy_payload(payload: dict) -> None:
    for key in _REQUIRED_LEGACY_KEYS:
        assert key in payload, f"/health regressed: lost legacy key {key!r}"
    assert payload["status"] == "ok"
    assert payload["database"] == "ok"


def _assert_lifecycle_payload(payload: dict) -> None:
    assert "knowledge_adapters" in payload, (
        "/health is missing the new knowledge_adapters lifecycle summary"
    )
    summary = payload["knowledge_adapters"]
    assert isinstance(summary, dict)
    assert "total" in summary
    assert "by_state" in summary
    assert "adapters" in summary
    for state in LifecycleState:
        assert state.value in summary["by_state"], (
            f"/health knowledge_adapters.by_state is missing {state.value!r}"
        )


def test_health_includes_knowledge_adapter_lifecycle_summary(
    client, monkeypatch
):
    """Cold-container path: no production registry built yet → every
    catalog adapter shows up as CATALOGUED. /health must still return
    200 + the legacy keys."""
    monkeypatch.setattr(adapter_bootstrap, "_registry", None, raising=False)
    monkeypatch.delenv(DISABLED_ADAPTERS_ENV, raising=False)

    for path in _HEALTH_PATHS:
        response = client.get(path)
        assert response.status_code == 200, path
        payload = response.json()
        _assert_legacy_payload(payload)
        _assert_lifecycle_payload(payload)
        summary = payload["knowledge_adapters"]
        catalog_keys = list(adapter_bootstrap.list_production_adapter_keys())
        assert summary["total"] == len(catalog_keys)
        assert summary["by_state"]["catalogued"] == len(catalog_keys)


def test_health_reports_disabled_adapters_via_env(client, monkeypatch):
    monkeypatch.setattr(adapter_bootstrap, "_registry", None, raising=False)
    monkeypatch.setenv(DISABLED_ADAPTERS_ENV, "gnomad,cochrane")

    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    summary = payload["knowledge_adapters"]
    assert summary["adapters"]["gnomad"] == "disabled"
    assert summary["adapters"]["cochrane"] == "disabled"
    assert summary["by_state"]["disabled"] >= 2


def test_health_does_not_instantiate_adapters(client, monkeypatch):
    """The lifecycle peek inside /health must not call any adapter
    constructor or trigger the heavy bootstrap. Each constructor is
    replaced with a tripwire."""
    monkeypatch.setattr(adapter_bootstrap, "_registry", None, raising=False)

    def _boom(self, *args, **kwargs):  # pragma: no cover — must not run
        raise AssertionError(
            "Adapter constructor was called during /health — this is "
            "the regression the lifecycle peek is meant to prevent."
        )

    for _key, (cls, _tier, _cfg) in adapter_bootstrap._ADAPTER_CATALOG.items():
        monkeypatch.setattr(cls, "__init__", _boom, raising=False)

    response = client.get("/health")
    assert response.status_code == 200
    assert (
        response.json()["knowledge_adapters"]["by_state"]["catalogued"]
        == len(adapter_bootstrap.list_production_adapter_keys())
    )
