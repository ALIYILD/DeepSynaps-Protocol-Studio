"""Schemas for the Tier 2 qEEG inference adapter.

Local Pydantic models. Kept inside the ``tier2_qeeg`` module so this PR
does not have to touch ``deepsynaps_core_schema``.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

QeegModelName = Literal["eegnet", "biot"]
QeegRunStatus = Literal["ok", "stub", "model_not_loaded", "error"]


class QeegHealthResponse(BaseModel):
    """Service + runtime health.

    ``models_available`` enumerates the model names recognised by the
    registry. ``models_loaded`` is the subset for which an ``.onnx`` file
    has been resolved. In stub mode the latter is always empty.
    """

    model_config = ConfigDict(extra="forbid")

    status: QeegRunStatus
    models_available: list[str]
    models_loaded: list[str]
    stub: bool
    message: str


class QeegInferenceRequest(BaseModel):
    """Input to a single qEEG inference call.

    The signal payload itself is optional in stub mode — the contract
    accepts a base64-encoded byte string but does not validate it. The
    real ONNX runner (follow-up PR) will decode + reshape.
    """

    model_config = ConfigDict(extra="forbid")

    model: QeegModelName
    signal_shape: tuple[int, int] = Field(
        description="(channels, samples). Validated against model expectations.",
    )
    sampling_rate_hz: int = Field(default=256, ge=1, le=8192)
    signal_b64: str | None = Field(
        default=None,
        description="Base64-encoded float32 array. Ignored in stub mode.",
    )


class QeegInferenceResponse(BaseModel):
    """Uniform response envelope for qEEG inference calls.

    Stub mode: ``stub=True, predictions=None``. Disclaimer always present.
    """

    model_config = ConfigDict(extra="forbid")

    stub: bool
    model: str
    status: QeegRunStatus
    predictions: list[float] | None
    latency_ms: int = 0
    disclaimer: str
    message: str = ""
