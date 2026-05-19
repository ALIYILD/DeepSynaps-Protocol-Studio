"""Schemas for the Tier 2 CBraMod EEG foundation-model adapter."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CbramodStatus = Literal["ok", "stub", "model_not_loaded", "error"]


class CbramodHealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: CbramodStatus
    model_loaded: bool
    device: str
    stub: bool
    message: str


class CbramodEmbedRequest(BaseModel):
    """Input to a single CBraMod embedding call.

    ``signal_b64`` is a base64-encoded float32 EEG segment. Ignored in
    stub mode. ``channels`` lists 10-20 montage labels in row order.
    """
    model_config = ConfigDict(extra="forbid")
    patient_id: str = Field(min_length=1)
    signal_b64: str | None = None
    sampling_rate_hz: int = Field(default=256, ge=1, le=8192)
    channels: list[str] = Field(default_factory=list)


class CbramodEmbedResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stub: bool
    status: CbramodStatus
    patient_id: str
    embedding: list[float] | None
    embedding_dim: int | None
    latency_ms: int = 0
    disclaimer: str
    message: str = ""
