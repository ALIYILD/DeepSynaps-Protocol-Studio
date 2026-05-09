"""Pin the public pure-function contracts of
app/services/advisor_outcome_pairing.py.

The DB-dependent pair_advice_with_outcomes() is excluded (requires Session).
All other public functions are pure aggregators operating on
AdvisorOutcomeRecord lists or scalar inputs.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services.advisor_outcome_pairing import (
    DEFAULT_PAIR_LOOKAHEAD_DAYS,
    DEFAULT_WINDOW_DAYS,
    KNOWN_ADVICE_CODES,
    MAX_WINDOW_DAYS,
    MIN_WINDOW_DAYS,
    OUTCOME_PAIRED_DISAPPEARED,
    OUTCOME_PAIRED_PRESENT,
    OUTCOME_PENDING,
    OUTCOME_STALE,
    PAIR_TOLERANCE_DAYS,
    AdvisorOutcomeRecord,
    _coerce_dt,
    _normalize_lookahead,
    _normalize_window,
    _parse_kv,
    _to_float,
    _to_int,
    compute_advisor_calibration,
    compute_advisor_calibration_by_channel,
    compute_weekly_trend_buckets,
)


# ── Constants pinning ─────────────────────────────────────────────────────────

class TestConstants:
    def test_default_window_days(self):
        assert DEFAULT_WINDOW_DAYS == 90

    def test_default_pair_lookahead_days(self):
        assert DEFAULT_PAIR_LOOKAHEAD_DAYS == 14

    def test_pair_tolerance_days(self):
        assert PAIR_TOLERANCE_DAYS == 2

    def test_min_max_window(self):
        assert MIN_WINDOW_DAYS == 7
        assert MAX_WINDOW_DAYS == 365

    def test_known_advice_codes_tuple(self):
        assert "REFLAG_HIGH" in KNOWN_ADVICE_CODES
        assert "MANUAL_REFLAG" in KNOWN_ADVICE_CODES
        assert "AUTH_DOMINANT" in KNOWN_ADVICE_CODES


# ── _parse_kv ─────────────────────────────────────────────────────────────────

class TestParseKv:
    def test_basic_parse(self):
        result = _parse_kv("clinic_id=abc channel=email advice_code=REFLAG_HIGH")
        assert result["clinic_id"] == "abc"
        assert result["channel"] == "email"
        assert result["advice_code"] == "REFLAG_HIGH"

    def test_trailing_semicolon_stripped(self):
        result = _parse_kv("key=value;")
        assert result["key"] == "value"

    def test_trailing_comma_stripped(self):
        result = _parse_kv("key=value,")
        assert result["key"] == "value"

    def test_empty_string_returns_empty_dict(self):
        assert _parse_kv("") == {}

    def test_tokens_without_equals_skipped(self):
        result = _parse_kv("noise foo=bar baz")
        assert "noise" not in result
        assert "baz" not in result
        assert result.get("foo") == "bar"

    def test_float_value(self):
        result = _parse_kv("re_flag_rate_pct=12.5")
        assert result["re_flag_rate_pct"] == "12.5"


# ── _coerce_dt ────────────────────────────────────────────────────────────────

class TestCoerceDt:
    def test_none_returns_none(self):
        assert _coerce_dt(None) is None

    def test_empty_string_returns_none(self):
        assert _coerce_dt("") is None

    def test_iso_with_tz(self):
        iso = "2026-01-15T10:00:00+00:00"
        dt = _coerce_dt(iso)
        assert dt is not None
        assert dt.tzinfo is not None
        assert dt.year == 2026

    def test_naive_iso_gets_utc(self):
        iso = "2026-01-15T10:00:00"
        dt = _coerce_dt(iso)
        assert dt is not None
        assert dt.tzinfo == timezone.utc

    def test_bad_string_returns_none(self):
        assert _coerce_dt("not-a-date") is None


# ── _to_float / _to_int ───────────────────────────────────────────────────────

class TestToFloatInt:
    def test_to_float_none_gives_zero(self):
        assert _to_float(None) == 0.0

    def test_to_float_string_number(self):
        assert _to_float("42.5") == 42.5

    def test_to_float_bad_string_gives_zero(self):
        assert _to_float("abc") == 0.0

    def test_to_int_none_gives_zero(self):
        assert _to_int(None) == 0

    def test_to_int_string_number(self):
        assert _to_int("7") == 7

    def test_to_int_float_string(self):
        assert _to_int("3.9") == 3

    def test_to_int_bad_string_gives_zero(self):
        assert _to_int("nope") == 0


# ── _normalize_window / _normalize_lookahead ──────────────────────────────────

class TestNormalizeWindow:
    def test_none_returns_default(self):
        assert _normalize_window(None) == DEFAULT_WINDOW_DAYS  # type: ignore[arg-type]

    def test_below_min_clamps_to_min(self):
        assert _normalize_window(0) == MIN_WINDOW_DAYS

    def test_above_max_clamps_to_max(self):
        assert _normalize_window(999) == MAX_WINDOW_DAYS

    def test_valid_passthrough(self):
        assert _normalize_window(30) == 30


class TestNormalizeLookahead:
    def test_default_on_bad_input(self):
        assert _normalize_lookahead("bad") == DEFAULT_PAIR_LOOKAHEAD_DAYS  # type: ignore[arg-type]

    def test_below_one_clamps_to_one(self):
        assert _normalize_lookahead(0) == 1

    def test_above_ninety_clamps(self):
        assert _normalize_lookahead(200) == 90

    def test_valid_passthrough(self):
        assert _normalize_lookahead(21) == 21


# ── Helpers for building test records ────────────────────────────────────────

_NOW = datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc)


def _make_record(
    outcome: str,
    advice_code: str = "REFLAG_HIGH",
    channel: str = "email",
    re_flag_delta: float | None = None,
    snapshot_at: datetime | None = None,
) -> AdvisorOutcomeRecord:
    ts0 = snapshot_at or _NOW
    ts1 = ts0 + timedelta(days=14) if outcome != OUTCOME_PENDING else None
    return AdvisorOutcomeRecord(
        channel=channel,
        advice_code=advice_code,
        severity="medium",
        snapshot_at=ts0,
        paired_at=ts1,
        re_flag_rate_pct_t0=20.0,
        re_flag_rate_pct_t1=(20.0 + re_flag_delta) if re_flag_delta is not None else None,
        re_flag_rate_delta=re_flag_delta,
        confirmed_count_t0=5,
        confirmed_count_t1=5 if outcome == OUTCOME_PAIRED_PRESENT else None,
        confirmed_count_delta=0 if outcome == OUTCOME_PAIRED_PRESENT else None,
        manual_rotation_share_pct_t0=30.0,
        manual_rotation_share_pct_t1=30.0 if outcome == OUTCOME_PAIRED_PRESENT else None,
        manual_rotation_share_delta=0.0 if outcome == OUTCOME_PAIRED_PRESENT else None,
        card_disappeared=outcome == OUTCOME_PAIRED_DISAPPEARED,
        outcome=outcome,
        snapshot_event_id="evt-001",
    )


# ── compute_advisor_calibration ───────────────────────────────────────────────

class TestComputeAdvisorCalibration:
    def test_empty_records_all_known_codes_present(self):
        result = compute_advisor_calibration([])
        for code in KNOWN_ADVICE_CODES:
            assert code in result

    def test_disappeared_count_counted(self):
        records = [
            _make_record(OUTCOME_PAIRED_DISAPPEARED, "REFLAG_HIGH"),
            _make_record(OUTCOME_PAIRED_DISAPPEARED, "REFLAG_HIGH"),
            _make_record(OUTCOME_PAIRED_PRESENT, "REFLAG_HIGH"),
        ]
        result = compute_advisor_calibration(records)
        assert result["REFLAG_HIGH"]["card_disappeared_count"] == 2
        assert result["REFLAG_HIGH"]["total_cards"] == 3

    def test_disappeared_pct_calculation(self):
        records = [
            _make_record(OUTCOME_PAIRED_DISAPPEARED, "MANUAL_REFLAG"),
            _make_record(OUTCOME_PAIRED_PRESENT, "MANUAL_REFLAG"),
        ]
        result = compute_advisor_calibration(records)
        assert result["MANUAL_REFLAG"]["card_disappeared_pct"] == 50.0
        assert result["MANUAL_REFLAG"]["predictive_accuracy_pct"] == 50.0

    def test_pending_counted_separately(self):
        records = [
            _make_record(OUTCOME_PENDING, "AUTH_DOMINANT"),
        ]
        result = compute_advisor_calibration(records)
        assert result["AUTH_DOMINANT"]["total_pending"] == 1
        assert result["AUTH_DOMINANT"]["total_cards"] == 0

    def test_mean_re_flag_delta(self):
        records = [
            _make_record(OUTCOME_PAIRED_PRESENT, "REFLAG_HIGH", re_flag_delta=-5.0),
            _make_record(OUTCOME_PAIRED_PRESENT, "REFLAG_HIGH", re_flag_delta=-3.0),
        ]
        result = compute_advisor_calibration(records)
        assert result["REFLAG_HIGH"]["mean_re_flag_rate_delta"] == -4.0

    def test_stale_excluded_from_totals(self):
        records = [
            _make_record(OUTCOME_STALE, "REFLAG_HIGH"),
        ]
        result = compute_advisor_calibration(records)
        assert result["REFLAG_HIGH"]["total_cards"] == 0
        assert result["REFLAG_HIGH"]["total_pending"] == 0


# ── compute_advisor_calibration_by_channel ────────────────────────────────────

class TestComputeCalibrationByChannel:
    def test_groups_by_channel(self):
        records = [
            _make_record(OUTCOME_PAIRED_DISAPPEARED, "REFLAG_HIGH", channel="email"),
            _make_record(OUTCOME_PAIRED_DISAPPEARED, "REFLAG_HIGH", channel="sms"),
        ]
        result = compute_advisor_calibration_by_channel(records)
        assert "email" in result
        assert "sms" in result
        assert result["email"]["card_disappeared_count"] == 1
        assert result["sms"]["card_disappeared_count"] == 1

    def test_empty_records_returns_empty(self):
        result = compute_advisor_calibration_by_channel([])
        assert result == {}


# ── compute_weekly_trend_buckets ──────────────────────────────────────────────

class TestComputeWeeklyTrendBuckets:
    def test_empty_records_returns_empty(self):
        result = compute_weekly_trend_buckets([])
        assert result == []

    def test_buckets_ordered_ascending(self):
        today = datetime.now(timezone.utc)
        records = [
            _make_record(OUTCOME_PAIRED_DISAPPEARED, snapshot_at=today - timedelta(days=14)),
            _make_record(OUTCOME_PAIRED_PRESENT, snapshot_at=today - timedelta(days=7)),
        ]
        buckets = compute_weekly_trend_buckets(records, window_days=90)
        assert len(buckets) >= 1
        # Verify ascending order
        dates = [b["week_start"] for b in buckets]
        assert dates == sorted(dates)

    def test_resolved_counted_in_bucket(self):
        today = datetime.now(timezone.utc)
        records = [
            _make_record(OUTCOME_PAIRED_DISAPPEARED, snapshot_at=today - timedelta(days=3)),
        ]
        buckets = compute_weekly_trend_buckets(records, window_days=30)
        total_resolved = sum(b["cards_resolved"] for b in buckets)
        assert total_resolved == 1

    def test_bucket_structure(self):
        today = datetime.now(timezone.utc)
        records = [
            _make_record(OUTCOME_PAIRED_PRESENT, snapshot_at=today - timedelta(days=2)),
        ]
        buckets = compute_weekly_trend_buckets(records, window_days=30)
        assert len(buckets) >= 1
        for b in buckets:
            assert "week_start" in b
            assert "cards_emitted" in b
            assert "cards_resolved" in b
