from __future__ import annotations

import json
from pathlib import Path

from deepsynaps_video.analyzers.bradykinesia import compute_bradykinesia_metrics
from deepsynaps_video.analyzers.gait import compute_gait_metrics
from deepsynaps_video.analyzers.monitoring import (
    ActorTrack,
    TrackPoint,
    detect_prolonged_inactivity,
)
from deepsynaps_video.analyzers.posture import compute_postural_stability_metrics
from deepsynaps_video.analyzers.tremor import compute_tremor_metrics
from deepsynaps_video.pose_engine.schemas import JointTrajectory
from deepsynaps_video.reporting import (
    ClinicalTaskReportPayload,
    MonitoringReportPayload,
    generate_clinical_task_report_payload,
    generate_longitudinal_summary,
    generate_monitoring_report_payload,
)
from deepsynaps_video.schemas import VideoMetadata


def _point(x: float, y: float, z: float | None = None) -> tuple[float, float, float | None]:
    return (x, y, z)


def _trajectory(name: str, values: tuple[float, ...], step: float = 0.5) -> JointTrajectory:
    return JointTrajectory(
        joint_name=name,
        timestamps_seconds=tuple(index * step for index in range(len(values))),
        coordinates=tuple(_point(value, 0.0) for value in values),
    )


def test_generate_clinical_task_report_payload_contains_sections_and_review_refs() -> None:
    gait_traj = (
        JointTrajectory(
            joint_name="right_ankle",
            timestamps_seconds=(0.0, 1.0, 2.0, 3.0, 4.0),
            coordinates=(
                _point(0.0, 2.0),
                _point(5.0, 6.0),
                _point(10.0, 10.0),
                _point(15.0, 6.0),
                _point(20.0, 2.0),
            ),
        ),
        JointTrajectory(
            joint_name="mid_hip",
            timestamps_seconds=(0.0, 1.0, 2.0, 3.0, 4.0),
            coordinates=tuple(_point(index * 5.0, 5.0) for index in range(5)),
        ),
    )
    gait = compute_gait_metrics(
        gait_traj,
        VideoMetadata(duration_seconds=4.0, fps=1.0, frame_count=5, width=640, height=480),
        min_peak_prominence_px=3.0,
    )
    brady = compute_bradykinesia_metrics(
        (_trajectory("finger_thumb_distance", (0.0, 10.0, 0.0, 7.0, 0.0, 4.0)),),
        task_type="finger_tapping",
    )
    tremor = compute_tremor_metrics((_trajectory("right_wrist", (0.0, 2.0, 0.0, -2.0, 0.0)),))
    posture = compute_postural_stability_metrics(
        (JointTrajectory("mid_hip", (0.0, 1.0, 2.0), (_point(0, 0), _point(1, 0), _point(1, 1))),)
    )

    payload = generate_clinical_task_report_payload(
        "video-1",
        gait_metrics=gait,
        bradykinesia_metrics=brady,
        tremor_metrics=tremor,
        posture_metrics=posture,
        patient_id="patient-1",
        session_id="session-1",
        video_segments={"gait": (0.0, 4.0), "finger_tapping": (5.0, 8.0)},
    )

    assert isinstance(payload, ClinicalTaskReportPayload)
    data = payload.to_json_dict()
    assert data["video_id"] == "video-1"
    assert data["patient_id"] == "patient-1"
    assert {section["task_name"] for section in data["sections"]} == {
        "gait",
        "bradykinesia",
        "tremor",
        "posture",
    }
    gait_section = next(section for section in data["sections"] if section["task_name"] == "gait")
    assert gait_section["video_segment"]["start_seconds"] == 0.0
    assert gait_section["units"]
    assert data["clinical_summary"]["review_required"] is True
    assert data["evidence_context"]["registry_total_papers"] == 87000
    assert any(link["task_family"] == "gait" for link in data["evidence_context"]["task_family_links"])
    assert gait_section.get("evidence_link", {}).get("condition_id") == "post-stroke-motor"


def test_generate_clinical_report_handles_missing_metrics_gracefully() -> None:
    payload = generate_clinical_task_report_payload("video-empty")

    data = payload.to_json_dict()
    assert data["sections"] == []
    assert "no analyzer metrics supplied" in data["clinical_summary"]["limitations"][0]


def test_generate_monitoring_report_payload_groups_events() -> None:
    track = ActorTrack(
        actor_id="patient-1",
        role="patient",
        points=(
            TrackPoint(0.0, 1.0, 1.0),
            TrackPoint(10.0, 1.1, 1.0),
            TrackPoint(12.0, 4.0, 4.0),
        ),
    )
    events = detect_prolonged_inactivity((track,), min_duration_seconds=8.0, max_motion_distance=0.25)

    payload = generate_monitoring_report_payload("video-monitoring", events)

    assert isinstance(payload, MonitoringReportPayload)
    data = payload.to_json_dict()
    assert data["event_count"] == 1
    assert data["events_by_type"]["prolonged_inactivity"] == 1
    assert data["events"][0]["video_segment"]["end_seconds"] == 10.0
    assert data["evidence_context"]["registry_total_papers"] == 87000
    assert data["evidence_context"]["task_family_links"]


def test_generate_longitudinal_summary_orders_sessions_and_deltas() -> None:
    first = generate_clinical_task_report_payload("video-1", session_id="visit-1")
    second = generate_clinical_task_report_payload("video-2", session_id="visit-2")
    second.clinical_summary["cadence_steps_per_min"] = 90.0
    first.clinical_summary["cadence_steps_per_min"] = 80.0

    summary = generate_longitudinal_summary("patient-1", [second, first])
    data = summary.to_json_dict()

    assert data["patient_id"] == "patient-1"
    assert [session["session_id"] for session in data["sessions"]] == ["visit-1", "visit-2"]
    assert data["metric_deltas"]["cadence_steps_per_min"] == 10.0


def test_example_payload_json_is_valid() -> None:
    example_path = Path(__file__).resolve().parents[1] / "demo" / "sample_report_payload.json"
    payload = json.loads(example_path.read_text())

    assert "clinical_task_report" in payload
    assert "monitoring_report" in payload
    assert payload["clinical_task_report"]["video_id"] == "demo-video-structured"
