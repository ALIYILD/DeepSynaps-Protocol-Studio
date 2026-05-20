"""Tier 2 — MRI segmentation pipeline orchestrator.

Stub-mode by default. Reads ``MRI_PIPELINE_WORKDIR`` /
``MRI_FASTSURFER_IMAGE`` / ``MRI_GPU_DEVICE`` from the environment; if
the workdir or container image is unset, every ``submit`` returns
``stub: True, segmentation_uri: None`` with the canonical MRI disclaimer.
No FastSurfer/HD-BET/SynthSeg container is started in this module until
a follow-up PR wires the real runner.
"""
from .disclaimers import MRI_DISCLAIMER
from .pipeline_registry import FASTSURFER_META, SYNTHSEG_META, list_pipelines
from .pipeline_runner import MriPipelineRunner, get_pipeline
from .schemas import (
    MriHealthResponse,
    MriJobRequest,
    MriJobResponse,
    MriJobStatus,
    MriPipelineName,
    MriStage,
)

__all__ = [
    "MRI_DISCLAIMER",
    "FASTSURFER_META",
    "SYNTHSEG_META",
    "list_pipelines",
    "MriPipelineRunner",
    "get_pipeline",
    "MriHealthResponse",
    "MriJobRequest",
    "MriJobResponse",
    "MriJobStatus",
    "MriPipelineName",
    "MriStage",
]
