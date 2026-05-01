"""Pydantic schemas — the JSON contract for the Video Analyzer.

Mirrors ``docs/VIDEO_ANALYZER.md`` §7. These models are the single source of
truth that the FastAPI layer, the Celery worker, the report renderer, and the
MedRAG bridge all share. Keep them in lockstep with the spec.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Capture / patient context
# ---------------------------------------------------------------------------


class PatientContext(BaseModel):
    """Minimal patient context attached to every analysis."""

    patient_id: str | None = None
    age: int | None = None
    sex: Literal["M", "F", "X"] | None = None
    handedness: Literal["L", "R", "A"] | None = None
    height_m: float | None = None


CaptureSource = Literal["smartphone", "clinic_camera", "rtsp", "webrtc", "upload"]


class CaptureContext(BaseModel):
    """Where the video came from."""

    source: CaptureSource
    fps: float
    duration_s: float
    resolution: tuple[int, int]
    consent_id: str | None = None
    camera_id: str | None = None
    capture_started_at: str | None = None  # ISO-8601


# ---------------------------------------------------------------------------
# QC and pose
# ---------------------------------------------------------------------------


class QCMetrics(BaseModel):
    mean_keypoint_visibility: float
    frame_drop_pct: float
    ambient_lux_estimate: float | None = None
    occlusion_flags: list[str] = Field(default_factory=list)


PoseBackend = Literal[
    "mediapipe-pose-cpu",
    "mediapipe-holistic-cpu",
    "rtmpose-l-2d-server",
    "rtmpose-x-3d-server",
    "vitpose-3d-server",
    "openpose-server",
]


# ---------------------------------------------------------------------------
# Task results
# ---------------------------------------------------------------------------


class MetricValue(BaseModel):
    """A single biomarker value with optional normative context."""

    value: float
    z: float | None = None
    ci_low: float | None = None
    ci_high: float | None = None
    norm_cohort_id: str | None = None


class SuggestedScore(BaseModel):
    """0–4 MDS-UPDRS-style score suggestion. Decision support only."""

    value: int = Field(ge=0, le=4)
    uncertainty: float = Field(ge=0.0)
    notes: str | None = None


TaskId = Literal[
    "mds_updrs_3_4_finger_tap",
    "mds_updrs_3_5_hand_open_close",
    "mds_updrs_3_6_pronation_sup",
    "mds_updrs_3_7_toe_tap",
    "mds_updrs_3_8_leg_agility",
    "mds_updrs_3_10_gait",
    "mds_updrs_3_11_freezing",
    "mds_updrs_3_12_postural_stab",
    "mds_updrs_3_13_posture",
    "mds_updrs_3_15_tremor_postural",
    "mds_updrs_3_17_tremor_rest",
    "tinetti_pom",
    "timed_up_and_go",
    "sit_to_stand_5x",
    "facial_expression_battery",
]


Side = Literal["left", "right", "bilateral", "n/a"]


class TaskResult(BaseModel):
    """One structured-task analysis run."""

    task_id: TaskId
    epoch_s: tuple[float, float]
    side: Side = "n/a"
    metrics: dict[str, MetricValue]
    suggested_score_0_4: SuggestedScore | None = None
    method_reference_dois: list[str] = Field(default_factory=list)
    pose_backend: PoseBackend | None = None
    model_version: str | None = None


# ---------------------------------------------------------------------------
# Continuous-monitoring events (v2)
# ---------------------------------------------------------------------------


MonitoringEventId = Literal[
    "bed_exit",
    "fall",
    "prolonged_inactivity",
    "out_of_zone",
    "staff_interaction",
    "restraint_presence",
    "agitation_spike",
]


class MonitoringEvent(BaseModel):
    event_id: MonitoringEventId
    camera_id: str
    timestamp_range: tuple[str, str]  # ISO-8601 start, end
    score: float
    clip_s3_uri: str | None = None
    model_version: str
    reviewer_state: Literal["unreviewed", "confirmed", "dismissed"] = "unreviewed"


# ---------------------------------------------------------------------------
# Longitudinal trends
# ---------------------------------------------------------------------------


class LongitudinalTrend(BaseModel):
    prior_visit_ids: list[str] = Field(default_factory=list)
    trend: dict[str, list[float]] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# MedRAG bridge
# ---------------------------------------------------------------------------


MedRAGFindingType = Literal[
    "movement_biomarker",
    "monitoring_event",
    "condition_prior",
]


class MedRAGFinding(BaseModel):
    type: MedRAGFindingType
    value: str
    zscore: float | None = None


class MedRAGQuery(BaseModel):
    findings: list[MedRAGFinding] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Top-level analysis report
# ---------------------------------------------------------------------------


Modality = Literal["task_video", "facial_video", "monitoring_stream"]


class VideoAnalysisReport(BaseModel):
    """Top-level JSON contract returned by the Video Analyzer."""

    analysis_id: str
    patient: PatientContext
    capture: CaptureContext
    modalities_present: list[Modality]
    pose_engine: PoseBackend
    qc: QCMetrics
    tasks: list[TaskResult] = Field(default_factory=list)
    monitoring_events: list[MonitoringEvent] = Field(default_factory=list)
    longitudinal: LongitudinalTrend | None = None
    medrag_query: MedRAGQuery | None = None
    extras: dict[str, Any] = Field(default_factory=dict)


__all__ = [
    "CaptureContext",
    "CaptureSource",
    "LongitudinalTrend",
    "MedRAGFinding",
    "MedRAGFindingType",
    "MedRAGQuery",
    "MetricValue",
    "Modality",
    "MonitoringEvent",
    "MonitoringEventId",
    "PatientContext",
    "PoseBackend",
    "QCMetrics",
    "Side",
    "SuggestedScore",
    "TaskId",
    "TaskResult",
    "VideoAnalysisReport",
]
