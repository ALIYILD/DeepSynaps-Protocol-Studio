"""Neuroimaging federation runtime — Category 4 PR-3.

Live federation across the 5 healthy neuroimaging adapters identified by
:mod:`app.services.knowledge.neuroimaging_inventory`. Translates a single
unified :class:`NeuroimagingSearchQuery` into each adapter's native call
signature, runs the calls concurrently with a per-adapter timeout, and
normalizes heterogeneous result shapes into a single
:class:`NeuroimagingSearchResult` Pydantic model.

Design contracts
----------------

- This module is **anonymous catalog federation only**. It MUST NOT
  accept ``patient_id`` or any PHI. The router-level docstring repeats
  this so future patient-linked variants stay separate endpoints
  with their own ``_gate_patient_access`` + consent flow.
- Every adapter call is wrapped in a defensive try/except. A single
  upstream failure NEVER raises an HTTP 5xx; it becomes a per-source
  status entry plus a warning string.
- Adapters are **lazy-imported** inside the wrapper functions so that
  importing this module is cheap (the canonical adapters drag SQLite
  and httpx clients).
- All five wrappers are async. They are dispatched concurrently via
  :func:`asyncio.gather` with ``return_exceptions=True``, but each
  wrapper is *also* wrapped in :func:`asyncio.wait_for` so a slow
  adapter cannot block the whole response.
- Adapter→federation timeout: 8.0 s (per-adapter).
- No fake coordinates are emitted. If an adapter returns no spatial
  information, ``coordinates`` and ``atlas_labels`` remain ``None``.

Source-status state machine
---------------------------

For each enabled adapter the federation reports one of:

- ``"ok"``           — call returned ≥1 row, no error
- ``"degraded"``     — call returned 0 rows but completed cleanly
- ``"timeout"``      — adapter exceeded 8 s
- ``"error"``        — adapter import failed OR any other exception during
                       the call (sub-reason is in ``error`` field)

A separate ``"unavailable"`` bucket was considered but collapsed into
``"error"`` (with ``error="adapter_import_failed"``) to preserve
contract compatibility with the PR-1 ``test_search_all_upstreams_down``
test which expects import failures to surface as ``status="error"``.

Disabled sources (``lifecycle_state`` != ``healthy``) are handled at the
router layer and report their lifecycle state directly; the federation
runtime never sees them.
"""
from __future__ import annotations

import asyncio
import importlib
import inspect
import logging
from typing import Any, Awaitable, Callable, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Per-adapter call timeout in seconds. Conservative — most of these
# adapters do 1–2 HTTP hops; 8s gives slack for cold-start without
# making the endpoint feel hung.
ADAPTER_TIMEOUT_SECONDS = 8.0


# ─── Public Pydantic surface ─────────────────────────────────────────────


# core-schema-exempt: PR-3 federation-runtime DTO; promote alongside the
# router-level NeuroimagingSearchRequest in a later DTO-consolidation PR.
class NeuroimagingSearchQuery(BaseModel):
    """Unified federation input. Every field is optional.

    The federation MUST be patient-anonymous — there is intentionally no
    ``patient_id``, ``encounter_id`` or any other linkage field. A
    future "search-for-this-patient" endpoint is a separate concern.
    """

    condition: Optional[str] = Field(
        None, description="Cognitive paradigm / condition / contrast term."
    )
    modality: Optional[str] = Field(
        None, description="Imaging modality filter (e.g. 'fMRI-BOLD')."
    )
    region: Optional[str] = Field(
        None, description="Region name or atlas acronym (e.g. 'DLPFC-L', 'HIP')."
    )
    coordinate: Optional[list[float]] = Field(
        None, description="[x, y, z] MNI coordinate for coordinate-based queries."
    )
    atlas: Optional[str] = Field(None, description="Atlas filter (e.g. 'MNI152').")
    population: Optional[str] = Field(
        None, description="Population filter (e.g. 'adult', 'pediatric')."
    )
    sources: Optional[list[str]] = Field(
        None,
        description=(
            "Restrict federation to this subset of source ids. "
            "Empty/None means 'all enabled sources'."
        ),
    )
    limit: int = Field(20, ge=1, le=100)


# core-schema-exempt: PR-3 federation-runtime DTO.
class NeuroimagingSearchResult(BaseModel):
    """One normalized federated result row.

    Heterogeneous upstream shapes are flattened into this single
    Pydantic model so frontend code can render results without knowing
    which upstream produced them.
    """

    title: str = Field(..., description="Human-readable title or label.")
    source: str = Field(..., description="Source id (e.g. 'neurovault').")
    source_id: str = Field(
        ..., description="Stable upstream record identifier (string-coerced)."
    )
    modality: Optional[str] = Field(None)
    condition_tags: list[str] = Field(default_factory=list)
    population_tags: list[str] = Field(default_factory=list)
    coordinate_space: Optional[str] = Field(
        None, description="e.g. 'MNI152' if known; never fabricated."
    )
    coordinates: Optional[list[float]] = Field(
        None, description="[x, y, z] if upstream returned one — never imputed."
    )
    atlas_labels: Optional[list[str]] = Field(None)
    dataset_url: Optional[str] = Field(None)
    doi_or_pmid: Optional[str] = Field(None)
    access_notes: Optional[str] = Field(None)
    provenance: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


# ─── Adapter resolution ──────────────────────────────────────────────────


def _resolve_adapter(import_path: str) -> Optional[type]:
    """Import a module and return its first ``*Adapter`` class.

    Never raises. Returns ``None`` on any import or lookup failure.
    """
    try:
        module = importlib.import_module(import_path)
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.warning("neuroimaging adapter import failed: %s (%s)", import_path, exc)
        return None
    for name, obj in inspect.getmembers(module, inspect.isclass):
        if obj.__module__ != import_path:
            continue
        if name.endswith("Adapter"):
            return obj
    return None


# ─── Per-adapter wrappers ────────────────────────────────────────────────
#
# Each wrapper:
#   - takes the unified query + a callable that constructs an adapter
#   - translates query → adapter's native call shape
#   - calls the adapter
#   - translates result → list[NeuroimagingSearchResult]
#   - catches ALL exceptions and returns ([], "error reason")
#
# Wrappers return a tuple (results, error_reason_or_None). They never
# raise. Timeout enforcement happens in the gather layer below.


async def _query_neurovault(
    query: NeuroimagingSearchQuery, adapter_cls: type
) -> tuple[list[NeuroimagingSearchResult], Optional[str]]:
    """Call the NeuroVault legacy shim and normalize results."""
    try:
        adapter = adapter_cls()
        term = query.condition or query.region or ""
        filters: dict[str, Any] = {"search_type": "images", "limit": query.limit}
        if query.modality:
            filters["modality"] = query.modality
        raw = await adapter.search(term, filters)
        results = []
        for row in raw or []:
            results.append(
                NeuroimagingSearchResult(
                    title=str(row.get("name", "") or row.get("description", "") or "")
                    or f"NeuroVault image {row.get('id', '')}",
                    source="neurovault",
                    source_id=str(row.get("id", "")),
                    modality=row.get("modality"),
                    condition_tags=_tags(
                        row.get("cognitive_paradigm_cogatlas"),
                        row.get("cognitive_contrast_cogpo"),
                    ),
                    coordinate_space="MNI152" if row.get("not_mni") is False else None,
                    dataset_url=row.get("url") or row.get("file"),
                    doi_or_pmid=row.get("DOI") or None,
                    access_notes="Open neuroimaging statistical map.",
                    provenance={"source": "neurovault", "raw_id": row.get("id")},
                )
            )
        # Best-effort cleanup of httpx client (legacy adapter holds one).
        await _safe_close(adapter)
        return results, None
    except Exception as exc:  # noqa: BLE001
        logger.warning("neurovault federation call failed: %s", exc)
        return [], f"neurovault adapter error: {type(exc).__name__}"


async def _query_openneuro(
    query: NeuroimagingSearchQuery, adapter_cls: type
) -> tuple[list[NeuroimagingSearchResult], Optional[str]]:
    """Call the OpenNeuro legacy shim and normalize results."""
    try:
        adapter = adapter_cls()
        term = query.condition or query.region or ""
        filters: dict[str, Any] = {"limit": query.limit}
        if query.modality:
            # OpenNeuro modalities are bare strings like 'MRI', 'EEG'.
            filters["modality"] = query.modality.split("-")[0]
        raw = await adapter.search(term, filters)
        results = []
        for row in raw or []:
            node = row.get("node", row) if isinstance(row, dict) else {}
            draft = (node or {}).get("draft", {}) or {}
            description = (draft or {}).get("description", {}) or {}
            summary = (draft or {}).get("summary", {}) or {}
            modalities = summary.get("modalities") or []
            results.append(
                NeuroimagingSearchResult(
                    title=str(description.get("Name") or node.get("id", "")),
                    source="openneuro",
                    source_id=str(node.get("id", "")),
                    modality=", ".join(modalities) if modalities else None,
                    condition_tags=list(summary.get("tasks") or []),
                    dataset_url=(
                        f"https://openneuro.org/datasets/{node.get('id')}"
                        if node.get("id")
                        else None
                    ),
                    doi_or_pmid=description.get("DatasetDOI"),
                    access_notes="Open BIDS dataset.",
                    provenance={"source": "openneuro", "raw_id": node.get("id")},
                )
            )
        await _safe_close(adapter)
        return results, None
    except Exception as exc:  # noqa: BLE001
        logger.warning("openneuro federation call failed: %s", exc)
        return [], f"openneuro adapter error: {type(exc).__name__}"


async def _query_neurosynth(
    query: NeuroimagingSearchQuery, adapter_cls: type
) -> tuple[list[NeuroimagingSearchResult], Optional[str]]:
    """Call the canonical Neurosynth adapter (DatabaseAdapter contract)."""
    try:
        adapter = adapter_cls()
        # Build a query dict matching NeurosynthAdapter.fetch().
        q: dict[str, Any] = {"limit": query.limit, "inference_type": "forward"}
        if query.condition:
            q["term"] = query.condition
        elif query.region:
            q["term"] = query.region
        if query.coordinate:
            q["coordinate"] = list(query.coordinate)
        # Need a connect lifecycle for canonical adapters.
        try:
            await adapter.connect()
        except Exception as exc:  # noqa: BLE001
            await _safe_disconnect(adapter)
            return [], f"neurosynth connect failed: {type(exc).__name__}"
        try:
            if "term" not in q and "coordinate" not in q:
                return [], None  # No queryable input → degraded, not error.
            raw = await adapter.fetch(q)
        finally:
            await _safe_disconnect(adapter)
        results = []
        for row in raw or []:
            results.append(
                NeuroimagingSearchResult(
                    title=str(row.get("term") or row.get("term_id") or ""),
                    source="neurosynth",
                    source_id=str(row.get("term_id") or row.get("term", "")),
                    condition_tags=[row.get("term")] if row.get("term") else [],
                    coordinate_space="MNI152" if row.get("coordinate") else None,
                    coordinates=(
                        list(row.get("coordinate"))
                        if isinstance(row.get("coordinate"), (list, tuple))
                        and len(row.get("coordinate")) == 3
                        else None
                    ),
                    access_notes=(
                        "Neurosynth meta-analytic association. Forward "
                        "inference only — reverse inference is disabled for "
                        "clinical contexts."
                    ),
                    provenance={
                        "source": "neurosynth",
                        "inference_type": row.get("inference_type", "forward"),
                    },
                    warnings=(
                        ["Reverse inference is not valid for clinical decisions."]
                        if row.get("inference_type") == "reverse"
                        else []
                    ),
                )
            )
        return results, None
    except Exception as exc:  # noqa: BLE001
        logger.warning("neurosynth federation call failed: %s", exc)
        return [], f"neurosynth adapter error: {type(exc).__name__}"


async def _query_allen_brain(
    query: NeuroimagingSearchQuery, adapter_cls: type
) -> tuple[list[NeuroimagingSearchResult], Optional[str]]:
    """Call the canonical Allen Brain Atlas adapter.

    Impedance mismatch: Allen is a gene-expression catalog, not a
    condition/contrast search. The only meaningful unified-query
    translation is ``region`` → ``structure_acronym``. Without one of
    those, this wrapper degrades cleanly (returns [] with no error).
    """
    try:
        adapter = adapter_cls()
        q: dict[str, Any] = {}
        if query.region:
            q["structure_acronym"] = query.region
        # Gene-symbol queries are out of scope for the public unified
        # query. If neither region nor a known gene is given, degrade.
        if not q:
            return [], None
        try:
            await adapter.connect()
        except Exception as exc:  # noqa: BLE001
            await _safe_disconnect(adapter)
            return [], f"allen_brain connect failed: {type(exc).__name__}"
        try:
            raw = await adapter.fetch(q)
        finally:
            await _safe_disconnect(adapter)
        results = []
        for row in raw or []:
            results.append(
                NeuroimagingSearchResult(
                    title=(
                        f"Allen Brain expression "
                        f"({row.get('structure_id', '?')})"
                    ),
                    source="allen_brain",
                    source_id=str(
                        row.get("probe_id")
                        or row.get("structure_id")
                        or row.get("id", "")
                    ),
                    population_tags=["postmortem", "adult"],
                    atlas_labels=(
                        [str(row.get("structure_id"))]
                        if row.get("structure_id")
                        else None
                    ),
                    access_notes="Allen Human Brain Atlas microarray data.",
                    provenance={
                        "source": "allen_brain",
                        "donor_id": row.get("donor_id"),
                    },
                )
            )
        return results, None
    except Exception as exc:  # noqa: BLE001
        logger.warning("allen_brain federation call failed: %s", exc)
        return [], f"allen_brain adapter error: {type(exc).__name__}"


async def _query_fcp_indi(
    query: NeuroimagingSearchQuery, adapter_cls: type
) -> tuple[list[NeuroimagingSearchResult], Optional[str]]:
    """Call the FCP-INDI legacy shim and normalize results."""
    try:
        adapter = adapter_cls()
        term = query.condition or query.region or ""
        filters: dict[str, Any] = {"search_type": "sites", "limit": query.limit}
        if query.population:
            # crude age-band mapping — adapter understands age_min/age_max
            if query.population.lower().startswith("adult"):
                filters["age_min"] = 18
        raw = await adapter.search(term, filters)
        results = []
        for row in raw or []:
            results.append(
                NeuroimagingSearchResult(
                    title=str(row.get("name") or row.get("site_code") or ""),
                    source="fcp_indi",
                    source_id=str(row.get("site_code") or row.get("id", "")),
                    modality="fMRI-BOLD",
                    population_tags=["adult", "healthy"],
                    access_notes="1000 Functional Connectomes / INDI open dataset.",
                    provenance={
                        "source": "fcp_indi",
                        "site_code": row.get("site_code"),
                    },
                )
            )
        await _safe_close(adapter)
        return results, None
    except Exception as exc:  # noqa: BLE001
        logger.warning("fcp_indi federation call failed: %s", exc)
        return [], f"fcp_indi adapter error: {type(exc).__name__}"


# ─── Helpers ─────────────────────────────────────────────────────────────


def _tags(*values: Optional[str]) -> list[str]:
    """Return non-empty stripped strings as a tag list."""
    out: list[str] = []
    for v in values:
        if v and isinstance(v, str) and v.strip():
            out.append(v.strip())
    return out


async def _safe_close(adapter: Any) -> None:
    """Best-effort ``close()`` for legacy adapters that hold httpx clients."""
    closer = getattr(adapter, "close", None)
    if closer is None:
        return
    try:
        result = closer()
        if inspect.isawaitable(result):
            await result
    except Exception:  # noqa: BLE001
        pass


async def _safe_disconnect(adapter: Any) -> None:
    """Best-effort ``disconnect()`` for canonical DatabaseAdapter instances."""
    disconnect = getattr(adapter, "disconnect", None)
    if disconnect is None:
        return
    try:
        result = disconnect()
        if inspect.isawaitable(result):
            await result
    except Exception:  # noqa: BLE001
        pass


# Wrapper registry — keyed by source id, valued by (wrapper_fn).
_WRAPPERS: dict[
    str,
    Callable[
        [NeuroimagingSearchQuery, type],
        Awaitable[tuple[list[NeuroimagingSearchResult], Optional[str]]],
    ],
] = {
    "neurovault": _query_neurovault,
    "openneuro": _query_openneuro,
    "neurosynth": _query_neurosynth,
    "allen_brain": _query_allen_brain,
    "fcp_indi": _query_fcp_indi,
}


# ─── Top-level federation entry point ────────────────────────────────────


async def federate(
    query: NeuroimagingSearchQuery,
    enabled_sources: list[dict[str, Any]],
    resolver: Optional[Callable[[str], Optional[type]]] = None,
) -> dict[str, Any]:
    """Run all enabled neuroimaging adapters concurrently and merge results.

    Parameters
    ----------
    query:
        The unified search query. Must not contain patient identifiers.
    enabled_sources:
        Inventory entries for sources with ``enabled=True`` and a live
        ``import_path``. The router computes this from
        :func:`app.services.knowledge.neuroimaging_inventory.list_enabled_sources`.
    resolver:
        Optional adapter-class resolver. Defaults to the module-local
        :func:`_resolve_adapter`. The router passes its own resolver so
        existing PR-1 tests that monkey-patch
        ``neuroimaging_router._resolve_adapter`` continue to work.

    Returns
    -------
    dict with keys:
        - ``results``       : list[NeuroimagingSearchResult] (merged)
        - ``source_status`` : list[dict] with id/name/status/result_count/error
        - ``warnings``      : list[str]
    """
    resolve = resolver or _resolve_adapter
    tasks: list[asyncio.Future] = []
    src_meta: list[dict[str, Any]] = []

    for src in enabled_sources:
        src_id = src["id"]
        wrapper = _WRAPPERS.get(src_id)
        if wrapper is None:
            # Healthy in inventory but no federation wrapper wired — log
            # and report as error (do NOT 500).
            tasks.append(_already_unavailable())
            src_meta.append(src)
            continue
        adapter_cls = resolve(src["import_path"])
        if adapter_cls is None:
            tasks.append(_already_unavailable())
            src_meta.append(src)
            continue
        tasks.append(
            _run_with_timeout(wrapper, query, adapter_cls, ADAPTER_TIMEOUT_SECONDS)
        )
        src_meta.append(src)

    raw = await asyncio.gather(*tasks, return_exceptions=True)

    all_results: list[NeuroimagingSearchResult] = []
    source_status: list[dict[str, Any]] = []
    warnings: list[str] = []

    for src, outcome in zip(src_meta, raw):
        src_id = src["id"]
        name = src["name"]
        if isinstance(outcome, Exception):
            # Should be unreachable given _run_with_timeout traps —
            # included as defence in depth.
            source_status.append(
                {
                    "id": src_id,
                    "name": name,
                    "status": "error",
                    "result_count": 0,
                    "error": type(outcome).__name__,
                }
            )
            warnings.append(f"{src_id}: {type(outcome).__name__}")
            continue
        results, status_str, err = outcome
        all_results.extend(results)
        source_status.append(
            {
                "id": src_id,
                "name": name,
                "status": status_str,
                "result_count": len(results),
                "error": err,
            }
        )
        if err:
            warnings.append(f"{src_id}: {err}")
        elif status_str == "degraded":
            warnings.append(f"{src_id}: no results for this query")

    return {
        "results": all_results,
        "source_status": source_status,
        "warnings": warnings,
    }


async def _already_unavailable() -> tuple[list[NeuroimagingSearchResult], str, str]:
    """Synthetic outcome for sources whose adapter could not be resolved.

    Returns ``status="error"`` (not ``"unavailable"``) to preserve
    contract compatibility with the PR-1 stub-era tests.
    """
    return [], "error", "adapter_import_failed"


async def _run_with_timeout(
    wrapper: Callable[
        [NeuroimagingSearchQuery, type],
        Awaitable[tuple[list[NeuroimagingSearchResult], Optional[str]]],
    ],
    query: NeuroimagingSearchQuery,
    adapter_cls: type,
    timeout_s: float,
) -> tuple[list[NeuroimagingSearchResult], str, Optional[str]]:
    """Wrap an adapter call with a hard timeout and exception trap.

    Returns ``(results, status_str, error_or_None)``.
    """
    try:
        results, err = await asyncio.wait_for(
            wrapper(query, adapter_cls), timeout=timeout_s
        )
    except asyncio.TimeoutError:
        return [], "timeout", f"adapter exceeded {timeout_s:.0f}s"
    except Exception as exc:  # noqa: BLE001 — defensive, must never bubble up
        logger.warning("federation wrapper unexpected error: %s", exc)
        return [], "error", f"unexpected_error: {type(exc).__name__}"
    if err:
        return results, "error", err
    if not results:
        return results, "degraded", None
    return results, "ok", None


__all__ = [
    "ADAPTER_TIMEOUT_SECONDS",
    "NeuroimagingSearchQuery",
    "NeuroimagingSearchResult",
    "federate",
]
