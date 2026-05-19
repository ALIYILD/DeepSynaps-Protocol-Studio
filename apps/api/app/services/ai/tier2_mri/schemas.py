"""Schemas for the Tier 2 MRI segmentation pipeline.

Local Pydantic models. Kept inside the ``tier2_mri`` module so this PR
does not have to touch ``deepsynaps_core_schema``.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MriStage = Literal["queued", "skullstrip", "segment", "qc", "done", "error"]
MriPipelineName = Literal["fastsurfer", "synthseg"]
MriJobStatus = Literal["ok", "stub", "queued", "running", "completed", "failed"]


class MriHealthResponse(BaseModel):
    """Service + runtime health."""

    model_config = ConfigDict(extra="forbid")

    status: MriJobStatus
    pipelines_available: list[str]
    gpu_available: bool
    stub: bool
    message: str


class MriJobRequest(BaseModel):
    """Submit a single MRI segmentation job.

    ``input_uri`` is an opaque pointer to a NIfTI volume (s3:// or
    file:// in practice). In stub mode it is NOT fetched or validated
    beyond non-empty.
    """

    model_config = ConfigDict(extra="forbid")

    pipeline: MriPipelineName = "fastsurfer"
    input_uri: str = Field(min_length=1)
    subject_id: str = Field(min_length=1)


class MriJobResponse(BaseModel):
    """Uniform response envelope for MRI job submission / status calls.

    Stub mode: ``stub=True, segmentation_uri=None, status="stub"``.
    Disclaimer always present.
    """

    model_config = ConfigDict(extra="forbid")

    stub: bool
    job_id: str
    status: MriJobStatus
    stage: MriStage
    pipeline: str
    started_at: str | None = None
    finished_at: str | None = None
    segmentation_uri: str | None = None
    disclaimer: str
    message: str = ""
