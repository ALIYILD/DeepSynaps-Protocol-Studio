from __future__ import annotations

from pydantic import BaseModel, Field


class MRIInputMetadata(BaseModel):
    sequence: str
    voxel_size_mm: float = Field(..., gt=0)
    dimensions: list[int] = Field(default_factory=list)


class ImagingModelOutput(BaseModel):
    summary: str
    artefacts: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ImagingModelStatus(BaseModel):
    provider_name: str
    configured: bool = False
    gpu_required: bool = False
