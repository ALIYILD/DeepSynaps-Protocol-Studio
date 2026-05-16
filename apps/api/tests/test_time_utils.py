"""Tests for time_utils — UTC timestamp helpers.

Covers: utc_now(), utc_iso(), utc_from_timestamp(), to_naive(), to_aware().
Verifies timezone-aware UTC datetimes, no deprecation warnings.
"""

import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

import pytest
from datetime import datetime, timezone, timedelta
from time_utils import utc_now, utc_iso, utc_from_timestamp, naive_utc_now, to_naive, to_aware


# ═══════════════════════════════════════════════════════════════════════════════
# utc_now()
# ═══════════════════════════════════════════════════════════════════════════════

class TestUtcNow:
    """Tests for utc_now() — timezone-aware UTC datetime."""

    def test_returns_datetime(self):
        result = utc_now()
        assert isinstance(result, datetime)

    def test_is_aware(self):
        """Result must have tzinfo set (not naive)."""
        result = utc_now()
        assert result.tzinfo is not None

    def test_is_utc(self):
        """tzinfo must be timezone.utc."""
        result = utc_now()
        assert result.tzinfo is timezone.utc

    def test_is_recent(self):
        """Result should be within the last second."""
        result = utc_now()
        now_ts = time.time()
        result_ts = result.timestamp()
        assert abs(now_ts - result_ts) < 1.0

    def test_no_deprecation_warning(self):
        """Should not emit DeprecationWarning."""
        import warnings
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            utc_now()
            dep_warnings = [x for x in w if issubclass(x.category, DeprecationWarning)]
            assert len(dep_warnings) == 0, f"Deprecation warnings: {[str(x.message) for x in dep_warnings]}"

    def test_returns_different_times(self):
        """Two calls should return different timestamps (monotonic)."""
        t1 = utc_now()
        time.sleep(0.01)
        t2 = utc_now()
        assert t2 >= t1


# ═══════════════════════════════════════════════════════════════════════════════
# utc_iso()
# ═══════════════════════════════════════════════════════════════════════════════

class TestUtcIso:
    """Tests for utc_iso() — ISO 8601 string with timezone."""

    def test_returns_string(self):
        result = utc_iso()
        assert isinstance(result, str)

    def test_contains_timezone_offset(self):
        """ISO string should include +00:00 UTC offset."""
        result = utc_iso()
        assert "+00:00" in result

    def test_is_valid_iso(self):
        """Should be parseable as ISO 8601."""
        result = utc_iso()
        parsed = datetime.fromisoformat(result)
        assert parsed.tzinfo is not None


# ═══════════════════════════════════════════════════════════════════════════════
# utc_from_timestamp()
# ═══════════════════════════════════════════════════════════════════════════════

class TestUtcFromTimestamp:
    """Tests for utc_from_timestamp() — replaces utcfromtimestamp."""

    def test_returns_datetime(self):
        ts = time.time()
        result = utc_from_timestamp(ts)
        assert isinstance(result, datetime)

    def test_is_aware(self):
        ts = time.time()
        result = utc_from_timestamp(ts)
        assert result.tzinfo is not None

    def test_is_utc(self):
        ts = time.time()
        result = utc_from_timestamp(ts)
        assert result.tzinfo is timezone.utc

    def test_roundtrip(self):
        """timestamp() should roundtrip approximately."""
        ts = 1609459200.0  # 2021-01-01 00:00:00 UTC
        result = utc_from_timestamp(ts)
        assert abs(result.timestamp() - ts) < 0.001

    def test_no_deprecation_warning(self):
        import warnings
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            utc_from_timestamp(time.time())
            dep_warnings = [x for x in w if issubclass(x.category, DeprecationWarning)]
            assert len(dep_warnings) == 0


# ═══════════════════════════════════════════════════════════════════════════════
# naive_utc_now() — DB compatibility bridge
# ═══════════════════════════════════════════════════════════════════════════════

class TestNaiveUtcNow:
    """Tests for naive_utc_now() — intentional naive datetime for DB columns."""

    def test_returns_datetime(self):
        result = naive_utc_now()
        assert isinstance(result, datetime)

    def test_is_naive(self):
        """Result must be naive (no tzinfo) for DB compatibility."""
        result = naive_utc_now()
        assert result.tzinfo is None

    def test_is_utc_value(self):
        """Value should be approximately UTC."""
        result = naive_utc_now()
        now_utc = datetime.now(timezone.utc)
        delta = abs((result.replace(tzinfo=timezone.utc) - now_utc).total_seconds())
        assert delta < 1.0


# ═══════════════════════════════════════════════════════════════════════════════
# to_naive() / to_aware()
# ═══════════════════════════════════════════════════════════════════════════════

class TestToNaive:
    """Tests for to_naive() — convert aware to naive UTC."""

    def test_converts_aware_to_naive(self):
        aware = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        result = to_naive(aware)
        assert result.tzinfo is None
        assert result.year == 2024

    def test_passes_through_naive(self):
        naive = datetime(2024, 1, 1, 12, 0, 0)
        result = to_naive(naive)
        assert result is naive
        assert result.tzinfo is None


class TestToAware:
    """Tests for to_aware() — convert naive to aware UTC."""

    def test_converts_naive_to_aware(self):
        naive = datetime(2024, 1, 1, 12, 0, 0)
        result = to_aware(naive)
        assert result.tzinfo is timezone.utc
        assert result.year == 2024

    def test_passes_through_aware(self):
        aware = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        result = to_aware(aware)
        assert result is aware
        assert result.tzinfo is timezone.utc


# ═══════════════════════════════════════════════════════════════════════════════
# Edge Cases
# ═══════════════════════════════════════════════════════════════════════════════

class TestEdgeCases:
    """Boundary conditions."""

    def test_utc_now_microsecond_precision(self):
        result = utc_now()
        assert 0 <= result.microsecond < 1_000_000

    def test_utc_iso_sorted(self):
        """ISO strings should sort chronologically."""
        time.sleep(0.01)
        iso1 = utc_iso()
        time.sleep(0.01)
        iso2 = utc_iso()
        assert iso1 < iso2

    def test_utc_from_timestamp_zero(self):
        result = utc_from_timestamp(0.0)
        assert result.year == 1970
        assert result.month == 1
        assert result.day == 1
        assert result.tzinfo is timezone.utc
