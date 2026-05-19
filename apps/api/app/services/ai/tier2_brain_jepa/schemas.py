"""Schemas for the Tier 2 Brain-JEPA fMRI foundation-model adapter."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BrainJepaStatus = Literal["ok", "stub", "model_not_loaded", "error"]


class BrainJepaHealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: BrainJepaStatus
    model_loaded: bool
    device: str
    stub: bool
    message: str


class BrainJepaEmbedRequest(BaseModel):
    """Input to a single Brain-JEPA embedding call."""
    model_config = ConfigDict(extra="forbid")
    patient_id: str = Field(min_length=1)
    fmri_uri: str = Field(min_length=1)
    pool: Literal["mean", "cls", "none"] = "mean"


class BrainJepaEmbedResponse(BaseModel):
    """Stub mode: embedding is None, embedding_dim is None."""
    model_config = ConfigDict(extra="forbid")
    stub: bool
    status: BrainJepaStatus
    patient_id: str
    embedding: list[float] | None
    embedding_dim: int | None
    latency_ms: int = 0
    disclaimer: str
    message: str = ""
