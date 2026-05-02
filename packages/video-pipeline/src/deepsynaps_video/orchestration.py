"""Clinical workflow facades for DeepSynaps Video Analyzer.

This module provides product-level orchestration helpers on top of the generic
workflow runner. It intentionally uses fixture/noop pose by default so tests and
cloud development do not require heavy CV dependencies.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from deepsynaps_video.pose_engine import estimate_2d_pose, extract_joint_trajectories
from deepsynaps_video.reporting import ClinicalTaskReportPayload, generate_clinical_task_report_payload
from deepsynaps_video.schemas import QCResult, VideoMetadata, json_ready, utc_now_iso
from deepsynaps_video.workflow_orchestration import (
    VideoArtifactRecord,
    VideoPipelineNode,
    VideoPipelineRun,
    execute_video_pipeline,
)


@dataclass(frozen=True)
class ClinicalVideoAnalysis:
    """End-to-end clinical task analysis envelope for one video."""

    analysis_id: str
    video_ref: str
    status: str
    report_payload: ClinicalTaskReportPayload
    qc: QCResult
    pipeline_run: VideoPipelineRun
    artifacts: tuple[VideoArtifactRecord, ...]
    provenance: tuple[dict[str, Any], ...]
    created_at: str = field(default_factory=utc_now_iso)

    def to_dict(self) -> dict[str, Any]:
        return json_ready(self)

    def to_json_dict(self) -> dict[str, Any]:
        return self.to_dict()


def run_clinical_task_pipeline(
    video_ref: str,
    *,
    video_metadata: VideoMetadata | None = None,
    backend: str = "noop",
) -> ClinicalVideoAnalysis:
    """Run a minimal clinical video analysis facade.

    The current facade wires pose estimation and reporting with explicit QC and
    provenance. Analyzer-specific metrics can be added by registering richer
    operations with :func:`execute_video_pipeline`.
    """

    pose = estimate_2d_pose(video_ref, backend=backend)
    trajectories = extract_joint_trajectories(pose)
    qc = QCResult(
        qc_id=f"qc_{abs(hash((video_ref, len(trajectories))))}",
        status="warning" if not trajectories else "pass",
        confidence=0.5 if not trajectories else 0.8,
        limitations=("noop pose backend produced no landmarks",) if not trajectories else (),
        checks={"trajectory_count": len(trajectories)},
    )
    report = generate_clinical_task_report_payload(video_ref, qc_result=qc)
    pipeline_run = execute_video_pipeline(
        (
            VideoPipelineNode("pose", "builtin.register_input_video", backend=backend, artifact_type="pose_sequence"),
            VideoPipelineNode("report", "builtin.generate_clinical_task_report", depends_on=("pose",), artifact_type="report_payload"),
        ),
        video_ref,
    )
    return ClinicalVideoAnalysis(
        analysis_id=f"clinical_video_{pipeline_run.run_id}",
        video_ref=video_ref,
        status=pipeline_run.status,
        report_payload=report,
        qc=qc,
        pipeline_run=pipeline_run,
        artifacts=pipeline_run.artifacts,
        provenance=pipeline_run.provenance,
    )


__all__ = ["ClinicalVideoAnalysis", "run_clinical_task_pipeline"]
