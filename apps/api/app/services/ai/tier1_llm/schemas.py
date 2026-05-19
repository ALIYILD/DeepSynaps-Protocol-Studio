"""Schemas for the Tier 1 clinical-reasoning LLM adapter.

Local Pydantic models. Kept inside the ``tier1_llm`` module so this PR does
not have to touch ``deepsynaps_core_schema``. If the contract stabilises,
types can be promoted to the shared schema package later.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Tier1Status = Literal["ok", "unavailable", "not_configured", "stub"]


class Tier1HealthResponse(BaseModel):
    """Service + endpoint health.

    ``stub`` is ``True`` whenever no upstream vLLM endpoint is configured.
    Surfaced under ``GET /api/v1/ai/tier1/health``.
    """

    model_config = ConfigDict(extra="forbid")

    status: Tier1Status
    model: str
    endpoint: str | None
    stub: bool
    message: str


class ClinicalReasoningRequest(BaseModel):
    """Input to the clinical-reasoning model.

    ``prompt`` is the clinician-authored question. ``context`` is an
    optional list of evidence snippets (e.g. citations, prior notes) that
    will be inlined ahead of the prompt by the eventual real client.
    """

    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1)
    context: list[str] = Field(default_factory=list)
    max_tokens: int = Field(default=512, ge=1, le=4096)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)


class ClinicalReasoningResponse(BaseModel):
    """Uniform response envelope for clinical reasoning calls.

    In stub mode ``stub`` is ``True``, ``output`` is ``None``, and the
    deterministic placeholder text lives in ``message`` so consumers can
    still render something honest. Disclaimer is always present.
    """

    model_config = ConfigDict(extra="forbid")

    stub: bool
    model: str
    status: Tier1Status
    output: str | None
    message: str
    tokens_used: int = 0
    latency_ms: int = 0
    disclaimer: str
