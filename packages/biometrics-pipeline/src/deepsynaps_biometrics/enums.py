"""Enumerations and constant sets for biometrics (MVP)."""

from __future__ import annotations

from enum import StrEnum


class SourceProvider(StrEnum):
    """Where a row of data was produced or first collected."""

    APPLE_HEALTHKIT = "apple_healthkit"
    ANDROID_HEALTH_CONNECT = "android_health_connect"
    OURA_DIRECT = "oura_direct"
    # Future unified aggregators
    TERRA = "terra"
    ROOK = "rook"
    SPIKE = "spike"
    MANUAL_UPLOAD = "manual_upload"
    DEEPSYNAPS_DEMO = "deepsynaps_demo"


class BiometricType(StrEnum):
    HEART_RATE = "heart_rate"
    RESTING_HEART_RATE = "resting_heart_rate"
    HRV_RMSSD = "hrv_rmssd"  # or vendor-specific; map in normalization
    HRV_SDNN = "hrv_sdnn"
    SLEEP_SUMMARY = "sleep_summary"
    SLEEP_SESSION = "sleep_session"
    STEPS = "steps"
    DISTANCE_M = "distance_m"
    ACTIVE_ENERGY_KCAL = "active_energy_kcal"
    SPO2 = "spo2"
    SKIN_TEMP_C = "skin_temp_c"
    WRIST_TEMP_C = "wrist_temp_c"
    READINESS_SCORE = "readiness_score"
    BLOOD_PRESSURE_SYSTOLIC = "blood_pressure_systolic"
    BLOOD_PRESSURE_DIASTOLIC = "blood_pressure_diastolic"


class SampleQuality(StrEnum):
    """Per-sample or per-window quality."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNKNOWN = "unknown"
    REJECTED = "rejected"


class AlertSeverity(StrEnum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SyncStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    OK = "ok"
    PARTIAL = "partial"  # some types denied or failed
    FAILED = "failed"
    REVOKED = "revoked"  # user withdrew consent / disconnected


class CausalModuleWarning(StrEnum):
    OBSERVATIONAL_ONLY = "observational_only"
    ASSUMPTION_DRIVEN = "assumption_driven"
    NOT_DIAGNOSTIC = "not_diagnostic"
