"""Schema round-trip tests against the demo report."""

from __future__ import annotations

import json
from pathlib import Path

from deepsynaps_video.schemas import VideoAnalysisReport


def test_demo_report_round_trips() -> None:
    sample = json.loads(
        (Path(__file__).parent.parent / "demo" / "sample_video_report.json").read_text()
    )
    report = VideoAnalysisReport.model_validate(sample)
    assert report.analysis_id == "00000000-0000-0000-0000-000000000001"
    assert any(t.task_id == "mds_updrs_3_4_finger_tap" for t in report.tasks)
    serialized = report.model_dump(mode="json")
    assert serialized["pose_engine"] == "rtmpose-l-2d-server"
