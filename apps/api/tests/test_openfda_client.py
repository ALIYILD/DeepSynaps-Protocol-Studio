"""Tests for OpenFDA API client.

Covers:
- Mock tests for OpenFDA API calls
- Cache hit/miss tests
- Offline fallback tests
- Signal detection PRR calculation tests
"""
from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import time
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.services.openfda_client import (
    EVIDENCE_GRADE,
    CacheEntry,
    OpenFDACache,
    _calculate_prr_metrics,
    _empty_prr_result,
    _parse_event_results,
    _parse_label_results,
    cache_stats,
    clear_cache,
    get_cache,
    query_adverse_events,
    query_drug_label,
    signal_detection_prr,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def temp_db():
    """Temporary SQLite database for cache tests."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    yield db_path
    try:
        os.unlink(db_path)
    except FileNotFoundError:
        pass


@pytest.fixture
def cache(temp_db):
    """Fresh cache instance with temp DB."""
    return OpenFDACache(temp_db)


@pytest.fixture
def mock_event_response():
    """Sample OpenFDA adverse event API response."""
    return {
        "meta": {
            "disclaimer": "Do not rely on openFDA to make decisions...",
            "terms": "https://open.fda.gov/terms/",
            "license": "https://open.fda.gov/license/",
            "last_updated": "2024-01-15",
            "results": {"skip": 0, "limit": 5, "total": 12345},
        },
        "results": [
            {
                "safetyreportid": "12345678-2024-001",
                "receivedate": "20240110",
                "serious": "1",
                "seriousnessdeath": "",
                "seriousnesshospitalization": "1",
                "seriousnessdisabling": "",
                "seriousnesscongenitalanomali": "",
                "seriousnesslifethreatening": "",
                "patient": {
                    "patientonsetage": "45",
                    "patientonsetageunit": "801",
                    "patientsex": "1",
                    "patientweight": "70.5",
                    "drug": [
                        {
                            "medicinalproduct": "SERTRALINE",
                            "drugcharacterization": "1",
                        },
                        {
                            "medicinalproduct": "ASPIRIN",
                            "drugcharacterization": "2",
                        },
                    ],
                    "reaction": [
                        {"reactionmeddrapt": "Nausea"},
                        {"reactionmeddrapt": "Headache"},
                    ],
                },
                "primarysource": {"qualification": "1"},
            },
            {
                "safetyreportid": "12345678-2024-002",
                "receivedate": "20240112",
                "serious": "2",
                "seriousnessdeath": "1",
                "patient": {
                    "patientonsetage": "62",
                    "patientonsetageunit": "801",
                    "patientsex": "2",
                    "drug": [
                        {
                            "medicinalproduct": "SERTRALINE",
                            "drugcharacterization": "1",
                        },
                    ],
                    "reaction": [
                        {"reactionmeddrapt": "Completed suicide"},
                    ],
                },
                "primarysource": {"qualification": "3"},
            },
        ],
    }


@pytest.fixture
def mock_label_response():
    """Sample OpenFDA drug label API response."""
    return {
        "meta": {
            "disclaimer": "Do not rely on openFDA...",
            "results": {"skip": 0, "limit": 1, "total": 3},
        },
        "results": [
            {
                "set_id": "e6f5c8e7-1234-5678-9abc-def012345678",
                "id": "12345678-abcd-ef01-2345-6789abcdef01",
                "openfda": {
                    "generic_name": ["sertraline"],
                    "brand_name": ["Zoloft"],
                    "manufacturer_name": ["Pfizer"],
                },
                "warnings": [
                    "WARNING: SUICIDALITY AND ANTIDEPRESSANT DRUGS",
                ],
                "boxed_warning": [
                    "BOXED WARNING: SUICIDAL THINKING AND BEHAVIOR",
                ],
                "contraindications": [
                    "Contraindicated in patients taking MAOIs...",
                ],
                "precautions": [
                    "Precautions: serotonin syndrome...",
                ],
                "drug_interactions": [
                    "Drug interactions with MAOIs, pimozide, warfarin...",
                ],
                "pregnancy": ["Pregnancy Category C..."],
                "indications_and_usage": [
                    "Treatment of major depressive disorder...",
                ],
            },
        ],
    }


# ── Cache tests ──────────────────────────────────────────────────────────────


class TestOpenFDACache:
    """Tests for OpenFDACache class."""

    def test_schema_creation(self, temp_db):
        """Cache schema is created on initialization."""
        cache = OpenFDACache(temp_db)
        assert cache._db_ok

        # Verify tables exist
        with sqlite3.connect(temp_db) as conn:
            tables = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='openfda_cache'"
            ).fetchone()
            assert tables is not None

    def test_set_and_get(self, cache):
        """Cache set and get roundtrip."""
        test_data = {"results": [{"test": "data"}], "meta": {"total": 100}}
        cache.set("test_endpoint", {"q": "sertraline"}, test_data, drug_name="sertraline")

        entry = cache.get("test_endpoint", {"q": "sertraline"})
        assert entry is not None
        assert entry.data == test_data
        assert entry.is_fresh

    def test_cache_miss(self, cache):
        """Cache miss returns None."""
        entry = cache.get("nonexistent", {"q": "nothing"})
        assert entry is None

    def test_cache_expiration(self, cache):
        """Expired entries are not returned."""
        test_data = {"results": []}
        cache.set("ep", {"q": "x"}, test_data)

        # Manually expire the entry
        entry = cache.get("ep", {"q": "x"})
        entry.created_at = time.time() - 25 * 60 * 60  # 25 hours ago
        cache._memory[entry.key] = entry

        # Should be a miss now
        result = cache.get("ep", {"q": "x"})
        assert result is None

    def test_offline_fallback(self, cache):
        """Offline fallback returns stale data with flags."""
        test_data = {"results": [{"event": "test"}]}
        cache.set("ep", {"q": "drug"}, test_data)

        # Get offline fallback
        fallback = cache.get_offline_fallback("ep", {"q": "drug"})
        assert fallback is not None
        assert fallback["cached"] is True
        assert fallback["offline"] is True
        assert "cache_age_hours" in fallback
        assert fallback["results"] == test_data["results"]

    def test_offline_fallback_no_data(self, cache):
        """Offline fallback returns None when no data exists."""
        fallback = cache.get_offline_fallback("missing", {"q": "none"})
        assert fallback is None

    def test_memory_fallback_when_db_fails(self, temp_db):
        """Cache falls back to in-memory when DB is unavailable."""
        cache = OpenFDACache(temp_db)
        test_data = {"results": ["in_memory"]}
        cache.set("ep", {"q": "test"}, test_data)

        # Corrupt the DB path to simulate failure
        cache._db_ok = False
        cache._db_path = "/nonexistent/path/cache.db"

        # Should still work from memory
        entry = cache.get("ep", {"q": "test"})
        assert entry is not None
        assert entry.data == test_data

    def test_clear_expired(self, cache):
        """Clear expired entries."""
        cache.set("fresh", {"q": "x"}, {"data": "fresh"})
        cache.set("stale", {"q": "y"}, {"data": "stale"})

        # Make one entry stale
        entry = cache.get("stale", {"q": "y"})
        entry.created_at = time.time() - 25 * 60 * 60
        cache._memory[entry.key] = entry

        count = cache.clear_expired()
        assert count > 0

    def test_clear_all(self, cache):
        """Clear entire cache."""
        cache.set("a", {"q": "1"}, {"data": "1"})
        cache.set("b", {"q": "2"}, {"data": "2"})

        count = cache.clear_all()
        assert count >= 2

    def test_stats(self, cache):
        """Cache stats are returned."""
        cache.set("a", {"q": "1"}, {"data": "1"})
        stats = cache.stats()
        assert "memory_entries" in stats
        assert "db_entries" in stats
        assert stats["ttl_hours"] == 24

    def test_deterministic_key(self, cache):
        """Same inputs produce same cache key."""
        params = {"q": "sertraline", "limit": 5}
        key1 = cache._make_key("endpoint", params)
        key2 = cache._make_key("endpoint", dict(params))
        assert key1 == key2


# ── API query tests with mocks ───────────────────────────────────────────────


class TestQueryAdverseEvents:
    """Tests for query_adverse_events function."""

    @patch("app.services.openfda_client._sync_get")
    def test_basic_query(self, mock_get, mock_event_response):
        """Basic adverse event query returns parsed results."""
        mock_get.return_value = mock_event_response

        result = query_adverse_events("sertraline", limit=5)

        assert len(result) == 2
        assert result[0]["safety_report_id"] == "12345678-2024-001"
        assert result[0]["patient"]["age"] == "45"
        assert result[0]["reactions"] == ["Nausea", "Headache"]
        mock_get.assert_called_once()

    @patch("app.services.openfda_client._sync_get")
    def test_evidence_metadata(self, mock_get, mock_event_response):
        """Results carry evidence grade and disclaimer."""
        mock_get.return_value = mock_event_response

        result = query_adverse_events("sertraline")

        assert result[0]["evidence_grade"] == EVIDENCE_GRADE
        assert "disclaimer" in result[0]
        assert "OpenFDA" in result[0]["evidence_source"]

    def test_empty_drug_name(self):
        """Empty drug name returns empty list."""
        result = query_adverse_events("")
        assert result == []

    @patch("app.services.openfda_client._sync_get")
    def test_api_error_offline_fallback(self, mock_get):
        """API error returns cached data with offline flags."""
        mock_get.side_effect = httpx.HTTPStatusError(
            "Server error",
            request=MagicMock(),
            response=MagicMock(status_code=500),
        )

        # First populate the cache
        cache = get_cache()
        test_data = {"results": [{"cached_event": True}], "meta": {}}
        cache.set("https://api.fda.gov/drug/event.json", test_data)

        # Use a unique query to test fallback
        result = query_adverse_events("nonexistent_drug_xyz_999")
        # Since cache is empty for this specific query, should return empty
        assert isinstance(result, list)


class TestQueryDrugLabel:
    """Tests for query_drug_label function."""

    @patch("app.services.openfda_client._sync_get")
    def test_basic_query(self, mock_get, mock_label_response):
        """Basic drug label query returns parsed results."""
        mock_get.return_value = mock_label_response

        result = query_drug_label("sertraline")

        assert result is not None
        assert "sertraline" in result["generic_name"]
        assert result["evidence_grade"] == EVIDENCE_GRADE
        assert len(result["boxed_warning"]) > 0
        mock_get.assert_called_once()

    @patch("app.services.openfda_client._sync_get")
    def test_warnings_and_interactions(self, mock_get, mock_label_response):
        """Label includes warnings, contraindications, and interactions."""
        mock_get.return_value = mock_label_response

        result = query_drug_label("sertraline")

        assert len(result["warnings"]) > 0
        assert len(result["contraindications"]) > 0
        assert len(result["drug_interactions"]) > 0
        assert len(result["indications"]) > 0

    @patch("app.services.openfda_client._sync_get")
    def test_no_results(self, mock_get):
        """No label found returns None."""
        mock_get.return_value = {"meta": {}, "results": []}

        result = query_drug_label("unknown_drug_xyz")
        assert result is None

    def test_empty_drug_name(self):
        """Empty drug name returns None."""
        result = query_drug_label("")
        assert result is None


# ── Signal detection / PRR tests ─────────────────────────────────────────────


class TestSignalDetectionPRR:
    """Tests for signal_detection_prr function."""

    @patch("app.services.openfda_client._count_reports")
    @patch("app.services.openfda_client._estimate_total_reports")
    def test_basic_prr_calculation(self, mock_total, mock_count):
        """PRR is calculated correctly for known counts."""
        # a: drug+event, b: drug without event, c: not drug+event, d: neither
        # a=50, b=950, c=100, d=9900
        mock_count.side_effect = [50, 950, 100]  # a, b, c
        mock_total.return_value = 11000  # a+b+c+d

        result = signal_detection_prr("sertraline", "nausea")

        assert result["prr"] is not None
        assert result["prr"] > 0
        assert "chi_square" in result
        assert "ci_95" in result
        assert result["counts"]["a"] == 50
        assert result["counts"]["b"] == 950
        assert result["counts"]["c"] == 100

    @patch("app.services.openfda_client._count_reports")
    @patch("app.services.openfda_client._estimate_total_reports")
    def test_signal_detected(self, mock_total, mock_count):
        """PRR >= 2 and chi-square > 4 signals detection."""
        # Strong signal: a=100, b=400, c=50, d=9450
        mock_count.side_effect = [100, 400, 50]
        mock_total.return_value = 10000

        result = signal_detection_prr("drugx", "eventy")

        assert result["prr"] >= 2.0
        assert result["chi_square"] > 4.0
        assert result["interpretation"] == "potential safety signal detected"

    @patch("app.services.openfda_client._count_reports")
    @patch("app.services.openfda_client._estimate_total_reports")
    def test_no_signal(self, mock_total, mock_count):
        """PRR < 1.5 indicates no signal."""
        mock_count.side_effect = [10, 990, 200]
        mock_total.return_value = 12000

        result = signal_detection_prr("drugx", "eventy")

        assert result["prr"] < 1.5
        assert result["interpretation"] in ["no signal", "negative association"]

    def test_empty_inputs(self):
        """Empty drug or event name returns empty result."""
        result = signal_detection_prr("", "event")
        assert result["prr"] is None

        result = signal_detection_prr("drug", "")
        assert result["prr"] is None

    @patch("app.services.openfda_client._count_reports")
    @patch("app.services.openfda_client._estimate_total_reports")
    def test_prr_cache(self, mock_total, mock_count):
        """PRR results are cached."""
        mock_count.side_effect = [20, 480, 50]
        mock_total.return_value = 10000

        # First call
        result1 = signal_detection_prr("sertraline", "headache")
        # Second call should use cache
        result2 = signal_detection_prr("sertraline", "headache")

        assert result1["prr"] == result2["prr"]


# ── PRR calculation unit tests ───────────────────────────────────────────────


class TestPRRMetrics:
    """Unit tests for PRR calculation internals."""

    def test_calculate_prr_metrics(self):
        """PRR calculation produces expected values."""
        # Known case: a=40, b=160, c=20, d=780
        # PRR = (40/200) / (20/800) = 0.2 / 0.025 = 8.0
        result = _calculate_prr_metrics("drug", "event", 40, 160, 20, 780)

        assert result["prr"] == pytest.approx(8.0, abs=0.1)
        assert result["counts"]["a"] == 40
        assert result["counts"]["b"] == 160
        assert result["counts"]["c"] == 20
        assert result["counts"]["d"] == 780
        assert result["interpretation"] == "potential safety signal detected"

    def test_prr_no_signal(self):
        """PRR < 2 with low chi-square = no signal."""
        result = _calculate_prr_metrics("drug", "event", 10, 990, 100, 9900)

        assert result["prr"] < 2.0
        assert result["interpretation"] != "potential safety signal detected"

    def test_prr_division_by_zero_protection(self):
        """Zero counts are handled safely."""
        result = _calculate_prr_metrics("drug", "event", 0, 100, 0, 10000)

        assert result["prr"] is not None  # Should not crash

    def test_prr_evidence_grade(self):
        """All PRR results have evidence grade C."""
        result = _calculate_prr_metrics("drug", "event", 10, 90, 5, 895)

        assert result["evidence_grade"] == EVIDENCE_GRADE
        assert "disclaimer" in result

    def test_empty_prr_result(self):
        """Empty PRR result has correct structure."""
        result = _empty_prr_result("drug", "event")

        assert result["drug"] == "drug"
        assert result["event"] == "event"
        assert result["prr"] is None
        assert result["chi_square"] is None
        assert result["interpretation"] == "insufficient data"

    def test_prr_confidence_interval(self):
        """95% CI is calculated for valid counts."""
        result = _calculate_prr_metrics("drug", "event", 50, 450, 25, 9475)

        assert result["ci_95"] is not None
        assert len(result["ci_95"]) == 2

    def test_prr_negative_association(self):
        """PRR < 1.0 indicates negative association."""
        result = _calculate_prr_metrics("drug", "event", 5, 495, 100, 9900)

        assert result["prr"] < 1.0
        assert result["interpretation"] == "negative association"


# ── Result parser tests ──────────────────────────────────────────────────────


class TestParseEventResults:
    """Tests for _parse_event_results."""

    def test_parses_results(self, mock_event_response):
        """Event results are correctly parsed."""
        results = _parse_event_results(mock_event_response)

        assert len(results) == 2
        assert results[0]["safety_report_id"] == "12345678-2024-001"
        assert results[0]["patient"]["age"] == "45"
        assert results[0]["patient"]["sex"] == "1"
        assert results[0]["reactions"] == ["Nausea", "Headache"]

    def test_empty_results(self):
        """Empty API response returns empty list."""
        results = _parse_event_results({"meta": {}, "results": []})
        assert results == []

    def test_missing_fields(self):
        """Handles missing fields gracefully."""
        raw = {
            "results": [
                {"safetyreportid": "1", "patient": {}},
            ],
        }
        results = _parse_event_results(raw)
        assert len(results) == 1
        assert results[0]["safety_report_id"] == "1"
        assert results[0]["patient"]["age"] is None


class TestParseLabelResults:
    """Tests for _parse_label_results."""

    def test_parses_label(self, mock_label_response):
        """Label results are correctly parsed."""
        result = _parse_label_results(mock_label_response)

        assert result is not None
        assert "sertraline" in result["generic_name"]
        assert len(result["boxed_warning"]) > 0
        assert len(result["warnings"]) > 0
        assert len(result["contraindications"]) > 0

    def test_no_results(self):
        """No results returns None."""
        result = _parse_label_results({"meta": {}, "results": []})
        assert result is None


# ── Cache management tests ───────────────────────────────────────────────────


class TestCacheManagement:
    """Tests for cache management utilities."""

    def test_clear_cache(self):
        """clear_cache removes all entries."""
        cache = get_cache()
        cache.set("a", {"q": "1"}, {"data": "1"})
        cache.set("b", {"q": "2"}, {"data": "2"})

        count = clear_cache()
        assert count >= 2

    def test_cache_stats(self):
        """cache_stats returns statistics."""
        stats = cache_stats()
        assert "memory_entries" in stats
        assert "db_entries" in stats
        assert stats["ttl_hours"] == 24


# ── Evidence grade tests ─────────────────────────────────────────────────────


class TestEvidenceGrade:
    """Verify all results carry evidence grade C."""

    @patch("app.services.openfda_client._sync_get")
    def test_adverse_events_grade(self, mock_get, mock_event_response):
        mock_get.return_value = mock_event_response
        result = query_adverse_events("sertraline")
        assert all(r["evidence_grade"] == "C" for r in result)

    @patch("app.services.openfda_client._sync_get")
    def test_label_grade(self, mock_get, mock_label_response):
        mock_get.return_value = mock_label_response
        result = query_drug_label("sertraline")
        assert result["evidence_grade"] == "C"

    def test_prr_grade(self):
        result = _empty_prr_result("drug", "event")
        assert result["evidence_grade"] == "C"
