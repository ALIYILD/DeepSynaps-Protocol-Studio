"""Schemas for the Tier 2 BrainHarmony structure-function fusion adapter."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BrainHarmonyStatus = Literal["ok", "stub", "model_not_loaded", "error"]


class BrainHarmonyHealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: BrainHarmonyStatus
    model_loaded: bool
    device: str
    stub: bool
    message: str


class BrainHarmonyFuseRequest(BaseModel):
    """Inputs for the structure-function fusion call."""
    model_config = ConfigDict(extra="forbid")
    patient_id: str = Field(min_length=1)
    smri_uri: str = Field(min_length=1)
    fmri_uri: str = Field(min_length=1)


class BrainHarmonyFuseResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stub: bool
    status: BrainHarmonyStatus
    patient_id: str
    fused_features: list[float] | None
    feature_dim: int | None
    latency_ms: int = 0
    disclaimer: str
    message: str = ""
