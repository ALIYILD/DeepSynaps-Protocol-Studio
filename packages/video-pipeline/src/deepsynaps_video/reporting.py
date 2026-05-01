"""Structured report payloads for DeepSynaps Video Analyzer.

This module assembles analyzer outputs into JSON-friendly payloads for
DeepSynaps frontends, APIs, and clinical documentation workflows. It deliberately
does not render HTML or PDF. Rendering layers should consume these payloads and
preserve the included metric units, timestamps, segment references, confidence,
and limitation text.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean
from typing import Any, Literal

from deepsynaps_video.analyzers.bradykinesia import BradykinesiaMetrics
from deepsynaps_video.analyzers.gait import GaitMetrics
from deepsynaps_video.analyzers.monitoring import MonitoringEvent
from deepsynaps_video.analyzers.posture import PostureMetrics
from deepsynaps_video.analyzers.tremor import TremorMetrics
from deepsynaps_video.schemas import json_ready, utc_now_iso

ReportPayloadType = Literal["clinical_task", "monitoring", "longitudinal"]
TaskStatus = Literal["available", "missing", "limited"]


@dataclass(frozen=True)
class VideoSegmentReference:
    """Reference to a source video segment for visual review."""

    video_id: str
    segment_id: str | None = None
    start_seconds: float | None = None
    end_seconds: float | None = None
    label: str | None = None
    artifact_uri: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class ReportMetric:
    """One frontend-ready metric with display label, units, and value."""

    key: str
    label: str
    value: float | int | str | None
    units: str | None = None
    confidence: float | None = None
    severity_grade: int | str | None = None
    source_task: str | None = None
    source_segment: VideoSegmentReference | None = None
    interpretation: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class TaskReportSection:
    """Clinical task report section for one analyzer family."""

    task_family: str
    status: TaskStatus
    title: str
    metrics: tuple[ReportMetric, ...] = ()
    limitations: tuple[str, ...] = ()
    source_segment: VideoSegmentReference | None = None
    summary: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class ClinicalTaskReportPayload:
    """Payload for structured clinical movement task videos."""

    payload_type: ReportPayloadType
    video_id: str
    generated_at: str
    schema_version: str
    sections: tuple[TaskReportSection, ...]
    review_segments: tuple[VideoSegmentReference, ...]
    limitations: tuple[str, ...]
    clinical_disclaimer: str
    patient_id: str | None = None
    session_id: str | None = None
    clinical_summary: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = json_ready(self)
        payload["sections"] = [_section_payload(section) for section in self.sections]
        payload["clinical_summary"] = self.clinical_summary or _clinical_summary(self.sections, self.limitations)
        return payload

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class MonitoringReportPayload:
    """Payload for continuous room/bed monitoring event timelines."""

    payload_type: ReportPayloadType
    video_id: str
    generated_at: str
    schema_version: str
    events: tuple[dict[str, Any], ...]
    event_counts: dict[str, int]
    highest_severity: str | None
    review_segments: tuple[VideoSegmentReference, ...]
    clinical_disclaimer: str
    event_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        payload = json_ready(self)
        payload["events_by_type"] = payload.get("event_counts", {})
        for event in payload.get("events", []):
            if isinstance(event, dict) and "evidence_segment" in event:
                event["video_segment"] = event["evidence_segment"]
        return payload

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass(frozen=True)
class LongitudinalSummaryPayload:
    """Payload summarizing repeated video sessions for one patient."""

    payload_type: ReportPayloadType
    patient_id: str
    generated_at: str
    schema_version: str
    session_count: int
    session_summaries: tuple[dict[str, Any], ...]
    metric_trends: dict[str, dict[str, float | int | None]]
    limitations: tuple[str, ...]
    clinical_disclaimer: str

    def to_dict(self) -> dict[str, Any]:
        payload = json_ready(self)
        payload["sessions"] = payload.get("session_summaries", [])
        payload["metric_deltas"] = {
            key: value.get("delta")
            for key, value in self.metric_trends.items()
        }
        return payload

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


def generate_clinical_task_report_payload(
    video_id: str,
    gait_metrics: GaitMetrics | None = None,
    bradykinesia_metrics: BradykinesiaMetrics | None = None,
    tremor_metrics: TremorMetrics | None = None,
    posture_metrics: PostureMetrics | None = None,
    *,
    segment_refs: dict[str, VideoSegmentReference] | None = None,
    video_segments: dict[str, tuple[float, float]] | None = None,
    patient_id: str | None = None,
    session_id: str | None = None,
) -> ClinicalTaskReportPayload:
    """Generate a JSON-friendly payload for structured movement task videos.

    Missing analyzer outputs produce explicit ``missing`` sections rather than
    being silently omitted. This keeps frontend and documentation workflows
    stable when a video contains only a subset of tasks.
    """

    segment_refs = _merge_segment_refs(video_id, segment_refs, video_segments)
    sections = tuple(
        section
        for section in (
            _gait_section(gait_metrics, segment_refs.get("gait")) if gait_metrics is not None else None,
            _bradykinesia_section(
                bradykinesia_metrics,
                segment_refs.get("bradykinesia") or segment_refs.get(bradykinesia_metrics.task_type)
                if bradykinesia_metrics is not None
                else None,
            )
            if bradykinesia_metrics is not None
            else None,
            _tremor_section(tremor_metrics, segment_refs.get("tremor")) if tremor_metrics is not None else None,
            _posture_section(posture_metrics, segment_refs.get("posture")) if posture_metrics is not None else None,
        )
        if section is not None
    )
    review_segments = tuple(segment for segment in segment_refs.values() if segment is not None)
    limitations = tuple(
        limitation
        for section in sections
        for limitation in section.limitations
    )
    return ClinicalTaskReportPayload(
        payload_type="clinical_task",
        video_id=video_id,
        generated_at=utc_now_iso(),
        schema_version="deepsynaps.video.report.v1",
        sections=sections,
        review_segments=review_segments,
        limitations=limitations,
        clinical_disclaimer=_clinical_disclaimer(),
        patient_id=patient_id,
        session_id=session_id,
    )


def generate_monitoring_report_payload(
    video_id: str,
    monitoring_events: tuple[MonitoringEvent, ...] | list[MonitoringEvent],
    *,
    evidence_segments: dict[str, VideoSegmentReference] | None = None,
) -> MonitoringReportPayload:
    """Generate a review timeline payload for room/bed monitoring events."""

    evidence_segments = evidence_segments or {}
    event_dicts: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    review_segments: list[VideoSegmentReference] = []
    for event in sorted(monitoring_events, key=lambda item: (item.start_seconds, item.event_type)):
        payload = event.to_json_dict()
        segment = evidence_segments.get(_event_key(event))
        if segment is None:
            segment = VideoSegmentReference(
                video_id=video_id,
                segment_id=f"{event.event_type}:{event.actor_id}:{event.start_seconds:g}",
                start_seconds=event.start_seconds,
                end_seconds=event.end_seconds,
                label=event.label,
            )
        payload["evidence_segment"] = segment.to_json_dict()
        event_dicts.append(payload)
        review_segments.append(segment)
        counts[event.event_type] = counts.get(event.event_type, 0) + 1
    return MonitoringReportPayload(
        payload_type="monitoring",
        video_id=video_id,
        generated_at=utc_now_iso(),
        schema_version="deepsynaps.video.monitoring_report.v1",
        events=tuple(event_dicts),
        event_counts=counts,
        highest_severity=_highest_severity(monitoring_events),
        review_segments=tuple(review_segments),
        clinical_disclaimer=_monitoring_disclaimer(),
        event_count=len(event_dicts),
    )


def generate_longitudinal_summary(
    patient_id: str,
    list_of_session_metrics: list[dict[str, Any] | ClinicalTaskReportPayload]
    | tuple[dict[str, Any] | ClinicalTaskReportPayload, ...],
) -> LongitudinalSummaryPayload:
    """Summarize repeated video-analysis sessions for one patient.

    Each session dict may be a report payload dict or a compact session metric
    record. Numeric values are aggregated into simple first/last/delta trends.
    """

    sessions = tuple(
        session.to_json_dict() if isinstance(session, ClinicalTaskReportPayload) else session
        for session in list_of_session_metrics
    )
    sessions = tuple(sorted(sessions, key=lambda session: str(session.get("session_id") or session.get("video_id") or "")))
    metric_values: dict[str, list[float]] = {}
    for session in sessions:
        for key, value in _flatten_numeric_metrics(session).items():
            metric_values.setdefault(key, []).append(value)
    trends: dict[str, dict[str, float | int | None]] = {}
    for key, values in metric_values.items():
        trends[key] = {
            "first": values[0] if values else None,
            "last": values[-1] if values else None,
            "delta": values[-1] - values[0] if len(values) >= 2 else None,
            "mean": mean(values) if values else None,
            "n": len(values),
        }
    return LongitudinalSummaryPayload(
        payload_type="longitudinal",
        patient_id=patient_id,
        generated_at=utc_now_iso(),
        schema_version="deepsynaps.video.longitudinal.v1",
        session_count=len(sessions),
        session_summaries=tuple(_session_summary(session) for session in sessions),
        metric_trends=trends,
        limitations=(
            "longitudinal trends require consistent task protocol, camera placement, and analyzer version",
        ),
        clinical_disclaimer=_clinical_disclaimer(),
    )


def _gait_section(metrics: GaitMetrics | None, segment: VideoSegmentReference | None) -> TaskReportSection:
    if metrics is None:
        return _missing_section("gait", "Gait")
    return TaskReportSection(
        task_family="gait",
        status=_status_from_limitations(metrics.limitations),
        title="Gait",
        metrics=(
            ReportMetric("cadence", "Cadence", metrics.cadence_steps_per_minute, "steps/min", metrics.confidence, source_task="gait", source_segment=segment),
            ReportMetric("walking_speed", "Walking speed", metrics.walking_speed_meters_per_second or metrics.walking_speed_pixels_per_second, "m/s" if metrics.walking_speed_meters_per_second is not None else "px/s", metrics.confidence, source_task="gait", source_segment=segment),
            ReportMetric("stride_length", "Stride length", metrics.mean_stride_length_meters or metrics.mean_stride_length_pixels, "m" if metrics.mean_stride_length_meters is not None else "px", metrics.confidence, source_task="gait", source_segment=segment),
            ReportMetric("step_time_variability", "Step time variability", metrics.step_time_variability_seconds, "s", metrics.confidence, source_task="gait", source_segment=segment),
            ReportMetric("asymmetry_index", "Step timing asymmetry", metrics.step_time_asymmetry_ratio, "ratio", metrics.confidence, source_task="gait", source_segment=segment),
        ),
        limitations=metrics.limitations,
        source_segment=segment,
        summary="Video-derived gait proxy metrics for neurology and rehab review.",
    )


def _bradykinesia_section(
    metrics: BradykinesiaMetrics | None,
    segment: VideoSegmentReference | None,
) -> TaskReportSection:
    if metrics is None:
        return _missing_section("bradykinesia", "Bradykinesia")
    return TaskReportSection(
        task_family="bradykinesia",
        status=_status_from_limitations(metrics.limitations),
        title=f"Bradykinesia: {metrics.task_type.replace('_', ' ')}",
        metrics=(
            ReportMetric("repetition_count", "Repetitions", metrics.repetition_count, "count", metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
            ReportMetric("mean_amplitude", "Mean amplitude", metrics.mean_amplitude_units, metrics.units.get("amplitude"), metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
            ReportMetric("amplitude_decrement", "Amplitude decrement", metrics.amplitude_decrement_ratio, "ratio", metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
            ReportMetric("rhythm_cv", "Rhythm variability", metrics.rhythm_cv, "coefficient of variation", metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
            ReportMetric("mean_speed", "Mean speed", metrics.mean_speed_units_per_second, metrics.units.get("speed"), metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
        ),
        limitations=metrics.limitations,
        source_segment=segment,
        summary=f"Adjustable severity proxy: {metrics.severity_label}.",
    )


def _tremor_section(metrics: TremorMetrics | None, segment: VideoSegmentReference | None) -> TaskReportSection:
    if metrics is None:
        return _missing_section("tremor", "Tremor")
    return TaskReportSection(
        task_family="tremor",
        status=_status_from_limitations(metrics.limitations),
        title=f"Tremor: {metrics.task_type}",
        metrics=(
            ReportMetric("peak_to_peak_amplitude", "Peak-to-peak amplitude", metrics.peak_to_peak_amplitude_px, "px", metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
            ReportMetric("dominant_frequency", "Dominant frequency", metrics.dominant_frequency_hz, "Hz", metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
            ReportMetric("rms_amplitude", "RMS amplitude", metrics.rms_amplitude_px, "px", metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
            ReportMetric("frequency_power", "Frequency power proxy", metrics.frequency_power_px2, "px^2", metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
        ),
        limitations=metrics.limitations,
        source_segment=segment,
        summary="Video-derived tremor amplitude and frequency screening metrics.",
    )


def _posture_section(metrics: PostureMetrics | None, segment: VideoSegmentReference | None) -> TaskReportSection:
    if metrics is None:
        return _missing_section("posture", "Posture")
    return TaskReportSection(
        task_family="posture",
        status=_status_from_limitations(metrics.limitations),
        title=f"Posture: {metrics.task_type}",
        metrics=(
            ReportMetric("sway_area", "Sway area", metrics.sway_area_px2, "px^2", metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
            ReportMetric("sway_path_length", "Sway path length", metrics.sway_path_length_px, "px", metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
            ReportMetric("sway_velocity", "Mean sway velocity", metrics.mean_sway_velocity_px_per_sec, "px/s", metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
            ReportMetric("trunk_angle", "Mean trunk angle", metrics.mean_trunk_angle_degrees, "degrees", metrics.confidence, metrics.severity_grade, metrics.task_type, segment),
        ),
        limitations=metrics.limitations,
        source_segment=segment,
        summary="Video-derived posture and sway proxy metrics.",
    )


def _missing_section(task_family: str, title: str) -> TaskReportSection:
    return TaskReportSection(
        task_family=task_family,
        status="missing",
        title=title,
        limitations=(f"{title} metrics were not provided for this payload.",),
    )


def _status_from_limitations(limitations: tuple[str, ...]) -> TaskStatus:
    return "limited" if limitations else "available"


def _highest_severity(events: tuple[MonitoringEvent, ...] | list[MonitoringEvent]) -> str | None:
    order = {"info": 0, "warning": 1, "critical": 2}
    if not events:
        return None
    return max((event.severity for event in events), key=lambda severity: order[severity])


def _event_key(event: MonitoringEvent) -> str:
    return f"{event.event_type}:{event.actor_id}:{event.start_seconds:g}"


def _merge_segment_refs(
    video_id: str,
    segment_refs: dict[str, VideoSegmentReference] | None,
    video_segments: dict[str, tuple[float, float]] | None,
) -> dict[str, VideoSegmentReference]:
    merged = dict(segment_refs or {})
    for key, interval in (video_segments or {}).items():
        if key in merged:
            continue
        start, end = interval
        merged[key] = VideoSegmentReference(
            video_id=video_id,
            segment_id=f"{key}:{start:g}-{end:g}",
            start_seconds=start,
            end_seconds=end,
            label=f"{key.replace('_', ' ')} review segment",
        )
    return merged


def _section_payload(section: TaskReportSection) -> dict[str, Any]:
    payload = section.to_json_dict()
    payload["task_name"] = section.task_family
    if section.source_segment is not None:
        payload["video_segment"] = section.source_segment.to_json_dict()
    units: dict[str, str] = {}
    for metric in section.metrics:
        if metric.units:
            units[metric.key] = metric.units
    payload["units"] = units
    return payload


def _clinical_summary(
    sections: tuple[TaskReportSection, ...],
    limitations: tuple[str, ...],
) -> dict[str, Any]:
    if not sections:
        return {
            "task_count": 0,
            "review_required": True,
            "limitations": ("no analyzer metrics supplied",),
        }
    severity_values = [
        metric.severity_grade
        for section in sections
        for metric in section.metrics
        if isinstance(metric.severity_grade, int)
    ]
    return {
        "task_count": len(sections),
        "review_required": True,
        "highest_severity_grade": max(severity_values) if severity_values else None,
        "limitations": limitations,
    }


def _flatten_numeric_metrics(payload: dict[str, Any]) -> dict[str, float]:
    flattened: dict[str, float] = {}

    def visit(prefix: str, value: Any) -> None:
        if isinstance(value, bool):
            return
        if isinstance(value, (int, float)):
            flattened[prefix] = float(value)
        elif isinstance(value, dict):
            for key, item in value.items():
                visit(f"{prefix}.{key}" if prefix else str(key), item)
        elif isinstance(value, (list, tuple)):
            for index, item in enumerate(value):
                visit(f"{prefix}.{index}", item)

    visit("", payload)
    clinical_summary = payload.get("clinical_summary")
    if isinstance(clinical_summary, dict):
        for key, value in clinical_summary.items():
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                flattened[str(key)] = float(value)
    return flattened


def _session_summary(session: dict[str, Any]) -> dict[str, Any]:
    return {
        "session_id": session.get("session_id") or session.get("video_id"),
        "video_id": session.get("video_id"),
        "generated_at": session.get("generated_at"),
        "payload_type": session.get("payload_type"),
        "available_sections": [
            section.get("task_family")
            for section in session.get("sections", [])
            if isinstance(section, dict) and section.get("status") != "missing"
        ],
    }


def _clinical_disclaimer() -> str:
    return (
        "Video Analyzer outputs are descriptive clinical decision-support metrics "
        "for clinician review; they are not autonomous diagnoses or official rating-scale scores."
    )


def _monitoring_disclaimer() -> str:
    return (
        "Monitoring events are reviewable safety candidates only and do not directly "
        "page staff, route alarms, or trigger clinical workflows without local governance."
    )


__all__ = [
    "ClinicalTaskReportPayload",
    "LongitudinalSummaryPayload",
    "MonitoringReportPayload",
    "ReportMetric",
    "TaskReportSection",
    "VideoSegmentReference",
    "generate_clinical_task_report_payload",
    "generate_longitudinal_summary",
    "generate_monitoring_report_payload",
]
