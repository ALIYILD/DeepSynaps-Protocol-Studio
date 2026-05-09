"""Tests for deepsynaps_features.transforms.* and contracts helpers.

Every transform follows the same shape:
  - compute_online(event: dict) -> dict[str, Any]  (drops None values)
  - compute_batch(events: list|DataFrame) -> DataFrame|list

Pin the contract for all 10 transforms so a refactor can't regress
the online/batch parity.
"""

from __future__ import annotations

import importlib
from datetime import datetime, timezone

import pytest

from deepsynaps_features import contracts as contracts_mod
from deepsynaps_features.transforms.base import _coerce_dt, _iter_event_rows


# ───────────────────────────── transform parametrisation ───────────────────


# (module_name, payload_dict_with_at-least-one-known-field, expected_keys)
_TRANSFORM_FIXTURES = [
    (
        "qeeg",
        {
            "session_id": "s1",
            "alpha_power": 1.23,
            "beta_power": 4.56,
            "recording_duration_s": 300,
        },
        {"session_id", "alpha_power", "beta_power", "recording_duration_s"},
    ),
    (
        "assessment",
        {
            "instrument": "PHQ-9",
            "raw_score": 12,
            "severity_level": "moderate",
            "completion_time_s": 90,
            "is_clinician_administered": True,
        },
        {
            "instrument", "raw_score", "severity_level", "completion_time_s",
            "is_clinician_administered",
        },
    ),
    (
        "audio",
        {"utterance_id": "u1", "duration_s": 60.0, "speech_rate_wpm": 140.0},
        {"utterance_id", "duration_s", "speech_rate_wpm"},
    ),
    (
        "ehr",
        {"diagnosis_codes": ["F33.1"], "num_active_meds": 3, "bmi": 25.4},
        {"diagnosis_codes", "num_active_meds", "bmi"},
    ),
    ("mri", {"scan_id": "m1"}, {"scan_id"}),
    (
        "outcome",
        {"target": "phq9_at_8w", "label": "responder", "score": 0.78, "horizon_days": 56},
        {"target", "label", "score", "horizon_days"},
    ),
    ("therapy", {"protocol_id": "p1"}, {"protocol_id"}),
    (
        "video",
        {"clip_id": "v1", "duration_s": 120.0, "fps": 30.0},
        {"clip_id", "duration_s", "fps"},
    ),
    ("wearable", {"hrv_rmssd_ms": 42.0}, {"hrv_rmssd_ms"}),
]


def _event(payload: dict) -> dict:
    return {
        "tenant_id": "t1",
        "patient_id": "p1",
        "occurred_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "payload": payload,
    }


# ───────────────────────────── compute_online ──────────────────────────────


@pytest.mark.parametrize("module_name,payload,_expected_keys", _TRANSFORM_FIXTURES)
def test_compute_online_includes_provenance(
    module_name: str, payload: dict, _expected_keys: set,
) -> None:
    mod = importlib.import_module(f"deepsynaps_features.transforms.{module_name}")
    result = mod.compute_online(_event(payload))
    assert result["tenant_id"] == "t1"
    assert result["patient_id"] == "p1"
    assert result["occurred_at"] == datetime(2026, 1, 1, tzinfo=timezone.utc)


@pytest.mark.parametrize("module_name,payload,expected_keys", _TRANSFORM_FIXTURES)
def test_compute_online_includes_payload_keys(
    module_name: str, payload: dict, expected_keys: set,
) -> None:
    mod = importlib.import_module(f"deepsynaps_features.transforms.{module_name}")
    result = mod.compute_online(_event(payload))
    # Each documented payload key (when set) ends up in the result.
    for key in expected_keys:
        if payload.get(key) is not None:
            assert key in result, f"{module_name}.compute_online dropped {key}"


@pytest.mark.parametrize("module_name,_payload,_expected_keys", _TRANSFORM_FIXTURES)
def test_compute_online_drops_none_values(
    module_name: str, _payload: dict, _expected_keys: set,
) -> None:
    mod = importlib.import_module(f"deepsynaps_features.transforms.{module_name}")
    # An event with no payload should still carry tenant/patient/occurred_at
    # but drop every None-valued payload field.
    result = mod.compute_online(_event({}))
    assert "tenant_id" in result
    assert all(v is not None for v in result.values())


@pytest.mark.parametrize("module_name,_payload,_expected_keys", _TRANSFORM_FIXTURES)
def test_compute_online_handles_missing_payload(
    module_name: str, _payload: dict, _expected_keys: set,
) -> None:
    mod = importlib.import_module(f"deepsynaps_features.transforms.{module_name}")
    # The compute_online doc says payload is `event.get("payload") or {}`.
    # An event with payload=None should not crash.
    evt = {
        "tenant_id": "t",
        "patient_id": "p",
        "occurred_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "payload": None,
    }
    result = mod.compute_online(evt)
    assert result["tenant_id"] == "t"


# ───────────────────────────── compute_batch ───────────────────────────────


@pytest.mark.parametrize("module_name,payload,_expected_keys", _TRANSFORM_FIXTURES)
def test_compute_batch_with_list_returns_dataframe_or_list(
    module_name: str, payload: dict, _expected_keys: set,
) -> None:
    mod = importlib.import_module(f"deepsynaps_features.transforms.{module_name}")
    events = [_event(payload), _event(payload)]
    result = mod.compute_batch(events)
    # When pandas is installed → DataFrame; otherwise → list.
    if hasattr(result, "to_dict"):
        rows = result.to_dict("records")
    else:
        rows = result
    assert len(rows) == 2


@pytest.mark.parametrize("module_name,_payload,_expected_keys", _TRANSFORM_FIXTURES)
def test_compute_batch_empty_input(
    module_name: str, _payload: dict, _expected_keys: set,
) -> None:
    mod = importlib.import_module(f"deepsynaps_features.transforms.{module_name}")
    result = mod.compute_batch([])
    if hasattr(result, "to_dict"):
        rows = result.to_dict("records")
    else:
        rows = result
    assert len(rows) == 0


# ───────────────────────────── batch / online parity ───────────────────────


@pytest.mark.parametrize("module_name,payload,_expected_keys", _TRANSFORM_FIXTURES)
def test_batch_matches_online_per_row(
    module_name: str, payload: dict, _expected_keys: set,
) -> None:
    mod = importlib.import_module(f"deepsynaps_features.transforms.{module_name}")
    evt = _event(payload)
    online = mod.compute_online(evt)
    batch = mod.compute_batch([evt])
    if hasattr(batch, "to_dict"):
        row = batch.to_dict("records")[0]
    else:
        row = batch[0]
    for k, v in online.items():
        assert row[k] == v, (
            f"{module_name} online/batch parity violated on key {k}: "
            f"online={v!r} batch={row.get(k)!r}"
        )


# ───────────────────────────── transforms/base.py helpers ──────────────────


class TestIterEventRows:
    def test_none_returns_empty(self) -> None:
        assert _iter_event_rows(None) == []

    def test_list_passes_through(self) -> None:
        evts = [{"a": 1}, {"a": 2}]
        assert _iter_event_rows(evts) is evts

    def test_dataframe_like_uses_to_dict_records(self) -> None:
        class _Stub:
            def to_dict(self, mode: str = "records") -> list[dict]:
                assert mode == "records"
                return [{"x": 1}]

        assert _iter_event_rows(_Stub()) == [{"x": 1}]

    def test_to_dict_without_records_arg(self) -> None:
        # Some objects expose to_dict() without the "records" parameter.
        class _Stub:
            def to_dict(self) -> list[dict]:
                return [{"x": 2}]

        # _iter_event_rows tries to_dict("records") first, falls back to to_dict().
        result = _iter_event_rows(_Stub())
        assert result == [{"x": 2}]

    def test_iterable_passthrough(self) -> None:
        gen = ({"a": i} for i in range(2))
        assert _iter_event_rows(gen) is gen


class TestCoerceDt:
    def test_datetime_passthrough(self) -> None:
        dt = datetime(2026, 1, 1, tzinfo=timezone.utc)
        assert _coerce_dt(dt) is dt

    def test_non_datetime_passthrough(self) -> None:
        assert _coerce_dt("2026-01-01") == "2026-01-01"
        assert _coerce_dt(None) is None
        assert _coerce_dt(42) == 42


# ───────────────────────────── contracts ───────────────────────────────────


class TestContracts:
    def test_utc_now_is_tz_aware(self) -> None:
        dt = contracts_mod.utc_now()
        assert dt.tzinfo is timezone.utc

    def test_isoformat_strips_offset_to_z(self) -> None:
        dt = datetime(2026, 5, 8, 12, 0, 0, tzinfo=timezone.utc)
        assert contracts_mod.isoformat(dt) == "2026-05-08T12:00:00Z"

    def test_isoformat_naive_passes_through(self) -> None:
        dt = datetime(2026, 5, 8, 12, 0, 0)
        out = contracts_mod.isoformat(dt)
        assert out == "2026-05-08T12:00:00"
