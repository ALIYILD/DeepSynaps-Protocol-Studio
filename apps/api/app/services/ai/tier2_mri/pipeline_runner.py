"""Tier 2 MRI Pipeline Runner.

Stub-only. Reads ``MRI_PIPELINE_WORKDIR`` / ``MRI_FASTSURFER_IMAGE`` /
``MRI_GPU_DEVICE`` from the environment. If the workdir or image is
unset, every job submission returns ``stub: True,
segmentation_uri: None, stage: 'queued'`` with the canonical MRI
disclaimer.

Real pipeline integration is a follow-up PR. The eventual integration
will use either ``docker`` SDK (container-per-job) or ``subprocess``
(local FastSurfer install), plus an async job queue (Celery/RQ) and a
NIfTI object store (S3 or local volume). None of those dependencies are
added in this PR.
"""
from __future__ import annotations

import os
import uuid
from typing import Optional

from .disclaimers import MRI_DISCLAIMER
from .pipeline_registry import get_pipeline_meta, list_pipelines
from .schemas import MriHealthResponse, MriJobRequest, MriJobResponse

_STUB_MESSAGE = (
    "Tier 2 MRI pipelines are not wired. Provide MRI_PIPELINE_WORKDIR "
    "and MRI_FASTSURFER_IMAGE, then land the follow-up runner PR to "
    "enable real segmentation."
)


class MriPipelineRunner:
    """Stub MRI pipeline orchestrator.

    Constructed once per process. Real instantiation will manage a
    container pool (or subprocess workers) and persist job state in
    Postgres / Redis.
    """

    def __init__(self) -> None:
        self.workdir: Optional[str] = os.getenv("MRI_PIPELINE_WORKDIR") or None
        self.fastsurfer_image: Optional[str] = os.getenv("MRI_FASTSURFER_IMAGE") or None
        self.gpu_device: str = os.getenv("MRI_GPU_DEVICE", "cpu")

    @property
    def gpu_available(self) -> bool:
        return self.gpu_device.startswith("cuda")

    def health(self) -> MriHealthResponse:
        available = [p.name for p in list_pipelines()]
        return MriHealthResponse(
            status="stub",
            pipelines_available=available,
            gpu_available=self.gpu_available,
            stub=True,
            message=_STUB_MESSAGE,
        )

    def submit(self, request: MriJobRequest) -> MriJobResponse:
        meta = get_pipeline_meta(request.pipeline)
        if meta is None:
            return MriJobResponse(
                stub=True,
                job_id=str(uuid.uuid4()),
                status="failed",
                stage="error",
                pipeline=request.pipeline,
                disclaimer=MRI_DISCLAIMER,
                message=f"Unknown pipeline '{request.pipeline}'.",
            )

        # In stub mode every submission gets a fresh UUID and reports as
        # queued. No state is persisted — get_status() also returns stub.
        return MriJobResponse(
            stub=True,
            job_id=str(uuid.uuid4()),
            status="stub",
            stage="queued",
            pipeline=meta.name,
            started_at=None,
            finished_at=None,
            segmentation_uri=None,
            disclaimer=MRI_DISCLAIMER,
            message=_STUB_MESSAGE,
        )

    def get_status(self, job_id: str) -> MriJobResponse:
        # No real persistence yet; surface a stub envelope for any id.
        return MriJobResponse(
            stub=True,
            job_id=job_id,
            status="stub",
            stage="queued",
            pipeline="fastsurfer",
            disclaimer=MRI_DISCLAIMER,
            message=_STUB_MESSAGE,
        )


_singleton: Optional[MriPipelineRunner] = None


def get_pipeline() -> MriPipelineRunner:
    """Return a process-wide ``MriPipelineRunner`` singleton."""
    global _singleton
    if _singleton is None:
        _singleton = MriPipelineRunner()
    return _singleton
