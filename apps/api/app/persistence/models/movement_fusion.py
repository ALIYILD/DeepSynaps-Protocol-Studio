"""Movement Fusion models — longitudinal biomarker trends and multimodal correlation.

These models support the Movement Analyzer's decision-support endpoints for
tracking movement biomarker progression over time and correlating video-based
movement features with voice-based acoustic features.

All biomarker values are stored with evidence grades and confidence scores
to support clinical decision-support workflows.
"""
from __future__ import annotations

from ._base import (
    Base,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    Index,
    Integer,
    Mapped,
    Optional,
    String,
    datetime,
    mapped_column,
    timezone,
    uuid,
)


class MovementBiomarkerTrend(Base):
    """Longitudinal movement biomarker storage for progression tracking.

    Each row records a single biomarker measurement from a single session.
    Supports querying time series of gait, tremor, finger-tap, and posture
    biomarkers for trend analysis and rate-of-change computation.
    """

    __tablename__ = "movement_biomarker_trends"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    clinic_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True, index=True
    )
    biomarker_type: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True
    )
    # Examples: gait_speed, stride_length, cadence, step_time_variability,
    # tremor_amplitude, tremor_dominant_frequency, taps_per_10s,
    # sway_area, sway_velocity, asymmetry_index, arm_swing_amplitude,
    # movement_smoothness, finger_tap_iti_cv, dual_task_cost
    value: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    confidence: Mapped[float] = mapped_column(Float(), nullable=False, default=0.0)
    evidence_grade: Mapped[str] = mapped_column(
        String(8), nullable=False, default="C"
    )
    session_date: Mapped[datetime] = mapped_column(
        DateTime(), nullable=False, index=True
    )
    source_analysis_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True, index=True
    )
    # Reference to the analysis run (snapshot_id, video_assessment_session_id, etc.)
    source_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default="movement_analyzer"
    )
    # "movement_analyzer", "video_assessment", "manual_entry"
    metadata_json: Mapped[Optional[str]] = mapped_column(
        String(2048), nullable=True
    )
    # Additional context (e.g., task_type, side, recording_duration)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        CheckConstraint(
            "evidence_grade IN ('A', 'B', 'C', 'N/A')",
            name="ck_biomarker_trend_evidence_grade",
        ),
        CheckConstraint(
            "biomarker_type IN ('gait_speed', 'stride_length', 'cadence', "
            "'step_time_variability', 'tremor_amplitude', 'tremor_dominant_frequency', "
            "'taps_per_10s', 'sway_area', 'sway_velocity', 'asymmetry_index', "
            "'arm_swing_amplitude', 'movement_smoothness', 'finger_tap_iti_cv', "
            "'dual_task_cost', 'postural_sway_area', 'body_lean_angle', "
            "'balance_confidence', 'tremor_band_power_4_6hz', "
            "'tremor_band_power_8_12hz')",
            name="ck_biomarker_trend_type",
        ),
    )


class MovementMultimodalCorrelation(Base):
    """Stored video-voice multimodal correlation results.

    Records the correlation between video-based movement features
    (gait speed, tremor amplitude, movement smoothness) and voice-based
    acoustic features (CPP, speech rate, pause duration) for a given session.
    """

    __tablename__ = "movement_multimodal_correlations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    clinic_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True, index=True
    )
    video_analysis_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True, index=True
    )
    voice_analysis_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True, index=True
    )
    video_biomarker: Mapped[str] = mapped_column(
        String(64), nullable=False
    )
    voice_feature: Mapped[str] = mapped_column(
        String(64), nullable=False
    )
    correlation_coefficient: Mapped[Optional[float]] = mapped_column(
        Float(), nullable=True
    )
    p_value: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    n_pairs: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    interpretation: Mapped[Optional[str]] = mapped_column(
        String(512), nullable=True
    )
    evidence_grade: Mapped[str] = mapped_column(
        String(8), nullable=False, default="C"
    )
    correlation_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pearson"
    )
    session_date: Mapped[datetime] = mapped_column(
        DateTime(), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        CheckConstraint(
            "correlation_type IN ('pearson', 'spearman')",
            name="ck_mm_corr_type",
        ),
    )


class MovementFallRiskScore(Base):
    """Stored fall risk scoring results (Tinetti-style composite).

    Records computed fall risk scores with component breakdowns
    for longitudinal tracking. Grade C (limited evidence) — requires
    clinical confirmation.
    """

    __tablename__ = "movement_fall_risk_scores"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    clinic_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True, index=True
    )
    total_score: Mapped[float] = mapped_column(Float(), nullable=False, default=0.0)
    # Tinetti-style 0-28 scale
    gait_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    balance_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    sway_component: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    speed_component: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    age_component: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    medication_component: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    risk_category: Mapped[str] = mapped_column(
        String(16), nullable=False, default="unknown"
    )
    # "low", "moderate", "high", "unknown"
    evidence_grade: Mapped[str] = mapped_column(
        String(8), nullable=False, default="C"
    )
    interpretation: Mapped[Optional[str]] = mapped_column(
        String(512), nullable=True
    )
    warning_text: Mapped[Optional[str]] = mapped_column(
        String(512), nullable=True
    )
    session_date: Mapped[datetime] = mapped_column(
        DateTime(), nullable=False, index=True
    )
    source_snapshot_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        CheckConstraint(
            "risk_category IN ('low', 'moderate', 'high', 'unknown')",
            name="ck_fall_risk_category",
        ),
    )
