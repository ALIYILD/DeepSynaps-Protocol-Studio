"""Knowledge-adapter lifecycle state derivation.

Pure-function helpers that compute a normalized lifecycle state for every
catalogued / registered knowledge adapter. Consumed by:

- ``/api/v1/knowledge/live/adapters`` (and ``/_lifecycle``) for client-facing
  introspection.
- ``/health``, ``/healthz``, ``/api/v1/health`` for ops dashboards.

This module performs READ-ONLY introspection of registry state. It must
not trigger adapter instantiation, ``connect()``, or live health checks —
the goal is to keep health endpoints cheap and safe even when every
upstream API is unreachable.

The state vocabulary is part of the HTTP contract; values must remain
stable.
"""

from __future__ import annotations

import os
import threading
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Any, Dict, Iterable, List, Optional

if TYPE_CHECKING:  # pragma: no cover — type-only import
    from app.services.knowledge.adapter_registry import AdapterRegistry


class LifecycleState(str, Enum):
    """Normalized adapter lifecycle states (stable HTTP contract).

    This is the **public, coarse-grained** vocabulary surfaced via
    ``/health``, ``/api/v1/knowledge/live/adapters``, and the
    ``/_lifecycle`` summary endpoint. Values are part of the API
    contract and must remain stable.

    For the **internal, fine-grained** state machine that records
    every stage transition (including failure provenance with
    timestamps + traceback), see :class:`AdapterStage` below. The
    fine-grained stage of each adapter is mapped to one of these
    coarse values by :func:`stage_to_public_state` before being
    surfaced to clients.
    """

    CATALOGUED = "catalogued"
    REGISTERED = "registered"
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DISABLED = "disabled"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"


class AdapterStage(str, Enum):
    """Fine-grained adapter lifecycle stages — internal state machine.

    Drives the bootstrap pipeline and the per-adapter ledger. Each
    catalogued adapter transitions through progression stages until it
    reaches a terminal stage (either ``HEALTHY`` on success or one of
    the ``FAILED_*`` stages on failure).

    The vocabulary is intentionally richer than :class:`LifecycleState`
    so operators can tell at a glance *which step* of the bootstrap
    pipeline failed for a given adapter. The public ``/health`` payload
    keeps using ``LifecycleState`` for backward compatibility; the
    ledger and per-adapter detail endpoints expose the fine-grained
    stage directly.

    Progression (happy-path):
        DECLARED  →  IMPORTED  →  INSTANTIATED  →  VALIDATED
                  →  METADATA_RESOLVED  →  REGISTERED  →  HEALTHY

    Failure stages (terminal — each captures the step that failed):
        FAILED_IMPORT, FAILED_INIT, FAILED_VALIDATION, FAILED_METADATA,
        FAILED_HEALTHCHECK.

    Operator-driven stages:
        DISABLED  — explicit config flag, set without attempting the rest
        DEGRADED  — registered + reachable but reporting partial health
        UNKNOWN   — fallback when no signal exists yet
    """

    # Progression
    DECLARED = "declared"
    IMPORTED = "imported"
    INSTANTIATED = "instantiated"
    VALIDATED = "validated"
    METADATA_RESOLVED = "metadata_resolved"
    REGISTERED = "registered"
    HEALTHY = "healthy"

    # Failure (terminal)
    FAILED_IMPORT = "failed_import"
    FAILED_INIT = "failed_init"
    FAILED_VALIDATION = "failed_validation"
    FAILED_METADATA = "failed_metadata"
    FAILED_HEALTHCHECK = "failed_healthcheck"

    # Operator-driven
    DISABLED = "disabled"
    DEGRADED = "degraded"
    UNKNOWN = "unknown"


# Mapping from fine-grained stage → coarse public state. The public
# /health payload uses this so backward-compatible 7-state buckets
# work even after the bootstrap pipeline starts emitting fine-grained
# stages.
_STAGE_TO_PUBLIC_STATE: Dict[AdapterStage, LifecycleState] = {
    AdapterStage.DECLARED: LifecycleState.CATALOGUED,
    AdapterStage.IMPORTED: LifecycleState.CATALOGUED,
    AdapterStage.INSTANTIATED: LifecycleState.REGISTERED,
    AdapterStage.VALIDATED: LifecycleState.REGISTERED,
    AdapterStage.METADATA_RESOLVED: LifecycleState.REGISTERED,
    AdapterStage.REGISTERED: LifecycleState.REGISTERED,
    AdapterStage.HEALTHY: LifecycleState.HEALTHY,
    AdapterStage.FAILED_IMPORT: LifecycleState.UNAVAILABLE,
    AdapterStage.FAILED_INIT: LifecycleState.UNAVAILABLE,
    AdapterStage.FAILED_VALIDATION: LifecycleState.UNAVAILABLE,
    AdapterStage.FAILED_METADATA: LifecycleState.UNAVAILABLE,
    AdapterStage.FAILED_HEALTHCHECK: LifecycleState.UNAVAILABLE,
    AdapterStage.DISABLED: LifecycleState.DISABLED,
    AdapterStage.DEGRADED: LifecycleState.DEGRADED,
    AdapterStage.UNKNOWN: LifecycleState.UNKNOWN,
}


def stage_to_public_state(stage: AdapterStage) -> LifecycleState:
    """Map a fine-grained stage to the coarse public lifecycle state."""
    return _STAGE_TO_PUBLIC_STATE.get(stage, LifecycleState.UNKNOWN)


# Stages that mark the end of the lifecycle (success or terminal failure).
# A ledger whose latest record is a terminal stage will not see further
# transitions unless the registry is rebuilt.
TERMINAL_STAGES: frozenset = frozenset(
    {
        AdapterStage.HEALTHY,
        AdapterStage.FAILED_IMPORT,
        AdapterStage.FAILED_INIT,
        AdapterStage.FAILED_VALIDATION,
        AdapterStage.FAILED_METADATA,
        AdapterStage.FAILED_HEALTHCHECK,
        AdapterStage.DISABLED,
    }
)


# Stages that indicate failure of any kind. Operators use this to count
# "things to investigate" without enumerating each failure variant.
FAILURE_STAGES: frozenset = frozenset(
    {
        AdapterStage.FAILED_IMPORT,
        AdapterStage.FAILED_INIT,
        AdapterStage.FAILED_VALIDATION,
        AdapterStage.FAILED_METADATA,
        AdapterStage.FAILED_HEALTHCHECK,
    }
)


@dataclass(frozen=True)
class AdapterLifecycleRecord:
    """One immutable transition into a stage.

    Records are append-only. The ledger for an adapter is the full
    ordered list of records — the *terminal* record is the most recent
    one, and that's what consumers care about.

    Failure provenance fields (``error_message``, ``traceback_snapshot``)
    are populated only when the stage is one of :data:`FAILURE_STAGES`;
    they remain ``None`` for progression stages.
    """

    key: str
    stage: AdapterStage
    entered_at: datetime
    previous_stage: Optional[AdapterStage] = None
    duration_ms: Optional[float] = None
    error_message: Optional[str] = None
    traceback_snapshot: Optional[str] = None
    adapter_version: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "stage": self.stage.value,
            "previous_stage": (
                self.previous_stage.value if self.previous_stage else None
            ),
            "entered_at": self.entered_at.isoformat(),
            "duration_ms": self.duration_ms,
            "error_message": self.error_message,
            "traceback_snapshot": self.traceback_snapshot,
            "adapter_version": self.adapter_version,
        }


class AdapterLifecycleLedger:
    """Process-wide append-only ledger of adapter stage transitions.

    Thread-safe. Singleton at module level — accessed via
    :func:`get_ledger` (do not instantiate directly outside tests).

    Stores one entry per stage transition, keyed by adapter key. Useful
    for:

    * `/api/v1/knowledge/live/adapters/<key>/lifecycle` debug endpoints
    * Coarse health summaries (current stage per adapter)
    * Forensics after a failed bootstrap (timestamp + traceback per failure)

    The ledger is cleared on registry rebuild via :meth:`reset`. Tests
    that monkeypatch the bootstrap singleton should also call reset to
    avoid stale data leaking between tests.
    """

    def __init__(self) -> None:
        self._records: List[AdapterLifecycleRecord] = []
        self._lock = threading.RLock()

    def record(
        self,
        key: str,
        stage: AdapterStage,
        *,
        previous_stage: Optional[AdapterStage] = None,
        duration_ms: Optional[float] = None,
        error: Optional[BaseException] = None,
        adapter_version: Optional[str] = None,
    ) -> AdapterLifecycleRecord:
        """Append a transition record for ``key`` entering ``stage``.

        When ``stage`` is a failure stage, ``error`` must be set so the
        message + traceback are captured. The caller is responsible for
        deciding when transitions happen; this class does not enforce
        ordering rules beyond append-only semantics.
        """
        if stage in FAILURE_STAGES and error is None:
            # Soft check — fail loudly in tests if a caller forgot the
            # error, but don't refuse to record. The traceback would be
            # blank in that case, which is enough signal at review.
            error_message: Optional[str] = "<no error supplied>"
            tb_snapshot: Optional[str] = None
        elif error is not None:
            error_message = f"{type(error).__name__}: {error}"
            tb_snapshot = "".join(
                traceback.format_exception(type(error), error, error.__traceback__)
            )
        else:
            error_message = None
            tb_snapshot = None

        record = AdapterLifecycleRecord(
            key=key,
            stage=stage,
            entered_at=datetime.now(timezone.utc),
            previous_stage=previous_stage,
            duration_ms=duration_ms,
            error_message=error_message,
            traceback_snapshot=tb_snapshot,
            adapter_version=adapter_version,
        )
        with self._lock:
            self._records.append(record)
        return record

    def for_key(self, key: str) -> List[AdapterLifecycleRecord]:
        """All records for ``key`` in chronological order. Empty if none."""
        with self._lock:
            return [r for r in self._records if r.key == key]

    def latest_for_key(self, key: str) -> Optional[AdapterLifecycleRecord]:
        """Most recent record for ``key``, or ``None`` if no records exist."""
        with self._lock:
            for r in reversed(self._records):
                if r.key == key:
                    return r
        return None

    def latest_stage_for_key(self, key: str) -> Optional[AdapterStage]:
        """Most recent stage for ``key``."""
        latest = self.latest_for_key(key)
        return latest.stage if latest else None

    def all_records(self) -> List[AdapterLifecycleRecord]:
        """Snapshot of every record across every key."""
        with self._lock:
            return list(self._records)

    def reset(self) -> None:
        """Drop every record. Used at registry rebuild."""
        with self._lock:
            self._records.clear()


# Process-wide ledger singleton. Tests reset it via reset().
_ledger: AdapterLifecycleLedger = AdapterLifecycleLedger()


def get_ledger() -> AdapterLifecycleLedger:
    """Return the process-wide ledger singleton."""
    return _ledger


def record_stage(
    key: str,
    stage: AdapterStage,
    *,
    previous_stage: Optional[AdapterStage] = None,
    duration_ms: Optional[float] = None,
    error: Optional[BaseException] = None,
    adapter_version: Optional[str] = None,
) -> AdapterLifecycleRecord:
    """Convenience: record a stage on the singleton ledger."""
    return _ledger.record(
        key,
        stage,
        previous_stage=previous_stage,
        duration_ms=duration_ms,
        error=error,
        adapter_version=adapter_version,
    )


_OK_STATUS_VALUES = frozenset({"ok", "healthy", "up", "ready", "green", "operational"})
_DEGRADED_STATUS_VALUES = frozenset(
    {"degraded", "warn", "warning", "partial", "yellow", "stale"}
)
_DOWN_STATUS_VALUES = frozenset(
    {"down", "error", "fail", "failed", "unavailable", "red", "offline"}
)


# Env var name to mark adapter keys as DISABLED. Comma-separated list, e.g.:
#     DEEPSYNAPS_DISABLED_KNOWLEDGE_ADAPTERS=gnomad,cochrane
# Disabled adapters are skipped at registry build time AND surfaced as
# DISABLED (not CATALOGUED) by lifecycle inspection so operators can tell
# "missing because we turned it off" from "missing because it failed to
# instantiate".
DISABLED_ADAPTERS_ENV = "DEEPSYNAPS_DISABLED_KNOWLEDGE_ADAPTERS"


def read_disabled_adapter_keys(
    env: Optional[Dict[str, str]] = None,
) -> frozenset:
    """Return the set of adapter keys disabled via env var.

    ``env`` is injectable for tests. Empty / unset → empty set.
    """
    raw = (env or os.environ).get(DISABLED_ADAPTERS_ENV, "") or ""
    return frozenset(token.strip() for token in raw.split(",") if token.strip())


def derive_state_from_health(cached: Optional[Dict[str, Any]]) -> LifecycleState:
    """Map a cached health-check dict to a ``LifecycleState``.

    Pure function — no I/O. ``cached`` is whatever the registry stored from
    the adapter's ``health_check()`` (possibly an error sentinel).
    """
    if not cached:
        return LifecycleState.UNKNOWN

    status = str(cached.get("status", "")).strip().lower()
    if status in _DEGRADED_STATUS_VALUES:
        return LifecycleState.DEGRADED
    if status in _DOWN_STATUS_VALUES:
        return LifecycleState.UNAVAILABLE
    if status in _OK_STATUS_VALUES:
        return LifecycleState.HEALTHY

    if cached.get("error"):
        return LifecycleState.UNAVAILABLE
    connected = cached.get("connected")
    if connected is True and status == "":
        return LifecycleState.HEALTHY
    if connected is False:
        return LifecycleState.UNAVAILABLE

    return LifecycleState.UNKNOWN


def compute_registry_lifecycle(
    registry: "AdapterRegistry",
    *,
    catalog_keys: Optional[Iterable[str]] = None,
    disabled_keys: Optional[Iterable[str]] = None,
) -> Dict[str, LifecycleState]:
    """Compute per-adapter lifecycle state from registry + catalog metadata.

    Args:
        registry: Live ``AdapterRegistry`` to inspect (read-only).
        catalog_keys: Static catalog of expected adapter keys. Catalogued
            keys not present in the registry are surfaced as ``CATALOGUED``.
        disabled_keys: Keys explicitly disabled via config. They show up as
            ``DISABLED`` (instead of ``CATALOGUED``) when missing from the
            registry. A disabled key that is somehow ALSO registered is
            still reported by its health state — the disable flag controls
            labelling of *absent* adapters only.

    The function consults the process-wide :class:`AdapterLifecycleLedger`
    for any key that has a recorded terminal stage and prefers that
    signal over the heuristic derived from ``list_adapters()`` +
    ``get_all_cached_health()``. This means an adapter that recorded
    ``FAILED_INIT`` at bootstrap shows up as ``UNAVAILABLE`` here, not
    silently as ``CATALOGUED`` (the pre-Phase-1 behaviour).

    Returns:
        Mapping of adapter key → ``LifecycleState``. Read-only operation.
    """
    states: Dict[str, LifecycleState] = {}
    registered_names = set(registry.list_adapters())
    catalog_set = set(catalog_keys or ())
    disabled_set = set(disabled_keys or ())
    ledger = get_ledger()

    missing_keys = (catalog_set | disabled_set) - registered_names
    for key in missing_keys:
        latest_stage = ledger.latest_stage_for_key(key)
        if latest_stage is not None and latest_stage in (
            FAILURE_STAGES | {AdapterStage.DISABLED}
        ):
            # Authoritative terminal stage from the ledger trumps the
            # heuristic. This is how FAILED_INIT etc. surface as
            # UNAVAILABLE on /health rather than being hidden as
            # CATALOGUED.
            states[key] = stage_to_public_state(latest_stage)
        elif key in disabled_set:
            states[key] = LifecycleState.DISABLED
        else:
            states[key] = LifecycleState.CATALOGUED

    cached_health = registry.get_all_cached_health()
    for name in registered_names:
        cached = cached_health.get(name)
        latest_stage = ledger.latest_stage_for_key(name)
        if cached is not None:
            states[name] = derive_state_from_health(cached)
        elif latest_stage is not None:
            states[name] = stage_to_public_state(latest_stage)
        else:
            states[name] = LifecycleState.REGISTERED

    return states


def summarize_lifecycle(
    states: Dict[str, LifecycleState],
) -> Dict[str, Any]:
    """Aggregate a ``{key → state}`` mapping into a compact summary."""
    by_state: Dict[str, int] = {member.value: 0 for member in LifecycleState}
    for state in states.values():
        by_state[state.value] = by_state.get(state.value, 0) + 1
    return {
        "total": len(states),
        "by_state": by_state,
        "adapters": {key: state.value for key, state in states.items()},
    }


def peek_registry_lifecycle_summary() -> Dict[str, Any]:
    """Side-effect-free peek at the production registry lifecycle.

    Reads the bootstrap singleton without acquiring its async lock and
    never triggers adapter instantiation, ``connect()``, or live health
    checks. Safe to call from synchronous handlers like ``/health``.

    When the production registry has not been built yet (e.g., the first
    HTTP call to ``/api/v1/knowledge/live/*`` is still in flight on a
    cold container), every catalogued adapter is reported as ``CATALOGUED``
    and every disabled key as ``DISABLED``.
    """
    from app.services.knowledge import adapter_bootstrap as _bootstrap

    catalog_keys = list(_bootstrap.list_production_adapter_keys())
    disabled_keys = read_disabled_adapter_keys()

    registry = _bootstrap._registry  # singleton snapshot; None before build
    if registry is None:
        states: Dict[str, LifecycleState] = {}
        for key in catalog_keys:
            if key in disabled_keys:
                states[key] = LifecycleState.DISABLED
            else:
                states[key] = LifecycleState.CATALOGUED
    else:
        states = compute_registry_lifecycle(
            registry,
            catalog_keys=catalog_keys,
            disabled_keys=disabled_keys,
        )

    return summarize_lifecycle(states)


__all__: List[str] = [
    "DISABLED_ADAPTERS_ENV",
    "FAILURE_STAGES",
    "TERMINAL_STAGES",
    "AdapterLifecycleLedger",
    "AdapterLifecycleRecord",
    "AdapterStage",
    "LifecycleState",
    "compute_registry_lifecycle",
    "derive_state_from_health",
    "get_ledger",
    "peek_registry_lifecycle_summary",
    "read_disabled_adapter_keys",
    "record_stage",
    "stage_to_public_state",
    "summarize_lifecycle",
]
