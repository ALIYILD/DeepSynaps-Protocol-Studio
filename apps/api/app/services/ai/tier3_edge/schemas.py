"""Schemas for the Tier 3 edge runner."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Tier3Status = Literal["ok", "stub", "model_not_loaded", "error"]


class Tier3HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Tier3Status
    eegnet_loaded: bool
    llamacpp_loaded: bool
    device: str
    stub: bool
    message: str


class Tier3ScreenRequest(BaseModel):
    """Single EEG screening call.

    ``signal_b64`` is a base64-encoded float32 EEG window; ignored in
    stub mode. The real runner targets <10 ms latency.
    """
    model_config = ConfigDict(extra="forbid")
    signal_b64: str | None = None
    sampling_rate_hz: int = Field(default=256, ge=1, le=8192)
    channels: list[str] = Field(default_factory=list)


class Tier3ScreenResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stub: bool
    status: Tier3Status
    screening_flag: bool | None
    score: float | None
    latency_ms: int = 0
    disclaimer: str
    message: str = ""


class Tier3ChatRequest(BaseModel):
    """Edge BioMistral chat call (clinician-side conversational helper)."""
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(min_length=1)
    max_tokens: int = Field(default=256, ge=1, le=2048)


class Tier3ChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stub: bool
    status: Tier3Status
    output: str | None
    tokens_used: int = 0
    latency_ms: int = 0
    disclaimer: str
    message: str = ""
