"""Core Pydantic schemas for normalized biometrics (DeepSynaps MVP).

Correlation, causal inference, and predictive alerts are modeled as distinct
concepts. Timestamps are UTC ISO-8601 strings unless noted.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from deepsynaps_biometrics.enums import (
    AlertSeverity,
    BiometricType,
    SampleQuality,
    SourceProvider,
    SyncStatus,
)


class DeviceSourceMetadata(BaseModel):
    """Provenance for hardware / OS bridge."""

    vendor: Optional[str] = None
    model: Optional[str] = None
    firmware_version: Optional[str] = None
    serial_hint: Optional[str] = None  # hashed or last-4 only in production
    os_name: Optional[str] = None
    os_version: Optional[str] = None
    app_name: Optional[str] = None
    app_version: Optional[str] = None


class UserDeviceConnection(BaseModel):
    """Link between a DeepSynaps user/patient and an upstream integration."""

    connection_id: str
    user_id: str
    provider: SourceProvider
    status: SyncStatus = SyncStatus.PENDING
    consent_scopes: list[str] = Field(default_factory=list)
    connected_at_utc: Optional[str] = None
    last_successful_sync_at_utc: Optional[str] = None
    last_error_code: Optional[str] = None
    metadata: DeviceSourceMetadata = Field(default_factory=DeviceSourceMetadata)


class BiometricSample(BaseModel):
    """Canonical scalar sample (HR point, step bucket, SpO2 spot, etc.)."""

    sample_id: str
    user_id: str
    biometric_type: BiometricType
    value: float
    unit: str
    observed_at_start_utc: str
    observed_at_end_utc: Optional[str] = None
    provider: SourceProvider
    connection_id: Optional[str] = None
    device: DeviceSourceMetadata = Field(default_factory=DeviceSourceMetadata)
    quality: SampleQuality = SampleQuality.UNKNOWN
    quality_score_0_1: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    sync_received_at_utc: str
    resolution_seconds: Optional[float] = None
    raw_vendor_type: Optional[str] = None
    extra: dict[str, Any] = Field(default_factory=dict)


class BiometricSeries(BaseModel):
    """Ordered collection of samples for one type + connection window."""

    user_id: str
    biometric_type: BiometricType
    provider: SourceProvider
    connection_id: Optional[str] = None
    samples: list[BiometricSample]
    series_start_utc: str
    series_end_utc: str


class SleepSession(BaseModel):
    """One sleep bout (night / nap) with staging optional."""

    session_id: str
    user_id: str
    bed_time_utc: Optional[str] = None
    sleep_start_utc: str
    wake_time_utc: str
    total_sleep_min: Optional[float] = None
    deep_min: Optional[float] = None
    rem_min: Optional[float] = None
    light_min: Optional[float] = None
    awake_min: Optional[float] = None
    efficiency_pct: Optional[float] = None
    provider: SourceProvider
    connection_id: Optional[str] = None
    quality: SampleQuality = SampleQuality.UNKNOWN
    sync_received_at_utc: str
    extra: dict[str, Any] = Field(default_factory=dict)


class ActivitySession(BaseModel):
    """Workout or activity episode."""

    session_id: str
    user_id: str
    start_utc: str
    end_utc: str
    activity_type: Optional[str] = None
    active_energy_kcal: Optional[float] = None
    avg_hr_bpm: Optional[float] = None
    max_hr_bpm: Optional[float] = None
    distance_m: Optional[float] = None
    steps: Optional[int] = None
    provider: SourceProvider
    connection_id: Optional[str] = None
    quality: SampleQuality = SampleQuality.UNKNOWN
    sync_received_at_utc: str


class HRVMeasurement(BaseModel):
    """Windowed HRV summary (not raw RR unless explicitly extended)."""

    measurement_id: str
    user_id: str
    window_start_utc: str
    window_end_utc: str
    hrv_ms: Optional[float] = None  # vendor-specific; label via metric_variant
    metric_variant: str = "rmssd"  # rmssd | sdnn | ln_rmssd | vendor_raw
    provider: SourceProvider
    connection_id: Optional[str] = None
    quality: SampleQuality = SampleQuality.UNKNOWN
    confidence_0_1: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    sync_received_at_utc: str


class BiometricFeatureWindow(BaseModel):
    """Aggregated features over a calendar or rolling window."""

    window_id: str
    user_id: str
    window_start_utc: str
    window_end_utc: str
    label: str  # e.g. "daily", "rolling_7d"
    features: dict[str, float] = Field(default_factory=dict)
    source_providers: list[SourceProvider] = Field(default_factory=list)


class CorrelationResult(BaseModel):
    """Pairwise correlation — explicitly not causal."""

    feature_a: str
    feature_b: str
    method: str = "pearson"  # pearson | spearman | ...
    coefficient: float
    p_value: Optional[float] = None
    n_samples: int
    window_label: str
    computed_at_utc: str
    disclaimer: str = "Correlation does not imply causation."


class LaggedCorrelationResult(BaseModel):
    """Correlation with explicit lag (days or samples)."""

    feature_a: str
    feature_b: str
    lag: str  # e.g. "1d", "7samples"
    coefficient: float
    p_value: Optional[float] = None
    n_samples: int
    computed_at_utc: str
    disclaimer: str = "Lagged correlation is associative only."


class PersonalBaselineProfile(BaseModel):
    """Within-person reference distribution for deviation alerts."""

    user_id: str
    feature_name: str
    mean: float
    std: float
    window_days: int
    effective_from_utc: str
    effective_to_utc: Optional[str] = None
    n_days_used: int
    method: str = "robust_z_trimmed"  # simple rolling mean | trimmed | etc.


class PredictiveAlert(BaseModel):
    """Rule- or z-score-based alert — MVP avoids black-box ML."""

    alert_id: str
    user_id: str
    severity: AlertSeverity
    title: str
    detail: str
    triggered_at_utc: str
    feature_refs: list[str] = Field(default_factory=list)
    score_0_1: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    rule_name: Optional[str] = None
    requires_clinical_review: bool = True


class CausalAnalysisRequest(BaseModel):
    """P1 — explicit DAG / adjustment intent (not MVP runtime default)."""

    user_id: str
    outcome_feature: str
    exposure_feature: str
    proposed_confounders: list[str] = Field(default_factory=list)
    dag_edges: list[tuple[str, str]] = Field(default_factory=list)
    notes: str = ""


class CausalAnalysisResult(BaseModel):
    """P1 — observational effect estimate with warnings."""

    request_id: str
    estimated_effect: Optional[float] = None
    unit: str = "context_dependent"
    method: str = "backdoor_linear_placeholder"
    warnings: list[str] = Field(
        default_factory=lambda: [
            "Observational causal estimates require explicit assumptions.",
            "Results are not diagnostic and must not replace clinical judgment.",
        ]
    )
    compared_correlation: Optional[float] = None
    computed_at_utc: str
