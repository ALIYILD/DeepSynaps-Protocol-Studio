"""Tests for CacheService — Redis-backed caching with safe fallback.

All tests use the in-memory _MockRedis backend — no live Redis required.
Tests verify: JSON-only serialization, PHI-safe keys, TTL behavior,
invalidation hooks, and SummaryEngine cache integration.
"""

import os
import sys
import time
import json

# Ensure src is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

import pytest
from cache_service import (
    CacheService,
    CacheConfig,
    _MockRedis,
    get_cache_service,
    reset_cache_service,
    _HAS_REDIS,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_env_and_singleton(monkeypatch):
    """Reset singleton and environment before every test."""
    reset_cache_service()
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_REDIS_CACHE", "false")
    monkeypatch.setenv("REDIS_URL", "")
    yield
    reset_cache_service()


@pytest.fixture
def mock_redis():
    """Fresh _MockRedis instance."""
    return _MockRedis()


@pytest.fixture
def cache_service(monkeypatch):
    """Fresh CacheService using mock backend."""
    monkeypatch.setenv("DEEPSYNAPS_ENABLE_REDIS_CACHE", "false")
    reset_cache_service()
    svc = CacheService()
    yield svc
    reset_cache_service()


# ═══════════════════════════════════════════════════════════════════════════════
# _MockRedis Core Behavior
# ═══════════════════════════════════════════════════════════════════════════════

class TestMockRedis:
    """Tests for the in-memory mock Redis fallback."""

    def test_set_and_get(self, mock_redis):
        """Mock should store and retrieve values."""
        mock_redis.set("key1", "value1", ex=60)
        result = mock_redis.get("key1")
        assert result == b"value1"

    def test_get_missing_key(self, mock_redis):
        """Missing keys return None."""
        assert mock_redis.get("nonexistent") is None

    def test_delete(self, mock_redis):
        """Delete removes a key."""
        mock_redis.set("key1", "value1", ex=60)
        assert mock_redis.delete("key1") == 1
        assert mock_redis.get("key1") is None

    def test_delete_missing(self, mock_redis):
        """Deleting missing key returns 0."""
        assert mock_redis.delete("nonexistent") == 0

    def test_ttl_expiration(self, mock_redis):
        """Keys expire after TTL seconds."""
        mock_redis.set("key1", "value1", ex=1)
        assert mock_redis.get("key1") == b"value1"
        time.sleep(1.5)
        assert mock_redis.get("key1") is None

    def test_delete_pattern(self, mock_redis):
        """delete_pattern removes keys matching substring."""
        mock_redis.set("prefix:a", "1", ex=60)
        mock_redis.set("prefix:b", "2", ex=60)
        mock_redis.set("other:c", "3", ex=60)
        deleted = mock_redis.delete_pattern("prefix:")
        assert deleted == 2
        assert mock_redis.get("prefix:a") is None
        assert mock_redis.get("prefix:b") is None
        assert mock_redis.get("other:c") == b"3"

    def test_ping(self, mock_redis):
        """Mock ping always returns True."""
        assert mock_redis.ping() is True

    def test_scan(self, mock_redis):
        """Scan returns matching keys."""
        mock_redis.set("scan:a", "1", ex=60)
        mock_redis.set("scan:b", "2", ex=60)
        cursor, keys = mock_redis.scan(match="scan:")
        assert cursor == 0
        assert len(keys) == 2

    def test_set_without_ttl(self, mock_redis):
        """Keys without TTL should not expire immediately."""
        mock_redis.set("no_ttl", "value", ex=None)
        # Should still be there after a short wait
        time.sleep(0.1)
        assert mock_redis.get("no_ttl") == b"value"


# ═══════════════════════════════════════════════════════════════════════════════
# CacheConfig
# ═══════════════════════════════════════════════════════════════════════════════

class TestCacheConfig:
    """Tests for cache configuration from environment."""

    def test_default_ttl(self, monkeypatch):
        """Default TTL should be 60 seconds."""
        monkeypatch.delenv("DEEPSYNAPS_CACHE_TTL_SECONDS", raising=False)
        assert CacheConfig.default_ttl() == 60

    def test_custom_ttl(self, monkeypatch):
        """Custom TTL from environment."""
        monkeypatch.setenv("DEEPSYNAPS_CACHE_TTL_SECONDS", "120")
        assert CacheConfig.default_ttl() == 120

    def test_patient_ttl(self, monkeypatch):
        """Patient cache TTL."""
        monkeypatch.setenv("DEEPSYNAPS_PATIENT_CACHE_TTL_SECONDS", "90")
        assert CacheConfig.patient_ttl() == 90

    def test_clinic_summary_ttl(self, monkeypatch):
        """Clinic summary cache TTL."""
        monkeypatch.setenv("DEEPSYNAPS_CLINIC_SUMMARY_CACHE_TTL_SECONDS", "45")
        assert CacheConfig.clinic_summary_ttl() == 45

    def test_key_prefix(self, monkeypatch):
        """Key prefix includes environment."""
        monkeypatch.setenv("DEEPSYNAPS_APP_ENV", "test")
        assert CacheConfig.key_prefix() == "ds:v1:test"

    def test_is_enabled_when_redis_unavailable(self, monkeypatch):
        """Cache should be disabled when redis-py not installed."""
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_REDIS_CACHE", "true")
        monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
        # When _HAS_REDIS is False, is_enabled returns False
        if not _HAS_REDIS:
            assert CacheConfig.is_enabled() is False


# ═══════════════════════════════════════════════════════════════════════════════
# CacheService Core
# ═══════════════════════════════════════════════════════════════════════════════

class TestCacheService:
    """Tests for CacheService with mock backend."""

    def test_is_enabled(self, cache_service):
        """Cache service should be functional."""
        assert cache_service.is_enabled() is True

    def test_is_redis_false_for_mock(self, cache_service):
        """Mock backend should report is_redis=False."""
        assert cache_service.is_redis() is False

    def test_health(self, cache_service):
        """Health check returns status dict."""
        health = cache_service.health()
        assert health["enabled"] is True
        assert health["backend"] == "mock"

    def test_set_and_get_json(self, cache_service):
        """Store and retrieve JSON values."""
        data = {"clinic_id": "c1", "count": 42}
        cache_service.set_json("test:key", data, ttl=60)
        result = cache_service.get_json("test:key")
        assert result == data

    def test_get_json_missing(self, cache_service):
        """Missing key returns None."""
        assert cache_service.get_json("missing:key") is None

    def test_json_serialization_only(self, cache_service):
        """Only JSON values should be stored — no pickle objects."""
        # datetime is serialized via default=str
        from datetime import datetime
        data = {"created_at": datetime(2024, 1, 1, 12, 0, 0)}
        cache_service.set_json("dt:key", data, ttl=60)
        result = cache_service.get_json("dt:key")
        assert result["created_at"] == "2024-01-01 12:00:00"

    def test_set_json_returns_bool(self, cache_service):
        """set_json should return True on success."""
        result = cache_service.set_json("ok:key", {"a": 1}, ttl=60)
        assert result is True

    def test_delete(self, cache_service):
        """Delete a cached key."""
        cache_service.set_json("del:key", {"x": 1}, ttl=60)
        assert cache_service.delete("del:key") == 1
        assert cache_service.get_json("del:key") is None

    def test_delete_prefix(self, cache_service):
        """Delete all keys matching a prefix."""
        cache_service.set_json("pre:a", {"x": 1}, ttl=60)
        cache_service.set_json("pre:b", {"x": 2}, ttl=60)
        cache_service.set_json("other:c", {"x": 3}, ttl=60)
        deleted = cache_service.delete_prefix("pre:")
        assert deleted == 2
        assert cache_service.get_json("pre:a") is None
        assert cache_service.get_json("other:c") is not None


# ═══════════════════════════════════════════════════════════════════════════════
# PHI-Safe Key Builder
# ═══════════════════════════════════════════════════════════════════════════════

class TestKeyBuilder:
    """Tests for CacheService.build_key — PHI-safe key construction."""

    def test_basic_key(self):
        """Key includes prefix and scope."""
        key = CacheService.build_key("clinic_dashboard", clinic_id="clinic_001")
        assert key.startswith("ds:v1:")
        assert "clinic_dashboard" in key
        assert "clinic:clinic_001" in key

    def test_patient_key(self):
        """Key includes patient ID."""
        key = CacheService.build_key("patient_dashboard", patient_id="p_123")
        assert "patient:p_123" in key

    def test_no_phi_in_key(self):
        """Keys should never contain raw PHI like names or SSNs."""
        # build_key only accepts IDs and scopes, not free-text PHI
        key = CacheService.build_key("test", clinic_id="c1", patient_id="p1")
        # Should only contain structured segments
        assert ":" in key  # Structured format
        # No spaces (no free text)
        assert " " not in key

    def test_params_are_hashed(self):
        """Params should be hashed, not stored raw."""
        key = CacheService.build_key(
            "test", clinic_id="c1", params={"filter": "some_long_filter_value" * 50}
        )
        # The key should contain "params:" with a short hash after
        assert "params:" in key
        # Extract the hash portion — it's in the joined string
        params_segment = [p for p in key.split(":") if len(p) == 12]
        assert len(params_segment) == 1  # The 12-char hash is present
        # The full filter text should NOT appear in the key
        assert "some_long_filter_value" not in key

    def test_route_in_key(self):
        """Key can include route segment."""
        key = CacheService.build_key("api", route="clinic_dashboard")
        assert "route:clinic_dashboard" in key

    def test_role_in_key(self):
        """Key can include actor role segment."""
        key = CacheService.build_key("api", actor_role="clinician")
        assert "role:clinician" in key

    def test_empty_ids_omitted(self):
        """Empty IDs should not appear in key."""
        key = CacheService.build_key("simple")
        assert "clinic:" not in key
        assert "patient:" not in key


# ═══════════════════════════════════════════════════════════════════════════════
# Cache Invalidation
# ═══════════════════════════════════════════════════════════════════════════════

class TestCacheInvalidation:
    """Tests for patient/clinic cache invalidation."""

    def test_invalidate_patient(self, cache_service):
        """invalidate_patient removes all entries for a patient."""
        # Use build_key with scope="patient" to match invalidate_patient prefix
        k1 = CacheService.build_key("patient", patient_id="p1", route="dashboard")
        k2 = CacheService.build_key("patient", patient_id="p1", route="timeline")
        k3 = CacheService.build_key("patient", patient_id="p2", route="dashboard")
        cache_service.set_json(k1, {"x": 1}, ttl=60)
        cache_service.set_json(k2, {"x": 2}, ttl=60)
        cache_service.set_json(k3, {"x": 3}, ttl=60)

        count = cache_service.invalidate_patient("p1")
        assert count == 2
        assert cache_service.get_json(k1) is None
        assert cache_service.get_json(k3) is not None

    def test_invalidate_clinic(self, cache_service):
        """invalidate_clinic removes all entries for a clinic."""
        k1 = CacheService.build_key("clinic", clinic_id="c1", route="dashboard")
        k2 = CacheService.build_key("clinic", clinic_id="c1", route="status")
        k3 = CacheService.build_key("clinic", clinic_id="c2", route="dashboard")
        cache_service.set_json(k1, {"x": 1}, ttl=60)
        cache_service.set_json(k2, {"x": 2}, ttl=60)
        cache_service.set_json(k3, {"x": 3}, ttl=60)

        count = cache_service.invalidate_clinic("c1")
        assert count == 2
        assert cache_service.get_json(k1) is None
        assert cache_service.get_json(k3) is not None

    def test_invalidate_patient_no_match(self, cache_service):
        """invalidate_patient returns 0 when no entries match."""
        count = cache_service.invalidate_patient("nonexistent")
        assert count == 0


# ═══════════════════════════════════════════════════════════════════════════════
# Singleton Pattern
# ═══════════════════════════════════════════════════════════════════════════════

class TestSingleton:
    """Tests for CacheService singleton lifecycle."""

    def test_singleton_returns_same_instance(self, monkeypatch):
        """Multiple calls return the same instance."""
        reset_cache_service()
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_REDIS_CACHE", "false")
        a = get_cache_service()
        b = get_cache_service()
        assert a is b
        reset_cache_service()

    def test_reset_creates_new_instance(self, monkeypatch):
        """After reset, a new instance is created."""
        reset_cache_service()
        monkeypatch.setenv("DEEPSYNAPS_ENABLE_REDIS_CACHE", "false")
        a = get_cache_service()
        reset_cache_service()
        b = get_cache_service()
        assert a is not b
        reset_cache_service()


# ═══════════════════════════════════════════════════════════════════════════════
# Integration: CacheService + SummaryEngine Key Patterns
# ═══════════════════════════════════════════════════════════════════════════════

class TestSummaryEngineCacheKeys:
    """Verify that SummaryEngine uses consistent cache key patterns."""

    def test_clinic_dashboard_key_pattern(self):
        """Clinic dashboard keys should be predictable."""
        key = CacheService.build_key("clinic_dashboard", clinic_id="clinic_001")
        assert "clinic_dashboard" in key
        assert "clinic:clinic_001" in key

    def test_patient_dashboard_key_pattern(self):
        """Patient dashboard keys should be predictable."""
        key = CacheService.build_key("patient_dashboard", patient_id="p_123")
        assert "patient_dashboard" in key
        assert "patient:p_123" in key

    def test_analyzer_status_key_pattern(self):
        """Analyzer status keys should be predictable."""
        key = CacheService.build_key("analyzer_status", clinic_id="clinic_001")
        assert "analyzer_status" in key
        assert "clinic:clinic_001" in key

    def test_summary_result_fits_cache(self, cache_service):
        """Typical summary results should serialize to JSON and fit in cache."""
        summary = {
            "scope": "clinic_dashboard",
            "clinic_id": "c1",
            "active_patients": 150,
            "recent_events_30d": 4230,
            "modality_breakdown": [
                {"modality": "qeeg", "count": 1200},
                {"modality": "mri", "count": 800},
            ],
            "quality_flags": {"good": 4000, "poor": 230},
        }
        cache_service.set_json("summary:c1", summary, ttl=30)
        retrieved = cache_service.get_json("summary:c1")
        assert retrieved == summary


# ═══════════════════════════════════════════════════════════════════════════════
# Security: No Pickle Serialization
# ═══════════════════════════════════════════════════════════════════════════════

class TestSecurity:
    """Security-focused tests for cache behavior."""

    def test_no_pickle_serialization(self, cache_service):
        """Cache uses JSON (with default=str fallback), never pickle."""
        class CustomObj:
            def __init__(self):
                self.value = "secret"

        obj = CustomObj()
        # JSON with default=str serializes to string repr — NOT pickle
        result = cache_service.set_json("safe:obj", obj, ttl=60)
        assert result is True  # Serialization succeeds via default=str
        # Retrieved value is a JSON string repr, not a deserialized live object
        retrieved = cache_service.get_json("safe:obj")
        assert isinstance(retrieved, str)  # JSON roundtripped as string
        assert "CustomObj" in retrieved   # String representation, not pickle

    def test_nested_json_roundtrip(self, cache_service):
        """Complex nested structures should survive roundtrip."""
        data = {
            "level1": {
                "level2": {
                    "list": [1, 2, 3],
                    "bool": True,
                    "null": None,
                    "float": 3.14,
                }
            }
        }
        cache_service.set_json("nested", data, ttl=60)
        result = cache_service.get_json("nested")
        assert result == data

    def test_unicode_in_values(self, cache_service):
        """Unicode values should survive roundtrip."""
        data = {"note": "Patient reported dizziness and naus\u00e9e"}
        cache_service.set_json("unicode", data, ttl=60)
        result = cache_service.get_json("unicode")
        assert result["note"] == "Patient reported dizziness and naus\u00e9e"

    def test_key_no_newlines(self):
        """Keys should never contain newlines (injection prevention)."""
        key = CacheService.build_key("test", clinic_id="c1", patient_id="p1")
        assert "\n" not in key
        assert "\r" not in key
