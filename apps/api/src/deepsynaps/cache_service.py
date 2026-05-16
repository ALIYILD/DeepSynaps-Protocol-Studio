"""Cache Service — optional Redis-backed caching with safe fallback.

- JSON serialization only (no pickles)
- PHI-safe scoped cache keys
- Explicit TTL on every write
- Graceful degradation when Redis unavailable
- Clinic/patient/role isolation in keys
"""

import os
import json
import hashlib
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# ── Redis Import (optional) ────────────────────────────────────
try:
    import redis
    _HAS_REDIS = True
except ImportError:
    _HAS_REDIS = False


# ── Config ─────────────────────────────────────────────────────

class CacheConfig:
    """Cache configuration from environment variables."""

    @classmethod
    def is_enabled(cls) -> bool:
        if not _HAS_REDIS:
            return False
        url = os.environ.get("REDIS_URL", "")
        enabled = os.environ.get("DEEPSYNAPS_ENABLE_REDIS_CACHE", "false").lower()
        return bool(url) and enabled in ("true", "1", "yes")

    @classmethod
    def redis_url(cls) -> Optional[str]:
        return os.environ.get("REDIS_URL") or None

    @classmethod
    def default_ttl(cls) -> int:
        return int(os.environ.get("DEEPSYNAPS_CACHE_TTL_SECONDS", "60"))

    @classmethod
    def patient_ttl(cls) -> int:
        return int(os.environ.get("DEEPSYNAPS_PATIENT_CACHE_TTL_SECONDS", "60"))

    @classmethod
    def clinic_summary_ttl(cls) -> int:
        return int(os.environ.get("DEEPSYNAPS_CLINIC_SUMMARY_CACHE_TTL_SECONDS", "30"))

    @classmethod
    def key_prefix(cls) -> str:
        env = os.environ.get("DEEPSYNAPS_APP_ENV", "development")
        return f"ds:v1:{env}"


# ── Mock Redis (fallback when Redis unavailable) ───────────────

class _MockRedis:
    """In-memory mock Redis for dev/test when real Redis is unavailable.

    Provides the same interface as redis.Redis but stores data in-process.
    NOT for production — data is lost on restart and not shared across workers.
    """

    def __init__(self):
        self._store: Dict[str, tuple] = {}  # key -> (value_json, expires_at)

    def _is_expired(self, key: str) -> bool:
        if key not in self._store:
            return True
        _, expires_at = self._store[key]
        if expires_at is not None and datetime.utcnow().timestamp() > expires_at:
            del self._store[key]
            return True
        return False

    def get(self, key: str) -> Optional[bytes]:
        if self._is_expired(key):
            return None
        value, _ = self._store[key]
        return value.encode() if isinstance(value, str) else value

    def set(self, key: str, value, ex: Optional[int] = None) -> bool:
        expires_at = datetime.utcnow().timestamp() + ex if ex else None
        self._store[key] = (value, expires_at)
        return True

    def delete(self, key: str) -> int:
        if key in self._store:
            del self._store[key]
            return 1
        return 0

    def delete_pattern(self, pattern: str) -> int:
        """Delete keys matching a pattern (simple substring match)."""
        keys_to_delete = [k for k in self._store if pattern in k]
        for k in keys_to_delete:
            del self._store[k]
        return len(keys_to_delete)

    def ping(self) -> bool:
        return True

    def scan(self, cursor: int = 0, match: str = "", count: int = 100):
        """Minimal scan implementation returning matching keys."""
        keys = [k for k in self._store.keys() if match in k]
        return (0, keys)  # cursor 0 means done


# ── Cache Service ──────────────────────────────────────────────

class CacheService:
    """Safe caching layer with Redis or in-memory fallback.

    Usage:
        cache = CacheService()
        result = cache.get_json("my_key")
        if result is None:
            result = compute_expensive_query()
            cache.set_json("my_key", result, ttl=60)
    """

    def __init__(self):
        self._client = None
        self._mock = None
        self._available = False
        self._connect()

    def _connect(self):
        """Attempt to connect to Redis, fall back to mock."""
        if not _HAS_REDIS:
            logger.info("redis-py not installed — using in-memory mock cache")
            self._mock = _MockRedis()
            self._available = True  # Mock is always available
            return

        url = CacheConfig.redis_url()
        if not url:
            logger.info("REDIS_URL not set — using in-memory mock cache")
            self._mock = _MockRedis()
            self._available = True
            return

        if not CacheConfig.is_enabled():
            logger.info("Redis cache disabled via DEEPSYNAPS_ENABLE_REDIS_CACHE — using mock")
            self._mock = _MockRedis()
            self._available = True
            return

        try:
            self._client = redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
            self._client.ping()
            self._available = True
            logger.info("Redis cache connected: %s", url.split("@")[-1] if "@" in url else "configured")
        except Exception as e:
            logger.warning("Redis connection failed: %s — falling back to in-memory mock", e)
            self._mock = _MockRedis()
            self._available = True

    # ── Public API ──────────────────────────────────────────────

    def is_enabled(self) -> bool:
        """True if cache is functional (Redis or mock)."""
        return self._available

    def is_redis(self) -> bool:
        """True if using real Redis (not mock)."""
        return self._client is not None

    def health(self) -> Dict[str, Any]:
        """Return cache health status."""
        return {
            "enabled": self.is_enabled(),
            "backend": "redis" if self.is_redis() else "mock",
            "redis_url_set": CacheConfig.redis_url() is not None,
            "env_enabled": os.environ.get("DEEPSYNAPS_ENABLE_REDIS_CACHE", "false").lower(),
        }

    def get_json(self, key: str) -> Optional[Any]:
        """Get a JSON value from cache. Returns None on miss."""
        if not self.is_enabled():
            return None
        try:
            raw = self._redis_get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as e:
            logger.debug("Cache get error for key %s: %s", key, e)
            return None

    def set_json(self, key: str, value: Any, ttl: int) -> bool:
        """Store a JSON value with explicit TTL (seconds)."""
        if not self.is_enabled():
            return False
        try:
            serialized = json.dumps(value, default=str)
            return self._redis_set(key, serialized, ex=ttl)
        except Exception as e:
            logger.debug("Cache set error for key %s: %s", key, e)
            return False

    def delete(self, key: str) -> int:
        """Delete a single key. Returns number of keys deleted."""
        if not self.is_enabled():
            return 0
        try:
            return self._redis_delete(key)
        except Exception as e:
            logger.debug("Cache delete error for key %s: %s", key, e)
            return 0

    def delete_prefix(self, prefix: str) -> int:
        """Delete all keys matching a prefix. Use with caution."""
        if not self.is_enabled():
            return 0
        try:
            if self.is_redis():
                # Use SCAN to avoid blocking Redis
                cursor = 0
                deleted = 0
                while True:
                    cursor, keys = self._client.scan(cursor=cursor, match=f"{prefix}*", count=100)
                    if keys:
                        self._client.delete(*keys)
                        deleted += len(keys)
                    if cursor == 0:
                        break
                return deleted
            else:
                return self._mock.delete_pattern(prefix)
        except Exception as e:
            logger.debug("Cache delete_prefix error for %s: %s", prefix, e)
            return 0

    def invalidate_patient(self, patient_id: str) -> int:
        """Invalidate all cache entries for a patient."""
        prefix = self.build_key("patient", patient_id=patient_id)
        count = self.delete_prefix(prefix)
        logger.info("Invalidated %d cache entries for patient %s", count, patient_id)
        return count

    def invalidate_clinic(self, clinic_id: str) -> int:
        """Invalidate all cache entries for a clinic."""
        prefix = self.build_key("clinic", clinic_id=clinic_id)
        count = self.delete_prefix(prefix)
        logger.info("Invalidated %d cache entries for clinic %s", count, clinic_id)
        return count

    # ── Key Builder ─────────────────────────────────────────────

    @classmethod
    def build_key(
        cls,
        scope: str,
        clinic_id: str = "",
        patient_id: str = "",
        route: str = "",
        params: Optional[Dict] = None,
        actor_role: str = "",
    ) -> str:
        """Build a PHI-safe scoped cache key.

        Format: ds:v1:{env}:{scope}:{clinic_id}:patient:{patient_id}:route:{hash}

        NEVER includes raw PHI — only IDs, scopes, and hashed params.
        """
        parts = [CacheConfig.key_prefix(), scope]

        if clinic_id:
            parts.append(f"clinic:{clinic_id}")
        if patient_id:
            parts.append(f"patient:{patient_id}")
        if route:
            parts.append(f"route:{route}")
        if actor_role:
            parts.append(f"role:{actor_role}")
        if params:
            # Hash params to avoid long keys with unbounded text
            params_json = json.dumps(params, sort_keys=True, default=str)
            params_hash = hashlib.sha256(params_json.encode()).hexdigest()[:12]
            parts.append(f"params:{params_hash}")

        return ":".join(parts)

    # ── Internal helpers ────────────────────────────────────────

    def _redis_get(self, key: str):
        if self._client:
            return self._client.get(key)
        return self._mock.get(key)

    def _redis_set(self, key: str, value: str, ex: int) -> bool:
        if self._client:
            return self._client.set(key, value, ex=ex)
        return self._mock.set(key, value, ex=ex)

    def _redis_delete(self, key: str) -> int:
        if self._client:
            return self._client.delete(key)
        return self._mock.delete(key)


# ── Singleton ──────────────────────────────────────────────────

_cache_service: Optional[CacheService] = None


def get_cache_service() -> CacheService:
    """Return the global cache service singleton."""
    global _cache_service
    if _cache_service is None:
        _cache_service = CacheService()
    return _cache_service


def reset_cache_service():
    """Reset the singleton (for testing)."""
    global _cache_service
    _cache_service = None
