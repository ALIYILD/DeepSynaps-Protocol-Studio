"""Passive Signal Ingest Pipeline — real-time behavioral data ingestion.

Receives passive data from:
- Wearables (Fitbit, Apple Health, Garmin via webhook)
- Smartphone sensors (accelerometer, GPS, screen state via app SDK)
- Manual uploads (CSV, JSON, sleep diary entries)

Provides quality validation, physiological range checks, batch processing,
and signal quality summaries for the Digital Phenotyping Analyzer.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Optional

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class SignalSource(str, Enum):
    """Origin of the passive signal."""

    WEARABLE = "wearable"          # Fitbit, Apple Health, Garmin
    SMARTPHONE = "smartphone"      # Accelerometer, GPS, screen
    MANUAL = "manual"              # CSV upload, sleep diary
    WEIGHT_SCALE = "weight_scale"  # Smart scale
    BLOOD_PRESSURE = "bp_monitor"  # BP cuff
    GLUCOSE_METER = "glucose"      # CGM or fingerstick


class SignalType(str, Enum):
    """Canonical passive signal types tracked by the phenotyping pipeline."""

    # Sleep
    SLEEP_START = "sleep_start"
    SLEEP_END = "sleep_end"
    SLEEP_DURATION = "sleep_duration"
    SLEEP_EFFICIENCY = "sleep_efficiency"
    SLEEP_DEEP = "sleep_deep_minutes"
    SLEEP_REM = "sleep_rem_minutes"
    SLEEP_AWAKE = "sleep_awake_minutes"
    # Mobility
    STEPS = "steps"
    DISTANCE = "distance_meters"
    FLOORS = "floors_climbed"
    ACTIVE_MINUTES = "active_minutes"
    SEDENTARY_MINUTES = "sedentary_minutes"
    GPS_RADIUS = "gps_radius_meters"
    # Social (metadata only, no content)
    COMM_COUNT = "communication_count"
    COMM_RESP_LATENCY = "communication_response_latency_min"
    # Screen
    SCREEN_TIME = "screen_time_minutes"
    SCREEN_UNLOCKS = "screen_unlocks"
    # Physiological
    HEART_RATE = "heart_rate_bpm"
    HRV = "heart_rate_variability_ms"
    RESTING_HR = "resting_heart_rate_bpm"
    SPO2 = "blood_oxygen_saturation"
    RESPIRATORY_RATE = "respiratory_rate"
    # Body
    WEIGHT = "weight_kg"
    BMI = "bmi"
    BODY_FAT = "body_fat_percent"
    BLOOD_PRESSURE_SYS = "blood_pressure_systolic"
    BLOOD_PRESSURE_DIA = "blood_pressure_diastolic"
    GLUCOSE = "blood_glucose_mg_dl"
    TEMPERATURE = "body_temperature_c"
    # Behavioural
    CALORIES = "calories_burned"
    WATER = "water_intake_ml"
    FOOD_LOG = "food_entries_count"


# ---------------------------------------------------------------------------
# Physiological range table
# ---------------------------------------------------------------------------

# (low, high) bounds — values outside trigger warnings and clamping.
_PHYSIOLOGICAL_RANGES: dict[SignalType, tuple[float, float]] = {
    SignalType.HEART_RATE: (30, 220),
    SignalType.SPO2: (70, 100),
    SignalType.STEPS: (0, 100_000),
    SignalType.SLEEP_DURATION: (0, 1440),
    SignalType.WEIGHT: (10, 300),
    SignalType.BLOOD_PRESSURE_SYS: (60, 260),
    SignalType.BLOOD_PRESSURE_DIA: (30, 160),
    SignalType.GLUCOSE: (20, 600),
    SignalType.TEMPERATURE: (33, 42),
}

# Maximum signal age before a temporal warning is issued (hours).
_MAX_SIGNAL_AGE_HOURS: float = 168.0  # 7 days

# Number of warnings that flip status to "rejected".
_REJECTION_WARNING_THRESHOLD: int = 3

# Pipeline version — bumped on breaking schema changes.
_PIPELINE_VERSION: str = "1.0.0"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def ingest_signal(
    patient_id: str,
    clinic_id: str,
    signal_type: SignalType,
    signal_source: SignalSource,
    value: float,
    unit: str,
    timestamp: datetime,
    metadata: Optional[dict[str, Any]] = None,
    device_id: Optional[str] = None,
    quality_score: Optional[float] = None,
) -> dict[str, Any]:
    """Ingest a single passive signal with quality validation.

    Args:
        patient_id: Patient identifier.
        clinic_id: Clinic identifier.
        signal_type: Canonical signal type enum.
        signal_source: Origin of the signal.
        value: Numeric signal value.
        unit: Unit of measurement (e.g. "bpm", "kg", "minutes").
        timestamp: When the signal was recorded (timezone-aware preferred).
        metadata: Optional free-form metadata dict.
        device_id: Hardware device identifier (e.g. Fitbit serial).
        quality_score: 0–1 quality score from the source device/SDK.

    Returns:
        dict with keys:
        - signal_id: unique id
        - status: "accepted" | "degraded" | "rejected"
        - quality_score: float
        - validation_warnings: list of human-readable warning strings
        - timestamp_stored: ISO datetime of ingestion
        - value: validated (potentially clamped) value
        - provenance: source/ingestion metadata
    """
    warnings: list[str] = []

    # --- Quality checks -----------------------------------------------------
    if quality_score is not None and quality_score < 0.5:
        warnings.append(
            f"Low quality signal (score={quality_score:.2f}). Interpret with caution."
        )

    # --- Range validation ---------------------------------------------------
    validated_value, range_warnings = _validate_signal_range(signal_type, value)
    warnings.extend(range_warnings)

    # --- Temporal validation ------------------------------------------------
    age_hours = (datetime.now(timezone.utc) - timestamp).total_seconds() / 3600
    if age_hours > _MAX_SIGNAL_AGE_HOURS:
        warnings.append(
            f"Signal is {age_hours:.1f} hours old. May not reflect current state."
        )

    # --- Status resolution --------------------------------------------------
    if len(warnings) > _REJECTION_WARNING_THRESHOLD:
        status = "rejected"
    elif warnings:
        status = "degraded"
    else:
        status = "accepted"

    signal_id = f"sig_{patient_id}_{signal_type.value}_{int(timestamp.timestamp())}"

    result = {
        "signal_id": signal_id,
        "status": status,
        "quality_score": quality_score if quality_score is not None else 0.0,
        "validation_warnings": warnings,
        "timestamp_stored": datetime.now(timezone.utc).isoformat(),
        "value": validated_value,
        "provenance": {
            "source": signal_source.value,
            "device_id": device_id,
            "ingest_method": "api" if signal_source != SignalSource.MANUAL else "upload",
            "pipeline_version": _PIPELINE_VERSION,
        },
    }

    _log.debug(
        "signal_ingest: patient=%s type=%s source=%s status=%s warnings=%d",
        patient_id, signal_type.value, signal_source.value, status, len(warnings),
    )

    return result


def ingest_batch(
    patient_id: str,
    clinic_id: str,
    signals: list[dict[str, Any]],
) -> dict[str, Any]:
    """Ingest a batch of signals and return a summary.

    Args:
        patient_id: Patient identifier.
        clinic_id: Clinic identifier.
        signals: List of signal dicts, each containing:
            - signal_type (str): SignalType value
            - signal_source (str): SignalSource value
            - value (float): Numeric value
            - unit (str, optional): Unit string
            - timestamp (str): ISO-8601 datetime string
            - metadata (dict, optional): Free-form metadata
            - device_id (str, optional): Device identifier
            - quality_score (float, optional): 0–1 quality score

    Returns:
        dict with batch summary and per-signal results.
    """
    results: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for idx, sig in enumerate(signals):
        try:
            # Coerce timestamp
            ts_raw = sig.get("timestamp")
            if ts_raw is None:
                raise ValueError("missing timestamp")
            ts = (
                ts_raw
                if isinstance(ts_raw, datetime)
                else datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
            )
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)

            result = ingest_signal(
                patient_id=patient_id,
                clinic_id=clinic_id,
                signal_type=SignalType(sig["signal_type"]),
                signal_source=SignalSource(sig["signal_source"]),
                value=float(sig["value"]),
                unit=str(sig.get("unit", "")),
                timestamp=ts,
                metadata=sig.get("metadata"),
                device_id=sig.get("device_id"),
                quality_score=_coerce_float_none(sig.get("quality_score")),
            )
            results.append(result)
        except Exception as exc:
            _log.warning(
                "signal_ingest_batch_error: patient=%s index=%d error=%s",
                patient_id, idx, exc,
            )
            errors.append({"index": idx, "error": str(exc)})

    accepted = sum(1 for r in results if r["status"] == "accepted")
    degraded = sum(1 for r in results if r["status"] == "degraded")
    rejected = sum(1 for r in results if r["status"] == "rejected")

    batch_id = f"batch_{patient_id}_{int(datetime.now(timezone.utc).timestamp())}"

    return {
        "batch_id": batch_id,
        "total": len(signals),
        "accepted": accepted,
        "degraded": degraded,
        "rejected": rejected,
        "errors": errors,
        "results": results,
    }


def get_signal_quality_summary(
    patient_id: str,
    days: int = 7,
) -> dict[str, Any]:
    """Return signal quality summary for a patient over *N* days.

    In production this queries the signal store; the MVP returns the
    expected structure with empty/default values so the UI can render
    recommendations.
    """
    return {
        "patient_id": patient_id,
        "period_days": days,
        "signals_tracked": len(SignalType),
        "sources_active": [],
        "quality_by_source": {},
        "coverage_percent": 0.0,
        "missing_signals": [st.value for st in SignalType],
        "recommendations": [
            "Connect a wearable device for automatic step and sleep tracking",
            "Enable smartphone sensor sharing for mobility and screen time data",
        ],
    }


def list_signals_for_patient(
    patient_id: str,
    signal_type: Optional[SignalType] = None,
    source: Optional[SignalSource] = None,
    days: int = 7,
    limit: int = 100,
) -> dict[str, Any]:
    """List ingested signals for a patient.

    In production this queries the signal database.  MVP returns the
    expected response shape with an empty list.
    """
    return {
        "patient_id": patient_id,
        "filters": {
            "signal_type": signal_type.value if signal_type else None,
            "source": source.value if source else None,
            "days": days,
            "limit": limit,
        },
        "total": 0,
        "items": [],
        "period": {
            "start": (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(),
            "end": datetime.now(timezone.utc).isoformat(),
        },
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _validate_signal_range(signal_type: SignalType, value: float) -> tuple[float, list[str]]:
    """Validate *value* against physiologically plausible ranges.

    Returns:
        (validated_value, warning_messages)

    Out-of-range values are clamped to the bounds and a warning is emitted.
    """
    warnings: list[str] = []
    validated = value

    if signal_type in _PHYSIOLOGICAL_RANGES:
        lo, hi = _PHYSIOLOGICAL_RANGES[signal_type]
        if value < lo or value > hi:
            warnings.append(
                f"Value {value} outside physiological range [{lo}-{hi}]. Check units."
            )
            validated = max(lo, min(value, hi))  # clamp

    return validated, warnings


def _coerce_float_none(val: Any) -> Optional[float]:
    """Safely coerce *val* to float or None."""
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Convenience: source → modality mapping used by the analyzer
# ---------------------------------------------------------------------------

SOURCE_MODALITIES: dict[SignalSource, list[str]] = {
    SignalSource.WEARABLE: ["accel", "ppg", "spo2", "temp"],
    SignalSource.SMARTPHONE: ["gps", "screen_events", "accel", "comm_meta"],
    SignalSource.MANUAL: ["ema", "sleep_diary", "csv_upload"],
    SignalSource.WEIGHT_SCALE: ["weight"],
    SignalSource.BLOOD_PRESSURE: ["bp_cuff"],
    SignalSource.GLUCOSE_METER: ["cgm", "fingerstick"],
}
