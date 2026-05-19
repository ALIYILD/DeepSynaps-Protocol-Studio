"""Tier 2 MRI pipeline registry.

Static metadata about the MRI segmentation pipelines the adapter
intends to orchestrate. ``binary_path`` is ``None`` while no container
or local install is resolvable. The follow-up PR resolves
``MRI_FASTSURFER_IMAGE`` into a usable docker reference.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class MriPipelineMeta(BaseModel):
    """Static metadata for a single MRI segmentation pipeline."""

    model_config = ConfigDict(extra="forbid")

    name: str
    target_runtime_sec: int
    requires_gpu: bool
    binary_path: str | None
    upstream: str
    license: str


FASTSURFER_META = MriPipelineMeta(
    name="fastsurfer",
    target_runtime_sec=60,
    requires_gpu=True,
    binary_path=None,
    upstream="https://github.com/Deep-MI/FastSurfer",
    license="Apache-2.0",
)

SYNTHSEG_META = MriPipelineMeta(
    name="synthseg",
    target_runtime_sec=90,
    requires_gpu=False,
    binary_path=None,
    upstream="https://github.com/BBillot/SynthSeg",
    license="Apache-2.0",
)


_ALL: dict[str, MriPipelineMeta] = {
    "fastsurfer": FASTSURFER_META,
    "synthseg": SYNTHSEG_META,
}


def list_pipelines() -> list[MriPipelineMeta]:
    """Return registry entries in deterministic order."""
    return [_ALL[name] for name in ("fastsurfer", "synthseg")]


def get_pipeline_meta(name: str) -> MriPipelineMeta | None:
    return _ALL.get(name)
