"""Tests for the neuroimaging federation runtime (Category 4, PR-3).

Two layers:

1. Unit tests for the federation module — mock each adapter at the
   module level, assert the normalized
   :class:`NeuroimagingSearchResult` shape and the per-source status
   string.
2. Integration tests against ``POST /api/v1/neuroimaging/search`` —
   verify the router proxies into ``federate()``, that the response
   stays HTTP 200 under every failure mode, and that the disclaimer
   plus the 13 disabled sources keep reporting their lifecycle state.

All upstream adapters are mocked. No live HTTP / SQLite I/O.
"""
from __future__ import annotations

import asyncio
from typing import Any, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.knowledge import neuroimaging_federation as fed_mod
from app.services.knowledge.neuroimaging_federation import (
    NeuroimagingSearchQuery,
    NeuroimagingSearchResult,
    federate,
)


pytestmark = pytest.mark.usefixtures("client")


def _auth(headers: dict[str, dict[str, str]]) -> dict[str, str]:
    return headers["clinician"]


# ─── Unit: per-adapter wrapper normalization ────────────────────────────


def test_neurovault_wrapper_normalizes_image_record() -> None:
    """NeuroVault legacy shim → unified search result."""

    class FakeNeurovault:
        async def search(self, query: str, filters: dict[str, Any]) -> list[dict[str, Any]]:
            return [
                {
                    "id": 1234,
                    "name": "Working Memory Z-map",
                    "modality": "fMRI-BOLD",
                    "not_mni": False,
                    "cognitive_paradigm_cogatlas": "n-back",
                    "cognitive_contrast_cogpo": "2-back vs 0-back",
                    "url": "https://neurovault.org/images/1234/",
                    "file": "https://neurovault.org/media/1234.nii.gz",
                }
            ]

        async def close(self) -> None:  # noqa: D401
            return None

    q = NeuroimagingSearchQuery(condition="working memory")
    results, err = asyncio.run(fed_mod._query_neurovault(q, FakeNeurovault))
    assert err is None
    assert len(results) == 1
    r = results[0]
    assert r.source == "neurovault"
    assert r.source_id == "1234"
    assert r.modality == "fMRI-BOLD"
    assert r.coordinate_space == "MNI152"
    assert "n-back" in r.condition_tags
    assert r.dataset_url.startswith("https://neurovault.org/")


def test_openneuro_wrapper_normalizes_graphql_edge() -> None:
    class FakeOpenneuro:
        async def search(self, query: str, filters: dict[str, Any]) -> list[dict[str, Any]]:
            return [
                {
                    "node": {
                        "id": "ds000001",
                        "draft": {
                            "description": {
                                "Name": "Pamoja Twiga",
                                "DatasetDOI": "10.18112/openneuro.ds000001.v1.0.0",
                            },
                            "summary": {
                                "modalities": ["MRI"],
                                "tasks": ["faces"],
                            },
                        },
                    }
                }
            ]

        async def close(self) -> None:
            return None

    q = NeuroimagingSearchQuery(condition="faces", modality="MRI")
    results, err = asyncio.run(fed_mod._query_openneuro(q, FakeOpenneuro))
    assert err is None
    assert len(results) == 1
    r = results[0]
    assert r.source == "openneuro"
    assert r.source_id == "ds000001"
    assert "faces" in r.condition_tags
    assert r.dataset_url == "https://openneuro.org/datasets/ds000001"
    assert r.doi_or_pmid == "10.18112/openneuro.ds000001.v1.0.0"


def test_neurosynth_wrapper_calls_connect_and_normalizes() -> None:
    class FakeNeurosynth:
        def __init__(self) -> None:
            self.connected = False

        async def connect(self) -> bool:
            self.connected = True
            return True

        async def disconnect(self) -> None:
            self.connected = False

        async def fetch(self, query: dict[str, Any]) -> list[dict[str, Any]]:
            assert self.connected, "fetch must be called after connect()"
            return [
                {
                    "term": "working memory",
                    "term_id": "ns:wm-001",
                    "inference_type": "forward",
                    "coordinate": [-42.0, 16.0, 36.0],
                }
            ]

    q = NeuroimagingSearchQuery(condition="working memory")
    results, err = asyncio.run(fed_mod._query_neurosynth(q, FakeNeurosynth))
    assert err is None
    assert len(results) == 1
    r = results[0]
    assert r.source == "neurosynth"
    assert r.coordinate_space == "MNI152"
    assert r.coordinates == [-42.0, 16.0, 36.0]
    assert "Reverse inference" not in (r.warnings[0] if r.warnings else "")


def test_neurosynth_wrapper_reverse_inference_emits_warning() -> None:
    class FakeNeurosynth:
        async def connect(self) -> bool:
            return True

        async def disconnect(self) -> None:
            return None

        async def fetch(self, query: dict[str, Any]) -> list[dict[str, Any]]:
            return [{"term": "x", "term_id": "y", "inference_type": "reverse"}]

    q = NeuroimagingSearchQuery(condition="x")
    results, _ = asyncio.run(fed_mod._query_neurosynth(q, FakeNeurosynth))
    assert results[0].warnings
    assert "Reverse inference" in results[0].warnings[0]


def test_neurosynth_wrapper_degrades_without_query_input() -> None:
    """No condition + no coordinate → degraded, NOT an error."""

    class FakeNeurosynth:
        async def connect(self) -> bool:
            return True

        async def disconnect(self) -> None:
            return None

        async def fetch(self, query: dict[str, Any]) -> list[dict[str, Any]]:
            raise AssertionError("fetch should not be called for empty query")

    q = NeuroimagingSearchQuery()  # nothing
    results, err = asyncio.run(fed_mod._query_neurosynth(q, FakeNeurosynth))
    assert results == []
    assert err is None


def test_allen_brain_wrapper_translates_region_to_structure() -> None:
    class FakeAllen:
        async def connect(self) -> bool:
            return True

        async def disconnect(self) -> None:
            return None

        async def fetch(self, query: dict[str, Any]) -> list[dict[str, Any]]:
            assert query.get("structure_acronym") == "HIP"
            return [
                {"probe_id": 9999, "structure_id": 4321, "donor_id": 1}
            ]

    q = NeuroimagingSearchQuery(region="HIP")
    results, err = asyncio.run(fed_mod._query_allen_brain(q, FakeAllen))
    assert err is None
    assert len(results) == 1
    assert results[0].source == "allen_brain"
    assert results[0].atlas_labels == ["4321"]


def test_allen_brain_wrapper_degrades_without_region() -> None:
    class FakeAllen:
        async def connect(self) -> bool:
            raise AssertionError("connect should not be called for empty query")

    q = NeuroimagingSearchQuery(condition="depression")
    results, err = asyncio.run(fed_mod._query_allen_brain(q, FakeAllen))
    assert results == []
    assert err is None


def test_fcp_indi_wrapper_normalizes_site_record() -> None:
    class FakeFcp:
        async def search(self, query: str, filters: dict[str, Any]) -> list[dict[str, Any]]:
            return [
                {"name": "Beijing_Zang", "site_code": "Beijing", "id": "site-Beijing"}
            ]

        async def close(self) -> None:
            return None

    q = NeuroimagingSearchQuery(condition="resting state")
    results, err = asyncio.run(fed_mod._query_fcp_indi(q, FakeFcp))
    assert err is None
    assert results[0].source == "fcp_indi"
    assert results[0].source_id == "Beijing"


def test_wrapper_traps_adapter_exceptions() -> None:
    """A blown-up adapter never propagates the exception out."""

    class ExplodingNeurovault:
        def __init__(self) -> None:
            raise RuntimeError("simulated cold-start failure")

    q = NeuroimagingSearchQuery(condition="x")
    results, err = asyncio.run(fed_mod._query_neurovault(q, ExplodingNeurovault))
    assert results == []
    assert err is not None
    assert "RuntimeError" in err


# ─── Unit: federate() orchestration + state machine ────────────────────


def _fake_enabled(*ids: str) -> list[dict[str, Any]]:
    """Build inventory-like dicts for the federate() input."""
    return [
        {
            "id": src_id,
            "name": src_id.replace("_", " ").title(),
            "import_path": f"app.fake.{src_id}",
            "source_url": f"https://{src_id}.example/",
            "lifecycle_state": "healthy",
        }
        for src_id in ids
    ]


class _OkAdapter:
    """Trivial fake adapter — only used as a sentinel; wrappers are patched."""


def test_federate_all_sources_ok(monkeypatch) -> None:
    async def _ok_wrapper(query, adapter_cls):
        return [
            NeuroimagingSearchResult(
                title="ok-row",
                source="neurovault",
                source_id="1",
            )
        ], None

    # Patch ALL wrappers to succeed.
    for key in list(fed_mod._WRAPPERS):
        monkeypatch.setitem(fed_mod._WRAPPERS, key, _ok_wrapper)

    out = asyncio.run(
        federate(
            NeuroimagingSearchQuery(condition="x"),
            _fake_enabled("neurovault", "openneuro", "neurosynth", "allen_brain", "fcp_indi"),
            resolver=lambda _path: _OkAdapter,
        )
    )
    assert len(out["results"]) == 5
    assert all(s["status"] == "ok" for s in out["source_status"])
    assert out["warnings"] == []


def test_federate_one_error_others_ok(monkeypatch) -> None:
    async def _ok(query, adapter_cls):
        return [NeuroimagingSearchResult(title="t", source="x", source_id="1")], None

    async def _err(query, adapter_cls):
        return [], "boom: NeurosynthAPIError"

    monkeypatch.setitem(fed_mod._WRAPPERS, "neurovault", _ok)
    monkeypatch.setitem(fed_mod._WRAPPERS, "openneuro", _ok)
    monkeypatch.setitem(fed_mod._WRAPPERS, "neurosynth", _err)
    monkeypatch.setitem(fed_mod._WRAPPERS, "allen_brain", _ok)
    monkeypatch.setitem(fed_mod._WRAPPERS, "fcp_indi", _ok)

    out = asyncio.run(
        federate(
            NeuroimagingSearchQuery(condition="x"),
            _fake_enabled("neurovault", "openneuro", "neurosynth", "allen_brain", "fcp_indi"),
            resolver=lambda _path: _OkAdapter,
        )
    )
    by_id = {s["id"]: s for s in out["source_status"]}
    assert by_id["neurosynth"]["status"] == "error"
    assert "boom" in by_id["neurosynth"]["error"]
    assert by_id["neurovault"]["status"] == "ok"
    assert len(out["results"]) == 4
    assert any("neurosynth" in w for w in out["warnings"])


def test_federate_timeout_surfaces_timeout_status(monkeypatch) -> None:
    async def _slow(query, adapter_cls):
        await asyncio.sleep(2)
        return [], None

    monkeypatch.setattr(fed_mod, "ADAPTER_TIMEOUT_SECONDS", 0.05)
    monkeypatch.setitem(fed_mod._WRAPPERS, "neurosynth", _slow)

    out = asyncio.run(
        federate(
            NeuroimagingSearchQuery(condition="x"),
            _fake_enabled("neurosynth"),
            resolver=lambda _path: _OkAdapter,
        )
    )
    assert out["source_status"][0]["status"] == "timeout"
    assert "0s" in out["source_status"][0]["error"] or "exceeded" in out["source_status"][0]["error"]
    assert any("neurosynth" in w for w in out["warnings"])
    assert out["results"] == []


def test_federate_all_fail_returns_empty_no_5xx(monkeypatch) -> None:
    async def _err(query, adapter_cls):
        raise RuntimeError("upstream blew up")

    for key in list(fed_mod._WRAPPERS):
        monkeypatch.setitem(fed_mod._WRAPPERS, key, _err)

    out = asyncio.run(
        federate(
            NeuroimagingSearchQuery(condition="x"),
            _fake_enabled("neurovault", "openneuro", "neurosynth", "allen_brain", "fcp_indi"),
            resolver=lambda _path: _OkAdapter,
        )
    )
    assert out["results"] == []
    assert all(s["status"] == "error" for s in out["source_status"])
    assert len(out["warnings"]) >= 5


def test_federate_degraded_when_zero_results_no_error(monkeypatch) -> None:
    async def _empty(query, adapter_cls):
        return [], None

    monkeypatch.setitem(fed_mod._WRAPPERS, "neurovault", _empty)

    out = asyncio.run(
        federate(
            NeuroimagingSearchQuery(condition="x"),
            _fake_enabled("neurovault"),
            resolver=lambda _path: _OkAdapter,
        )
    )
    assert out["source_status"][0]["status"] == "degraded"
    assert out["source_status"][0]["error"] is None


def test_federate_import_failure_reports_error_status() -> None:
    """Resolver returning None → status=error with adapter_import_failed."""
    out = asyncio.run(
        federate(
            NeuroimagingSearchQuery(condition="x"),
            _fake_enabled("neurovault"),
            resolver=lambda _path: None,
        )
    )
    assert out["source_status"][0]["status"] == "error"
    assert out["source_status"][0]["error"] == "adapter_import_failed"


# ─── Integration: HTTP /search ─────────────────────────────────────────


def test_search_state_machine_no_stub_status(client, auth_headers) -> None:
    """Every enabled source surfaces one of ok/degraded/timeout/error.

    Replaces the PR-1 ``no_runtime_in_pr1`` stub-status assertion.
    """
    resp = client.post(
        "/api/v1/neuroimaging/search",
        headers=_auth(auth_headers),
        json={"condition": "depression"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    allowed = {"ok", "degraded", "timeout", "error"}
    for s in body["source_status"]:
        assert s["status"] in allowed, f"unexpected status: {s['status']}"
        # PR-1 stub vocabulary MUST be gone.
        assert s["status"] != "skipped"
        assert s.get("error") != "no_runtime_in_pr1"


def test_search_disabled_sources_keep_their_lifecycle_state(client, auth_headers) -> None:
    """Disabled sources MUST NOT appear in the federation status list.

    Per the PR-3 contract, disabled sources are filtered out at the
    inventory layer (``list_enabled_sources``) and never become
    ``status="error"`` — they keep their lifecycle state on the catalog
    endpoint instead.
    """
    # Catalog still reports all 18 sources with their lifecycle states.
    cat = client.get(
        "/api/v1/neuroimaging/adapters", headers=_auth(auth_headers)
    ).json()
    assert cat["total"] == 18
    non_healthy = [
        s for s in cat["sources"] if s["lifecycle_state"] != "healthy"
    ]
    assert len(non_healthy) == 13, "expected 13 disabled sources"
    for s in non_healthy:
        assert s["lifecycle_state"] in {
            "requires_application",
            "software_resource",
            "catalogued",
            "deprecated",
        }

    # Federation only contacts the 5 healthy sources.
    resp = client.post(
        "/api/v1/neuroimaging/search",
        headers=_auth(auth_headers),
        json={},
    )
    body = resp.json()
    fed_ids = {s["id"] for s in body["source_status"]}
    non_healthy_ids = {s["id"] for s in non_healthy}
    assert fed_ids.isdisjoint(non_healthy_ids)


def test_search_disclaimer_always_present(client, auth_headers) -> None:
    resp = client.post(
        "/api/v1/neuroimaging/search",
        headers=_auth(auth_headers),
        json={"condition": "anything"},
    )
    body = resp.json()
    assert "decision_support_disclaimer" in body
    assert body["decision_support_disclaimer"]
    assert body["provenance"]["decision_support_disclaimer"] == body["decision_support_disclaimer"]


def test_search_all_adapters_succeed_via_monkeypatch(
    client, auth_headers, monkeypatch
) -> None:
    """End-to-end happy path: every wrapper returns a normalized row."""

    async def _ok(query, adapter_cls):
        return [
            NeuroimagingSearchResult(
                title="row",
                source="neurovault",  # rewritten by router to match enabled list
                source_id="42",
                modality="fMRI-BOLD",
            )
        ], None

    for key in list(fed_mod._WRAPPERS):
        monkeypatch.setitem(fed_mod._WRAPPERS, key, _ok)
    # Make the resolver return a sentinel so wrappers get invoked.
    from app.routers import neuroimaging_knowledge_router as nr

    monkeypatch.setattr(nr, "_resolve_adapter", lambda _p: _OkAdapter)

    resp = client.post(
        "/api/v1/neuroimaging/search",
        headers=_auth(auth_headers),
        json={"condition": "x"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    statuses = [s["status"] for s in body["source_status"]]
    assert statuses.count("ok") == 5
    assert len(body["results"]) == 5
    assert body["warnings"] == []


def test_search_one_adapter_raises_no_5xx(
    client, auth_headers, monkeypatch
) -> None:
    async def _ok(query, adapter_cls):
        return [
            NeuroimagingSearchResult(
                title="row", source="x", source_id="1"
            )
        ], None

    async def _explode(query, adapter_cls):
        raise RuntimeError("simulated upstream failure")

    monkeypatch.setitem(fed_mod._WRAPPERS, "neurovault", _ok)
    monkeypatch.setitem(fed_mod._WRAPPERS, "openneuro", _ok)
    monkeypatch.setitem(fed_mod._WRAPPERS, "neurosynth", _explode)
    monkeypatch.setitem(fed_mod._WRAPPERS, "allen_brain", _ok)
    monkeypatch.setitem(fed_mod._WRAPPERS, "fcp_indi", _ok)
    from app.routers import neuroimaging_knowledge_router as nr

    monkeypatch.setattr(nr, "_resolve_adapter", lambda _p: _OkAdapter)

    resp = client.post(
        "/api/v1/neuroimaging/search",
        headers=_auth(auth_headers),
        json={"condition": "x"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    by_id = {s["id"]: s for s in body["source_status"]}
    assert by_id["neurosynth"]["status"] == "error"
    assert by_id["neurovault"]["status"] == "ok"
    assert len(body["results"]) == 4
    assert any("neurosynth" in w for w in body["warnings"])


def test_search_one_adapter_times_out_no_5xx(
    client, auth_headers, monkeypatch
) -> None:
    async def _ok(query, adapter_cls):
        return [
            NeuroimagingSearchResult(title="row", source="x", source_id="1")
        ], None

    async def _slow(query, adapter_cls):
        await asyncio.sleep(1.5)
        return [], None

    monkeypatch.setattr(fed_mod, "ADAPTER_TIMEOUT_SECONDS", 0.1)
    monkeypatch.setitem(fed_mod._WRAPPERS, "neurovault", _ok)
    monkeypatch.setitem(fed_mod._WRAPPERS, "openneuro", _ok)
    monkeypatch.setitem(fed_mod._WRAPPERS, "neurosynth", _slow)
    monkeypatch.setitem(fed_mod._WRAPPERS, "allen_brain", _ok)
    monkeypatch.setitem(fed_mod._WRAPPERS, "fcp_indi", _ok)
    from app.routers import neuroimaging_knowledge_router as nr

    monkeypatch.setattr(nr, "_resolve_adapter", lambda _p: _OkAdapter)

    resp = client.post(
        "/api/v1/neuroimaging/search",
        headers=_auth(auth_headers),
        json={"condition": "x"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    by_id = {s["id"]: s for s in body["source_status"]}
    assert by_id["neurosynth"]["status"] == "timeout"
    assert len(body["results"]) == 4


def test_search_all_adapters_fail_returns_200_empty(
    client, auth_headers, monkeypatch
) -> None:
    """All adapters down → HTTP 200, empty results, full warnings."""

    async def _err(query, adapter_cls):
        raise RuntimeError("everything is broken")

    for key in list(fed_mod._WRAPPERS):
        monkeypatch.setitem(fed_mod._WRAPPERS, key, _err)
    from app.routers import neuroimaging_knowledge_router as nr

    monkeypatch.setattr(nr, "_resolve_adapter", lambda _p: _OkAdapter)

    resp = client.post(
        "/api/v1/neuroimaging/search",
        headers=_auth(auth_headers),
        json={"condition": "x"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["results"] == []
    assert all(s["status"] == "error" for s in body["source_status"])
    assert len(body["warnings"]) >= 5
    # Disclaimer still attached.
    assert body["decision_support_disclaimer"]
