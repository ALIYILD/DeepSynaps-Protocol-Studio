"""
Live knowledge-adapter HTTP surface.

Exposes the 5 production-wired knowledge adapters (PubMed, ClinicalTrials.gov,
Cochrane, Europe PMC, gnomAD) via REST. Backed by the canonical
``AdapterRegistry`` from ``app.services.knowledge.adapter_registry`` and the
singleton bootstrap in ``app.services.knowledge.adapter_bootstrap``.

This router is intentionally separate from ``knowledge_router_v2.py``:

- v2 imports from the parallel ``app.knowledge.*`` tree (Kimi research
  preserved as reference only). Those imports currently fall through to
  a no-op stub class, so v2's ``/knowledge/adapters`` reports every
  adapter as ``not_registered``.
- This router imports from the canonical ``app.services.knowledge.*``
  production tree, so its endpoints actually run the adapters.

The two routers coexist while the migration finishes. Prefix collision is
avoided: v2 is under ``/knowledge``, this one under ``/api/v1/knowledge/live``.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Path, status
from pydantic import BaseModel, Field

from app.services.knowledge.adapter_bootstrap import (
    get_production_registry,
    list_disabled_adapter_keys,
    list_production_adapter_keys,
)
from app.services.knowledge.adapter_registry import AdapterRegistry
from app.services.knowledge.lifecycle import (
    LifecycleState,
    compute_registry_lifecycle,
    summarize_lifecycle,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/knowledge/live",
    tags=["Knowledge Layer — Live Adapters"],
)


# ---------------------------------------------------------------------------
# Response shapes
# ---------------------------------------------------------------------------


class AdapterSummary(BaseModel):
    """Compact metadata for an adapter listing."""

    key: str
    source_name: str
    source_version: str
    tier: str
    connected: bool
    lifecycle_state: str = Field(
        default=LifecycleState.UNKNOWN.value,
        description="Normalized adapter lifecycle state — see /adapters/_lifecycle.",
    )


class LifecycleSummary(BaseModel):
    total: int
    by_state: Dict[str, int]
    adapters: Dict[str, str]


class AdaptersList(BaseModel):
    total: int
    adapters: List[AdapterSummary]


class AdapterDetail(BaseModel):
    key: str
    source_name: str
    source_version: str
    tier: str
    license_type: str
    connected: bool
    confidence_tier_unknown: str = Field(
        default="See /health for live health data"
    )


class AdapterHealth(BaseModel):
    status: str
    source: str
    latency_ms: Optional[float] = None
    error: Optional[str] = None
    extra: Dict[str, Any] = Field(default_factory=dict)


class SearchRequest(BaseModel):
    """Request body for a search. ``query`` is adapter-specific; see each
    adapter's docstring for accepted query shape."""

    query: Dict[str, Any] = Field(
        ..., description="Adapter-specific query dict. May also be a string under key 'term'."
    )
    include_invalid: bool = Field(
        default=False,
        description=(
            "If true, return records that failed validate() (with _valid=False). "
            "Default false drops them silently — safer for downstream display."
        ),
    )


class SearchResult(BaseModel):
    adapter: str
    count: int
    results: List[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _ensure_connected(adapter, key: str) -> None:
    if not adapter.is_connected:
        ok = await adapter.connect()
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Adapter {key!r} could not connect to its upstream source.",
            )


def _summary_from_info(
    key: str,
    info: Dict[str, Any],
    *,
    lifecycle_state: str = LifecycleState.UNKNOWN.value,
) -> AdapterSummary:
    return AdapterSummary(
        key=key,
        source_name=info.get("source_name", ""),
        source_version=info.get("source_version", ""),
        tier=info.get("tier", "P2"),
        connected=bool(info.get("connected", False)),
        lifecycle_state=lifecycle_state,
    )


def _summary_from_lifecycle_only(
    key: str,
    state: LifecycleState,
) -> AdapterSummary:
    return AdapterSummary(
        key=key,
        source_name="",
        source_version="",
        tier="",
        connected=False,
        lifecycle_state=state.value,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/adapters", response_model=AdaptersList)
async def list_live_adapters(
    registry: AdapterRegistry = Depends(get_production_registry),
) -> AdaptersList:
    """List every production-wired adapter and its current lifecycle state."""
    info = registry.get_all_info()
    catalog_keys = list(list_production_adapter_keys())
    disabled_keys = list(list_disabled_adapter_keys())
    states = compute_registry_lifecycle(
        registry,
        catalog_keys=catalog_keys,
        disabled_keys=disabled_keys,
    )
    summaries: List[AdapterSummary] = []
    for key, state in states.items():
        if key in info:
            summaries.append(
                _summary_from_info(key, info[key], lifecycle_state=state.value)
            )
        else:
            summaries.append(_summary_from_lifecycle_only(key, state))
    return AdaptersList(total=len(summaries), adapters=summaries)


@router.get("/adapters/_catalog", response_model=List[str])
async def list_catalog_keys() -> List[str]:
    """Return the static catalog of adapter keys that *should* be registered.

    Useful for verifying the bootstrap actually wired what the code says it
    wires — clients can compare this against ``/adapters``.
    """
    return list(list_production_adapter_keys())


@router.get("/adapters/_lifecycle", response_model=LifecycleSummary)
async def adapters_lifecycle_summary(
    registry: AdapterRegistry = Depends(get_production_registry),
) -> LifecycleSummary:
    catalog_keys = list(list_production_adapter_keys())
    disabled_keys = list(list_disabled_adapter_keys())
    states = compute_registry_lifecycle(
        registry,
        catalog_keys=catalog_keys,
        disabled_keys=disabled_keys,
    )
    return LifecycleSummary(**summarize_lifecycle(states))


@router.get("/adapters/{key}", response_model=AdapterDetail)
async def get_live_adapter(
    key: str = Path(..., min_length=1, max_length=64),
    registry: AdapterRegistry = Depends(get_production_registry),
) -> AdapterDetail:
    """Return adapter detail (source, version, tier, license, connected state)."""
    info_map = registry.get_all_info()
    if key not in info_map:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown or unregistered adapter: {key!r}.",
        )
    info = info_map[key]
    adapter = registry.get(key)
    license_type = ""
    if adapter is not None:
        try:
            license_type = adapter.get_license().license_type
        except Exception as exc:  # noqa: BLE001
            logger.debug("get_license() raised for %s: %s", key, exc)
    return AdapterDetail(
        key=key,
        source_name=info.get("source_name", ""),
        source_version=info.get("source_version", ""),
        tier=info.get("tier", "P2"),
        license_type=license_type,
        connected=bool(info.get("connected", False)),
    )


@router.get("/adapters/{key}/health", response_model=AdapterHealth)
async def adapter_health(
    key: str = Path(..., min_length=1, max_length=64),
    registry: AdapterRegistry = Depends(get_production_registry),
) -> AdapterHealth:
    """Run the adapter's live ``health_check()``.

    Connects on demand if not already connected. Returns ``status=down`` with
    an ``error`` rather than HTTP 500 when the upstream is unreachable —
    callers should always be able to read a health response.
    """
    adapter = registry.get(key)
    if adapter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown adapter: {key!r}.",
        )
    if not adapter.is_connected:
        try:
            await adapter.connect()
        except Exception as exc:  # noqa: BLE001
            logger.debug("adapter %s connect() raised: %s", key, exc)
    health = await adapter.health_check()
    return AdapterHealth(
        status=str(health.get("status", "unknown")),
        source=str(health.get("source", "")),
        latency_ms=health.get("latency_ms"),
        error=health.get("error"),
        extra={
            k: v
            for k, v in health.items()
            if k not in {"status", "source", "latency_ms", "error"}
        },
    )


@router.post("/adapters/{key}/search", response_model=SearchResult)
async def adapter_search(
    key: str = Path(..., min_length=1, max_length=64),
    body: SearchRequest = Body(...),
    registry: AdapterRegistry = Depends(get_production_registry),
) -> SearchResult:
    """Run a query against the named adapter.

    Pipeline: ``fetch → normalize → validate``. Records that fail validate
    (``_valid=False``) are dropped unless ``include_invalid=true`` is set.
    """
    adapter = registry.get(key)
    if adapter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown adapter: {key!r}.",
        )
    await _ensure_connected(adapter, key)

    try:
        raw = await adapter.fetch(body.query)
    except ValueError as exc:
        # Adapters raise their own *Error types on misuse; surface as 400.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid query for adapter {key!r}: {exc}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        # Adapter-specific exceptions (PubMedError, GnomadAPIError, ...).
        msg = f"{type(exc).__name__}: {exc}"
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Upstream error from {key!r}: {msg}",
        ) from exc

    normalised = await adapter.normalize(raw)
    validated = await adapter.validate(normalised)
    if not body.include_invalid:
        validated = [r for r in validated if r.get("_valid", True)]
    return SearchResult(adapter=key, count=len(validated), results=validated)
