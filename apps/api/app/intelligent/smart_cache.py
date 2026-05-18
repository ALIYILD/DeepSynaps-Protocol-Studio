"""
smart_cache.py — Intelligent Synaps v4
========================================
Intelligent caching layer with category-based TTL policies, cache warming,
and evidence-update invalidation.

Policies:
    drug_info        → 86400 s (24 h)
    clinical_trial   → 3600 s  (1 h)
    genomic          → 259200 s (72 h)
    adverse_event    → 7200 s  (2 h)
    literature       → 604800 s (1 week)
    guideline        → 604800 s (1 week)
    default          → 3600 s  (1 h)
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
import unittest
from collections import OrderedDict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, Generic, List, Optional, Set, Tuple, TypeVar

from pydantic import BaseModel, Field

logger = logging.getLogger("intelligent_synaps.smart_cache")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TTL_POLICIES: Dict[str, int] = {
    "drug_info": 86400,       # 24 hours
    "clinical_trial": 3600,   # 1 hour
    "genomic": 259200,        # 72 hours
    "adverse_event": 7200,    # 2 hours
    "literature": 604800,     # 1 week
    "guideline": 604800,      # 1 week
    "protocol": 1800,         # 30 minutes
    "patient_data": 600,      # 10 minutes
    "default": 3600,          # 1 hour
}

MAX_CACHE_SIZE = 10_000
WARN_THRESHOLD = 0.85

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CacheEntry(BaseModel):
    """A single cache entry with metadata."""

    key: str
    value: Any
    category: str = "default"
    created_at: float = Field(default_factory=time.time)
    expires_at: float
    access_count: int = 0
    last_accessed: float = Field(default_factory=time.time)
    hit_count: int = 0
    size_bytes: int = 0

    class Config:
        arbitrary_types_allowed = True

    @property
    def is_expired(self) -> bool:
        return time.time() > self.expires_at

    @property
    def ttl_remaining(self) -> float:
        return max(0.0, self.expires_at - time.time())

    def touch(self) -> None:
        self.access_count += 1
        self.last_accessed = time.time()
        self.hit_count += 1


class CacheStats(BaseModel):
    """Aggregate cache statistics."""

    total_entries: int = 0
    total_hits: int = 0
    total_misses: int = 0
    total_evictions: int = 0
    total_invalidations: int = 0
    hit_rate: float = 0.0
    miss_rate: float = 0.0
    memory_estimate_bytes: int = 0
    categories: Dict[str, Dict[str, int]] = Field(default_factory=dict)
    oldest_entry_age_seconds: float = 0.0
    average_entry_age_seconds: float = 0.0


class CachePolicy(BaseModel):
    """Per-category cache policy configuration."""

    category: str
    ttl_seconds: int
    max_size: Optional[int] = None
    warmup_queries: List[str] = Field(default_factory=list)
    invalidate_on_evidence_update: bool = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hash_key(key: str) -> str:
    """Deterministic hash for cache keys that may contain special chars."""
    if len(key) <= 64 and key.isalnum():
        return key
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]


def _estimate_size(value: Any) -> int:
    """Rough size estimate in bytes for memory tracking."""
    try:
        return len(json.dumps(value, default=str).encode("utf-8"))
    except (TypeError, ValueError):
        return 512  # fallback


def _serialize(value: Any) -> str:
    """Serialize value to JSON string."""
    return json.dumps(value, default=str)


def _deserialize(raw: str) -> Any:
    """Deserialize JSON string back to Python object."""
    return json.loads(raw)


# ---------------------------------------------------------------------------
# SmartCache
# ---------------------------------------------------------------------------

class SmartCache:
    """Intelligent cache with category-based TTL and warming.

    Usage:
        cache = SmartCache()
        await cache.set("sertraline_dosage", data, category="drug_info")
        data = await cache.get("sertraline_dosage", category="drug_info")
        await cache.warm_cache(["sertraline", "fluoxetine"])
    """

    def __init__(
        self,
        max_size: int = MAX_CACHE_SIZE,
        ttl_policies: Optional[Dict[str, int]] = None,
    ) -> None:
        self.max_size = max_size
        self.ttl_policies = ttl_policies or dict(TTL_POLICIES)
        self._store: OrderedDict[str, CacheEntry] = OrderedDict()
        self._category_index: Dict[str, Set[str]] = {}
        self._lock = asyncio.Lock()
        self._hits = 0
        self._misses = 0
        self._evictions = 0
        self._invalidations = 0
        self._warmup_history: Set[str] = set()
        logger.info(
            "SmartCache initialised (max_size=%d, categories=%d)",
            max_size,
            len(self.ttl_policies),
        )

    # -- Core operations ------------------------------------------------------

    async def get(
        self, key: str, category: str = "default"
    ) -> Optional[Any]:
        """Retrieve a value from cache.

        Returns None if key not found or entry has expired.
        """
        hashed = _hash_key(f"{category}:{key}")
        async with self._lock:
            entry = self._store.get(hashed)
            if entry is None:
                self._misses += 1
                logger.debug("Cache MISS: %s (category=%s)", key, category)
                return None

            if entry.is_expired:
                self._misses += 1
                self._evict_entry(hashed)
                logger.debug("Cache EXPIRED: %s (category=%s)", key, category)
                return None

            entry.touch()
            self._hits += 1
            # Move to end (most recently used)
            self._store.move_to_end(hashed)
            logger.debug(
                "Cache HIT: %s (category=%s, hits=%d)",
                key,
                category,
                entry.hit_count,
            )
            return entry.value

    async def set(
        self,
        key: str,
        value: Any,
        category: str = "default",
        ttl: Optional[int] = None,
    ) -> None:
        """Store a value in cache with category-based TTL.

        Parameters
        ----------
        key:
            Cache key. Will be combined with category for namespacing.
        value:
            Any JSON-serialisable value.
        category:
            One of TTL_POLICIES keys. Determines default TTL.
        ttl:
            Optional override TTL in seconds.
        """
        hashed = _hash_key(f"{category}:{key}")
        effective_ttl = ttl or self.ttl_policies.get(category, TTL_POLICIES["default"])
        now = time.time()

        entry = CacheEntry(
            key=key,
            value=value,
            category=category,
            created_at=now,
            expires_at=now + effective_ttl,
            size_bytes=_estimate_size(value),
        )

        async with self._lock:
            # Check capacity and evict if needed
            while len(self._store) >= self.max_size:
                self._evict_lru()

            self._store[hashed] = entry
            # Index by category
            self._category_index.setdefault(category, set()).add(hashed)
            logger.debug(
                "Cache SET: %s (category=%s, ttl=%ds)",
                key,
                category,
                effective_ttl,
            )

    async def delete(self, key: str, category: str = "default") -> bool:
        """Delete a single cache entry. Returns True if existed."""
        hashed = _hash_key(f"{category}:{key}")
        async with self._lock:
            if hashed in self._store:
                self._evict_entry(hashed)
                logger.debug("Cache DELETE: %s (category=%s)", key, category)
                return True
            return False

    async def exists(self, key: str, category: str = "default") -> bool:
        """Check if a key exists and is not expired (without updating stats)."""
        hashed = _hash_key(f"{category}:{key}")
        async with self._lock:
            entry = self._store.get(hashed)
            if entry is None or entry.is_expired:
                return False
            return True

    async def get_or_compute(
        self,
        key: str,
        compute: Callable[[], Any],
        category: str = "default",
        ttl: Optional[int] = None,
    ) -> Any:
        """Get from cache or compute and store if missing.

        Parameters
        ----------
        key:
            Cache key.
        compute:
            Async callable that returns the value if not cached.
        category, ttl:
            Passed to `set`.

        Returns
        -------
        The cached or freshly computed value.
        """
        cached = await self.get(key, category)
        if cached is not None:
            return cached

        # Compute
        if asyncio.iscoroutinefunction(compute):
            value = await compute()
        else:
            value = compute()

        await self.set(key, value, category, ttl)
        return value

    # -- Bulk operations ------------------------------------------------------

    async def mget(
        self, keys: List[str], category: str = "default"
    ) -> Dict[str, Optional[Any]]:
        """Multi-get. Returns dict of key → value (None for missing)."""
        results: Dict[str, Optional[Any]] = {}
        for key in keys:
            results[key] = await self.get(key, category)
        return results

    async def mset(
        self,
        items: Dict[str, Any],
        category: str = "default",
        ttl: Optional[int] = None,
    ) -> None:
        """Multi-set."""
        for key, value in items.items():
            await self.set(key, value, category, ttl)

    # -- Cache management -----------------------------------------------------

    async def invalidate_category(self, category: str) -> int:
        """Invalidate all entries in a category. Returns count removed."""
        async with self._lock:
            to_remove = list(self._category_index.get(category, set()))
            for hashed in to_remove:
                if hashed in self._store:
                    del self._store[hashed]
            self._category_index.pop(category, None)
            self._invalidations += len(to_remove)
            logger.info(
                "Invalidated category '%s': %d entries removed",
                category,
                len(to_remove),
            )
            return len(to_remove)

    async def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate entries whose key contains the pattern."""
        async with self._lock:
            to_remove = [
                hashed
                for hashed, entry in self._store.items()
                if pattern in entry.key
            ]
            for hashed in to_remove:
                entry = self._store.pop(hashed, None)
                if entry:
                    self._category_index.get(entry.category, set()).discard(hashed)
            self._invalidations += len(to_remove)
            logger.info(
                "Invalidated pattern '%s': %d entries removed", pattern, len(to_remove)
            )
            return len(to_remove)

    async def invalidate_entity(
        self, entity_type: str, entity_id: str
    ) -> int:
        """Invalidate all cache entries related to an entity.

        Triggered when evidence updates are detected for an entity.
        """
        pattern = f"{entity_type}:{entity_id}"
        return await self.invalidate_pattern(pattern)

    async def clear(self) -> None:
        """Clear entire cache."""
        async with self._lock:
            count = len(self._store)
            self._store.clear()
            self._category_index.clear()
            logger.info("Cache cleared: %d entries removed", count)

    async def stats(self) -> CacheStats:
        """Get current cache statistics."""
        async with self._lock:
            total = self._hits + self._misses
            hit_rate = self._hits / total if total > 0 else 0.0
            categories: Dict[str, Dict[str, int]] = {}
            now = time.time()
            total_age = 0.0
            oldest_age = 0.0
            mem = 0

            for entry in self._store.values():
                cat = entry.category
                if cat not in categories:
                    categories[cat] = {"entries": 0, "hits": 0}
                categories[cat]["entries"] += 1
                categories[cat]["hits"] += entry.hit_count
                age = now - entry.created_at
                total_age += age
                oldest_age = max(oldest_age, age)
                mem += entry.size_bytes

            return CacheStats(
                total_entries=len(self._store),
                total_hits=self._hits,
                total_misses=self._misses,
                total_evictions=self._evictions,
                total_invalidations=self._invalidations,
                hit_rate=round(hit_rate, 4),
                miss_rate=round(1.0 - hit_rate, 4),
                memory_estimate_bytes=mem,
                categories=categories,
                oldest_entry_age_seconds=round(oldest_age, 1),
                average_entry_age_seconds=round(
                    total_age / len(self._store), 1
                ) if self._store else 0.0,
            )

    # -- Cache warming --------------------------------------------------------

    async def warm_cache(
        self,
        hot_queries: List[str],
        fetcher: Optional[Callable[[str], Any]] = None,
        category: str = "default",
    ) -> int:
        """Pre-populate cache with frequently accessed data.

        Parameters
        ----------
        hot_queries:
            List of query strings to warm.
        fetcher:
            Optional async callable(query) → value. If None, only metadata
            is tracked for future warming.
        category:
            Category for warmed entries.

        Returns
        -------
        Number of entries successfully warmed.
        """
        warmed = 0
        tasks = []
        for query in hot_queries:
            if query in self._warmup_history:
                continue
            self._warmup_history.add(query)
            if fetcher:
                tasks.append(self._warm_single(query, fetcher, category))

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            warmed = sum(1 for r in results if not isinstance(r, Exception))

        logger.info(
            "Cache warming: %d/%d queries warmed (category=%s)",
            warmed,
            len(hot_queries),
            category,
        )
        return warmed

    async def _warm_single(
        self,
        query: str,
        fetcher: Callable[[str], Any],
        category: str,
    ) -> None:
        """Fetch and cache a single warm-up query."""
        try:
            if asyncio.iscoroutinefunction(fetcher):
                value = await fetcher(query)
            else:
                value = fetcher(query)
            await self.set(query, value, category)
        except Exception as exc:
            logger.warning("Warm-up failed for '%s': %s", query, exc)
            raise

    async def get_warmup_history(self) -> List[str]:
        """Get list of queries that have been warmed."""
        return list(self._warmup_history)

    # -- Internal eviction ----------------------------------------------------

    def _evict_lru(self) -> None:
        """Evict least recently used entry."""
        if not self._store:
            return
        hashed, entry = self._store.popitem(last=False)
        self._category_index.get(entry.category, set()).discard(hashed)
        self._evictions += 1
        logger.debug("LRU evicted: %s", entry.key)

    def _evict_entry(self, hashed: str) -> None:
        """Evict a specific entry by hash."""
        entry = self._store.pop(hashed, None)
        if entry:
            self._category_index.get(entry.category, set()).discard(hashed)
            self._evictions += 1

    # -- Context manager for batch operations --------------------------------

    async def batch(self) -> "CacheBatch":
        """Return a batch context for atomic multi-operations."""
        return CacheBatch(self)


class CacheBatch:
    """Context manager for batch cache operations."""

    def __init__(self, cache: SmartCache) -> None:
        self.cache = cache
        self._ops: List[Tuple[str, str, Any]] = []  # (op, key, value_or_category)

    async def __aenter__(self) -> "CacheBatch":
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if exc_type is None:
            for op, key, val in self._ops:
                if op == "set":
                    cat, value = val
                    await self.cache.set(key, value, cat)
                elif op == "delete":
                    await self.cache.delete(key, val)

    def set(self, key: str, value: Any, category: str = "default") -> None:
        self._ops.append(("set", key, (category, value)))

    def delete(self, key: str, category: str = "default") -> None:
        self._ops.append(("delete", key, category))


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

class TestSmartCache(unittest.IsolatedAsyncioTestCase):
    async def test_basic_set_get(self) -> None:
        cache = SmartCache()
        await cache.set("key1", {"data": 42}, category="drug_info")
        val = await cache.get("key1", category="drug_info")
        self.assertEqual(val, {"data": 42})

    async def test_miss_returns_none(self) -> None:
        cache = SmartCache()
        val = await cache.get("nonexistent")
        self.assertIsNone(val)

    async def test_expiration(self) -> None:
        cache = SmartCache()
        await cache.set("key1", "value", category="clinical_trial", ttl=0)
        # Immediately try to get — should be expired
        await asyncio.sleep(0.01)
        val = await cache.get("key1", category="clinical_trial")
        self.assertIsNone(val)

    async def test_delete(self) -> None:
        cache = SmartCache()
        await cache.set("key1", "value")
        self.assertTrue(await cache.delete("key1"))
        self.assertIsNone(await cache.get("key1"))
        self.assertFalse(await cache.delete("key1"))

    async def test_exists(self) -> None:
        cache = SmartCache()
        await cache.set("key1", "value")
        self.assertTrue(await cache.exists("key1"))
        self.assertFalse(await cache.exists("nonexistent"))

    async def test_get_or_compute(self) -> None:
        cache = SmartCache()
        call_count = 0

        def compute() -> int:
            nonlocal call_count
            call_count += 1
            return 42

        val1 = await cache.get_or_compute("computed", compute)
        self.assertEqual(val1, 42)
        self.assertEqual(call_count, 1)

        # Second call should use cache
        val2 = await cache.get_or_compute("computed", compute)
        self.assertEqual(val2, 42)
        self.assertEqual(call_count, 1)

    async def test_mget_mset(self) -> None:
        cache = SmartCache()
        await cache.mset({"a": 1, "b": 2, "c": 3})
        results = await cache.mget(["a", "b", "missing"])
        self.assertEqual(results["a"], 1)
        self.assertEqual(results["b"], 2)
        self.assertIsNone(results["missing"])

    async def test_invalidate_category(self) -> None:
        cache = SmartCache()
        await cache.set("k1", "v1", category="drug_info")
        await cache.set("k2", "v2", category="drug_info")
        await cache.set("k3", "v3", category="genomic")
        removed = await cache.invalidate_category("drug_info")
        self.assertEqual(removed, 2)
        self.assertIsNone(await cache.get("k1", "drug_info"))
        self.assertIsNotNone(await cache.get("k3", "genomic"))

    async def test_invalidate_pattern(self) -> None:
        cache = SmartCache()
        await cache.set("sertraline_dosage", "data1", category="drug_info")
        await cache.set("sertraline_interactions", "data2", category="drug_info")
        await cache.set("fluoxetine_dosage", "data3", category="drug_info")
        removed = await cache.invalidate_pattern("sertraline")
        self.assertEqual(removed, 2)
        self.assertIsNone(await cache.get("sertraline_dosage", "drug_info"))
        self.assertIsNotNone(await cache.get("fluoxetine_dosage", "drug_info"))

    async def test_stats(self) -> None:
        cache = SmartCache()
        await cache.set("k1", "v1")
        await cache.get("k1")  # hit
        await cache.get("missing")  # miss
        stats = await cache.stats()
        self.assertEqual(stats.total_entries, 1)
        self.assertEqual(stats.total_hits, 1)
        self.assertEqual(stats.total_misses, 1)
        self.assertEqual(stats.hit_rate, 0.5)

    async def test_lru_eviction(self) -> None:
        cache = SmartCache(max_size=3)
        await cache.set("k1", "v1")
        await cache.set("k2", "v2")
        await cache.set("k3", "v3")
        await cache.set("k4", "v4")  # Should evict k1
        self.assertIsNone(await cache.get("k1"))
        self.assertIsNotNone(await cache.get("k2"))
        self.assertIsNotNone(await cache.get("k3"))
        self.assertIsNotNone(await cache.get("k4"))

    async def test_clear(self) -> None:
        cache = SmartCache()
        await cache.set("k1", "v1")
        await cache.set("k2", "v2")
        await cache.clear()
        stats = await cache.stats()
        self.assertEqual(stats.total_entries, 0)
        self.assertIsNone(await cache.get("k1"))

    async def test_batch(self) -> None:
        cache = SmartCache()
        async with await cache.batch() as batch:
            batch.set("k1", "v1")
            batch.set("k2", "v2")
        self.assertEqual(await cache.get("k1"), "v1")
        self.assertEqual(await cache.get("k2"), "v2")

    async def test_different_categories_same_key(self) -> None:
        cache = SmartCache()
        await cache.set("entity", "drug_data", category="drug_info")
        await cache.set("entity", "genome_data", category="genomic")
        self.assertEqual(await cache.get("entity", "drug_info"), "drug_data")
        self.assertEqual(await cache.get("entity", "genomic"), "genome_data")

    async def test_ttl_policy_lookup(self) -> None:
        cache = SmartCache()
        for cat in TTL_POLICIES:
            await cache.set("k", "v", category=cat)
            entry = cache._store[_hash_key(f"{cat}:k")]
            expected_ttl = TTL_POLICIES[cat]
            actual_ttl = entry.expires_at - entry.created_at
            self.assertAlmostEqual(actual_ttl, expected_ttl, delta=1)


def run_tests() -> None:
    unittest.main(module=__name__, exit=False, verbosity=2)


if __name__ == "__main__":
    run_tests()
