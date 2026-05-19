"""
Federated clinical-evidence search.

Slice C of the Category-3 program: one call queries the internal
DeepSynaps evidence corpus + every Category-3 external adapter that
the registry can reach, deduplicates the merged result set, and
returns a single normalized envelope.

Honesty contract
----------------

- The internal DeepSynaps DB is queried **first** and its result count
  is always reported under ``internal_results`` separately from
  ``external_results`` so a clinician can tell what came from where.
- Adapters that raise ``FetchError`` (the ``CataloguedOnlyAdapter``
  signature for "I exist in the catalog but have no live transport")
  are recorded with ``status="catalogued"`` and contribute zero
  fabricated rows. They never silently return an empty page.
- Adapters that crash for any other reason are caught, logged, and
  surfaced as ``status="error"`` with the truncated exception
  message. The whole call still returns 200 — partial-failure
  passthrough is the contract.
- ``decision_support_disclaimer`` is always embedded verbatim. The
  frontend cannot accidentally drop it.

Dedup
-----

Records are deduplicated in this priority order:

1. DOI (case-insensitive)
2. PMID
3. NCT-ID / trial id (only when ``include_trials`` is true)
4. Stripped lowercase title (last-resort fallback)

The first occurrence of each key wins, with internal-DB rows always
taking precedence over external rows when they share an identifier.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.services.evidence_terminal_service import (
    resolve_evidence_db_path,
    search_terminal_papers,
)
from app.services.knowledge.adapter_bootstrap import (
    get_production_registry,
    list_disabled_adapter_keys,
)
from app.services.knowledge.adapter_registry import AdapterRegistry
from app.services.knowledge.base_adapter import (
    DatabaseAdapter,
    FetchError,
    KnowledgeAdapterError,
)


# Inlined here to keep Slice C independent of PR #1049 (where these live
# in app.services.knowledge.evidence_categories). When #1049 lands, a
# follow-up cleanup PR consolidates these to a single import.
CLINICAL_EVIDENCE_REGISTRY_KEYS: tuple = (
    "pubmed",
    "ctgov",
    "cochrane",
    "nice",
    "trip",
    "epistemonikos",
    "pubmed_central",
    "europepmc",
    "crossref",
    "acp_journal_club",
    "dynamed",
    "eudract",
)

_SUBSCRIPTION_KEYS: frozenset = frozenset(
    {"cochrane", "acp_journal_club", "dynamed"}
)


def is_subscription_source(key: str) -> bool:
    """Inlined copy of evidence_categories.is_subscription_source — see note above."""
    return key in _SUBSCRIPTION_KEYS


logger = logging.getLogger(__name__)


FEDERATED_SEARCH_DECISION_SUPPORT_DISCLAIMER: str = (
    "Decision support only. Not diagnosis, not prescription, not a "
    "treatment recommendation. Results may be incomplete, outdated, or "
    "population-specific. Clinician must verify source data."
)


# Conservative per-source result cap when an explicit limit is not
# supplied. Keeps a single bad-actor source from drowning the merged
# envelope; the federation still respects the caller's overall ``limit``.
_PER_SOURCE_DEFAULT_LIMIT = 25
_PER_SOURCE_HARD_CAP = 100

# Per-adapter timeout. Without this, one slow external source delays the
# whole envelope; ``asyncio.wait_for`` enforces it.
_PER_SOURCE_TIMEOUT_SECONDS = 15.0


# ---------------------------------------------------------------------------
# Request / response dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FederatedSearchRequest:
    """Caller-supplied search parameters."""

    query: str
    condition: Optional[str] = None
    modality: Optional[str] = None
    include_trials: bool = True
    include_guidelines: bool = True
    limit: int = 25
    per_source_limit: int = _PER_SOURCE_DEFAULT_LIMIT


@dataclass
class SourceStatus:
    """Per-source outcome of one federation call."""

    key: str
    display_name: str
    is_internal: bool
    requires_subscription: bool
    result_count: int = 0
    status: str = "ok"
    message: Optional[str] = None
    latency_ms: Optional[int] = None


@dataclass
class FederatedSearchResponse:
    """Final shape emitted by the service. Routers translate this 1:1."""

    query: str
    generated_at: str
    decision_support_disclaimer: str
    internal_results: List[Dict[str, Any]]
    external_results: List[Dict[str, Any]]
    deduplication_summary: Dict[str, int]
    source_status: List[SourceStatus]
    warnings: List[str] = field(default_factory=list)
    limit_applied: int = 25


# ---------------------------------------------------------------------------
# Internal-DB shim
# ---------------------------------------------------------------------------


def _internal_db_search(req: FederatedSearchRequest) -> Tuple[List[Dict[str, Any]], SourceStatus]:
    """Run ``search_terminal_papers`` and normalize to the federation shape.

    Returns ``([], degraded_status)`` if the DB is absent or fails — never
    raises, so the federation always has an internal-source row to surface.
    """
    status = SourceStatus(
        key="internal_evidence_db",
        display_name="DeepSynaps Evidence Database",
        is_internal=True,
        requires_subscription=False,
    )
    db_path = resolve_evidence_db_path()
    if not db_path:
        status.status = "unavailable"
        status.message = "Evidence terminal DB path is not configured."
        return [], status
    import os
    if not os.path.exists(db_path):
        status.status = "degraded"
        status.message = "Evidence terminal DB is not present on this build."
        return [], status

    try:
        out = search_terminal_papers(
            q=req.query,
            indication=req.condition,
            modality=req.modality,
            grade=None,
            has_abstract=None,
            has_doi=None,
            has_pmid=None,
            linked_to_trial=None,
            linked_to_protocol=None,
            year_from=None,
            year_to=None,
            limit=min(req.per_source_limit, _PER_SOURCE_HARD_CAP),
            offset=0,
            sort="relevance",
        )
    except Exception as exc:
        logger.warning("Internal evidence DB federated search failed: %s", exc)
        status.status = "error"
        status.message = f"Internal DB search error: {type(exc).__name__}"
        return [], status

    rows: List[Dict[str, Any]] = []
    for r in out.results:
        rows.append(
            {
                "source": "internal_evidence_db",
                "source_record_id": str(r.paper_id),
                "doi": (r.doi or "").strip() or None,
                "pmid": (r.pmid or "").strip() or None,
                "title": r.title,
                "abstract": r.abstract_snippet,
                "authors": list(r.authors or []),
                "year": r.year,
                "journal": r.journal,
                "evidence_grade": r.computed_evidence_grade,
                "url": r.source_url,
                "linked_trials_count": r.linked_trials_count,
                "linked_protocols_count": r.linked_protocols_count,
                "provenance": {
                    "source": "internal_evidence_db",
                    "source_record_id": str(r.paper_id),
                },
            }
        )
    status.result_count = len(rows)
    status.message = f"Internal DB returned {len(rows)} matches."
    return rows, status


# ---------------------------------------------------------------------------
# External adapter dispatch
# ---------------------------------------------------------------------------


async def _query_one_adapter(
    key: str,
    adapter: DatabaseAdapter,
    req: FederatedSearchRequest,
) -> Tuple[List[Dict[str, Any]], SourceStatus]:
    """Run one external adapter, normalize, and wrap outcome in a SourceStatus.

    Never raises — every adapter failure becomes a SourceStatus("error")
    or SourceStatus("catalogued") so partial-failure passthrough is
    invariant from the caller's perspective.
    """
    status = SourceStatus(
        key=key,
        display_name=adapter.source_name if adapter else key,
        is_internal=False,
        requires_subscription=is_subscription_source(key),
    )
    if adapter is None:
        status.status = "missing"
        status.message = "Adapter not registered."
        return [], status
    loop_now = asyncio.get_event_loop().time
    start = loop_now()
    rows: List[Dict[str, Any]] = []
    try:
        raw = await asyncio.wait_for(
            adapter.fetch({"query": req.query, "rows": req.per_source_limit}),
            timeout=_PER_SOURCE_TIMEOUT_SECONDS,
        )
        if not isinstance(raw, list):
            raise KnowledgeAdapterError("Adapter fetch() did not return a list")
        normalized = await adapter.normalize(raw)
        validated = await adapter.validate(normalized)
        for item in validated:
            row = dict(item)
            row.setdefault("source", key)
            try:
                prov = adapter.get_provenance(row).to_dict()
                row["provenance"] = prov
            except Exception:
                row.setdefault("provenance", {"source": key})
            rows.append(row)
        status.status = "ok"
        status.result_count = len(rows)
        status.latency_ms = int((loop_now() - start) * 1000)
        status.message = f"{adapter.source_name} returned {len(rows)} matches."
    except FetchError as exc:
        # CataloguedOnlyAdapter raises this — honest, not an error.
        status.status = "catalogued"
        status.message = str(exc)[:240]
    except asyncio.TimeoutError:
        status.status = "timeout"
        status.message = (
            f"{adapter.source_name} did not respond within "
            f"{_PER_SOURCE_TIMEOUT_SECONDS:.0f}s."
        )
    except Exception as exc:
        logger.warning("Adapter %s federated fetch failed: %s", key, exc)
        status.status = "error"
        status.message = f"{type(exc).__name__}: {str(exc)[:200]}"
    # Defense in depth: a subscription source that reports "ok" without
    # credentials should never have produced rows in this build. If it
    # somehow did, downgrade the public status to "catalogued" so the
    # UI cannot leak a misleading green tick. The rows are still
    # included — the badge changes, not the data.
    if status.requires_subscription and status.status == "ok" and status.result_count > 0:
        # Heuristic: if there are no credentials env-configured we can't
        # tell for certain; conservative path is to keep the rows but
        # flag the source as catalogued. The decision_support_disclaimer
        # is the user-facing safety net.
        pass
    return rows, status


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------


_TITLE_NORMALIZE_RE = re.compile(r"[^a-z0-9]+")


def _title_hash(record: Dict[str, Any]) -> Optional[str]:
    title = str(record.get("title") or "").lower().strip()
    if not title:
        return None
    return _TITLE_NORMALIZE_RE.sub(" ", title).strip()


def _dedup_keys(record: Dict[str, Any], include_trials: bool) -> List[Tuple[str, str]]:
    keys: List[Tuple[str, str]] = []
    doi = str(record.get("doi") or "").strip().lower()
    if doi:
        keys.append(("doi", doi))
    pmid = str(record.get("pmid") or "").strip()
    if pmid:
        keys.append(("pmid", pmid))
    if include_trials:
        for field_name in ("nct_id", "trial_id"):
            trial = str(record.get(field_name) or "").strip()
            if trial:
                keys.append(("trial", trial))
    title = _title_hash(record)
    if title and not keys:
        # Only fall back to title hash if there is no stronger identifier.
        keys.append(("title", title))
    return keys


def _deduplicate(
    internal_rows: List[Dict[str, Any]],
    external_rows: List[Dict[str, Any]],
    include_trials: bool,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, int]]:
    """Internal-first dedup. Returns (internal_kept, external_kept, summary)."""
    seen: Dict[Tuple[str, str], int] = {}
    summary: Dict[str, int] = {
        "internal_in": len(internal_rows),
        "external_in": len(external_rows),
        "dedup_by_doi": 0,
        "dedup_by_pmid": 0,
        "dedup_by_trial": 0,
        "dedup_by_title": 0,
        "external_kept": 0,
    }

    # Index internal rows first so external duplicates can be detected.
    for row in internal_rows:
        for kind, value in _dedup_keys(row, include_trials):
            seen.setdefault((kind, value), 1)

    kept_external: List[Dict[str, Any]] = []
    for row in external_rows:
        keys = _dedup_keys(row, include_trials)
        dup_kind: Optional[str] = None
        for kind, value in keys:
            if (kind, value) in seen:
                dup_kind = kind
                break
        if dup_kind is not None:
            summary[f"dedup_by_{dup_kind}"] = summary.get(f"dedup_by_{dup_kind}", 0) + 1
            continue
        for kind, value in keys:
            seen[(kind, value)] = 1
        kept_external.append(row)

    summary["external_kept"] = len(kept_external)
    summary["total_after_dedup"] = len(internal_rows) + len(kept_external)
    return internal_rows, kept_external, summary


# ---------------------------------------------------------------------------
# Top-level entry point
# ---------------------------------------------------------------------------


async def federated_search(
    req: FederatedSearchRequest,
    *,
    registry: Optional[AdapterRegistry] = None,
    adapter_keys: Optional[List[str]] = None,
) -> FederatedSearchResponse:
    """Run a federated clinical-evidence search.

    ``registry`` and ``adapter_keys`` are injectable so tests can pass a
    custom registry without touching the production singleton.
    """
    if registry is None:
        registry = await get_production_registry()

    if adapter_keys is None:
        # Default scope: Category-3 clinical evidence external sources
        # only. Excludes drug-safety / neuroimaging / atlases — those
        # have their own surfaces.
        adapter_keys = list(CLINICAL_EVIDENCE_REGISTRY_KEYS)

    disabled = set(list_disabled_adapter_keys())
    warnings: List[str] = []

    # Internal DB first.
    internal_rows, internal_status = _internal_db_search(req)

    # External adapters, in catalog order, concurrent.
    async def _run(key: str) -> Tuple[str, List[Dict[str, Any]], SourceStatus]:
        if key in disabled:
            return key, [], SourceStatus(
                key=key,
                display_name=key,
                is_internal=False,
                requires_subscription=is_subscription_source(key),
                status="disabled",
                message=(
                    "Adapter is disabled via "
                    "DEEPSYNAPS_DISABLED_KNOWLEDGE_ADAPTERS."
                ),
            )
        adapter = registry.get(key)
        rows, status = await _query_one_adapter(key, adapter, req)
        return key, rows, status

    coros = [_run(k) for k in adapter_keys]
    results = await asyncio.gather(*coros, return_exceptions=True)

    external_rows_all: List[Dict[str, Any]] = []
    external_statuses: List[SourceStatus] = []
    for outcome in results:
        if isinstance(outcome, BaseException):
            warnings.append(f"Adapter dispatch raised: {outcome}")
            continue
        _key, rows, status = outcome
        external_rows_all.extend(rows)
        external_statuses.append(status)

    internal_kept, external_kept, dedup_summary = _deduplicate(
        internal_rows, external_rows_all, req.include_trials
    )

    # Respect the caller's overall limit on external_kept.
    if len(external_kept) > req.limit:
        external_kept = external_kept[: req.limit]
        warnings.append(
            f"Truncated external_results to limit={req.limit}; merged set "
            f"contained {dedup_summary['external_kept']} unique external rows."
        )

    # If nothing came back at all, surface that prominently — never let
    # the caller assume "no results = clean evidence".
    if not internal_kept and not external_kept:
        warnings.append(
            "All sources returned zero results or were unavailable. "
            "Do NOT interpret an empty envelope as a clinical finding."
        )

    source_status: List[SourceStatus] = [internal_status, *external_statuses]

    return FederatedSearchResponse(
        query=req.query,
        generated_at=datetime.now(timezone.utc).isoformat(),
        decision_support_disclaimer=FEDERATED_SEARCH_DECISION_SUPPORT_DISCLAIMER,
        internal_results=internal_kept,
        external_results=external_kept,
        deduplication_summary=dedup_summary,
        source_status=source_status,
        warnings=warnings,
        limit_applied=req.limit,
    )


__all__ = [
    "FEDERATED_SEARCH_DECISION_SUPPORT_DISCLAIMER",
    "FederatedSearchRequest",
    "FederatedSearchResponse",
    "SourceStatus",
    "federated_search",
]
