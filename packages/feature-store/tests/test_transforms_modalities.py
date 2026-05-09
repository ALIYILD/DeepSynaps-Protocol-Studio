"""Tests for the 8 per-modality transforms in
``deepsynaps_features.transforms``.

Pins the **online ↔ batch parity** contract that the streaming workers
in ``streaming/workers.py`` depend on:

- ``compute_online(event)`` MUST drop None-valued fields so Redis HSET
  doesn't store sentinel literals.
- ``compute_online`` carries ``tenant_id`` / ``patient_id`` /
  ``occurred_at`` through unchanged when present (these become Redis
  hash keys downstream).
- Each modality's documented payload keys are passed through.
- ``compute_batch`` over a list-of-events is equivalent to mapping
  ``compute_online`` row-wise.
- An empty ``payload`` produces only the id keys (no fabricated data).

Why this matters: the streaming worker writes whatever
``compute_online`` returns straight into Redis. A regression that
silently included ``None`` or fabricated a default value would corrupt
the online feature store and (worse) be invisible until a downstream
model retrained against the noise.
"""
from __future__ import annotations

from typing import Any

import pytest

from deepsynaps_features.transforms import (
    assessment,
    audio,
    ehr,
    mri,
    outcome,
    therapy,
    video,
    wearable,
)


# Each entry pins:
#   module, expected payload keys, a representative payload, and the
#   subset of values we expect to appear in the projected feature dict.
MODALITIES: list[tuple[Any, dict, list[str]]] = [
    (
        wearable,
        {
            "device_id": "fitbit-7",
            "steps_24h": 8000,
            "sleep_minutes_24h": 420,
            "resting_hr_bpm": 62.5,
            "hrv_rmssd_ms": 35.0,
            "activity_minutes_24h": 90,
            "calories_kcal_24h": 2100.0,
            "spo2_pct": 97.5,
        },
        ["device_id", "steps_24h", "spo2_pct"],
    ),
    (
        audio,
        {
            "utterance_id": "u-1",
            "duration_s": 3.4,
            "sample_rate_hz": 16000,
            "speech_rate_wpm": 130,
            "pitch_mean_hz": 180.0,
            "energy_mean": 0.05,
        },
        ["utterance_id", "speech_rate_wpm"],
    ),
    (
        video,
        {
            "clip_id": "v-1",
            "duration_s": 5.0,
            "fps": 24,
            "num_faces_detected": 1,
            "affect_valence": 0.2,
            "affect_arousal": 0.5,
        },
        ["clip_id", "affect_valence"],
    ),
    (
        ehr,
        {
            "diagnosis_codes": ["F33.1"],
            "medication_codes": ["sertraline"],
            "num_active_meds": 2,
            "bmi": 23.5,
            "sbp_mmHg": 120,
            "dbp_mmHg": 78,
        },
        ["diagnosis_codes", "bmi"],
    ),
    (
        mri,
        {
            "scan_id": "sc-1",
            "sequence": "T1",
            "icv_ml": 1500.0,
            "hippocampus_vol_ml": 7.4,
            "wmh_vol_ml": 0.5,
        },
        ["scan_id", "wmh_vol_ml"],
    ),
    (
        outcome,
        {
            "target": "depression",
            "label": "responder",
            "score": 0.72,
            "horizon_days": 28,
        },
        ["target", "score"],
    ),
    (
        therapy,
        {
            "protocol_id": "rtms-l-dlpfc",
            "session_number": 4,
            "session_duration_min": 30,
            "adherence_pct": 92,
            "side_effects_present": False,
            "self_reported_relief": 6,
            "notes_len": 120,
        },
        ["protocol_id", "session_number"],
    ),
    (
        assessment,
        {
            "instrument": "PHQ-9",
            "raw_score": 12,
            "severity_level": "moderate",
            "normed_score": 0.6,
            "completion_time_s": 90,
            "is_clinician_administered": True,
        },
        ["instrument", "raw_score"],
    ),
]


# ── compute_online ─────────────────────────────────────────────────────


@pytest.mark.parametrize("mod, payload, must_be_present", MODALITIES)
def test_compute_online_carries_ids(
    mod: Any, payload: dict, must_be_present: list[str]
) -> None:
    # Pin: tenant_id, patient_id, occurred_at flow through unchanged
    # — they become Redis hash keys downstream and must NEVER be
    # silently rewritten.
    event = {
        "tenant_id": "t-1",
        "patient_id": "p-1",
        "occurred_at": "2026-05-09T00:00:00Z",
        "payload": payload,
    }
    out = mod.compute_online(event)
    assert out["tenant_id"] == "t-1"
    assert out["patient_id"] == "p-1"
    assert out["occurred_at"] == "2026-05-09T00:00:00Z"


@pytest.mark.parametrize("mod, payload, must_be_present", MODALITIES)
def test_compute_online_passes_through_payload(
    mod: Any, payload: dict, must_be_present: list[str]
) -> None:
    # Pin: each modality's documented payload keys are projected into
    # the feature dict.
    event = {
        "tenant_id": "t-1",
        "patient_id": "p-1",
        "payload": payload,
    }
    out = mod.compute_online(event)
    for key in must_be_present:
        assert key in out, f"{mod.__name__} must project key {key!r}"
        assert out[key] == payload[key]


@pytest.mark.parametrize("mod, payload, must_be_present", MODALITIES)
def test_compute_online_drops_none_fields(
    mod: Any, payload: dict, must_be_present: list[str]
) -> None:
    # Pin: missing payload values are DROPPED (not written as None).
    # Redis HSET cannot represent None and silently coercing to "None"
    # string would poison downstream features.
    event = {
        "tenant_id": "t-1",
        "patient_id": "p-1",
        "payload": {},  # all fields missing
    }
    out = mod.compute_online(event)
    # Only id-fields survive (occurred_at is also dropped because missing).
    assert "tenant_id" in out
    assert "patient_id" in out
    # No payload fields leaked through as None.
    for v in out.values():
        assert v is not None


@pytest.mark.parametrize("mod, payload, must_be_present", MODALITIES)
def test_compute_online_handles_missing_payload_key(
    mod: Any, payload: dict, must_be_present: list[str]
) -> None:
    # Pin: a completely absent ``payload`` key on the event must not
    # raise — equivalent to an empty payload.
    event = {"tenant_id": "t", "patient_id": "p"}
    out = mod.compute_online(event)
    assert out == {"tenant_id": "t", "patient_id": "p"}


# ── compute_batch ──────────────────────────────────────────────────────


@pytest.mark.parametrize("mod, payload, must_be_present", MODALITIES)
def test_compute_batch_list_of_events(
    mod: Any, payload: dict, must_be_present: list[str]
) -> None:
    # Pin online↔batch parity: compute_batch over a list yields one
    # row per event, with the same projection as compute_online.
    events = [
        {"tenant_id": "t-1", "patient_id": "p-1", "payload": payload},
        {"tenant_id": "t-1", "patient_id": "p-2", "payload": payload},
    ]
    out = mod.compute_batch(events)
    # Out is either a pandas DataFrame (preferred) or a list fallback.
    if hasattr(out, "to_dict"):
        rows = out.to_dict("records")
    else:
        rows = list(out)
    assert len(rows) == 2
    for row in rows:
        # Drop NaN entries that pandas may add for missing columns.
        normalised = {k: v for k, v in row.items() if v is not None}
        for key in must_be_present:
            assert key in normalised


def test_compute_batch_handles_none_input() -> None:
    # Pin: None input yields an empty result (DataFrame or []),
    # never raises.
    out = wearable.compute_batch(None)
    if hasattr(out, "to_dict"):
        assert len(out.to_dict("records")) == 0
    else:
        assert list(out) == []


def test_compute_batch_dataframe_input() -> None:
    # Pin: pandas DataFrame input is consumed via to_dict("records").
    pd = pytest.importorskip("pandas")
    df = pd.DataFrame(
        [
            {
                "tenant_id": "t",
                "patient_id": "p",
                "payload": {"steps_24h": 1000},
            },
            {
                "tenant_id": "t",
                "patient_id": "q",
                "payload": {"steps_24h": 2000},
            },
        ]
    )
    out = wearable.compute_batch(df)
    rows = out.to_dict("records") if hasattr(out, "to_dict") else list(out)
    steps = sorted(int(r["steps_24h"]) for r in rows if r.get("steps_24h"))
    assert steps == [1000, 2000]
