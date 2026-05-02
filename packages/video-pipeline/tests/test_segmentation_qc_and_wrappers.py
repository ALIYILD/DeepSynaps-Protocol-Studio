from __future__ import annotations

import pytest

from deepsynaps_video.ingestion import (
    create_video_asset,
    extract_frame_sample,
    normalize_video,
    probe_video_metadata,
)
from deepsynaps_video.pose_engine import run_pose_estimation
from deepsynaps_video.qc import build_qc_result
from deepsynaps_video.schemas import QCResult
from deepsynaps_video.segmentation import (
    auto_detect_task_boundaries,
    define_room_zones,
    define_task_segments,
    select_primary_subject,
)


def test_define_task_segments_validates_and_serializes() -> None:
    segments = define_task_segments(
        "video-1",
        [
            {"task_label": "gait", "start_seconds": 0.0, "end_seconds": 4.0},
            {"task_label": "finger_tapping", "start_seconds": 5.0, "end_seconds": 8.0, "side": "right"},
        ],
    )

    assert [segment.task_label for segment in segments] == ["gait", "finger_tapping"]
    assert segments[1].side == "right"
    assert segments[0].to_json_dict()["video_id"] == "video-1"


def test_define_task_segments_rejects_bad_ranges_and_overlap() -> None:
    with pytest.raises(ValueError, match="end_seconds"):
        define_task_segments("video-1", [{"task_label": "gait", "start_seconds": 1.0, "end_seconds": 1.0}])

    with pytest.raises(ValueError, match="overlap"):
        define_task_segments(
            "video-1",
            [
                {"task_label": "gait", "start_seconds": 0.0, "end_seconds": 3.0},
                {"task_label": "tremor", "start_seconds": 2.0, "end_seconds": 4.0},
            ],
        )


def test_subject_and_room_zone_helpers() -> None:
    selection = select_primary_subject(("track-a", "track-b"), selected_track_id="track-b")
    assert selection.track_id == "track-b"

    zones = define_room_zones(
        "room-1",
        [
            {
                "zone_id": "bed",
                "zone_type": "bed",
                "polygon": ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)),
            }
        ],
    )
    assert zones.zones[0].zone_type == "bed"

    with pytest.raises(ValueError, match="at least 3"):
        define_room_zones("room-1", [{"zone_id": "bad", "polygon": ((0.0, 0.0), (1.0, 1.0))}])


def test_auto_detect_task_boundaries_returns_explicit_qc_shape() -> None:
    result = auto_detect_task_boundaries("video-1")
    assert result == ()


def test_qc_result_and_reportable_failures() -> None:
    qc = build_qc_result(
        subject_id="task-1",
        checks={"landmark_missingness": 0.2, "signal_quality": 0.9},
        limitations=("low light",),
    )
    assert isinstance(qc, QCResult)
    assert qc.status == "warning"
    assert qc.score < 1.0
    assert qc.to_json_dict()["limitations"] == ["low light"]


def test_function_table_wrappers_are_available() -> None:
    assert create_video_asset is not None
    assert probe_video_metadata is not None
    assert normalize_video is not None
    assert extract_frame_sample is not None
    pose = run_pose_estimation("video://noop", backend="noop")
    assert pose.backend.name == "noop"

