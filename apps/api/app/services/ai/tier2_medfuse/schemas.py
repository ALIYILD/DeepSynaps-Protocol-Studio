"""Schemas for the Tier 2 MEDFuse multimodal fusion adapter."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MedfuseStatus = Literal["ok", "stub", "model_not_loaded", "error"]


class MedfuseHealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: MedfuseStatus
    model_loaded: bool
    supported_modalities: list[str]
    stub: bool
    message: str


class MedfuseFuseRequest(BaseModel):
    """Multimodal input.

    ``modalities`` maps a modality label (e.g. "mri", "eeg", "clinical")
    to an opaque pointer (URI or precomputed embedding ref). Not fetched
    in stub mode.
    """
    model_config = ConfigDict(extra="forbid")
    patient_id: str = Field(min_length=1)
    modalities: dict[str, str] = Field(default_factory=dict)


class MedfuseFuseResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stub: bool
    status: MedfuseStatus
    patient_id: str
    fused_embedding: list[float] | None
    embedding_dim: int | None
    modalities_used: list[str]
    latency_ms: int = 0
    disclaimer: str
    message: str = ""
