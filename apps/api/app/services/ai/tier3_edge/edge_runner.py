"""Tier 3 edge runner (stub).

Reads ``TIER3_LLAMACPP_MODEL_PATH`` (GGUF path for BioMistral),
``TIER3_EEGNET_PATH`` (ONNX path), and ``TIER3_DEVICE``. Stays in stub
mode while any required path is unset.
"""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import TIER3_DISCLAIMER
from .schemas import (
    Tier3ChatRequest,
    Tier3ChatResponse,
    Tier3HealthResponse,
    Tier3ScreenRequest,
    Tier3ScreenResponse,
)

_STUB_MESSAGE = (
    "Tier 3 edge models are not loaded. Provide TIER3_EEGNET_PATH (ONNX) "
    "and TIER3_LLAMACPP_MODEL_PATH (.gguf) and land the follow-up wiring "
    "PR to enable real edge inference."
)
_STUB_CHAT = "[stub: edge LLM not yet wired]"


class EdgeRunner:
    def __init__(self) -> None:
        self.llamacpp_path: Optional[str] = os.getenv("TIER3_LLAMACPP_MODEL_PATH") or None
        self.eegnet_path: Optional[str] = os.getenv("TIER3_EEGNET_PATH") or None
        self.device: str = os.getenv("TIER3_DEVICE", "cpu")

    @property
    def eegnet_loaded(self) -> bool:
        return False

    @property
    def llamacpp_loaded(self) -> bool:
        return False

    def health(self) -> Tier3HealthResponse:
        return Tier3HealthResponse(
            status="stub",
            eegnet_loaded=self.eegnet_loaded,
            llamacpp_loaded=self.llamacpp_loaded,
            device=self.device,
            stub=True,
            message=_STUB_MESSAGE,
        )

    def screen(self, request: Tier3ScreenRequest) -> Tier3ScreenResponse:
        start = time.monotonic()
        _ = request.sampling_rate_hz
        latency_ms = int((time.monotonic() - start) * 1000)
        return Tier3ScreenResponse(
            stub=True,
            status="stub",
            screening_flag=None,
            score=None,
            latency_ms=latency_ms,
            disclaimer=TIER3_DISCLAIMER,
            message=_STUB_MESSAGE,
        )

    def chat(self, request: Tier3ChatRequest) -> Tier3ChatResponse:
        start = time.monotonic()
        _ = request.prompt
        latency_ms = int((time.monotonic() - start) * 1000)
        return Tier3ChatResponse(
            stub=True,
            status="stub",
            output=None,
            tokens_used=0,
            latency_ms=latency_ms,
            disclaimer=TIER3_DISCLAIMER,
            message=_STUB_CHAT,
        )


_singleton: Optional[EdgeRunner] = None


def get_runner() -> EdgeRunner:
    global _singleton
    if _singleton is None:
        _singleton = EdgeRunner()
    return _singleton
