"""End-to-end orchestration. Two entry points: ``run_task`` and ``run_monitor``.

Both entry points are async-friendly so the Celery worker can fan out across
GPU workers. They never raise on optional-dep absence — when ``mediapipe`` or
``ultralytics`` is missing they return a styled ``unavailable`` envelope, the
same way the MRI / qEEG façades handle slim images.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .schemas import (
    CaptureContext,
    PatientContext,
    VideoAnalysisReport,
)
from .tasks.segmenter import TaskEpoch


@dataclass
class TaskRunRequest:
    analysis_id: str
    clip_path: Path
    patient: PatientContext
    capture: CaptureContext
    epochs: list[TaskEpoch]
    research_consent: bool = False


@dataclass
class MonitorRunRequest:
    analysis_id: str
    rtsp_url: str
    camera_id: str
    duration_s: float
    consent_id: str


def run_task(request: TaskRunRequest) -> VideoAnalysisReport:
    """Run the structured-task pipeline end-to-end.

    Steps:

    1. ``io.ingest`` — face-blur + transcode + frame index.
    2. ``pose.run_pose`` — pluggable HPE backend with cache.
    3. ``motion.smooth_track`` + ``fill_gaps`` + ``lift_to_world``.
    4. ``tasks.segmenter.segment_operator`` — accept the epochs.
    5. For each epoch: dispatch to the right task analyzer.
    6. ``scoring.suggest_mds_updrs_score`` per task.
    7. ``longitudinal.build_trend`` if the patient has prior visits.
    8. ``overlay.render_overlay``.
    9. ``db.save_video_analysis`` + MedRAG bridge.

    TODO(impl): wire the steps with try/except so a single failed task
    analyzer still produces a report for the others.
    """

    _ = request
    raise NotImplementedError


def run_monitor(request: MonitorRunRequest) -> VideoAnalysisReport:
    """Run the continuous-monitoring pipeline end-to-end.

    Steps:

    1. ``io.ingest`` (RTSP → segmented mp4 chunks, default-on face blur).
    2. ``monitoring.detector.detect_and_track`` per chunk.
    3. ``monitoring.zones.compute_transitions``.
    4. Detector fan-out: bed-exit, falls, inactivity, interactions
       (each gated by per-camera alert policy).
    5. Aggregate ``MonitoringEvent`` rows.
    6. Optional clip extraction for the dashboard review queue.
    7. ``db.save_video_analysis`` + MedRAG bridge.

    TODO(impl). Feature-flagged behind ``settings.monitoring_enabled``.
    """

    _ = request
    raise NotImplementedError


__all__ = ["MonitorRunRequest", "TaskRunRequest", "run_monitor", "run_task"]
