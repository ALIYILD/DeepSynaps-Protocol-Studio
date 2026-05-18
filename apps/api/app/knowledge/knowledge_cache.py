#!/usr/bin/env python3
"""
DeepSynaps Knowledge Cache -- Production-Grade Redis Caching for 66 Adapters
============================================================================

A high-performance, async Redis-backed caching layer for external database
adapter responses. Features per-adapter TTL, cache key hashing, hit/miss
tracking, memory-aware eviction, cache warming, batch operations, and
circuit-breaker integration.

Architecture::

    Adapter Request → Cache Check → [HIT] Return cached
                                  → [MISS] Query adapter → Store → Return

Usage::

    cache = KnowledgeCache(redis_url="redis://localhost:6379")
    result = await cache.get("pubmed", "cancer immunotherapy")
    if result is None:
        data = await adapter.query("cancer immunotherapy")
        await cache.set("pubmed", "cancer immunotherapy", data)
        result = data

Author: DeepSynps Engineering
Version: 1.0.0
"""

from __future__ import annotations

__version__ = "1.0.0"

import asyncio
import hashlib
import json
import logging
import pickle
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import (
    Any,
    Callable,
    Coroutine,
    Dict,
    Generic,
    List,
    Optional,
    Protocol,
    Sequence,
    Set,
    Tuple,
    TypeVar,
    Union,
)

import redis.asyncio as redis_lib
from redis.asyncio.client import Redis
from redis.asyncio.connection import ConnectionPool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Type variables
# ---------------------------------------------------------------------------
T = TypeVar("T")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Redis key prefix to avoid collisions with other apps
_KEY_PREFIX: str = "ds:knowledge:v1"

# Separator used in cache key construction
_KEY_SEP: str = "::"

# Maximum number of keys to scan per batch during invalidation
_SCAN_COUNT: int = 500

# Default batch size for bulk operations
_BATCH_SIZE: int = 100

# Memory pressure thresholds (fraction of maxmemory)
_MEM_WARN_THRESHOLD: float = 0.75
_MEM_CRITICAL_THRESHOLD: float = 0.90

# ---------------------------------------------------------------------------
# Adapter TTL configuration -- tuned per source volatility
# ---------------------------------------------------------------------------
# fmt: off
ADAPTER_TTL: Dict[str, int] = {
    # Biomedical literature -- daily updates
    "pubmed":            3_600,    # 1 hour
    "pubmed_central":    7_200,    # 2 hours
    " Europe_pmc":       7_200,    # 2 hours
    "bioarxiv":          1_800,    # 30 minutes
    "medrxiv":           1_800,    # 30 minutes
    "arxiv":             3_600,    # 1 hour
    "ieee":              7_200,    # 2 hours
    "springer":          7_200,    # 2 hours
    "nature":            3_600,    # 1 hour
    "science_direct":    7_200,    # 2 hours
    "wiley":             7_200,    # 2 hours
    "biorxiv":           1_800,    # 30 minutes
    "chemrxiv":          1_800,    # 30 minutes
    "jstor":             86_400,   # 24 hours
    "google_scholar":    1_800,    # 30 minutes

    # Clinical trials -- weekly updates
    "clinicaltrials":    7_200,    # 2 hours
    "who_ictrp":         14_400,   # 4 hours
    "eu_ct":             14_400,   # 4 hours
    "ct_gov":            7_200,    # 2 hours

    # Drug databases -- stable, long TTL
    "drugbank":          86_400,   # 24 hours
    "rxnorm":            86_400,   # 24 hours
    "openfda":           1_800,    # 30 minutes -- real-time alerts
    "faers":             3_600,    # 1 hour -- quarterly updates
    "chembl":            86_400,   # 24 hours
    "pubchem":           86_400,   # 24 hours
    "kegg":              86_400,   # 24 hours
    "atc":               172_800,  # 48 hours
    "unii":              172_800,  # 48 hours
    "meddra":            172_800,  # 48 hours
    "snomed_ct":         86_400,   # 24 hours
    "icd10":             172_800,  # 48 hours
    "icd9":              172_800,  # 48 hours
    "loinc":             86_400,   # 24 hours
    "mesh":              86_400,   # 24 hours
    "umls":              86_400,   # 24 hours

    # Neuroimaging / brain databases
    "neurosynth":        86_400,   # 24 hours -- meta-analysis stable
    "neurovault":        3_600,    # 1 hour
    "brainmap":          86_400,   # 24 hours
    "hcp":               86_400,   # 24 hours
    "hcp_dev":           86_400,   # 24 hours
    "hcp_aging":         86_400,   # 24 hours
    "adni":              86_400,   # 24 hours
    "abide":             86_400,   # 24 hours
    "abide2":            86_400,   # 24 hours
    "openneuro":         3_600,    # 1 hour
    "nidm":              86_400,   # 24 hours
    "fmridb":            86_400,   # 24 hours

    # Genomics / proteomics
    "ncbi_gene":         86_400,   # 24 hours
    "ensembl":           86_400,   # 24 hours
    "uniprot":           86_400,   # 24 hours
    "genecards":         86_400,   # 24 hours
    "dbsnp":             172_800,  # 48 hours
    "clinvar":           7_200,    # 2 hours
    "gnomad":            86_400,   # 24 hours
    "gtex":              86_400,   # 24 hours
    "string_db":         86_400,   # 24 hours
    "reactome":          86_400,   # 24 hours

    # Pathways / ontologies
    "go":                86_400,   # 24 hours
    "kegg_pathway":      86_400,   # 24 hours
    "wiki_pathways":     86_400,   # 24 hours
    "pathway_commons":   86_400,   # 24 hours
    "disgenet":          86_400,   # 24 hours
    "opentargets":       3_600,    # 1 hour

    # General knowledge / semantic
    "wikidata":          7_200,    # 2 hours
    "dbpedia":           14_400,   # 4 hours
    "wordnet":           604_800,  # 7 days -- very stable
    "conceptnet":        86_400,   # 24 hours

    # Patent / regulatory
    "uspto":             86_400,   # 24 hours
    "epo":               86_400,   # 24 hours
    "orange_book":       172_800,  # 48 hours

    # Catch-all default
    "_default":          3_600,    # 1 hour
}
# fmt: on


# ---------------------------------------------------------------------------
# Warming queries per adapter (pre-populate on startup)
# ---------------------------------------------------------------------------
ADAPTER_WARM_QUERIES: Dict[str, List[str]] = {
    "pubmed": [
        "cancer immunotherapy",
        "Alzheimer disease biomarkers",
        "CRISPR gene editing review",
        "COVID-19 vaccine efficacy",
        "precision medicine oncology",
    ],
    "clinicaltrials": [
        "phase 3 oncology",
        "Alzheimer disease intervention",
        "diabetes mellitus type 2",
        "cardiovascular outcomes",
    ],
    "drugbank": [
        "aspirin",
        "metformin",
        "insulin",
        "atorvastatin",
        "acetaminophen",
    ],
    "openfda": [
        "adverse events 2024",
        "drug recalls",
        "label changes",
    ],
    "neurosynth": [
        "working memory",
        "default mode network",
        "amygdala activation",
        "executive function",
    ],
    "neurovault": [
        "finger tapping",
        "emotion processing",
        "language comprehension",
    ],
}


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class CacheError(Exception):
    """Base exception for cache operations."""


class CacheConnectionError(CacheError):
    """Raised when Redis connection fails."""


class CacheSerializationError(CacheError):
    """Raised when value serialization/deserialization fails."""


class CacheInvalidationError(CacheError):
    """Raised when cache invalidation fails."""


class CircuitBreakerOpenError(CacheError):
    """Raised when circuit breaker is open (Redis unavailable)."""


# ---------------------------------------------------------------------------
# Circuit breaker for Redis resilience
# ---------------------------------------------------------------------------

class CircuitState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"       # Normal operation
    OPEN = "open"           # Failing fast
    HALF_OPEN = "half_open"  # Testing recovery


@dataclass
class CircuitBreaker:
    """Simple circuit breaker for Redis connection resilience.

    Tracks consecutive failures and automatically recovers after a
    cooldown period.  When OPEN, all cache operations fail fast so
    that downstream code falls back to direct adapter queries.
    """

    failure_threshold: int = 5
    recovery_timeout: float = 30.0  # seconds
    half_open_max_calls: int = 3

    _state: CircuitState = field(default=CircuitState.CLOSED, repr=False)
    _failures: int = field(default=0, repr=False)
    _last_failure_time: Optional[float] = field(default=None, repr=False)
    _half_open_calls: int = field(default=0, repr=False)

    @property
    def state(self) -> CircuitState:
        return self._state

    def record_success(self) -> None:
        """Record a successful operation; reset failure count."""
        self._failures = 0
        self._half_open_calls = 0
        if self._state == CircuitState.HALF_OPEN:
            self._state = CircuitState.CLOSED
            logger.info("Circuit breaker CLOSED (recovered)")

    def record_failure(self) -> None:
        """Record a failed operation; potentially trip the breaker."""
        self._failures += 1
        self._last_failure_time = time.monotonic()
        if self._failures >= self.failure_threshold:
            self._state = CircuitState.OPEN
            logger.warning(
                "Circuit breaker OPEN after %d consecutive failures",
                self._failures,
            )

    def can_execute(self) -> bool:
        """Return True if the operation is allowed to proceed."""
        if self._state == CircuitState.CLOSED:
            return True
        if self._state == CircuitState.OPEN:
            if self._last_failure_time is None:
                return False
            elapsed = time.monotonic() - self._last_failure_time
            if elapsed >= self.recovery_timeout:
                self._state = CircuitState.HALF_OPEN
                self._half_open_calls = 0
                logger.info("Circuit breaker HALF_OPEN (testing recovery)")
                return True
            return False
        # HALF_OPEN
        if self._half_open_calls < self.half_open_max_calls:
            self._half_open_calls += 1
            return True
        return False

    def __repr__(self) -> str:
        return (
            f"<CircuitBreaker state={self._state.value} "
            f"failures={self._failures}/{self.failure_threshold}>"
        )


# ---------------------------------------------------------------------------
# Cache statistics
# ---------------------------------------------------------------------------

@dataclass
class CacheStats:
    """Immutable snapshot of cache statistics."""

    hits: int = 0
    misses: int = 0
    evictions: int = 0
    sets: int = 0
    invalidations: int = 0
    errors: int = 0
    circuit_trips: int = 0
    adapter_hits: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    adapter_misses: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    bytes_written: int = 0
    bytes_read: int = 0
    start_time: datetime = field(default_factory=datetime.utcnow)

    @property
    def total_requests(self) -> int:
        return self.hits + self.misses

    @property
    def hit_rate(self) -> float:
        total = self.total_requests
        return self.hits / total if total > 0 else 0.0

    @property
    def miss_rate(self) -> float:
        total = self.total_requests
        return self.misses / total if total > 0 else 0.0

    @property
    def uptime_seconds(self) -> float:
        return (datetime.utcnow() - self.start_time).total_seconds()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "hits": self.hits,
            "misses": self.misses,
            "evictions": self.evictions,
            "sets": self.sets,
            "invalidations": self.invalidations,
            "errors": self.errors,
            "circuit_trips": self.circuit_trips,
            "hit_rate": round(self.hit_rate, 4),
            "miss_rate": round(self.miss_rate, 4),
            "total_requests": self.total_requests,
            "bytes_written": self.bytes_written,
            "bytes_read": self.bytes_read,
            "uptime_seconds": self.uptime_seconds,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }


# ---------------------------------------------------------------------------
# Serialized value wrapper (metadata + payload)
# ---------------------------------------------------------------------------

@dataclass
class CacheEntry:
    """Wrapper for cached values with metadata."""

    adapter_key: str
    query: str
    created_at: float  # utcnow().timestamp()
    ttl_seconds: int
    version: str = "1"
    payload: Any = None

    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps(
            {
                "adapter_key": self.adapter_key,
                "query": self.query,
                "created_at": self.created_at,
                "ttl_seconds": self.ttl_seconds,
                "version": self.version,
                "payload": self.payload,
            },
            default=str,
        )

    @classmethod
    def from_json(cls, raw: str) -> "CacheEntry":
        """Deserialize from JSON string."""
        data = json.loads(raw)
        return cls(
            adapter_key=data["adapter_key"],
            query=data["query"],
            created_at=data["created_at"],
            ttl_seconds=data["ttl_seconds"],
            version=data.get("version", "1"),
            payload=data.get("payload"),
        )


# ---------------------------------------------------------------------------
# Main KnowledgeCache class
# ---------------------------------------------------------------------------

class KnowledgeCache:
    """Production-grade async Redis cache for 66 external database adapters.

    Features:

    - **Per-adapter TTL**: Each of the 66 adapters has a tailored TTL based on
      source update frequency (see ``ADAPTER_TTL``).
    - **Cache key hashing**: Deterministic MD5-based keys with namespaced
      prefix to avoid collisions.
    - **Hit/miss tracking**: Detailed statistics per adapter and globally,
      accessible via ``get_stats()``.
    - **Memory management**: LRU eviction support, memory-pressure monitoring,
      and optional maxmemory-policy awareness.
    - **Cache warming**: Pre-populate frequently-accessed adapter caches on
      startup via ``warm_cache()``.
    - **Batch operations**: Efficient multi-get / multi-set via ``mget()`` and
      ``mset()`` using ``asyncio.gather``.
    - **Circuit breaker**: Automatic resilience when Redis is unavailable;
      falls back to direct adapter queries.
    - **Cache invalidation**: Adapter-scoped, pattern-based, and bulk
      invalidation strategies.

    Parameters
    ----------
    redis_url:
        Redis connection URL (e.g. ``redis://localhost:6379/0``).
    pool_kwargs:
        Additional keyword arguments forwarded to the
        :class:`redis.asyncio.ConnectionPool` constructor (e.g. ``max_connections``).

    Example
    -------
    .. code-block:: python

        cache = KnowledgeCache("redis://localhost:6379")

        # Simple get/set
        result = await cache.get("pubmed", "CRISPR")
        if result is None:
            data = await fetch_from_pubmed("CRISPR")
            await cache.set("pubmed", "CRISPR", data)

        # Batch get (parallel)
        results = await cache.mget(
            [("pubmed", "q1"), ("pubmed", "q2"), ("drugbank", "aspirin")]
        )

        # Warm cache on startup
        await cache.warm_cache("pubmed", common_queries=["CRISPR", "Alzheimer"])

        # Stats
        print(await cache.get_stats())
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        **pool_kwargs: Any,
    ) -> None:
        self._redis_url = redis_url
        self._pool_kwargs = pool_kwargs
        self._pool: Optional[ConnectionPool] = None
        self._redis: Optional[Redis] = None
        self._stats = CacheStats()
        self._circuit = CircuitBreaker()
        self._local_lock = asyncio.Lock()
        logger.info("KnowledgeCache initialized (redis_url=%s)", redis_url)

    # -- Connection lifecycle ------------------------------------------------

    async def connect(self) -> None:
        """Establish Redis connection (idempotent)."""
        if self._redis is not None:
            return
        try:
            self._pool = ConnectionPool.from_url(
                self._redis_url,
                decode_responses=True,
                **self._pool_kwargs,
            )
            self._redis = redis_lib.Redis(connection_pool=self._pool)
            # Verify connectivity
            await self._redis.ping()
            self._circuit.record_success()
            logger.info("KnowledgeCache connected to Redis")
        except Exception as exc:
            self._circuit.record_failure()
            raise CacheConnectionError(f"Failed to connect to Redis: {exc}") from exc

    async def disconnect(self) -> None:
        """Gracefully close the Redis connection pool."""
        if self._redis is not None:
            await self._redis.close()
            self._redis = None
        if self._pool is not None:
            await self._pool.disconnect()
            self._pool = None
        logger.info("KnowledgeCache disconnected from Redis")

    async def _ensure_connected(self) -> Redis:
        """Return a live Redis client, reconnecting if necessary."""
        if self._redis is None:
            await self.connect()
        assert self._redis is not None
        return self._redis

    async def health_check(self) -> Dict[str, Any]:
        """Return health status including circuit state and Redis info.

        Returns a dictionary with keys ``ok`` (bool), ``circuit_state``,
        ``redis_info`` (server info dict), and ``memory_human``.
        """
        result: Dict[str, Any] = {"ok": False, "circuit_state": self._circuit.state.value}
        try:
            redis_client = await self._ensure_connected()
            info = await redis_client.info(section="memory")
            result["redis_info"] = info
            used = info.get("used_memory", 0)
            peak = info.get("maxmemory", 0) or 1  # avoid div-by-zero
            result["memory_human"] = self._bytes_human(used)
            result["memory_fraction"] = round(used / peak, 4) if peak else 0
            result["ok"] = True
            self._circuit.record_success()
        except Exception as exc:
            result["error"] = str(exc)
            self._circuit.record_failure()
        return result

    @staticmethod
    def _bytes_human(n: int) -> str:
        """Convert bytes to human-readable string."""
        for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
            if abs(n) < 1024:
                return f"{n:.1f}{unit}"
            n /= 1024
        return f"{n:.1f}PiB"

    # -- Key generation ------------------------------------------------------

    def _make_key(
        self,
        adapter_key: str,
        query: str,
        filters: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Create a deterministic, hashed cache key.

        The key format is ``ds:knowledge:v1::<adapter>::<md5_hash>`` so that
        scanning by adapter prefix is efficient.
        """
        filter_json = json.dumps(filters or {}, sort_keys=True, separators=(",", ":"))
        key_data = f"{adapter_key}{_KEY_SEP}{query}{_KEY_SEP}{filter_json}"
        digest = hashlib.md5(key_data.encode("utf-8")).hexdigest()
        return f"{_KEY_PREFIX}{_KEY_SEP}{adapter_key}{_KEY_SEP}{digest}"

    def _adapter_prefix(self, adapter_key: str) -> str:
        """Return a Redis key prefix for scanning adapter-specific keys."""
        return f"{_KEY_PREFIX}{_KEY_SEP}{adapter_key}{_KEY_SEP}"

    # -- Core get / set ------------------------------------------------------

    async def get(
        self,
        adapter_key: str,
        query: str,
        filters: Optional[Dict[str, Any]] = None,
    ) -> Optional[Any]:
        """Retrieve a cached result for *adapter_key* + *query*.

        Returns the cached payload on hit, or ``None`` on miss (or when
        the circuit breaker is open).
        """
        if not self._circuit.can_execute():
            self._stats.errors += 1
            return None

        key = self._make_key(adapter_key, query, filters)
        try:
            redis_client = await self._ensure_connected()
            raw: Optional[str] = await redis_client.get(key)
            if raw is not None:
                self._stats.hits += 1
                self._stats.adapter_hits[adapter_key] += 1
                entry = CacheEntry.from_json(raw)
                self._stats.bytes_read += len(raw.encode("utf-8"))
                return entry.payload
            self._stats.misses += 1
            self._stats.adapter_misses[adapter_key] += 1
            return None
        except Exception as exc:
            self._circuit.record_failure()
            self._stats.errors += 1
            logger.warning("Cache GET failed for %s: %s", adapter_key, exc)
            return None

    async def set(
        self,
        adapter_key: str,
        query: str,
        result: Any,
        filters: Optional[Dict[str, Any]] = None,
        ttl: Optional[int] = None,
    ) -> bool:
        """Store *result* in the cache for *adapter_key* + *query*.

        The TTL is taken from the *ttl* argument, or falls back to the
        per-adapter default in ``ADAPTER_TTL``.

        Returns ``True`` on success, ``False`` on failure.
        """
        if not self._circuit.can_execute():
            self._stats.errors += 1
            return False

        key = self._make_key(adapter_key, query, filters)
        resolved_ttl = ttl or ADAPTER_TTL.get(adapter_key, ADAPTER_TTL["_default"])

        entry = CacheEntry(
            adapter_key=adapter_key,
            query=query,
            created_at=datetime.utcnow().timestamp(),
            ttl_seconds=resolved_ttl,
            payload=result,
        )
        try:
            redis_client = await self._ensure_connected()
            raw = entry.to_json()
            await redis_client.setex(key, resolved_ttl, raw)
            self._stats.sets += 1
            self._stats.bytes_written += len(raw.encode("utf-8"))
            self._circuit.record_success()
            return True
        except Exception as exc:
            self._circuit.record_failure()
            self._stats.errors += 1
            logger.warning("Cache SET failed for %s: %s", adapter_key, exc)
            return False

    async def get_or_set(
        self,
        adapter_key: str,
        query: str,
        factory: Callable[[], Coroutine[Any, Any, T]],
        filters: Optional[Dict[str, Any]] = None,
        ttl: Optional[int] = None,
    ) -> T:
        """Get from cache, or call *factory* to produce and store the value.

        This is the primary high-level API -- it implements the classic
        cache-aside pattern with circuit-breaker awareness.

        Parameters
        ----------
        adapter_key:
            Which adapter namespace to use.
        query:
            The query string (used for key generation).
        factory:
            An async callable that returns the value to cache on miss.
        filters:
            Optional filter dict included in the cache key.
        ttl:
            Optional override TTL (seconds).

        Returns
        -------
        The cached or freshly-computed value.
        """
        cached = await self.get(adapter_key, query, filters)
        if cached is not None:
            return cached  # type: ignore[return-value]
        # Cache miss -- execute factory
        try:
            value = await factory()
        except Exception as exc:
            logger.error("Factory failed for %s:%s: %s", adapter_key, query, exc)
            raise
        # Store in cache (fire-and-forget on failure)
        await self.set(adapter_key, query, value, filters, ttl)
        return value

    # -- Batch operations (asyncio.gather) -----------------------------------

    async def mget(
        self,
        keys: Sequence[Tuple[str, str]],
        filters_list: Optional[Sequence[Optional[Dict[str, Any]]]] = None,
    ) -> List[Optional[Any]]:
        """Batch cache lookup with parallel async gets.

        Parameters
        ----------
        keys:
            Sequence of ``(adapter_key, query)`` tuples.
        filters_list:
            Optional parallel sequence of filter dicts (same length as *keys*).

        Returns
        -------
        A list of payloads in the same order as *keys*; ``None`` for misses.
        """
        if not keys:
            return []
        if filters_list is None:
            filters_list = [None] * len(keys)

        tasks = [
            self.get(ak, q, flt)
            for (ak, q), flt in zip(keys, filters_list)
        ]
        return await asyncio.gather(*tasks, return_exceptions=False)

    async def mset(
        self,
        items: Sequence[Tuple[str, str, Any]],
        filters_list: Optional[Sequence[Optional[Dict[str, Any]]]] = None,
        ttl_list: Optional[Sequence[Optional[int]]] = None,
    ) -> List[bool]:
        """Batch cache store with parallel async sets.

        Parameters
        ----------
        items:
            Sequence of ``(adapter_key, query, result)`` tuples.
        filters_list:
            Optional parallel sequence of filter dicts.
        ttl_list:
            Optional parallel sequence of TTL overrides.

        Returns
        -------
        A list of success booleans in the same order as *items*.
        """
        if not items:
            return []
        if filters_list is None:
            filters_list = [None] * len(items)
        if ttl_list is None:
            ttl_list = [None] * len(items)

        tasks = [
            self.set(ak, q, res, flt, ttl)
            for (ak, q, res), flt, ttl in zip(items, filters_list, ttl_list)
        ]
        return await asyncio.gather(*tasks, return_exceptions=False)

    async def get_many_or_set(
        self,
        requests: Sequence[Tuple[str, str, Callable[[], Coroutine[Any, Any, T]]]],
        filters_list: Optional[Sequence[Optional[Dict[str, Any]]]] = None,
        ttl_list: Optional[Sequence[Optional[int]]] = None,
    ) -> List[T]:
        """Batch cache-aside: get cached values, call factories for misses.

        This is the batched version of :meth:`get_or_set`.  It maximises
        throughput by running all cache checks in parallel, then running
        all factories for misses in parallel, then storing all results.

        Parameters
        ----------
        requests:
            Sequence of ``(adapter_key, query, factory)`` tuples.
        filters_list, ttl_list:
            Optional parallel sequences (same length as *requests*).

        Returns
        -------
        List of values in the same order as *requests*.
        """
        if not requests:
            return []
        if filters_list is None:
            filters_list = [None] * len(requests)
        if ttl_list is None:
            ttl_list = [None] * len(requests)

        n = len(requests)

        # Phase 1: parallel cache lookups
        cached = await asyncio.gather(
            *(
                self.get(ak, q, flt)
                for (ak, q, _), flt in zip(requests, filters_list)
            ),
            return_exceptions=False,
        )

        # Phase 2: collect misses and run factories in parallel
        misses: List[int] = [i for i, v in enumerate(cached) if v is None]
        factory_tasks = [
            requests[i][2]() for i in misses
        ]
        computed = await asyncio.gather(*factory_tasks, return_exceptions=True)

        results: List[Any] = list(cached)
        store_items: List[Tuple[str, str, Any]] = []
        store_filters: List[Optional[Dict[str, Any]]] = []
        store_ttls: List[Optional[int]] = []

        for idx, computed_val in zip(misses, computed):
            if isinstance(computed_val, Exception):
                logger.error(
                    "Factory failed for %s:%s: %s",
                    requests[idx][0],
                    requests[idx][1],
                    computed_val,
                )
                # Leave as None (caller may want to handle)
                results[idx] = None
                continue
            results[idx] = computed_val
            store_items.append(
                (requests[idx][0], requests[idx][1], computed_val)
            )
            store_filters.append(filters_list[idx])
            store_ttls.append(ttl_list[idx])

        # Phase 3: parallel cache stores for successful computations
        if store_items:
            await self.mset(store_items, store_filters, store_ttls)

        return results  # type: ignore[return-value]

    # -- Cache invalidation --------------------------------------------------

    async def invalidate(
        self,
        adapter_key: str,
        query: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None,
    ) -> int:
        """Invalidate cache entries for an adapter.

        Invalidation modes::

            * adapter only  → ``invalidate("pubmed")``
            * exact key     → ``invalidate("pubmed", "CRISPR")``
            * key + filters → ``invalidate("pubmed", "CRISPR", {"year": 2024})``

        Returns the number of keys deleted.
        """
        if not self._circuit.can_execute():
            self._stats.errors += 1
            return 0

        try:
            redis_client = await self._ensure_connected()
            if query is not None:
                # Exact key invalidation
                key = self._make_key(adapter_key, query, filters)
                deleted = await redis_client.delete(key)
                self._stats.invalidations += deleted
                return deleted

            # Adapter-scoped invalidation via scan+delete
            pattern = self._adapter_prefix(adapter_key) + "*"
            cursor = 0
            deleted = 0
            while True:
                cursor, keys = await redis_client.scan(
                    cursor=cursor, match=pattern, count=_SCAN_COUNT
                )
                if keys:
                    pipe = redis_client.pipeline()
                    for k in keys:
                        pipe.delete(k)
                    results = await pipe.execute()
                    deleted += sum(results)
                if cursor == 0:
                    break
            self._stats.invalidations += deleted
            logger.info("Invalidated %d keys for adapter '%s'", deleted, adapter_key)
            return deleted
        except Exception as exc:
            self._circuit.record_failure()
            self._stats.errors += 1
            logger.error("Cache invalidation failed for %s: %s", adapter_key, exc)
            raise CacheInvalidationError(str(exc)) from exc

    async def invalidate_pattern(
        self,
        pattern: str,
    ) -> int:
        """Invalidate all keys matching a glob *pattern* (use with caution).

        The pattern is matched against the full Redis key name after
        prepending the internal prefix namespace.

        Returns the number of keys deleted.
        """
        if not self._circuit.can_execute():
            self._stats.errors += 1
            return 0

        full_pattern = f"{_KEY_PREFIX}{_KEY_SEP}*{pattern}*"
        try:
            redis_client = await self._ensure_connected()
            cursor = 0
            deleted = 0
            while True:
                cursor, keys = await redis_client.scan(
                    cursor=cursor, match=full_pattern, count=_SCAN_COUNT
                )
                if keys:
                    pipe = redis_client.pipeline()
                    for k in keys:
                        pipe.delete(k)
                    results = await pipe.execute()
                    deleted += sum(results)
                if cursor == 0:
                    break
            self._stats.invalidations += deleted
            logger.info("Invalidated %d keys matching pattern '%s'", deleted, pattern)
            return deleted
        except Exception as exc:
            self._circuit.record_failure()
            self._stats.errors += 1
            logger.error("Pattern invalidation failed for '%s': %s", pattern, exc)
            raise CacheInvalidationError(str(exc)) from exc

    async def invalidate_all(self) -> int:
        """**DANGER** -- invalidate the entire knowledge cache namespace.

        Uses an atomic Lua script for correctness under concurrent access.

        Returns the number of keys deleted.
        """
        if not self._circuit.can_execute():
            self._stats.errors += 1
            return 0

        pattern = f"{_KEY_PREFIX}{_KEY_SEP}*"
        try:
            redis_client = await self._ensure_connected()
            lua_script = """
            local keys = redis.call('keys', ARGV[1])
            local count = 0
            for _, k in ipairs(keys) do
                redis.call('del', k)
                count = count + 1
            end
            return count
            """
            deleted = await redis_client.eval(lua_script, 0, pattern)  # type: ignore[no-untyped-call]
            self._stats.invalidations += deleted
            logger.warning("Invalidated ALL %d knowledge cache keys", deleted)
            return deleted
        except Exception as exc:
            self._circuit.record_failure()
            self._stats.errors += 1
            logger.error("Full invalidation failed: %s", exc)
            raise CacheInvalidationError(str(exc)) from exc

    # -- Cache warming -------------------------------------------------------

    async def warm_cache(
        self,
        adapter_key: str,
        common_queries: List[str],
        factory: Optional[Callable[[str], Coroutine[Any, Any, Any]]] = None,
        filters: Optional[Dict[str, Any]] = None,
        max_concurrent: int = 5,
    ) -> Dict[str, Any]:
        """Pre-populate the cache with common queries for an adapter.

        This is typically called on application startup for high-traffic
        adapters (e.g. PubMed, DrugBank).  Existing cached values are not
        overwritten unless they have expired.

        Parameters
        ----------
        adapter_key:
            The adapter namespace to warm.
        common_queries:
            List of query strings to pre-fetch and store.
        factory:
            Optional async callable ``factory(query) -> result``.  If
            omitted, only the key structure is prepared (useful for
            testing or when data is injected externally).
        filters:
            Optional shared filters for all warmed queries.
        max_concurrent:
            Maximum number of concurrent factory calls to avoid
            overwhelming the upstream adapter.

        Returns
        -------
        A dict with ``warmed``, ``failed``, ``skipped`` counts.
        """
        if not common_queries:
            return {"warmed": 0, "failed": 0, "skipped": 0}

        semaphore = asyncio.Semaphore(max_concurrent)
        results = {"warmed": 0, "failed": 0, "skipped": 0}

        async def _warm_one(query: str) -> None:
            async with semaphore:
                # Skip if already cached
                existing = await self.get(adapter_key, query, filters)
                if existing is not None:
                    results["skipped"] += 1
                    return
                if factory is None:
                    results["skipped"] += 1
                    return
                try:
                    data = await factory(query)
                    ok = await self.set(adapter_key, query, data, filters)
                    if ok:
                        results["warmed"] += 1
                    else:
                        results["failed"] += 1
                except Exception as exc:
                    logger.warning("Warm failed for %s:%s: %s", adapter_key, query, exc)
                    results["failed"] += 1

        await asyncio.gather(*(_warm_one(q) for q in common_queries))
        logger.info(
            "Cache warming for '%s': warmed=%d failed=%d skipped=%d",
            adapter_key,
            results["warmed"],
            results["failed"],
            results["skipped"],
        )
        return results

    async def warm_all_adapters(
        self,
        factory_map: Optional[
            Dict[str, Callable[[str], Coroutine[Any, Any, Any]]]
        ] = None,
        max_concurrent_per_adapter: int = 5,
    ) -> Dict[str, Dict[str, Any]]:
        """Warm cache for all adapters that have pre-defined warm queries.

        Uses :meth:`warm_cache` for each entry in ``ADAPTER_WARM_QUERIES``.
        Runs adapters in parallel for speed.

        Parameters
        ----------
        factory_map:
            Mapping from adapter_key → factory callable.  If an adapter
            has no entry, warming is skipped for that adapter.
        max_concurrent_per_adapter:
            Passed through to :meth:`warm_cache`.

        Returns
        -------
        Dict mapping adapter_key → warm results dict.
        """
        factory_map = factory_map or {}
        tasks = {
            adapter: self.warm_cache(
                adapter,
                queries,
                factory=factory_map.get(adapter),
                max_concurrent=max_concurrent_per_adapter,
            )
            for adapter, queries in ADAPTER_WARM_QUERIES.items()
        }
        results = await asyncio.gather(*tasks.values(), return_exceptions=False)
        return dict(zip(tasks.keys(), results))

    # -- Memory management ---------------------------------------------------

    async def check_memory_pressure(self) -> Dict[str, Any]:
        """Check Redis memory usage and optionally trigger LRU eviction.

        Returns a dict with ``status`` (``ok`` / ``warn`` / ``critical``),
        ``used_fraction``, and ``action_taken`` (bool).
        """
        try:
            redis_client = await self._ensure_connected()
            info = await redis_client.info(section="memory")
            used = info.get("used_memory", 0)
            maxmem = info.get("maxmemory", 0)

            if maxmem == 0:
                return {"status": "ok", "used_fraction": 0, "action_taken": False}

            fraction = used / maxmem
            result: Dict[str, Any] = {
                "status": "ok",
                "used_fraction": round(fraction, 4),
                "used_human": self._bytes_human(used),
                "max_human": self._bytes_human(maxmem),
                "action_taken": False,
            }

            if fraction >= _MEM_CRITICAL_THRESHOLD:
                result["status"] = "critical"
                # Aggressive invalidation: evict oldest 10% of keys per adapter
                evicted = await self._evict_oldest(percent=0.10)
                result["action_taken"] = evicted > 0
                result["evicted"] = evicted
                self._stats.evictions += evicted
                logger.critical(
                    "Memory critical (%.1f%%) -- evicted %d keys", fraction * 100, evicted
                )
            elif fraction >= _MEM_WARN_THRESHOLD:
                result["status"] = "warn"
                logger.warning("Memory pressure at %.1f%%", fraction * 100)

            return result
        except Exception as exc:
            logger.error("Memory check failed: %s", exc)
            return {"status": "error", "error": str(exc)}

    async def _evict_oldest(self, percent: float = 0.10) -> int:
        """Evict the oldest *percent* of keys across all adapters.

        Uses TTL as a proxy for age -- keys closest to expiry are removed
        first.  This is a cooperative best-effort; the primary eviction
        should be handled by Redis ``maxmemory-policy=allkeys-lru``.
        """
        try:
            redis_client = await self._ensure_connected()
            cursor = 0
            keys_with_ttl: List[Tuple[str, int]] = []
            while True:
                cursor, keys = await redis_client.scan(
                    cursor=cursor, match=f"{_KEY_PREFIX}{_KEY_SEP}*", count=_SCAN_COUNT
                )
                if keys:
                    pipe = redis_client.pipeline()
                    for k in keys:
                        pipe.ttl(k)
                    ttls = await pipe.execute()
                    keys_with_ttl.extend(
                        (k, ttl) for k, ttl in zip(keys, ttls) if ttl > 0
                    )
                if cursor == 0:
                    break

            if not keys_with_ttl:
                return 0

            # Sort by remaining TTL ascending (closest to expiry first)
            keys_with_ttl.sort(key=lambda x: x[1])
            evict_count = max(1, int(len(keys_with_ttl) * percent))
            to_evict = [k for k, _ in keys_with_ttl[:evict_count]]

            pipe = redis_client.pipeline()
            for k in to_evict:
                pipe.delete(k)
            results = await pipe.execute()
            return sum(results)
        except Exception as exc:
            logger.error("Eviction failed: %s", exc)
            return 0

    # -- Statistics ----------------------------------------------------------

    async def get_stats(self) -> Dict[str, Any]:
        """Return comprehensive cache statistics.

        Includes hit/miss rates, per-adapter breakdown, circuit breaker
        state, and Redis server info.
        """
        base = self._stats.to_dict()
        base["circuit_breaker"] = {
            "state": self._circuit.state.value,
            "failures": self._circuit._failures,
            "threshold": self._circuit.failure_threshold,
        }
        # Per-adapter hit rates
        all_adapters: Set[str] = set(self._stats.adapter_hits.keys()) | set(
            self._stats.adapter_misses.keys()
        )
        adapter_breakdown = {}
        for ak in sorted(all_adapters):
            h = self._stats.adapter_hits.get(ak, 0)
            m = self._stats.adapter_misses.get(ak, 0)
            t = h + m
            adapter_breakdown[ak] = {
                "hits": h,
                "misses": m,
                "hit_rate": round(h / t, 4) if t > 0 else 0,
            }
        base["per_adapter"] = adapter_breakdown

        # Redis memory info (best-effort)
        try:
            health = await self.health_check()
            if health.get("ok"):
                base["memory"] = {
                    "used_human": health.get("memory_human"),
                    "fraction": health.get("memory_fraction"),
                }
        except Exception:
            pass

        return base

    async def reset_stats(self) -> None:
        """Reset all cache statistics counters to zero."""
        self._stats = CacheStats()
        logger.info("Cache statistics reset")

    # -- Context manager -----------------------------------------------------

    async def __aenter__(self) -> "KnowledgeCache":
        await self.connect()
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        await self.disconnect()


# ---------------------------------------------------------------------------
# Convenience factory
# ---------------------------------------------------------------------------

async def create_knowledge_cache(
    redis_url: str = "redis://localhost:6379/0",
    **pool_kwargs: Any,
) -> KnowledgeCache:
    """Create and connect a :class:`KnowledgeCache` in one call.

    Example::

        cache = await create_knowledge_cache("redis://localhost:6379")
        async with cache:
            result = await cache.get("pubmed", "CRISPR")
    """
    cache = KnowledgeCache(redis_url, **pool_kwargs)
    await cache.connect()
    return cache


# ---------------------------------------------------------------------------
# Unit tests (using unittest.mock for Redis)
# ---------------------------------------------------------------------------

class _FakeRedis:
    """In-memory fake Redis for unit testing (no real server required)."""

    def __init__(self) -> None:
        self._store: Dict[str, Tuple[str, float]] = {}  # key -> (value, expiry_ts)
        self._now: float = 0.0

    def _is_expired(self, key: str) -> bool:
        if key not in self._store:
            return True
        return self._store[key][1] <= self._now

    # --- Required async interface ---

    async def ping(self) -> str:
        return "PONG"

    async def get(self, key: str) -> Optional[str]:
        if key not in self._store or self._is_expired(key):
            self._store.pop(key, None)
            return None
        return self._store[key][0]

    async def setex(self, key: str, seconds: int, value: str) -> None:
        self._store[key] = (value, self._now + seconds)

    async def delete(self, *keys: str) -> int:
        count = 0
        for k in keys:
            if k in self._store:
                del self._store[k]
                count += 1
        return count

    async def scan(self, cursor: int = 0, match: str = "", count: int = 10) -> Tuple[int, List[str]]:
        # Simple implementation: return all non-expired keys matching pattern
        matching = []
        for k in self._store:
            if not self._is_expired(k):
                # Very naive glob matching
                pattern = match.replace("*", "")
                if k.startswith(pattern) or pattern == "":
                    matching.append(k)
        return (0, matching)  # cursor 0 = done

    async def ttl(self, key: str) -> int:
        if key not in self._store:
            return -2
        remaining = int(self._store[key][1] - self._now)
        return max(remaining, 0)

    async def info(self, section: str = "default") -> Dict[str, Any]:
        return {
            "used_memory": len(self._store) * 1024,
            "maxmemory": 100 * 1024 * 1024,
        }

    async def eval(self, script: str, numkeys: int, *args: str) -> int:
        # Lua eval for invalidate_all
        pattern = args[0].replace("*", "") if args else ""
        to_del = [k for k in list(self._store.keys()) if k.startswith(pattern)]
        for k in to_del:
            del self._store[k]
        return len(to_del)

    def pipeline(self) -> "_FakePipeline":
        return _FakePipeline(self)

    async def close(self) -> None:
        pass


class _FakePipeline:
    """Fake Redis pipeline for batch operations."""

    def __init__(self, fake: _FakeRedis) -> None:
        self._fake = fake
        self._ops: List[Coroutine[Any, Any, Any]] = []

    def delete(self, key: str) -> "_FakePipeline":
        async def _del() -> int:
            return await self._fake.delete(key)
        self._ops.append(_del())
        return self

    def ttl(self, key: str) -> "_FakePipeline":
        async def _ttl() -> int:
            return await self._fake.ttl(key)
        self._ops.append(_ttl())
        return self

    async def execute(self) -> List[Any]:
        return await asyncio.gather(*self._ops, return_exceptions=False)


class _FakeConnectionPool:
    """Fake connection pool for testing."""

    async def disconnect(self) -> None:
        pass


# -- Pytest-compatible tests (run with ``python -m pytest``) ---------------

import unittest
from unittest.mock import patch, AsyncMock


class TestKnowledgeCache(unittest.IsolatedAsyncioTestCase):
    """Comprehensive unit tests for KnowledgeCache using a fake Redis."""

    async def asyncSetUp(self) -> None:  # type: ignore[override]
        self.cache = KnowledgeCache("redis://localhost:6379/0")
        # Inject fake Redis
        self.fake_redis = _FakeRedis()
        self.cache._redis = self.fake_redis  # type: ignore[assignment]
        self.cache._pool = _FakeConnectionPool()  # type: ignore[assignment]

    async def asyncTearDown(self) -> None:  # type: ignore[override]
        await self.cache.disconnect()

    # -- Basic operations --

    async def test_set_and_get(self) -> None:
        """Basic set followed by get returns the value."""
        ok = await self.cache.set("pubmed", "CRISPR", {"papers": [1, 2, 3]})
        self.assertTrue(ok)
        result = await self.cache.get("pubmed", "CRISPR")
        self.assertIsNotNone(result)
        self.assertEqual(result, {"papers": [1, 2, 3]})

    async def test_get_miss_returns_none(self) -> None:
        """Get on non-existent key returns None."""
        result = await self.cache.get("pubmed", "nonexistent_query_xyz")
        self.assertIsNone(result)

    async def test_ttl_expiration(self) -> None:
        """Values expire after TTL."""
        await self.cache.set("pubmed", "temporary", {"data": "tmp"}, ttl=1)
        # Immediately should be present
        self.assertIsNotNone(await self.cache.get("pubmed", "temporary"))
        # Simulate time passing
        self.fake_redis._now += 2
        self.assertIsNone(await self.cache.get("pubmed", "temporary"))

    async def test_default_ttl_from_config(self) -> None:
        """Default TTL is pulled from ADAPTER_TTL config."""
        await self.cache.set("drugbank", "aspirin", {"name": "aspirin"})
        # drugbank TTL is 86400; check it's stored
        key = self.cache._make_key("drugbank", "aspirin")
        remaining = await self.fake_redis.ttl(key)
        self.assertGreater(remaining, 86000)

    async def test_per_adapter_ttl_override(self) -> None:
        """Explicit TTL argument overrides adapter default."""
        await self.cache.set("pubmed", "q", {"x": 1}, ttl=600)
        key = self.cache._make_key("pubmed", "q")
        remaining = await self.fake_redis.ttl(key)
        self.assertLessEqual(remaining, 600)

    async def test_set_with_filters(self) -> None:
        """Filters participate in key generation."""
        await self.cache.set(
            "pubmed", "cancer", {"results": [1]}, filters={"year": 2024}
        )
        # Same query without filters should miss
        result_no_filter = await self.cache.get("pubmed", "cancer")
        self.assertIsNone(result_no_filter)
        # Same query with matching filters should hit
        result_with_filter = await self.cache.get(
            "pubmed", "cancer", filters={"year": 2024}
        )
        self.assertEqual(result_with_filter, {"results": [1]})

    # -- Statistics --

    async def test_hit_miss_stats(self) -> None:
        """Stats track hits and misses correctly."""
        await self.cache.set("pubmed", "q1", "val1")
        _ = await self.cache.get("pubmed", "q1")  # hit
        _ = await self.cache.get("pubmed", "q2")  # miss
        stats = self.cache._stats
        self.assertEqual(stats.hits, 1)
        self.assertEqual(stats.misses, 1)
        self.assertAlmostEqual(stats.hit_rate, 0.5)

    async def test_get_stats_returns_dict(self) -> None:
        """get_stats returns a serializable dictionary."""
        await self.cache.set("pubmed", "q", "v")
        await self.cache.get("pubmed", "q")
        stats = await self.cache.get_stats()
        self.assertIn("hits", stats)
        self.assertIn("misses", stats)
        self.assertIn("hit_rate", stats)
        self.assertIn("circuit_breaker", stats)
        self.assertIn("per_adapter", stats)

    async def test_reset_stats(self) -> None:
        """reset_stats clears all counters."""
        await self.cache.set("pubmed", "q", "v")
        await self.cache.get("pubmed", "q")
        await self.cache.reset_stats()
        self.assertEqual(self.cache._stats.hits, 0)
        self.assertEqual(self.cache._stats.misses, 0)

    # -- Cache invalidation --

    async def test_invalidate_adapter_scoped(self) -> None:
        """invalidate() without query removes all adapter keys."""
        await self.cache.set("pubmed", "q1", "v1")
        await self.cache.set("pubmed", "q2", "v2")
        await self.cache.set("drugbank", "d1", "dv1")
        deleted = await self.cache.invalidate("pubmed")
        self.assertEqual(deleted, 2)
        self.assertIsNone(await self.cache.get("pubmed", "q1"))
        self.assertIsNone(await self.cache.get("pubmed", "q2"))
        # drugbank should still exist
        self.assertEqual(await self.cache.get("drugbank", "d1"), "dv1")

    async def test_invalidate_exact_key(self) -> None:
        """invalidate() with query removes only that key."""
        await self.cache.set("pubmed", "q1", "v1")
        await self.cache.set("pubmed", "q2", "v2")
        deleted = await self.cache.invalidate("pubmed", "q1")
        self.assertEqual(deleted, 1)
        self.assertIsNone(await self.cache.get("pubmed", "q1"))
        self.assertEqual(await self.cache.get("pubmed", "q2"), "v2")

    async def test_invalidate_all(self) -> None:
        """invalidate_all removes all knowledge cache keys."""
        await self.cache.set("pubmed", "q1", "v1")
        await self.cache.set("drugbank", "d1", "dv1")
        deleted = await self.cache.invalidate_all()
        self.assertEqual(deleted, 2)
        self.assertIsNone(await self.cache.get("pubmed", "q1"))
        self.assertIsNone(await self.cache.get("drugbank", "d1"))

    # -- Batch operations --

    async def test_mget_parallel(self) -> None:
        """mget performs parallel lookups."""
        await self.cache.set("pubmed", "q1", "v1")
        await self.cache.set("pubmed", "q2", "v2")
        await self.cache.set("drugbank", "d1", "dv1")
        results = await self.cache.mget(
            [("pubmed", "q1"), ("pubmed", "q2"), ("drugbank", "d1"), ("pubmed", "missing")]
        )
        self.assertEqual(results, ["v1", "v2", "dv1", None])

    async def test_mset_parallel(self) -> None:
        """mset performs parallel stores."""
        items = [
            ("pubmed", "q1", "v1"),
            ("pubmed", "q2", "v2"),
            ("drugbank", "d1", "dv1"),
        ]
        oks = await self.cache.mset(items)
        self.assertTrue(all(oks))
        self.assertEqual(await self.cache.get("pubmed", "q1"), "v1")
        self.assertEqual(await self.cache.get("pubmed", "q2"), "v2")
        self.assertEqual(await self.cache.get("drugbank", "d1"), "dv1")

    async def test_get_or_set_hit(self) -> None:
        """get_or_set returns cached value on hit (factory not called)."""
        await self.cache.set("pubmed", "q", "cached")
        factory_calls: List[int] = []

        async def factory() -> str:
            factory_calls.append(1)
            return "fresh"

        result = await self.cache.get_or_set("pubmed", "q", factory)
        self.assertEqual(result, "cached")
        self.assertEqual(factory_calls, [])

    async def test_get_or_set_miss(self) -> None:
        """get_or_set calls factory and stores result on miss."""
        async def factory() -> Dict[str, int]:
            return {"data": 42}

        result = await self.cache.get_or_set("pubmed", "q", factory)
        self.assertEqual(result, {"data": 42})
        # Should now be cached
        cached = await self.cache.get("pubmed", "q")
        self.assertEqual(cached, {"data": 42})

    async def test_get_many_or_set(self) -> None:
        """get_many_or_set handles mixed hit/miss batch."""
        await self.cache.set("pubmed", "q1", "v1")

        async def factory1() -> str:
            return "fresh1"

        async def factory2() -> str:
            return "fresh2"

        results = await self.cache.get_many_or_set(
            [
                ("pubmed", "q1", factory1),  # hit
                ("pubmed", "q2", factory2),  # miss
            ]
        )
        self.assertEqual(results, ["v1", "fresh2"])
        # q2 should now be cached
        self.assertEqual(await self.cache.get("pubmed", "q2"), "fresh2")

    # -- Cache warming --

    async def test_warm_cache_with_factory(self) -> None:
        """warm_cache calls factory for each query and stores results."""
        factory_calls: List[str] = []

        async def factory(q: str) -> str:
            factory_calls.append(q)
            return f"result_for_{q}"

        result = await self.cache.warm_cache(
            "pubmed",
            ["query1", "query2", "query3"],
            factory=factory,
            max_concurrent=2,
        )
        self.assertEqual(result["warmed"], 3)
        self.assertEqual(result["failed"], 0)
        # Verify stored
        self.assertEqual(await self.cache.get("pubmed", "query1"), "result_for_query1")
        self.assertEqual(await self.cache.get("pubmed", "query2"), "result_for_query2")
        self.assertEqual(await self.cache.get("pubmed", "query3"), "result_for_query3")

    async def test_warm_cache_skips_existing(self) -> None:
        """warm_cache skips keys that are already cached."""
        await self.cache.set("pubmed", "query1", "already_cached")

        async def factory(q: str) -> str:
            return f"new_{q}"

        result = await self.cache.warm_cache(
            "pubmed", ["query1", "query2"], factory=factory
        )
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["warmed"], 1)
        # Existing value should not be overwritten
        self.assertEqual(await self.cache.get("pubmed", "query1"), "already_cached")

    async def test_warm_cache_without_factory(self) -> None:
        """warm_cache with no factory only skips."""
        result = await self.cache.warm_cache("pubmed", ["q1", "q2"])
        self.assertEqual(result["skipped"], 2)
        self.assertEqual(result["warmed"], 0)

    # -- Circuit breaker --

    async def test_circuit_breaker_opens_after_failures(self) -> None:
        """Circuit breaker trips after threshold failures."""
        cb = CircuitBreaker(failure_threshold=3)
        self.assertTrue(cb.can_execute())
        cb.record_failure()
        cb.record_failure()
        self.assertTrue(cb.can_execute())
        cb.record_failure()
        self.assertFalse(cb.can_execute())
        self.assertEqual(cb.state, CircuitState.OPEN)

    async def test_circuit_breaker_half_open_recovery(self) -> None:
        """Circuit breaker enters half-open after recovery timeout."""
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=0.1)
        cb.record_failure()
        self.assertEqual(cb.state, CircuitState.OPEN)
        # Wait for recovery timeout
        await asyncio.sleep(0.15)
        self.assertTrue(cb.can_execute())
        self.assertEqual(cb.state, CircuitState.HALF_OPEN)

    async def test_circuit_breaker_full_recovery(self) -> None:
        """Circuit breaker closes after half-open successes."""
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=0.1)
        cb.record_failure()
        await asyncio.sleep(0.15)
        cb.can_execute()  # enters half-open
        cb.record_success()
        self.assertEqual(cb.state, CircuitState.CLOSED)

    # -- Memory management --

    async def test_check_memory_pressure(self) -> None:
        """Memory pressure check returns status dict."""
        result = await self.cache.check_memory_pressure()
        self.assertIn("status", result)
        self.assertIn("used_fraction", result)

    # -- Connection health --

    async def test_health_check(self) -> None:
        """health_check returns connectivity status."""
        result = await self.cache.health_check()
        self.assertIn("ok", result)
        self.assertTrue(result["ok"])
        self.assertIn("memory_human", result)

    # -- Key generation determinism --

    def test_make_key_deterministic(self) -> None:
        """Same inputs produce identical keys."""
        k1 = self.cache._make_key("pubmed", "CRISPR", {"year": 2024})
        k2 = self.cache._make_key("pubmed", "CRISPR", {"year": 2024})
        self.assertEqual(k1, k2)

    def test_make_key_sensitive_to_order(self) -> None:
        """Different inputs produce different keys."""
        k1 = self.cache._make_key("pubmed", "CRISPR", {"a": 1, "b": 2})
        k2 = self.cache._make_key("pubmed", "CRISPR", {"b": 2, "a": 1})
        # Same dict (sorted) → same key
        self.assertEqual(k1, k2)
        k3 = self.cache._make_key("pubmed", "CRISPR", {"a": 1})
        self.assertNotEqual(k1, k3)

    def test_adapter_prefix(self) -> None:
        """Adapter prefix format is correct."""
        prefix = self.cache._adapter_prefix("pubmed")
        self.assertTrue(prefix.startswith(_KEY_PREFIX))
        self.assertIn("pubmed", prefix)

    # -- CacheEntry serialization --

    def test_cache_entry_roundtrip(self) -> None:
        """CacheEntry serializes and deserializes correctly."""
        entry = CacheEntry(
            adapter_key="pubmed",
            query="CRISPR",
            created_at=datetime.utcnow().timestamp(),
            ttl_seconds=3600,
            payload={"papers": [1, 2]},
        )
        raw = entry.to_json()
        restored = CacheEntry.from_json(raw)
        self.assertEqual(restored.adapter_key, entry.adapter_key)
        self.assertEqual(restored.query, entry.query)
        self.assertEqual(restored.payload, entry.payload)

    # -- Edge cases --

    async def test_empty_mget(self) -> None:
        """mget with empty list returns empty list."""
        results = await self.cache.mget([])
        self.assertEqual(results, [])

    async def test_empty_mset(self) -> None:
        """mset with empty list returns empty list."""
        oks = await self.cache.mset([])
        self.assertEqual(oks, [])

    async def test_empty_warm_cache(self) -> None:
        """warm_cache with empty queries returns zero counts."""
        result = await self.cache.warm_cache("pubmed", [])
        self.assertEqual(result["warmed"], 0)

    async def test_large_payload(self) -> None:
        """Cache handles large payloads correctly."""
        large_data = {"items": list(range(10000))}
        ok = await self.cache.set("pubmed", "big", large_data)
        self.assertTrue(ok)
        result = await self.cache.get("pubmed", "big")
        self.assertEqual(result, large_data)

    async def test_unicode_query(self) -> None:
        """Cache handles unicode queries correctly."""
        query = "免疫療法 🔬 molecular"
        data = {"result": "ok"}
        ok = await self.cache.set("pubmed", query, data)
        self.assertTrue(ok)
        result = await self.cache.get("pubmed", query)
        self.assertEqual(result, data)

    async def test_special_chars_in_query(self) -> None:
        """Cache handles special characters in queries."""
        query = "SELECT * FROM table WHERE x='y'; DROP TABLE; --"
        data = {"safe": True}
        ok = await self.cache.set("pubmed", query, data)
        self.assertTrue(ok)
        result = await self.cache.get("pubmed", query)
        self.assertEqual(result, data)

    # -- Context manager --

    async def test_context_manager(self) -> None:
        """KnowledgeCache works as an async context manager."""
        cache = KnowledgeCache("redis://localhost:6379/0")
        fake = _FakeRedis()
        fake_pool = _FakeConnectionPool()
        # Pre-inject fake to avoid real Redis connection attempt
        cache._redis = fake  # type: ignore[assignment]
        cache._pool = fake_pool  # type: ignore[assignment]
        cache._circuit.record_success()  # ensure circuit is closed
        async with cache:
            await cache.set("pubmed", "q", "v")
            self.assertEqual(await cache.get("pubmed", "q"), "v")


# ---------------------------------------------------------------------------
# Run tests when executed directly
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    unittest.main(verbosity=2)
