"""Slice A — Category 3 clinical-evidence registry + lifecycle tests.

Asserts the honest-state contract that the rest of the platform relies on:

1. All 12 external clinical-evidence sources are *catalogued* in the
   production registry (whether or not they have a live network adapter).
2. The internal DeepSynaps evidence DB is *first-class*: it appears in
   the ``/api/v1/evidence/clinical-sources`` surface as ``is_internal=True``
   and is not bypassed by a hardcoded paper count.
3. Subscription / restricted sources (Cochrane, ACP, DynaMed) do NOT
   report ``lifecycle_state="healthy"`` without credentials.
4. Catalogued-only adapters refuse to fetch — they raise ``FetchError``
   rather than returning empty results that would be indistinguishable
   from "we ran the query and got nothing".

These tests do not hit the network and do not require evidence.db to
exist; the endpoint degrades to ``internal_source.lifecycle_state =
"degraded"`` in that case, which is itself part of the contract.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.services.knowledge.adapter_bootstrap import (
    _ADAPTER_CATALOG,
    build_production_registry,
    list_production_adapter_keys,
)
from app.services.knowledge.adapters.catalogued_only import (
    CataloguedOnlyAdapter,
)
from app.services.knowledge.base_adapter import FetchError
from app.services.knowledge.evidence_categories import (
    CLINICAL_EVIDENCE_REGISTRY_KEYS,
    SUBSCRIPTION_CLINICAL_EVIDENCE_KEYS,
    EvidenceCategory,
    category_for_adapter,
    is_subscription_source,
)


# ── 1. Catalog completeness ────────────────────────────────────────────────

def test_all_twelve_cat3_external_keys_are_in_catalog() -> None:
    """The 12 product-spec clinical-evidence sources must all be catalogued."""
    catalog_keys = set(list_production_adapter_keys())
    missing = [k for k in CLINICAL_EVIDENCE_REGISTRY_KEYS if k not in catalog_keys]
    assert not missing, (
        f"Catalog is missing Cat-3 clinical-evidence keys: {missing}. "
        f"Add an entry to _ADAPTER_CATALOG in adapter_bootstrap.py."
    )
    # Spec promises exactly 12 external sources.
    assert len(CLINICAL_EVIDENCE_REGISTRY_KEYS) == 12


def test_clinical_evidence_keys_all_map_to_category() -> None:
    """Every clinical-evidence key must map to the CLINICAL_EVIDENCE category."""
    for key in CLINICAL_EVIDENCE_REGISTRY_KEYS:
        assert category_for_adapter(key) is EvidenceCategory.CLINICAL_EVIDENCE, (
            f"{key} is not categorised as clinical_evidence — fix "
            f"ADAPTER_CATEGORIES in evidence_categories.py"
        )


def test_subscription_keys_recognised() -> None:
    """Cochrane, ACP, DynaMed are flagged as subscription sources."""
    assert SUBSCRIPTION_CLINICAL_EVIDENCE_KEYS == {
        "cochrane",
        "acp_journal_club",
        "dynamed",
    }
    for key in SUBSCRIPTION_CLINICAL_EVIDENCE_KEYS:
        assert is_subscription_source(key) is True


# ── 2. Catalogued-only adapter contract ─────────────────────────────────────

def _build_one(key: str) -> CataloguedOnlyAdapter | None:
    """Instantiate one catalogued-only adapter from the catalog by key."""
    entry = _ADAPTER_CATALOG.get(key)
    if entry is None:
        return None
    cls, _tier, config = entry
    instance = cls(config)
    if not isinstance(instance, CataloguedOnlyAdapter):
        return None
    return instance


# Cat-3 sources that remain catalogued-only after the live-adapter wire-up.
# CrossRef + PubMed Central moved to live network adapters in
# PRs #1074 / #1092 (catalog swap landed alongside this comment); they
# are excluded from the catalogued-only contract tests and instead
# covered by their dedicated test_crossref_live_adapter /
# test_pubmed_central_live_adapter suites.
_CATALOGUED_ONLY_CAT3_KEYS = [
    "eudract",
    "nice",
    "trip",
    "epistemonikos",
    "acp_journal_club",
    "dynamed",
]


@pytest.mark.parametrize("key", _CATALOGUED_ONLY_CAT3_KEYS)
def test_catalogued_only_adapter_refuses_to_fetch(key: str) -> None:
    """Catalogued-only adapters must raise FetchError instead of fabricating."""
    adapter = _build_one(key)
    assert adapter is not None, f"Catalog entry for {key} is not a CataloguedOnlyAdapter"
    with pytest.raises(FetchError):
        asyncio.run(adapter.fetch("any query"))


@pytest.mark.parametrize("key", _CATALOGUED_ONLY_CAT3_KEYS)
def test_catalogued_only_health_check_reports_honest_state(key: str) -> None:
    """health_check must say connected=False and either catalogued/disabled."""
    adapter = _build_one(key)
    assert adapter is not None
    result = asyncio.run(adapter.health_check())
    assert result["connected"] is False
    assert result["status"] in {"catalogued", "disabled"}, (
        f"Unexpected status for {key}: {result['status']}"
    )
    assert isinstance(result.get("message"), str) and result["message"]
    # Subscription sources MUST be disabled when no credentials are set.
    if is_subscription_source(key):
        assert result["status"] == "disabled", (
            f"Subscription source {key} must be disabled without credentials, "
            f"got status={result['status']}"
        )


# ── 3. Registry build still succeeds ────────────────────────────────────────

def test_build_production_registry_includes_all_cat3_sources() -> None:
    """Registry must register every Cat-3 source (or honestly skip if disabled)."""
    registry = build_production_registry()
    registered = set(registry.list_adapters())
    # In a default build none of the cat3 keys are disabled, so all 12
    # must be present in the registry.
    for key in CLINICAL_EVIDENCE_REGISTRY_KEYS:
        assert key in registered, (
            f"Production registry did not register {key} — check that the "
            f"adapter class instantiates cleanly with empty config."
        )


# ── 4. HTTP endpoint contract ────────────────────────────────────────────────

def test_clinical_sources_endpoint_returns_all_thirteen_sources(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """GET /clinical-sources returns 1 internal + 12 external sources."""
    response = client.get(
        "/api/v1/evidence/clinical-sources",
        headers=auth_headers["clinician"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["internal_source"]["is_internal"] is True
    assert body["internal_source"]["category"] == "clinical_evidence"
    assert len(body["external_sources"]) == 12
    keys_in_response = {row["key"] for row in body["external_sources"]}
    assert keys_in_response == set(CLINICAL_EVIDENCE_REGISTRY_KEYS)


def test_clinical_sources_endpoint_subscription_sources_not_healthy(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Cochrane / ACP / DynaMed must not be reported as healthy without creds."""
    response = client.get(
        "/api/v1/evidence/clinical-sources",
        headers=auth_headers["clinician"],
    )
    body = response.json()
    by_key = {row["key"]: row for row in body["external_sources"]}
    for key in ("cochrane", "acp_journal_club", "dynamed"):
        row = by_key[key]
        assert row["requires_subscription"] is True
        assert row["lifecycle_state"] != "healthy", (
            f"{key} reported as healthy without credentials — this is the "
            f"exact failure mode the catalogued-only path is meant to prevent."
        )


def test_clinical_sources_endpoint_includes_decision_support_disclaimer(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Every response carries the decision-support disclaimer verbatim."""
    response = client.get(
        "/api/v1/evidence/clinical-sources",
        headers=auth_headers["clinician"],
    )
    body = response.json()
    disclaimer = body["decision_support_disclaimer"]
    assert "Decision support only" in disclaimer
    assert "Not diagnosis" in disclaimer
    assert "Clinician must verify" in disclaimer


def test_clinical_sources_endpoint_requires_clinician_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Guest cannot read clinical-sources."""
    response = client.get(
        "/api/v1/evidence/clinical-sources",
        headers=auth_headers["guest"],
    )
    assert response.status_code in (401, 403)
